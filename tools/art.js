/* tools/art.js —— 美术接入验收
 *
 * 施工规范 B8：有图时各处正常显示、无图时全走 SVG 占位且零报错、
 * 关键时刻的立绘滑入能触发。
 *
 *     node tools/art.js [目标html] [noart]
 */
const { chromium } = require('playwright');
const path = require('path');
const T = path.resolve(process.argv[2] || 'index.html');
const NOART = process.argv[3] === 'noart';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280,height:820}});
  const errs = []; p.on('pageerror', e=>errs.push(e.message));
  p.on('console', m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
  let img = 0, img404 = 0;
  if (NOART) await p.route('**/art/**', r => (img404++, r.abort()));
  else p.on('response', r => { if (/\/art\//.test(r.url())) { img++; if (r.status() >= 400) img404++; } });

  await p.goto('file://' + T);
  await p.evaluate(()=>{ if(window.Engine) Engine.seed(4); });
  await p.click('.mask #ok'); await p.waitForTimeout(400);
  {   // B9 起开局是事务所，先接案
    const c = await p.waitForSelector('.caseCard', {timeout:2500}).catch(()=>null);
    if (c) { await c.click(); await p.waitForTimeout(700); }
  }

  const shot = async (n) => { if(!NOART) await p.screenshot({path:'t/a-'+n+'.png'}); };
  const broken = () => p.evaluate(()=>[...document.querySelectorAll('img.art')]
      .filter(i=>i.complete && i.naturalWidth===0).length);
  const counts = () => p.evaluate(()=>({img:document.querySelectorAll('img.art').length,
                                        ph:document.querySelectorAll('.art.ph').length}));

  console.log('阅卷：' + JSON.stringify(await counts()) + '  坏图 ' + await broken());
  await p.click('.doc.pickable[data-ev="e3"]'); await p.waitForTimeout(150);
  await p.click('#aRead'); await p.waitForTimeout(400);
  console.log('  细读证据后：' + JSON.stringify(await counts()));
  await shot('file');

  await p.click('#leave'); await p.click('#yes'); await p.waitForTimeout(800);
  console.log('会见：' + JSON.stringify(await counts()) + '  坏图 ' + await broken());
  await p.fill('#talkSay','你先坐。慢慢说，不着急。'); await p.click('#go'); await p.waitForTimeout(600);
  await shot('meet');

  await p.click('#stop'); await p.waitForSelector('#st .chip');
  await p.click('#st .chip[data-v="lenient"]'); await p.click('#go'); await p.waitForTimeout(1500);
  console.log('庭审：' + JSON.stringify(await counts()) + '  坏图 ' + await broken());
  await shot('cross');

  // 触发立绘滑入
  for(let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]');
                        await p.click('#go'); await p.waitForTimeout(700); }
  await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="show"]');
  await p.click('#go'); await p.waitForTimeout(500);
  console.log('立绘滑入：' + await p.evaluate(()=>{ const f=document.querySelector('#flash');
    return f ? (f.classList.contains('on') ? '出现了：'+f.querySelector('.flashCap b').textContent : '没出现') : '没有 #flash'; }));
  await shot('flash');

  console.log(NOART ? ('art 请求被全部拦截 ' + img404 + ' 次') : ('art 请求 ' + img + ' 次，其中失败 ' + img404));
  console.log('页面 error：' + errs.length + (errs.length?'  '+errs.slice(0,3).join(' | '):''));
  await b.close();
})();
