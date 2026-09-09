const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};
const tail=(p,n=1)=>p.evaluate(k=>[...document.querySelectorAll('#record .line')].slice(-k).map(e=>e.textContent.replace(/\s+/g,' ')),n);

(async () => {
  const dir = path.resolve('srv');
  const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.slice(1)));
    fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});
  await new Promise(r=>srv.listen(8092,r));
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:820}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
  await p.goto('http://localhost:8092/x.html');
  await p.evaluate(()=>localStorage.clear());
  await p.reload();
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(17); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(500);

  const cards = await p.$$eval('.caseCard', es=>es.map(e=>e.dataset.id + ' ' + e.querySelector('b').textContent));
  console.log('接案页：' + cards.join('　|　'));
  /* 事务所一屏最多列三个案子，c05 还排不上。直接接案。 */
  if(await p.$('.caseCard[data-id="c05"]')) await p.click('.caseCard[data-id="c05"]');
  else await p.evaluate(()=>takeCase('c05'));
  await p.waitForTimeout(800);
  console.log('顶栏：' + await p.$eval('.brand span', e=>e.textContent));

  // 阅卷
  await p.click('.doc.pickable[data-ev="e1"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(250);
  await p.click('#mk .chip[data-f="relevance"]'); await p.waitForTimeout(150);
  await p.click('#aThink'); await p.waitForTimeout(600);
  console.log('内心独白：' + await p.$eval('.myNotes .think', e=>e.textContent).catch(()=>'（无）'));
  for (const e of ['e2','e3']){
    await p.click(`.doc.pickable[data-ev="${e}"]`); await p.waitForTimeout(150);
    await p.click('#aRead'); await p.waitForTimeout(250);
    if(e==='e3'){ await p.click('#mk .chip[data-f="legality"]'); await p.waitForTimeout(150); }
  }
  const a1 = await p.evaluate(()=>({read:[...S.read], mark:JSON.stringify(S.marks||{})}));
  console.log('细读 ' + a1.read.join(',') + '　标记 ' + a1.mark);
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(800);

  // 会见
  console.log('\n—— 会见 ——');
  const QS = ['你先坐。不用道歉，也不用急。',
              '我知道你这几十天不好过。',
              '别急。后来那两下是怎么回事？',
              '我明白。刀是怎么到你手上的？',
              '慢慢说。你想从哪儿说起都行。',
              '不着急。他用刀是怎么打你的，打哪儿？',
              '换了谁都一样。这不怪你。',
              '慢慢说。你为什么还要往前那两下？'];
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
  for (const f of ['relevance','none','legality']){
    await p.waitForSelector('#tri .chip'); await p.click(`#tri .chip[data-v="${f}"]`);
    await p.click('#go'); await p.waitForTimeout(900);
    console.log('   ['+f+'] ' + (await tail(p,1))[0].slice(0,90));
  }

  // 证人
  console.log('\n—— 证人 ——');
  const WQ = ['他回车里拿了什么，用了多久？',
              '刀掉在地上之后，刘志龙往哪个方向走的？',
              '从刀掉地上到事情结束，大概多久？'];
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
   '刘志龙返回车内取出长刀，对周海明的颈部等要害连续击打七次。行凶的认定看的是行为的暴力程度和对人身安全的现实危险，不取决于是否已经造成后果。',
   '侦查机关强调用的是刀面。持一把五十九厘米的刀拍击颈部，手腕一翻就是刃击，这个危险是现实存在的，不因为当时是刀身接触而消失。',
   '长刀脱手并不等于侵害结束。刘志龙转身走向的是他自己那辆车，刀就是从这辆车里拿出来的，车内后排还有一把管制刀具，同车三人都站在车边没有一人制止。危险并没有实际消除。',
   '对正在进行的行凶采取防卫行为，造成不法侵害人伤亡的，依照刑法第二十条第三款不属于防卫过当，不负刑事责任。本案符合这一条的适用条件。'];

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
  await p.screenshot({path:'shot-c05.png'});
  console.log('\n页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  srv.close(); await b.close();
})();
