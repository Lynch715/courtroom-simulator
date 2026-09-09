const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};
const tail=(p,n=1)=>p.evaluate(k=>[...document.querySelectorAll('#record .line')].slice(-k).map(e=>e.textContent.replace(/\s+/g,' ')),n);

(async () => {
  const dir = path.resolve('srv');
  const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.slice(1)));
    fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});
  await new Promise(r=>srv.listen(8088,r));
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:820}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
  await p.goto('http://localhost:8088/x.html');
  await p.evaluate(()=>localStorage.clear());
  await p.reload();
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(17); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(500);

  const cards = await p.$$eval('.caseCard', es=>es.map(e=>e.dataset.id + ' ' + e.querySelector('b').textContent));
  console.log('接案页：' + cards.join('　|　'));
  await p.click('.caseCard[data-id="c03"]'); await p.waitForTimeout(700);
  console.log('顶栏：' + await p.$eval('.brand span', e=>e.textContent));

  // 阅卷
  await p.click('.doc.pickable[data-ev="e1"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(250);
  await p.click('#mk .chip[data-f="legality"]'); await p.waitForTimeout(150);
  await p.click('#aThink'); await p.waitForTimeout(600);
  console.log('内心独白：' + await p.$eval('.myNotes .think', e=>e.textContent).catch(()=>'（无）'));
  for (const e of ['e2','e3']){
    await p.click(`.doc.pickable[data-ev="${e}"]`); await p.waitForTimeout(150);
    await p.click('#aRead'); await p.waitForTimeout(250);
  }
  const a1 = await p.evaluate(()=>({read:[...S.read], mark:JSON.stringify(S.marks||{})}));
  console.log('细读 ' + a1.read.join(',') + '　标记 ' + a1.mark);
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(800);

  // 会见
  console.log('\n—— 会见 ——');
  const QS = ['你先坐。不着急，我们有的是时间。',
              '我知道你现在什么都不想说。没关系。',
              '别急。那天晚上的经过，你还记得多少？',
              '我明白。那天为什么喝酒？',
              '慢慢说。你想从哪儿说起都行。',
              '不着急。撞完第一辆车之后，你做了什么？',
              '我知道你不容易。这不怪你一个人。',
              '慢慢说。赔偿的钱是哪来的，家里的房子呢？'];
  for (const q of QS){
    if(!await p.$('#talkSay')) break;
    if(await p.$('#bust')){ await p.click('#bust'); await p.waitForTimeout(800);
      const bl = await p.evaluate(()=>[...document.querySelectorAll('#talk .line .body')].slice(-3).map(e=>e.textContent));
      console.log('[戳穿] ' + bl.map(x=>x.replace(/\s+/g,' ')).join(' / ').slice(0,140)); }
    if(!await p.$('#talkSay')) break;
    await p.fill('#talkSay', q); await p.click('#go'); await p.waitForTimeout(800);
    const st = await p.evaluate(()=>({t:S.trust, k:[...S.known], o:[...S.lieOut], bu:[...S.lieBusted], n:S.turnsLeft,
      l:[...document.querySelectorAll('#talk .line .body')].slice(-1)[0]?.textContent||''}));
    console.log(`[信任${st.t} 余${st.n}] 我：${q}\n        他：${st.l.replace(/\s+/g,' ').slice(0,90)}`);
    if(st.k.length) console.log('        （问出：'+st.k.join(',')+'）');
    if(st.o.length) console.log('        （谎话：'+st.o.join(',')+(st.bu.length?'　已戳穿：'+st.bu.join(','):'')+'）');
  }
  const meet = await p.evaluate(()=>({trust:S.trust, known:[...S.known], out:[...S.lieOut], busted:[...S.lieBusted]}));
  console.log('会见结果：信任 '+meet.trust+'　问出 '+(meet.known.join(',')||'无')+'　谎话 '+(meet.out.join(',')||'无')+'　戳穿 '+(meet.busted.join(',')||'无'));

  if(!await p.$('#st .chip')){ await p.click('#stop'); }
  await p.waitForSelector('#st .chip');
  console.log('策略：' + (await p.$$eval('#st .chip', es=>es.map(e=>e.textContent))).join(' / '));
  await p.click('#st .chip[data-v="innocent"]'); await p.click('#go'); await p.waitForTimeout(1600);

  // 质证
  console.log('\n—— 质证 ——');
  await p.waitForSelector('#tri .chip');
  await p.click('#tri .chip[data-v="legality"]'); await p.click('#go'); await p.waitForTimeout(900);
  console.log('   ' + (await tail(p,1))[0].slice(0,100));
  await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]'); await p.click('#go'); await p.waitForTimeout(900);

  // 证人
  console.log('\n—— 证人 ——');
  const WQ = ['路面上有没有制动拖印？','血是谁抽的，几点抽的，有没有人见证？','他在现场是什么状态，说了什么？'];
  for (const q of WQ){
    if(!await p.$('#wit .chip[data-v="ask"]')) break;
    await p.click('#wit .chip[data-v="ask"]'); await p.waitForSelector('#witSay');
    await p.fill('#witSay', q); await p.click('#go'); await p.waitForTimeout(1000);
    const t = await tail(p,2);
    console.log('   问：'+q); t.forEach(l=>console.log('      '+l.slice(0,90)));
  }
  if(await p.$('#wit .chip[data-v="show"]')){ await p.click('#wit .chip[data-v="show"]'); await p.click('#go'); await p.waitForTimeout(1000); }
  if(await p.$('#wit .chip[data-v="pass"]')){ await p.click('#wit .chip[data-v="pass"]'); await p.click('#go'); await p.waitForTimeout(1000); }
  const xc = await p.evaluate(()=>({c:JSON.stringify(S.c), hits:[...S.hits], shown:[...S.shown]}));
  console.log('质证后：'+xc.c+'　立住 '+(xc.hits.join(',')||'无'));

  // 辩论
  console.log('\n—— 辩论 ——');
  const LINES = [
   '被告人对危害结果不是放任。放任是明知危害结果会发生而听之任之，行为人对结果不加控制；本案被告人始终在试图控制车辆，是轻信能够避免，属于过于自信的过失，依法应当以交通肇事罪论处。',
   '监控显示第一次碰撞后车尾制动灯亮起持续八秒，现场第一碰撞点前方还有十几米的制动拖印。他在踩刹车，这与放任危害结果发生的主观心态直接相悖。',
   '被告人亲属变卖唯一住房，全额赔偿一百零六万元，四名被害人近亲属中三家出具谅解书。依照刑法第六十一条，赔偿与谅解应当作为从轻处罚的量刑情节予以考虑。',
   '死刑只适用于罪行极其严重的犯罪分子。本案由交通事故引发，被告人并非蓄意加害特定对象，与故意杀人、爆炸等罪行极其严重的情形距离甚远，不属于依法应当适用死刑的情形。'];
  let li=0;
  for(let i=0;i<24;i++){
    if (await p.$('.mask .vhead .r')) break;
    if (await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(450); continue; }
    if (await p.$('#say')){
      const l = li<LINES.length ? LINES[li++] : '辩护人的辩论意见发表完毕。';
      await p.fill('#say', l); await p.click('#go'); await p.waitForTimeout(1200);
      const st = await p.evaluate(()=>({c:JSON.stringify(S.c),h:[...S.hits]}));
      console.log(`   [${li}] ${l.slice(0,26)}…  → ${st.c} 立住 ${st.h.join(',')||'无'}`);
      continue;
    }
    await p.waitForTimeout(500);
  }
  await p.waitForSelector('.mask .vhead .r', {timeout:25000});
  const r = await p.evaluate(()=>({v:document.querySelector('.mask .vhead .r').textContent.trim(),
    t:Engine.total(), c:JSON.stringify(S.c), hits:[...S.hits],
    sub:document.querySelector('.modal .sub')?.textContent.replace(/\s+/g,' ').trim()||'',
    epi:(document.querySelector('.epilogue')||{}).textContent||'',
    pm:(document.querySelector('.postmortem')||{}).textContent||'',
    ledger:[...document.querySelectorAll('.modal .ledger .e')].map(e=>e.textContent.replace(/\s+/g,' '))}));
  console.log('\n判决：' + r.v + '　心证 ' + r.t + '　' + r.c);
  console.log('立住：' + (r.hits.join(',')||'无'));
  console.log(r.sub);
  console.log('结局：' + r.epi.slice(0,60) + '…');
  console.log('延伸阅读：' + (r.pm ? r.pm.slice(0,50) + '…' : '没有'));
  console.log('\n心证流水：'); r.ledger.forEach(l=>console.log('   ' + l));
  await p.screenshot({path:'shot-c03.png'});
  console.log('\n页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  srv.close(); await b.close();
})();
