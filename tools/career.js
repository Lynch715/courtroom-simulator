const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');

const play = async (p, strategy, plan) => {
  await p.waitForSelector('.caseCard'); await p.click('.caseCard');
  await p.waitForSelector('#leave'); await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(500);
  await p.waitForSelector('#stop'); await p.click('#stop'); await p.waitForSelector('#st .chip');
  await p.click(`#st .chip[data-v="${strategy}"]`); await p.click('#go'); await p.waitForTimeout(1400);
  for(let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
                        await p.click('#go'); await p.waitForTimeout(700); }
  await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="pass"]');
  await p.click('#go'); await p.waitForTimeout(700);
  for(const line of plan){
    if (await p.$('.mask .vhead .r')) break;
    const o = await p.waitForSelector('#obj .chip',{timeout:4000}).catch(()=>null);
    if(o){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); }
    if (!await p.$('#say')) break;
    await p.fill('#say', line); await p.click('#go'); await p.waitForTimeout(1000);
  }
  for(let i=0;i<10;i++){
    if (await p.$('.mask .vhead .r')) break;
    if (await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); continue; }
    if (await p.$('#say')){ await p.fill('#say','辩护人的辩论意见发表完毕。'); await p.click('#go'); await p.waitForTimeout(900); continue; }
    await p.waitForTimeout(500);
  }
  await p.waitForSelector('.mask .vhead .r', {timeout:20000});
};

const STRONG = ['本案全程使用被告人本人实名卡操作，监控在案，不存在秘密窃取的行为要件。',
  '银行系统故障持续四日，两次报修均无人处置，损失扩大系管理失职所致。',
  '请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑。'];
const WEAK = ['请法庭从轻处理。','请法庭考虑他的实际情况。','请法庭明察。'];

(async () => {
  const dir = path.resolve('srv');
  const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':q.url.slice(1));
    fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':'text/html'}),r.end(d)));});
  await new Promise(r=>srv.listen(8093,r));
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('http://localhost:8093/x.html');
  await p.evaluate(()=>{ localStorage.clear(); });
  await p.reload();
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(13); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(400);

  console.log('【一】连打三个案子，三轨累积');
  const runs = [['innocent', STRONG], ['lenient', WEAK], ['procedure', STRONG]];
  for (let i=0;i<runs.length;i++){
    await play(p, runs[i][0], runs[i][1]);
    const r = await p.evaluate(()=>({v:document.querySelector('.mask .vhead .r').textContent.trim(),
      rep:META.rep, con:META.conscience, cash:META.cash, done:META.done.length,
      notes:[...document.querySelectorAll('.conNotes p')].map(e=>e.textContent),
      epi:(document.querySelector('.epilogue')||{}).textContent||'',
      pm:!!document.querySelector('.postmortem')}));
    console.log(`  第${i+1}局（${runs[i][0]}）→ ${r.v}`);
    console.log(`    声誉 ${r.rep}　良心 ${r.con}　现金 ${r.cash}　打过 ${r.done} 个案子`);
    r.notes.forEach(n=>console.log('    · ' + n));
    if(r.epi) console.log('    结局：' + r.epi.slice(0,42) + '…');
    if(i===0) console.log('    延伸阅读：' + (r.pm ? '有' : '没有'));
    await p.click('#office'); await p.waitForTimeout(600);
  }

  console.log('\n【二】打到一半退出，重进能不能接上');
  await p.waitForSelector('.caseCard'); await p.click('.caseCard');
  await p.waitForSelector('#leave');
  await p.click('.doc.pickable[data-ev="e3"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(200);
  await p.click('#mk .chip[data-f="legality"]'); await p.waitForTimeout(200);
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(600);
  await p.fill('#talkSay','你先坐。慢慢说，不着急。'); await p.click('#go'); await p.waitForTimeout(700);
  const before = await p.evaluate(()=>({stage:PHASES[S.stage].name, trust:S.trust, read:[...S.read], marks:JSON.stringify(S.marks), turns:S.turnsLeft}));
  console.log('  退出前：' + JSON.stringify(before));
  await p.reload(); await p.waitForTimeout(400);
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(500);
  const askText = await p.$eval('#action', e=>e.textContent.replace(/\s+/g,' ').slice(0,40)).catch(()=>'');
  console.log('  重进看到：' + askText);
  await p.click('#go'); await p.waitForTimeout(900);
  const after = await p.evaluate(()=>({stage:PHASES[S.stage].name, trust:S.trust, read:[...S.read], marks:JSON.stringify(S.marks), turns:S.turnsLeft,
    hasInput:!!document.querySelector('#talkSay')}));
  console.log('  接上后：' + JSON.stringify(after));
  console.log('  一致：' + (before.stage===after.stage && before.trust===after.trust
    && before.marks===after.marks && before.turns===after.turns ? '是' : '否'));

  console.log('\n页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  srv.close(); await b.close();
})();
