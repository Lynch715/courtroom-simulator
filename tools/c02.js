const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};

(async () => {
  const dir = path.resolve('srv');
  const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.slice(1)));
    fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});
  await new Promise(r=>srv.listen(8087,r));
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:820}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
  await p.goto('http://localhost:8087/x.html');
  await p.evaluate(()=>localStorage.clear());
  await p.reload();
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(31); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(500);

  const cards = await p.$$eval('.caseCard', es=>es.map(e=>e.dataset.id + ' ' + e.querySelector('b').textContent));
  console.log('接案页：' + cards.join('　|　'));

  await p.click('.caseCard[data-id="c02"]'); await p.waitForTimeout(700);
  console.log('顶栏：' + await p.$eval('.brand span', e=>e.textContent));
  console.log('开场：' + (await p.$eval('#docview .deskIntro', e=>e.textContent)).split('\n')[0]);

  // 阅卷：细读鉴定意见 + 标真实性，细读勘验笔录
  await p.click('.doc.pickable[data-ev="e1"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(250);
  await p.click('#mk .chip[data-f="authenticity"]'); await p.waitForTimeout(150);
  await p.click('#aThink'); await p.waitForTimeout(500);
  console.log('内心独白：' + await p.$eval('.myNotes .think', e=>e.textContent));
  await p.click('.doc.pickable[data-ev="e2"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(250);
  await p.click('.doc.pickable[data-ev="e3"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(250);
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(700);

  // 会见
  console.log('\n会见开场：' + await p.$eval('#talk .line:nth-child(3) .body', e=>e.textContent).catch(()=>''));
  for (const q of ['你先坐。慢慢说，不着急。','这些东西是从哪儿买的？',
                   '我理解你的处境，不怪你。','被抓那天你是怎么说的？',
                   '你摊子上贴的那张纸条，是什么时候贴的？']){
    await p.fill('#talkSay', q); await p.click('#go'); await p.waitForTimeout(700);
  }
  const meet = await p.evaluate(()=>({trust:S.trust, known:[...S.known], out:[...S.lieOut], busted:[...S.lieBusted],
    last:[...document.querySelectorAll('#talk .line .body')].slice(-4).map(e=>e.textContent)}));
  console.log('信任 ' + meet.trust + '　问出 ' + meet.known.join(',') + '　谎话 ' + meet.out.join(',') + '　戳穿 ' + (meet.busted.join(',')||'无'));
  meet.last.forEach(l=>console.log('   ' + l));

  await p.click('#stop'); await p.waitForSelector('#st .chip');
  const strats = await p.$$eval('#st .chip', es=>es.map(e=>e.textContent));
  console.log('\n策略三选一：' + strats.join(' / '));
  await p.click('#st .chip[data-v="innocent"]'); await p.click('#go'); await p.waitForTimeout(1500);

  // 质证
  await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="authenticity"]');
  await p.click('#go'); await p.waitForTimeout(800);
  console.log('\n质证鉴定意见：' + await p.evaluate(()=>[...document.querySelectorAll('#record .line')].slice(-1)[0].textContent.replace(/\s+/g,' ').slice(0,80)));
  await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
  await p.click('#go'); await p.waitForTimeout(800);

  // 鉴定人：追问标准来源
  await p.waitForSelector('#wit .chip');
  await p.click('#wit .chip[data-v="ask"]'); await p.waitForSelector('#witSay');
  await p.fill('#witSay','一点八焦耳这个标准，是哪里定的？'); await p.click('#go'); await p.waitForTimeout(900);
  const w1 = await p.evaluate(()=>[...document.querySelectorAll('#record .line')].slice(-2).map(e=>e.textContent.replace(/\s+/g,' ')));
  w1.forEach(l=>console.log('   ' + l.slice(0,70)));
  await p.click('#wit .chip[data-v="ask"]'); await p.waitForSelector('#witSay');
  await p.fill('#witSay','这个能量打在人身上，会致伤吗？'); await p.click('#go'); await p.waitForTimeout(900);
  console.log('   ' + (await p.evaluate(()=>[...document.querySelectorAll('#record .line')].slice(-2)[0].textContent.replace(/\s+/g,' ').slice(0,70))));
  await p.click('#wit .chip[data-v="show"]'); await p.click('#go'); await p.waitForTimeout(800);
  await p.click('#wit .chip[data-v="pass"]'); await p.click('#go'); await p.waitForTimeout(800);

  // 辩论
  const LINES = ['一点八焦耳每平方厘米是部门规范性文件定的送检标准，远低于通常讲的致伤力界限，不能直接等同于刑法上的枪支。',
    '被告人在公开夜市摆摊六年，九支物品放在台面明处从未遮掩，她始终以为是打气球的玩具，不具备持有枪支的主观故意。',
    '这批物品从批发市场公开购进，单价三十二元，同一批货市面上多个摊位都在用，来源和用途都是公开的。',
    '被告人系初犯，年过五十，涉案物品未流入其他用途，社会危害性小，请求依照刑法第七十二条适用缓刑。'];
  for (const l of LINES){
    if (await p.$('.mask .vhead .r')) break;
    const o = await p.waitForSelector('#obj .chip',{timeout:4000}).catch(()=>null);
    if(o){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); }
    if (!await p.$('#say')) break;
    await p.fill('#say', l); await p.click('#go'); await p.waitForTimeout(1100);
  }
  for(let i=0;i<10;i++){
    if (await p.$('.mask .vhead .r')) break;
    if (await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); continue; }
    if (await p.$('#say')){ await p.fill('#say','辩护人的辩论意见发表完毕。'); await p.click('#go'); await p.waitForTimeout(900); continue; }
    await p.waitForTimeout(500);
  }
  await p.waitForSelector('.mask .vhead .r', {timeout:20000});
  const r = await p.evaluate(()=>({v:document.querySelector('.mask .vhead .r').textContent.trim(),
    t:Engine.total(), c:JSON.stringify(S.c), hits:[...S.hits],
    sub:document.querySelector('.modal .sub').textContent.replace(/\s+/g,' ').trim(),
    epi:(document.querySelector('.epilogue')||{}).textContent||'',
    pm:(document.querySelector('.postmortem')||{}).textContent||'',
    ledger:[...document.querySelectorAll('.modal .ledger .e')].map(e=>e.textContent.replace(/\s+/g,' '))}));
  console.log('\n判决：' + r.v + '　心证 ' + r.t + '　' + r.c);
  console.log('立住：' + r.hits.join(','));
  console.log(r.sub);
  console.log('结局：' + r.epi.slice(0,50) + '…');
  console.log('延伸阅读：' + (r.pm ? r.pm.slice(0,40) + '…' : '没有'));
  console.log('\n心证流水：'); r.ledger.forEach(l=>console.log('   ' + l));
  await p.screenshot({path:'shot-c02.png'});
  console.log('\n页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  srv.close(); await b.close();
})();
