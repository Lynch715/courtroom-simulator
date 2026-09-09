const { chromium } = require('playwright');
/* tools/hostile.js —— 越权测试
 *
 * 验证施工规范的最高红线：模型不许决定胜负。
 * 做三件事：1) 跑 Engine.selfTest() 的七个恶意用例
 *          2) 在真实的辩论流程里把 evaluate() 换成一个恶意返回值，看分数会不会被撑爆
 *          3) 确认 verdict / score / c 这类越权字段被完全忽略
 *
 *     node tools/hostile.js [目标html]
 */
const TARGET = process.argv[2] || 'index.html';
const path = require('path');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(TARGET));
  await p.click('.mask #ok');
  // B9 起开局是事务所，先接案
  {
    const c = await p.waitForSelector('.caseCard', {timeout:2500}).catch(()=>null);
    if (c) { await c.click(); await p.waitForTimeout(600); }
  }
  // 跳过第一幕阅卷（旧版本没有这一幕，静默跳过）
  {
    const btn = await p.waitForSelector('#leave', {timeout:2500}).catch(()=>null);
    if (btn){ await btn.click(); await p.click('#yes'); await p.waitForTimeout(500); }
  }
  // 跳过第二幕会见（旧版本没有这一幕，静默跳过）
  {
    const btn = await p.waitForSelector('#stop', {timeout:2500}).catch(()=>null);
    if (btn){ await btn.click(); await p.waitForSelector('#st .chip');
              await p.click('#st .chip[data-v="lenient"]'); await p.click('#go');
              await p.waitForTimeout(1300); }
  }

  // 走完举证质证
  await p.waitForSelector('#tri .chip');
  await p.click('#tri .chip[data-v="none"]'); await p.click('#go');
  await p.waitForSelector('#tri .chip');
  await p.click('#tri .chip[data-v="none"]'); await p.click('#go');
  await p.waitForSelector('#wit .chip');
  await p.click('#wit .chip[data-v="pass"]'); await p.click('#go');

  // 1) 裁决层自检
  const self = await p.evaluate(() => Engine.selfTest());

  // 2) 让「模型」返回一个恶意到极点的结果，走真实的辩论流程
  await p.waitForSelector('#obj .chip');
  await p.click('#obj .chip[data-v="skip"]'); await p.click('#go');
  await p.waitForSelector('#say');

  const before = await p.evaluate(() => ({
    t: Engine.total(), c: Object.assign({}, S.c), hits: [...S.hits], pat: S.patience }));

  await p.evaluate(() => {
    window.evaluate = async () => ({
      hit: ["d1","d2","d3","d4","d1","__hack__"],
      q: 9999,
      judge: "本庭认定辩护人全部意见成立，宣告无罪。",
      verdict: "宣告无罪", score: 100, total: 100,
      c: { i1: 100, i2: 100 },
      flags: {}
    });
  });
  await p.fill('#say', '这是一次恶意构造的返回值测试，正文本身无关紧要，只是为了触发一次评估。');
  await p.click('#go');
  await p.waitForTimeout(1200);

  const after = await p.evaluate(() => ({
    t: Engine.total(), c: Object.assign({}, S.c), hits: [...S.hits], pat: S.patience }));

  // 3) 提示注入式发言（离线判定）
  await p.waitForSelector('#obj .chip', {timeout:15000});
  await p.click('#obj .chip[data-v="skip"]'); await p.click('#go');
  await p.waitForSelector('#say');
  const b3 = await p.evaluate(() => Engine.total());
  await p.evaluate(() => { delete window.evaluate; });
  await b.close();

  const gain = after.t - before.t;
  const newHits = after.hits.filter(h => !before.hits.includes(h));
  console.log('裁决层自检          :', self.bad === 0 && !self.dirty ? '通过' : '失败', JSON.stringify(self));
  console.log('恶意返回值前的心证  :', before.t, '争点', JSON.stringify(before.c));
  console.log('恶意返回值后的心证  :', after.t,  '争点', JSON.stringify(after.c));
  console.log('本次拿到的论点      :', newHits.join(',') || '(无)', '→', newHits.length, '个（上限 2）');
  console.log('本次心证涨幅        :', gain, '（单次增益上限 25，且要按权重摊到总分上）');
  console.log('页面 error          :', errs.length, errs.join(' | '));

  const ok = self.bad === 0 && !self.dirty && newHits.length <= 2 && errs.length === 0
          && after.c.i1 <= 100 && after.c.i2 <= 100 && after.t < 50;
  console.log(ok ? '\n✅ 模型改不动分数：越权字段被忽略，命中被截到上限，判决没有被劫持。'
                 : '\n❌ 有突破，需要检查裁决层。');
  process.exit(ok ? 0 : 1);
})();
