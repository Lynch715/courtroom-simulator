const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const mime={'.html':'text/html','.webp':'image/webp'};
const tail=(p,n=1)=>p.evaluate(k=>[...document.querySelectorAll('#record .line')].slice(-k).map(e=>e.textContent.replace(/\s+/g,' ')),n);

(async () => {
  const dir = path.resolve('srv');
  const srv = http.createServer((q,r)=>{const f=path.join(dir,q.url==='/'?'x.html':decodeURIComponent(q.url.slice(1)));
    fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'}),r.end(d)));});
  await new Promise(r=>srv.listen(8093,r));
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:820}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
  await p.goto('http://localhost:8093/x.html');
  await p.evaluate(()=>localStorage.clear());
  await p.reload();
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(17); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok'); await p.waitForTimeout(500);

  const cards = await p.$$eval('.caseCard', es=>es.map(e=>e.dataset.id + ' ' + e.querySelector('b').textContent));
  console.log('接案页：' + cards.join('　|　'));
  /* 事务所一屏最多列三个案子，c06 还排不上。直接接案。 */
  if(await p.$('.caseCard[data-id="c06"]')) await p.click('.caseCard[data-id="c06"]');
  else await p.evaluate(()=>takeCase('c06'));
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
    if(e==='e2'){ await p.click('#mk .chip[data-f="legality"]'); await p.waitForTimeout(150); }
  }
  const a1 = await p.evaluate(()=>({read:[...S.read], mark:JSON.stringify(S.marks||{})}));
  console.log('细读 ' + a1.read.join(',') + '　标记 ' + a1.mark);
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(800);

  // 会见
  console.log('\n—— 会见 ——');
  const QS = ['你先坐。不着急，咱们有的是时间。',
              '我知道你这半年不好过。',
              '别急。那个证的事，你当时是怎么想的？',
              '我明白。你一年收多少，能挣多少？',
              '慢慢说。你想从哪儿说起都行。',
              '不着急。你到底知不知道要办这个证？',
              '换了谁都一样，这不怪你。',
              '慢慢说。那些农户为什么不自己拉去粮库？'];
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
  for (const f of ['relevance','legality','none']){
    await p.waitForSelector('#tri .chip'); await p.click(`#tri .chip[data-v="${f}"]`);
    await p.click('#go'); await p.waitForTimeout(900);
    console.log('   ['+f+'] ' + (await tail(p,1))[0].slice(0,90));
  }

  // 证人
  console.log('\n—— 证人 ——');
  const WQ = ['粮库愿不愿意直接收散户拉来的粮？',
              '他送来的粮，水分杂质这些够不够标准？',
              '这四年，粮库查过他的收购资格没有？'];
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
   '刑法第二百二十五条第四项是兜底条款，其适用必须与前三项行为具有相当性，并且需要有法律或者司法解释的明文规定。现行司法解释没有把无证收购粮食列进去，罪刑法定不允许随意扩张。',
   '被告人违反的是粮食流通管理条例，该条例已经规定了没收违法所得和罚款的法律责任，是行政处罚。行政违法不能自动上升为犯罪，这个行为该由行政机关来处理。',
   '被告人收购的玉米全部售予两家国有粮库，粮食没有脱离国家收储体系。一百三十七户农户凭台账领款，价格高于自己雇车排队后的净收益。他没有扰乱流通秩序，他是流通里的一环。',
   '全部经营额二十一万余元，被告人四年获利六千元。用六千元的获利去适用非法经营罪的法定刑，罪与刑严重失衡，本案不具有刑罚必要性。'];

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
  await p.screenshot({path:'shot-c06.png'});
  console.log('\n页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  srv.close(); await b.close();
})();
