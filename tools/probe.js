const { chromium } = require('playwright');
/* tools/probe.js —— 回归探针
 *
 * 每个批次交付前跑一次：用同一套操作序列驱动「上一版」和「新构建产物」，
 * 逐字段比对最终的心证、判决、笔录、心证流水，并统计控制台 error。
 *
 * 依赖 playwright（跑在 Claude 的容器里，不需要装在你的机器上）：
 *     node tools/probe.js 旧文件.html 新文件.html
 */
const A_FILE = process.argv[2] || 'index.html';
const B_FILE = process.argv[3] || 'index.html';
const path = require('path');


const SEQS = {};
SEQS.good = [
  { kind:'cfg' },
  { kind:'skipFile' },
  { kind:'skipMeet', strategy:'lenient' },
  { kind:'cross', pick:['none'] },                 // e1 无异议
  { kind:'cross', pick:['legality'], say:'该笔录系单人取证，未记载已告知权利义务。' }, // e3 命中瑕疵
  { kind:'witness', pick:'show' },                 // 出示运维日志
  { kind:'obj', pick:'skip' },
  { kind:'debate', text:'本案全程使用被告人本人实名卡操作，监控在案，不存在秘密窃取的行为要件，与盗窃罪的构成不符。' },
  { kind:'obj', pick:'r_legal' },
  { kind:'debate', text:'银行系统故障持续四日，两次报修均无人处置，损失扩大系银行管理失职所致，不应由被告人独自承担。' },
  { kind:'obj', pick:'r_norel' },
  { kind:'debate', text:'请求依照刑法第六十三条第二款报最高人民法院核准，在法定刑以下量刑，本案量刑畸重。' },
];
SEQS.bad = [
  { kind:'cfg' },
  { kind:'skipFile' },
  { kind:'skipMeet', strategy:'lenient' },
  { kind:'cross', pick:['authenticity'] },
  { kind:'cross', pick:['none'] },
  { kind:'witness', pick:'pass' },
  { kind:'obj', pick:'r_lead' },
  { kind:'debate', text:'请法庭充分考虑被告人的实际情况，从轻处理。' },
  { kind:'obj', pick:'r_dup' },
  { kind:'debate', text:'我方认为指控不能成立，请法庭明察。' },
  { kind:'obj', pick:'skip' },
  { kind:'debate', text:'辩护人没有别的意见了，请法庭依法裁判。' },
];
SEQS.mixed = [
  { kind:'cfg' },
  { kind:'skipFile' },
  { kind:'skipMeet', strategy:'lenient' },
  { kind:'cross', pick:['relevance','legality'], say:'来源与本案无关。' },
  { kind:'cross', pick:['legality'] },
  { kind:'witness', pick:'ask' },
  { kind:'obj', pick:'r_legal' },
  { kind:'debate', text:'本案应属不当得利，返还即可，动用刑罚违背刑法谦抑原则，宜由民事途径救济。' },
  { kind:'obj', pick:'skip' },
  { kind:'debate', text:'被告人全程实名操作，监控在案，不符合秘密窃取的要件。' },
  { kind:'obj', pick:'r_norel' },
  { kind:'debate', text:'银行运维日志显示故障持续四日，两次报修无人处置，管理失职是损失扩大的直接原因。' },
];

async function run(file, SEQ){
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + file);
  // 播种，让离线应答池的随机选择可复现
  await p.evaluate(()=>{ if(window.Engine && Engine.seed) Engine.seed(42); });

  const click = async sel => { await p.waitForSelector(sel, {state:'visible', timeout:8000}); await p.click(sel); };

  for (const s of SEQ){
    if (s.kind === 'cfg'){
      await click('.mask #ok');
      const c = await p.waitForSelector('.caseCard', {timeout:2500}).catch(()=>null);
      if (c) { await c.click(); await p.waitForTimeout(600); }   // B9 起开局是事务所
      continue;
    }
    if (s.kind === 'skipFile'){          // 跳过第一幕阅卷。旧版本没有这一幕，静默跳过
      const btn = await p.waitForSelector('#leave', {timeout:2500}).catch(()=>null);
      if (btn){ await btn.click(); await click('#yes'); await p.waitForTimeout(500); }
      continue;
    }
    if (s.kind === 'skipMeet'){          // 不问任何话就结束会见，按 s.strategy 定策略
      const btn = await p.waitForSelector('#stop', {timeout:2500}).catch(()=>null);
      if (btn){
        await btn.click();
        await p.waitForSelector('#st .chip');
        await p.click(`#st .chip[data-v="${s.strategy||'lenient'}"]`);
        await click('#go');
        await p.waitForTimeout(1200);
      }
      continue;
    }
    if (s.kind === 'cross'){
      await p.waitForSelector('#tri .chip', {timeout:8000});
      for (const v of s.pick) await p.click(`#tri .chip[data-v="${v}"]`);
      if (s.say) await p.fill('#say', s.say);
      await click('#go');
      continue;
    }
    if (s.kind === 'witness'){
      await p.waitForSelector(`#wit .chip[data-v="${s.pick}"]`, {timeout:8000});
      await p.click(`#wit .chip[data-v="${s.pick}"]`);
      await click('#go');
      await p.waitForTimeout(900);
      // B5 起证人环节是个循环：出示完还能接着问，要自己说「没有问题了」。
      // #witAskBox 是 B5 才有的，用它区分新旧版本，别去点旧版残留的 DOM。
      if (await p.$('#witAskBox')){
        await p.click('#wit .chip[data-v="pass"]');
        await click('#go');
        await p.waitForTimeout(600);
      }
      continue;
    }
    if (s.kind === 'obj'){
      await p.waitForSelector('#obj .chip', {timeout:15000});
      await p.click(`#obj .chip[data-v="${s.pick}"]`);
      await click('#go');
      continue;
    }
    if (s.kind === 'debate'){
      await p.waitForSelector('#say', {timeout:8000});
      await p.fill('#say', s.text);
      await click('#go');
      continue;
    }
  }

  // B5 起辩论轮次是动态的：脚本里的台词说完之后，把剩下的流程收干净。
  for (let i = 0; i < 14; i++){
    if (await p.$('.mask .vhead .r')) break;
    if (await p.$('#obj .chip')){
      await p.click('#obj .chip[data-v="skip"]'); await p.click('#go');
      await p.waitForTimeout(400); continue;
    }
    if (await p.$('#say')){
      await p.fill('#say', '辩护人的辩论意见发表完毕。'); await p.click('#go');
      await p.waitForTimeout(900); continue;
    }
    await p.waitForTimeout(600);
  }
  await p.waitForSelector('.mask .vhead .r', {timeout:20000});
  // 结构自检：三栏必须是 main 的直接子元素。
  // 模板少一个 </div> 会让左栏吞掉中栏和右栏，而按 id 查元素的测试全都还能过。
  const layout = await p.evaluate(() => [...document.querySelector('main').children].map(c=>c.className));
  const out = await p.evaluate(() => ({
    verdict: document.querySelector('.mask .vhead .r').textContent.trim(),
    score:   document.querySelector('#sVal').textContent.trim(),
    label:   document.querySelector('#sLab').textContent.trim(),
    issues:  [...document.querySelectorAll('#issueList .issue')].map(e =>
               e.querySelector('b').textContent + '=' + e.querySelector('em').textContent),
    ledger:  [...document.querySelectorAll('.modal .ledger .e')].map(e => e.textContent.trim()),
    lines:   [...document.querySelectorAll('#record .line')].map(e =>
               (e.querySelector('.who')?.textContent||'') + '|' + e.querySelector('.body').textContent),
  }));
  await b.close();
  return { out, errs, layout };
}

(async () => {
 let allSame = true;
 for (const name of Object.keys(SEQS)) {
  const SEQ = SEQS[name];
  console.log('\n=== 路线 ' + name + ' ===');
  const a = await run(path.resolve(A_FILE), SEQ);
  const c = await run(path.resolve(B_FILE), SEQ);
  const j = o => JSON.stringify(o, null, 1);
  const core = o => j({verdict:o.verdict, score:o.score, label:o.label, issues:o.issues, ledger:o.ledger});
  const same = core(a.out) === core(c.out);
  console.log('旧版   判决:', a.out.verdict, '| 心证:', a.out.score, '| 争点:', a.out.issues.join(' '));
  console.log('构建产物 判决:', c.out.verdict, '| 心证:', c.out.score, '| 争点:', c.out.issues.join(' '));
  console.log('笔录条数:', a.out.lines.length, 'vs', c.out.lines.length);
  console.log('心证流水:', a.out.ledger.length, 'vs', c.out.ledger.length);
  console.log('旧版 error:', a.errs.length, '| 产物 error:', c.errs.length);
  const wantCols = 'col left|col mid|col right';
  if (c.layout.join('|') !== wantCols){
    console.log('❌ 三栏结构不对：' + JSON.stringify(c.layout));
    allSame = false;
  }
  if (a.errs.length) console.log(a.errs);
  if (c.errs.length) console.log(c.errs);
  const lineSame = j(a.out.lines) === j(c.out.lines);
  console.log(same ? ('✅ 判定一致' + (lineSame ? '，笔录也一字不差' : '（笔录文案有变化，见下）')) : '❌ 判定有差异');
  if (same && !lineSame){
    const A = a.out.lines, C = c.out.lines;
    for (let i=0;i<Math.max(A.length,C.length);i++)
      if (A[i]!==C[i]) console.log('   旧: '+(A[i]||'(无)')+'\n   新: '+(C[i]||'(无)'));
  }
  if (!same){
    allSame = false;
    const A = core(a.out).split('\n'), C = core(c.out).split('\n');
    for (let i=0;i<Math.max(A.length,C.length);i++)
      if (A[i]!==C[i]) console.log('  L'+i+'\n   切片: '+A[i]+'\n   产物: '+C[i]);
  }
 }
 console.log(allSame ? '\n===== 三条路线全部一致 =====' : '\n===== 存在差异 =====');
 process.exit(allSame?0:1);
})();
