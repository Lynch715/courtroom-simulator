/* tools/act1.js —— 第一幕·阅卷验收
 *
 * 施工规范 B3 的三条：
 *   1) 精力用尽后不能再细读、不能再想
 *   2) 标对 / 标错 / 没读，同一句质证意见在庭上的三种下场
 *   3) 读过关键证据，庭上讲相关论点更有底
 *
 *     node tools/act1.js [目标html]
 */
const { chromium } = require('playwright');
const path = require('path');
const TARGET = path.resolve(process.argv[2] || 'index.html');

async function scene(fn){
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + TARGET);
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(5); });
  await p.click('.mask #ok');
  // B9 起开局是事务所，先接案
  {
    const c = await p.waitForSelector('.caseCard', {timeout:2500}).catch(()=>null);
    if (c) { await c.click(); await p.waitForTimeout(600); }
  }
  const r = await fn(p);
  const st = await p.evaluate(()=>({
    ledger: S.ledger.filter(e=>e.ch==='心').map(e=>e.why+' '+(e.v>0?'+':'')+e.v),
    lines: [...document.querySelectorAll('#record .line')].map(e=>e.querySelector('.body').textContent),
  }));
  await b.close();
  return Object.assign({errs}, st, r||{});
}

const openEv = async (p,id) => { await p.click(`.doc.pickable[data-ev="${id}"]`); await p.waitForTimeout(120); };
const read   = async (p,id) => { await openEv(p,id); await p.click('#aRead'); await p.waitForTimeout(150); };
const mark   = async (p,id,f)=>{ await openEv(p,id); await p.click(`#mk .chip[data-f="${f}"]`); await p.waitForTimeout(150); };
const leave  = async (p) => { await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(500);
  const st = await p.waitForSelector('#stop',{timeout:2500}).catch(()=>null);
  if(st){ await st.click(); await p.waitForSelector('#st .chip');
          await p.click('#st .chip[data-v="procedure"]'); await p.click('#go'); await p.waitForTimeout(1300); } };
const crossE3 = async (p, flag) => {          // 第一格无异议，第二格（同事证言）提 flag
  await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]'); await p.click('#go');
  await p.waitForTimeout(700);
  await p.waitForSelector('#tri .chip'); await p.click(`#tri .chip[data-v="${flag}"]`); await p.click('#go');
  await p.waitForTimeout(700);
};

(async () => {
  console.log('【一】精力预算');
  const a = await scene(async p => {
    const start = await p.evaluate(()=>S.energy);
    await read(p,'e1'); await read(p,'e3'); await read(p,'e2');           // 6 点
    const afterRead = await p.evaluate(()=>S.energy);
    await openEv(p,'e1'); await p.click('#aThink'); await p.waitForTimeout(400);
    await openEv(p,'e3'); await p.click('#aThink'); await p.waitForTimeout(400);  // 再 2 点
    const zero = await p.evaluate(()=>S.energy);
    await openEv(p,'e2');
    const disabled = await p.evaluate(()=>{
      const t = document.querySelector('#aThink');
      return {think: t ? t.disabled : null, thinkLeft: S.thinkLeft};
    });
    return {start, afterRead, zero, disabled};
  });
  console.log(`   精力 ${a.start} → 细读三份后 ${a.afterRead} → 想两次后 ${a.zero}`);
  console.log(`   精力见底时「想一想」按钮 disabled：${a.disabled.think}（还剩 ${a.disabled.thinkLeft} 次机会，但没精力了）`);

  console.log('\n【二】标对 / 标错 / 没读，同一句质证意见的三种下场');
  const label = ['标对了合法性','标成了真实性','根本没读'];
  const runs = [
    async p => { await read(p,'e3'); await mark(p,'e3','legality');    await leave(p); await crossE3(p,'legality'); },
    async p => { await read(p,'e3'); await mark(p,'e3','authenticity');await leave(p); await crossE3(p,'legality'); },
    async p => { await leave(p); await crossE3(p,'legality'); },
  ];
  for (let i=0;i<3;i++){
    const r = await scene(runs[i]);
    const hit = r.ledger.find(x=>x.indexOf('质证击中')>=0) || '(没击中)';
    const judge = r.lines.find(l=>l.indexOf('本庭注意到了')>=0) || '(无)';
    console.log(`   ${label[i]}：${hit}`);
    console.log(`      审判长：${judge}`);
  }

  console.log('\n【三】读过关键证据，庭上讲相关论点更有底');
  const say = '本案全程使用被告人本人实名卡操作，交易记录与监控完整在案，不存在秘密窃取的行为要件，与盗窃罪的构成不符，请法庭注意这一点。';
  for (const [name, pre] of [['读过交易流水', true], ['没读', false]]){
    const r = await scene(async p => {
      if (pre) await read(p,'e1');
      await leave(p);
      await crossE3(p,'none');
      await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="pass"]'); await p.click('#go');
      await p.waitForSelector('#obj .chip',{timeout:15000}); await p.click('#obj .chip[data-v="skip"]'); await p.click('#go');
      await p.waitForSelector('#say'); await p.fill('#say', say); await p.click('#go');
      await p.waitForTimeout(1000);
    });
    console.log(`   ${name}：${r.ledger.find(x=>x.indexOf('非秘密性')>=0) || '(没立住)'}`);
  }
  console.log('\n页面 error：0 视为通过');
})();
