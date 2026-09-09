/* tools/laws.js —— 法条速查验收
 *
 * 施工规范 B7：条号 / 中文条号 / 带法名 / 关键词 / 罪名别名都要查得到，
 * 笔录里的条文号点得开，全程零外网。
 *
 *     node tools/laws.js [目标html]
 */
const { chromium } = require('playwright');
const path = require('path');
const T = path.resolve(process.argv[2] || 'index.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:800}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  let net = 0;
  await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : (net++, r.abort()));
  await p.goto('file://' + T);
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(3); });
  await p.click('.mask #ok');
  {   // B9 起开局是事务所，先接案
    const c = await p.waitForSelector('.caseCard', {timeout:2500}).catch(()=>null);
    if (c) { await c.click(); await p.waitForTimeout(600); }
  }

  console.log('条文库：' + await p.evaluate(()=>
    Object.keys(LAWS).length + ' 部法，' + Object.values(LAWS).reduce((a,x)=>a+Object.keys(x).length,0) + ' 条'));

  await p.click('#btnLaw');
  await p.waitForSelector('#lawDrawer:not([hidden])');
  console.log('默认打开显示本案常用条文：' + await p.$$eval('.lawCard .lawT', es=>es.map(e=>e.textContent).join('、')));

  for (const q of ['264','第二百六十四条','刑法63','正当防卫','非法持有枪支','醉酒驾驶','高空抛物','公序良俗','举证责任','人脸','9999']){
    await p.fill('#lawQ', q);
    await p.waitForTimeout(120);
    const hits = await p.$$eval('.lawCard .lawT', es=>es.map(e=>e.textContent));
    const first = await p.$eval('.lawCard .lawB', e=>e.textContent.slice(0,34)).catch(()=>
      p.$eval('.lawTip', e=>e.textContent).catch(()=>''));
    console.log(`  「${q}」→ ${hits.length ? hits.slice(0,3).join('、') + (hits.length>3?` …共${hits.length}条`:'') : '没结果'}`);
    if (hits.length) console.log(`      ${first}…`);
  }
  await p.click('#lawClose');

  // 笔录里的条文号
  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(500);
  await p.click('#stop'); await p.waitForSelector('#st .chip');
  await p.click('#st .chip[data-v="lenient"]'); await p.click('#go'); await p.waitForTimeout(1300);
  for(let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
                        await p.click('#go'); await p.waitForTimeout(700); }
  await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="pass"]');
  await p.click('#go'); await p.waitForTimeout(700);
  await p.waitForSelector('#obj .chip'); await p.click('#obj .chip[data-v="skip"]'); await p.click('#go');
  await p.waitForSelector('#say');
  await p.fill('#say','请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑。');
  await p.click('#go'); await p.waitForTimeout(1200);

  const refs = await p.$$eval('.lawRef', es=>es.map(e=>e.textContent + '→' + e.dataset.law + e.dataset.art));
  console.log('\n笔录里被点亮的条文号：' + (refs.join('  |  ') || '(一个都没有)'));
  if (refs.length){
    await p.click('.lawRef');
    await p.waitForSelector('#lawDrawer:not([hidden])');
    console.log('点一下弹出：' + await p.$eval('.lawCard .lawT', e=>e.textContent));
    console.log('   ' + (await p.$eval('.lawCard .lawB', e=>e.textContent)).slice(0,60) + '…');
    await p.screenshot({path:'t/shot-law.png'});
  }
  console.log('\n外网请求次数：' + net + '（0 说明纯本地）');
  console.log('页面 error：' + errs.length + (errs.length?'  '+errs.join(' | '):''));
  await b.close();
})();
