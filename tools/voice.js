const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const FILE = path.resolve(process.argv[2] || 'index.html');

// 假的识别引擎：真麦克风在无头浏览器里用不了，但行为可以完整验证
const FAKE = `
window.__srEvents = [];
class FakeSR {
  constructor(){ this.lang=''; this.continuous=false; this.interimResults=false; }
  start(){ window.__sr = this; window.__srEvents.push('start'); }
  stop(){ window.__srEvents.push('stop'); if(this.onend) this.onend(); }
  abort(){ window.__srEvents.push('abort'); }
}
window.SpeechRecognition = FakeSR;
window.__say = (text, isFinal) => {
  const r = window.__sr; if(!r || !r.onresult) return;
  const res = [{ 0:{transcript:text}, isFinal:!!isFinal, length:1 }];
  res.length = 1;
  r.onresult({ resultIndex:0, results:res });
};
window.__fail = (err) => { const r = window.__sr; if(r && r.onerror) r.onerror({error:err}); };
`;

async function boot(p){
  if(await p.$('#wgo')) await p.click('#wgo');
  else if(await p.$('.mask #ok')) await p.click('.mask #ok');
  await p.waitForTimeout(400);
  /* 存档是 B12 之后加的：reload 之后先问「要接着打吗」。接着打，然后直接返回。 */
  if(await p.$('#fresh')){ await p.click('#go'); await p.waitForTimeout(900);
    await p.waitForSelector('#tri .chip', {timeout:10000}); return; }

  /* 事务所接案页是 B9 之后加的：老脚本原来直接进卷宗，这里补一步选案。 */
  await p.waitForTimeout(400);
  if(await p.$('.caseCard[data-id="c01"]')){ await p.click('.caseCard[data-id="c01"]'); await p.waitForTimeout(700); }

  const btn = await p.waitForSelector('#leave', {timeout:3000}).catch(()=>null);
  if(btn){ await btn.click(); await p.click('#yes'); await p.waitForTimeout(400); }
  const st = await p.waitForSelector('#stop', {timeout:3000}).catch(()=>null);
  if(st){ await st.click(); await p.waitForSelector('#st .chip');
          await p.click('#st .chip[data-v="lenient"]'); await p.click('#go'); await p.waitForTimeout(1200); }
  await p.waitForSelector('#tri .chip');
}

(async () => {
  const b = await chromium.launch();

  console.log('【一】本地 file:// 打开');
  {
    const p = await b.newPage();
    await p.addInitScript(FAKE);          // 就算浏览器支持，file:// 也不该给按钮
    await p.goto('file://' + FILE);
    await boot(p);
    const hasBtn = !!(await p.$('[data-voice]'));
    const hint = await p.$eval('.voiceHint', e=>e.textContent).catch(()=>null);
    console.log('   按住说话按钮：' + (hasBtn ? '有（不对）' : '没有'));
    console.log('   提示行：' + (hint || '(没有，不对)'));
    console.log('   isSecureContext = ' + await p.evaluate(()=>window.isSecureContext));
    await p.close();
  }

  // 起个本地服务器，localhost 在 Chromium 里算安全上下文
  const dir = path.dirname(FILE);
  const srv = http.createServer((req,res)=>{
    const f = path.join(dir, req.url === '/' ? path.basename(FILE) : req.url.slice(1));
    fs.readFile(f, (e,d)=> e ? (res.writeHead(404), res.end()) : (res.writeHead(200,{'Content-Type':'text/html'}), res.end(d)));
  });
  await new Promise(r=>srv.listen(8099, r));

  console.log('\n【二】localhost 上（安全上下文）');
  {
    const p = await b.newPage();
    const errs = []; p.on('pageerror', e=>errs.push(e.message));
    await p.addInitScript(FAKE);
    await p.goto('http://localhost:8099/' + path.basename(FILE));
    await boot(p);
    console.log('   isSecureContext = ' + await p.evaluate(()=>window.isSecureContext));
    console.log('   按住说话按钮：' + (await p.$('[data-voice]') ? '有' : '没有（不对）'));

    const box = await p.$('.chip.voice');
    await box.dispatchEvent('pointerdown');
    await p.waitForTimeout(80);
    console.log('   按下后按钮高亮：' + await p.$eval('.chip.voice', e=>e.classList.contains('on')));

    await p.evaluate(()=>window.__say('审判长，辩护人认为', false));
    await p.waitForTimeout(60);
    console.log('   中途结果进浮层：「' + await p.$eval('.interim', e=>e.textContent) + '」');
    console.log('   中途结果进输入框了吗：' + (await p.$eval('#say', e=>e.value) ? '进了（不对）' : '没有'));

    await p.evaluate(()=>window.__say('审判长，辩护人认为本案不构成盗窃', true));
    await p.waitForTimeout(60);
    console.log('   定稿落进输入框：「' + await p.$eval('#say', e=>e.value) + '」');

    await box.dispatchEvent('pointerup');
    await p.waitForTimeout(80);
    console.log('   松手后停止：' + (await p.evaluate(()=>window.__srEvents.join(','))));
    console.log('   浮层收起：' + !(await p.$eval('.interim', e=>e.classList.contains('on'))));
    console.log('   有没有自动提交（笔录里出现了吗）：' +
      (await p.evaluate(()=>[...document.querySelectorAll('#record .line')].some(e=>e.textContent.indexOf('不构成盗窃')>=0)) ? '提交了（不对）' : '没有'));
    console.log('   输入框还能改：' + await p.evaluate(()=>{
      const t = document.querySelector('#say'); t.value += '，请法庭注意。'; return t.value.slice(-6); }));
    console.log('   页面 error：' + errs.length);
    await p.close();
  }

  console.log('\n【三】识别失败（模拟国内连不上 Google）');
  {
    const p = await b.newPage();
    await p.addInitScript(FAKE);
    await p.goto('http://localhost:8099/' + path.basename(FILE));
    await boot(p);
    const box = await p.$('.chip.voice');
    await box.dispatchEvent('pointerdown');
    await p.waitForTimeout(60);
    await p.evaluate(()=>window.__fail('network'));
    await p.waitForTimeout(200);
    console.log('   按钮还在吗：' + (await p.$('[data-voice]') ? '在（不对）' : '没了'));
    console.log('   换成了：' + (await p.$eval('.voiceHint', e=>e.textContent).catch(()=>'(没有提示，不对)')));
    console.log('   toast：' + (await p.$eval('#toast', e=>e.textContent).catch(()=>'(没有)')));
    console.log('   记住了吗：' + await p.evaluate(()=>localStorage.getItem('xinzheng_voice_off')));
    await p.reload();
    await boot(p);
    console.log('   刷新之后：' + (await p.$('[data-voice]') ? '按钮又回来了（不对）' : '仍然是提示行') );
    await p.close();
  }

  srv.close(); await b.close();
})();
