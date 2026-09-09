const { chromium } = require('playwright');
const path = require('path');
const TARGET = path.resolve(process.argv[2] || 'index.html');
const COURT_LINE = '我的当事人自始至终不知道那台机器有故障，他没有非法占有的目的，请法庭注意这一点。';

async function scene(fn){
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + TARGET);
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(11); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok');

  /* 事务所接案页是 B9 之后加的：老脚本原来直接进卷宗，这里补一步选案。 */
  await p.waitForTimeout(400);
  if(await p.$('.caseCard[data-id="c01"]')){ await p.click('.caseCard[data-id="c01"]'); await p.waitForTimeout(700); }
  await fn(p);
  const st = await p.evaluate(()=>({
    trust:S.trust, known:[...S.known], out:[...S.lieOut], busted:[...S.lieBusted],
    believed:[...S.lieBelieved], fired:S.lieFired, con:S.career.conscience,
    ledger:S.ledger.filter(e=>e.ch==='心').map(e=>e.why+' '+(e.v>0?'+':'')+e.v),
    talk:[...document.querySelectorAll('#talk .line .body')].map(e=>e.textContent),
    lines:[...document.querySelectorAll('#record .line .body')].map(e=>e.textContent),
    t: typeof Engine!=='undefined' ? Engine.total() : null,
  }));
  await b.close();
  return Object.assign({errs}, st);
}

const readEv = async (p,id)=>{ await p.click(`.doc.pickable[data-ev="${id}"]`); await p.waitForTimeout(120);
                               await p.click('#aRead'); await p.waitForTimeout(180); };
const leaveFile = async p =>{ await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(500); };
const talk = async (p,t)=>{ await p.waitForSelector('#talkSay'); await p.fill('#talkSay',t);
                            await p.click('#go'); await p.waitForTimeout(500); };
const endMeet = async (p,st)=>{ await p.click('#stop'); await p.waitForSelector('#st .chip');
                                await p.click(`#st .chip[data-v="${st}"]`); await p.click('#go');
                                await p.waitForTimeout(1300); };
const toDebate = async p =>{
  for(let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
                        await p.click('#go'); await p.waitForTimeout(700); }
  await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="pass"]');
  await p.click('#go'); await p.waitForTimeout(700);
  await p.waitForSelector('#obj .chip',{timeout:15000}); await p.click('#obj .chip[data-v="skip"]');
  await p.click('#go'); await p.waitForTimeout(400);
};

(async () => {
  console.log('【链路一】没读同事证言笔录 → 戳不穿 → 庭上引用 → 当庭打脸');
  const a = await scene(async p=>{
    await leaveFile(p);                                   // 一份都不读
    await talk(p,'你先坐。慢慢说，不着急。');
    await talk(p,'那天晚上你是几点到的？');
    await talk(p,'你知不知道那台机器有毛病？');           // 触发谎话
    const canBust = await p.$('#bust');
    console.log('   会见时有没有「出示卷宗里的记载」这个按钮：' + (canBust?'有':'没有'));
    console.log('   他跟你说的：' + ((await p.evaluate(()=>[...document.querySelectorAll('#talk .line .body')].map(e=>e.textContent))).find(t=>t.indexOf('一次都没意识到')>=0)||'(没抛谎)'));
    await endMeet(p,'innocent');
    await toDebate(p);
    await p.waitForSelector('#say'); await p.fill('#say',COURT_LINE);
    await p.click('#go'); await p.waitForTimeout(1200);
  });
  console.log('   庭上：' + (a.lines.find(l=>l.indexOf('同事证言在卷')>=0)||'(没打脸)'));
  console.log('   审判长：' + (a.lines.find(l=>l.indexOf('对不上')>=0)||'(无)'));
  console.log('   代价：' + (a.ledger.find(x=>x.indexOf('谎话')>=0)||'(无)') + '　最终心证 ' + a.t);

  console.log('\n【链路二】读了笔录 → 当面戳穿 → 庭上说同一句话，没事');
  const c = await scene(async p=>{
    await readEv(p,'e3');
    await leaveFile(p);
    await talk(p,'你先坐。慢慢说。');
    await talk(p,'那天晚上几点到的？');
    await talk(p,'你知不知道那台机器有毛病？');
    const btn = await p.$('#bust');
    console.log('   会见时有没有「出示卷宗里的记载」这个按钮：' + (btn?'有':'没有'));
    if(btn){ await btn.click(); await p.waitForTimeout(500);
      console.log('   戳穿时他说：' + ((await p.evaluate(()=>[...document.querySelectorAll('#talk .line .body')].map(e=>e.textContent))).find(t=>t.indexOf('随口一说')>=0)||'(没戳穿)')); }
    await endMeet(p,'innocent');
    await toDebate(p);
    await p.waitForSelector('#say'); await p.fill('#say',COURT_LINE);
    await p.click('#go'); await p.waitForTimeout(1200);
  });
  console.log('   庭上打脸：' + (c.fired?'仍然触发了（不对）':'没有触发') + '　最终心证 ' + c.t);

  console.log('\n【链路三】答应一件办不到的事');
  const d = await scene(async p=>{
    await leaveFile(p);
    const t0 = await p.evaluate(()=>S.trust);
    await talk(p,'你放心，我保证你无罪，一定没事。');
    const t1 = await p.evaluate(()=>({t:S.trust,c:S.career.conscience}));
    console.log('   信任 ' + t0 + ' → ' + t1.t + '　良心 ' + t1.c);
    console.log('   他说：' + (await p.evaluate(()=>[...document.querySelectorAll('#talk .line .body')].pop().textContent)));
    await endMeet(p,'innocent');
  });

  console.log('\n【附加】信任不够时问不出秘密');
  const e = await scene(async p=>{
    await leaveFile(p);
    await talk(p,'到底怎么回事，你说实话，第一次是怎么发现的？');   // pressing，信任反降
    console.log('   信任 ' + (await p.evaluate(()=>S.trust)) + '，问出的秘密数 ' + (await p.evaluate(()=>S.known.length)));
    console.log('   他说：' + (await p.evaluate(()=>[...document.querySelectorAll('#talk .line .body')].pop().textContent)));
    for(const q of ['是我问急了。你慢慢说，我不着急。','我理解你当时的处境，不怪你。',
                    '你先别怕，我会尽力。','慢慢说，不是你的错，我知道你不容易。']){
      await talk(p,q);
      const st = await p.evaluate(()=>({t:S.trust,k:S.known.length}));
      console.log(`   「${q}」→ 信任 ${st.t}，已问出 ${st.k} 条`);
    }
    await talk(p,'那第一次到底是怎么回事，你慢慢说。');
    const fin = await p.evaluate(()=>({t:S.trust,k:[...S.known],
      last:[...document.querySelectorAll('#talk .line .body')].slice(-3).map(e=>e.textContent)}));
    console.log('   信任 ' + fin.t + '，问出的秘密：' + (fin.k.join(',')||'无'));
    fin.last.forEach(l=>console.log('      ' + l));
    await endMeet(p,'lenient');
  });

  const errs = [...a.errs,...c.errs,...d.errs,...e.errs];
  console.log('\n页面 error：' + errs.length + (errs.length?('  '+errs.join(' | ')):''));
})();
