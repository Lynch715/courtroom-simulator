const { chromium } = require('playwright');
const path = require('path');
const TARGET = path.resolve(process.argv[2] || 'index.html');

async function open(fn){
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + TARGET);
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(21); });
  if(await p.$('#wgo')) await p.click('#wgo'); else await p.click('.mask #ok');

  /* 事务所接案页是 B9 之后加的：老脚本原来直接进卷宗，这里补一步选案。 */
  await p.waitForTimeout(400);
  if(await p.$('.caseCard[data-id="c01"]')){ await p.click('.caseCard[data-id="c01"]'); await p.waitForTimeout(700); }
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(500);
  await p.click('#stop'); await p.waitForSelector('#st .chip');
  await p.click('#st .chip[data-v="lenient"]'); await p.click('#go'); await p.waitForTimeout(1300);
  const r = await fn(p, b);
  const errsAll = errs.slice();
  await b.close();
  return {errs: errsAll, r};
}
const crossToWitness = async p => {
  for(let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
                        await p.click('#go'); await p.waitForTimeout(700); }
  await p.waitForSelector('#wit .chip');
};
const witPass = async p => { await p.click('#wit .chip[data-v="pass"]'); await p.click('#go'); await p.waitForTimeout(700); };
const skipObj = async p => {
  const ok = await p.waitForSelector('#obj .chip',{timeout:4000}).catch(()=>null);
  if(!ok) return false;
  await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); return true; };
const speak = async (p,t) => { await p.waitForSelector('#say'); await p.fill('#say',t);
                               await p.click('#go'); await p.waitForTimeout(1100); };
// 只取「法庭辩论」开始之后公诉人说的话
const prosLines = p => p.evaluate(()=>{
  const all=[...document.querySelectorAll('#record .line')];
  const i=all.findIndex(e=>e.querySelector('.body').textContent.indexOf('现在进行法庭辩论')>=0);
  return all.slice(i+1).filter(e=>(e.querySelector('.who')||{}).textContent==='公诉人 · 林奕')
            .map(e=>e.querySelector('.body').textContent);
});

(async () => {
  console.log('【一】立住论点之后，公诉人不再拿那条说事');
  await open(async p => {
    await crossToWitness(p); await witPass(p);
    await skipObj(p);
    console.log('   第1轮他说：' + (await prosLines(p))[0].slice(0,40) + '…');
    await speak(p,'本案全程使用被告人本人实名卡操作，监控完整在案，不存在秘密窃取的行为要件，与盗窃罪的构成不符。');
    await skipObj(p);
    const l2 = (await prosLines(p))[1];
    console.log('   你立住「非秘密性」之后，第2轮他说：' + l2.slice(0,46) + '…');
    console.log('   → 这是回应你，不是重复第1轮：' + (l2.indexOf('一百七十一次是什么')<0 ? '是' : '否'));
    await speak(p,'请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑，本案量刑畸重。');
    await skipObj(p);
    const sys = await p.evaluate(()=>[...document.querySelectorAll('#record .line.sys .body')]
      .map(e=>e.textContent).filter(t=>t.indexOf('没有再提')>=0));
    console.log('   ' + (sys[0] || '（没有出现「不再提」的提示）'));
    const st = await p.evaluate(()=>({said:[...S.argSaid],reb:[...S.argRebutted]}));
    console.log('   他说过的论点：' + st.said.join(',') + '；回应过你的：' + st.reb.join(','));
  });

  console.log('\n【一之二】先把量刑那条论点立住，他就不提数额了');
  await open(async p => {
    await crossToWitness(p); await witPass(p);
    await skipObj(p);
    await speak(p,'请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑，本案罪责刑不相适应。');
    await skipObj(p);
    await speak(p,'银行系统故障持续四日，两次报修均无人处置，损失扩大系管理失职所致。');
    if (await skipObj(p) && await p.$('#say'))
      await speak(p,'本案全程实名卡操作，监控在案，不符合秘密窃取的行为要件。');
    // 把剩下的流程走完，看他还提不提那些被驳倒的论点
    for(let i=0;i<8;i++){
      if (await p.$('.mask .vhead .r')) break;
      if (await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); continue; }
      if (await p.$('#say')){ await p.fill('#say','以上意见请法庭在评议时一并考虑。'); await p.click('#go'); await p.waitForTimeout(900); continue; }
      await p.waitForTimeout(400);
    }
    const sys = await p.evaluate(()=>[...document.querySelectorAll('#record .line.sys .body')]
      .map(e=>e.textContent).filter(t=>t.indexOf('没有再提')>=0));
    sys.forEach(t=>console.log('   ' + t));
    if(!sys.length) console.log('   （他把三条都说完了，没有可跳过的）');
    const st = await p.evaluate(()=>({said:[...S.argSaid],hits:[...S.hits]}));
    console.log('   你立住的：' + st.hits.join(',') + '　他推进过的：' + st.said.join(','));
  });

  console.log('\n【二】追问证人，问出破绽');
  const two = await open(async p => {
    await crossToWitness(p);
    for(const q of ['你说设备当天运行正常，依据是什么？','那份值班记录是谁写的，什么时候写的？']){
      await p.click('#wit .chip[data-v="ask"]'); await p.waitForSelector('#witSay');
      await p.fill('#witSay', q); await p.click('#go'); await p.waitForTimeout(800);
      const last = await p.evaluate(()=>[...document.querySelectorAll('#record .line')].slice(-2)
        .map(e=>(e.querySelector('.who')||{}).textContent+'｜'+e.querySelector('.body').textContent));
      console.log('   问：' + q);
      last.forEach(l=>console.log('     ' + l));
    }
    return p.evaluate(()=>({hit:[...S.witHit], hits:[...S.hits],
      led:S.ledger.filter(e=>e.ch==='心').map(e=>e.why+' '+(e.v>0?'+':'')+e.v)}));
  });
  console.log('   问出的破绽：' + two.r.hit.join(',') + '　已立住的论点：' + two.r.hits.join(','));
  console.log('   ' + (two.r.led.find(x=>x.indexOf('破绽')>=0)||''));

  console.log('\n【三】轮次是动态的');
  for (const [name, plan] of [
    ['一路空泛', ['请法庭从轻处理。','请法庭考虑他的实际情况。','请法庭明察。','希望法庭公正裁判。','我的意见就这些。']],
    ['三条论点全立住', [
      '本案全程使用被告人本人实名卡操作，监控在案，不存在秘密窃取的行为要件。',
      '银行系统故障持续四日，两次报修均无人处置，损失扩大系管理失职所致。',
      '请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑。']],
    ['第一句就说完了', ['辩护人的辩论意见发表完毕。']],
  ]){
    const r = await open(async p => {
      await crossToWitness(p); await witPass(p);
      for(const line of plan){
        if (await p.$('.mask .vhead .r')) break;
        if (!await skipObj(p)) break;
        if (await p.$('.mask .vhead .r')) break;
        if (!await p.$('#say')) break;
        await speak(p, line);
      }
      for(let i=0;i<10;i++){
        if (await p.$('.mask .vhead .r')) break;
        if (await p.$('#obj .chip')){ await p.click('#obj .chip[data-v="skip"]'); await p.click('#go'); await p.waitForTimeout(400); continue; }
        if (await p.$('#say')){ await p.fill('#say','辩护人的辩论意见发表完毕。'); await p.click('#go'); await p.waitForTimeout(900); continue; }
        await p.waitForTimeout(500);
      }
      return p.evaluate(()=>({round:S.round, said:[...S.argSaid], reb:[...S.argRebutted],
        v:(document.querySelector('.mask .vhead .r')||{}).textContent}));
    });
    console.log(`   ${name}：辩论 ${r.r.round} 轮，他推进了 ${r.r.said.length} 条、回应了 ${r.r.reb.length} 次 → ${r.r.v}`);
  }
})();
