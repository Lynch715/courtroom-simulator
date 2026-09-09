/* tools/floor.js —— 耐心见底的后果
 *
 * 连续冒犯法庭，验证：训诫（耐心<20）→ 责令停止发言（耐心=0）→ 插话入口收起
 * → 被禁言后仍能走完流程到宣判。
 *
 *     node tools/floor.js [目标html]
 */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2] || 'index.html'));
  await p.evaluate(()=>{ if(window.Engine&&Engine.seed) Engine.seed(3); });
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
  for (let i=0;i<2;i++){ await p.waitForSelector('#tri .chip'); await p.click('#tri .chip[data-v="none"]'); await p.click('#go'); }
  await p.waitForSelector('#wit .chip'); await p.click('#wit .chip[data-v="pass"]'); await p.click('#go');

  const rude = ['你闭嘴，胡说八道。','公诉人放屁。','这法庭简直是胡说八道，无耻。','滚出去。','白痴。','你算什么东西。','纯属放屁，闭嘴。'];
  for (let i=0;i<rude.length;i++){
    const st = await p.evaluate(()=>({p:S.patience,a:S.admonished,s:S.silenced}));
    if (st.s) break;
    await p.waitForSelector('#asideBtn', {timeout:10000});
    await p.click('#asideBtn'); await p.waitForSelector('#asideSay');
    await p.fill('#asideSay', rude[i]); await p.click('#asideGo');
    await p.waitForTimeout(600);
    const af = await p.evaluate(()=>({p:S.patience,a:S.admonished,s:S.silenced,rep:S.career.rep}));
    console.log(`第${i+1}次冒犯：耐心 ${st.p} → ${af.p}` + (af.a&&!st.a?'   ← 触发训诫':'') + (af.s&&!st.s?'   ← 责令停止发言':''));
    if (af.s){
      const last = await p.evaluate(()=>[...document.querySelectorAll('#record .line')].slice(-3)
        .map(e=>(e.querySelector('.who')?.textContent||'')+'｜'+e.querySelector('.body').textContent));
      last.forEach(l=>console.log('   '+l));
      console.log('   声誉累计 ' + af.rep);
    }
  }
  // 被禁言后还能不能继续走到宣判
  const asideGone = await p.evaluate(()=>!document.querySelector('#asideBtn'));
  console.log('\n禁言后插话入口已收起：' + (asideGone?'是':'否'));
  await p.waitForSelector('.primary', {timeout:10000});
  for (let i=0;i<8;i++){
    if (await p.$('.mask .vhead .r')) break;
    const btn = await p.$('#go'); if (btn) { await btn.click(); await p.waitForTimeout(700); } else await p.waitForTimeout(700);
  }
  const v = await p.$('.mask .vhead .r');
  console.log('禁言后仍能走到宣判：' + (v ? '是 → ' + (await v.textContent()).trim() : '否'));
  console.log('页面 error：' + errs.length + (errs.length?('  '+errs.join(' | ')):''));
  await b.close();
})();
