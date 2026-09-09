/* 30-engine.js —— 引擎层：确定性判定
 *
 * 红线（施工规范 一、3）：
 *   所有状态写入只能经过本文件的通道函数。业务代码里禁止出现 S.c.i1 += x 这种写法。
 *   模型的返回值不得直接进状态，必须先过 adjudicate()。
 */

/* ══════════════ 1、写入通道 ══════════════ */

/* 心证。ledger 里 channel="心" 的才会显示在右栏流水和复盘页。 */
function move(issue, val, why){
  if(!(issue in S.c)){ console.warn("move：不存在的争点", issue); return; }
  S.c[issue] = clamp(S.c[issue] + val, -100, 100);
  S.ledger.push({ch:"心", why, v:val});
  paint();
}

/* 法官耐心。0-100，不参与心证计算，只影响法庭对你的容忍度。 */
function patience(val, why){
  const before = S.patience;
  S.patience = clamp(S.patience + val, 0, 100);
  if(S.patience !== before) S.ledger.push({ch:"耐", why: why||"", v:S.patience-before});
  paint();
}

/* 当事人对你的信任。0-100，只在会见里动。 */
function trust(val, why){
  const before = S.trust;
  S.trust = clamp(S.trust + val, 0, 100);
  if(S.trust !== before) S.ledger.push({ch:"信", why: why||"", v:S.trust-before});
  paint();
}

/* 当前辩护策略 */
function strat(){
  if(!S.strategy || !CASE.meeting) return null;
  return CASE.meeting.strategies.find(x=>x.id === S.strategy) || null;
}

/* 生涯三轨。k: rep 声誉 | cash 金钱 | conscience 良心 */
function career(k, val, why){
  if(!(k in S.career)){ console.warn("career：不存在的轨", k); return; }
  S.career[k] += val;
  S.ledger.push({ch:"涯", key:k, why, v:val});
}

/* ══════════════ 2、局面推进 ══════════════ */

/* 证据进入玩家视野 */
function showEv(id){
  if(!CASE.ev[id]){ console.warn("showEv：不存在的证据", id); return; }
  S.shown.add(id);
}

/* 证据证明力被削弱 */
function weakenEv(id){
  if(!CASE.ev[id]){ console.warn("weakenEv：不存在的证据", id); return; }
  S.evWeak.add(id);
}

/* 按 revealAt 推进证据出场。stage 形如 "cross:0"。 */
function revealFor(tag){
  for(const id in CASE.ev) if(CASE.ev[id].revealAt === tag) showEv(id);
}

/* 立住一个辩护论点 */
function hitPoint(id, v, why){
  if(S.hits.has(id)) return 0;
  const p = CASE.kp[id];
  if(!p){ console.warn("hitPoint：不存在的论点", id); return 0; }
  S.hits.add(id);
  move(p.issue, v, why);
  return v;
}

/* 质证击中瑕疵。与论点分开记，语义不同：论点是你说赢的，质证是你看出来的。 */
function hitCross(evId, v, why){
  if(S.crossHits.has(evId)) return 0;
  S.crossHits.add(evId);
  move(CASE.mainIssue, v, why);
  return v;
}

/* 走一条 penalties 里的程序性加减分 */
function penal(key, issue){
  const p = CASE.penalties[key];
  if(!p){ console.warn("penal：不存在的条目", key); return; }
  if(typeof p.v === "number") move(issue || CASE.mainIssue, p.v, p.why);
  if(typeof p.patience === "number") patience(p.patience, p.why);
}

/* 心证总分：按权重加权平均，权重不必合计 100 */
function total(){
  let sum = 0, w = 0;
  for(const k in CASE.issues){ sum += S.c[k] * CASE.issues[k].weight; w += CASE.issues[k].weight; }
  return w ? Math.round(sum / w) : 0;
}

/* ══════════════ 3、裁决层 ══════════════
 * 模型只能「提名」命中和打表达分，能不能算、算多少，由这里说了算。
 * 上限：单次最多 2 个论点、总增益 25 分；q 只做 0.3-1.0 的缩放，不能凭空造分。
 */
const ADJ = { maxPoints: 2, maxGain: 25, qFloor: 0.3, qCeil: 1.0, keepRatio: 0.6 };

function adjudicate(raw){
  const out = {gain: 0, hits: [], patience: 0, dropped: []};
  if(!raw || typeof raw !== "object") return out;

  const q = clamp((typeof raw.q === "number" ? raw.q : 5) / 10, ADJ.qFloor, ADJ.qCeil);
  const list = Array.isArray(raw.hit) ? raw.hit : [];
  let n = 0;

  for(const id of list){
    const p = CASE.kp[id];
    if(!p){ out.dropped.push([id, "不是本案的论点"]); continue; }          // 白名单
    if(S.hits.has(id)){ out.dropped.push([id, "已经立住过"]); continue; }   // 去重
    if(p.requires && !S.shown.has(p.requires)){ out.dropped.push([id, "前置证据未出示"]); out.needEv = p.requires; continue; }
    if(n >= ADJ.maxPoints){ out.dropped.push([id, "超出单次命中上限"]); continue; }

    /* 前两幕的功课在这里兑现。数据字段见 src/data/cases/_schema.md：
       readEv    阅卷时细读过这份证据          ×1.15
       markEv+markFlag  阅卷时对这份证据标对了三性  ×1.3
       grantedBy 会见时问出了这个秘密           ×1.2
       B3/B4 之前这些字段是空的，乘数恒为 1，不影响现在的判定。 */
    let mul = 1;
    if(p.readEv && S.read.has(p.readEv)) mul *= 1.15;
    if(p.markEv && (S.marks[p.markEv]||[]).indexOf(p.markFlag) >= 0) mul *= 1.3;
    if(p.grantedBy && S.known.indexOf(p.grantedBy) >= 0) mul *= 1.2;
    /* 会见时问出来的秘密，让相关论点更有底 */
    if(S.known.some(k=>{
      const sec = CASE.meeting && CASE.meeting.secrets.find(x=>x.id===k);
      return sec && sec.grants === id;
    })) mul *= 1.2;
    /* 庭上从证人嘴里问出来的事实，让这个论点更有底 */
    if(S.witGrants.indexOf(id) >= 0) mul *= 1.25;
    /* 辩护策略：你选的路决定哪些论点更好使 */
    const st = strat();
    if(st && st.mul && st.mul[id]) mul *= st.mul[id];

    /* 单次发言的增益上限。截断时不要“打折立住”——
       一句话顺带蹭到的论点如果只能拿到零头，就干脆不立，留着让玩家下一轮
       专门讲一遍，拿满分。否则认真准备的第二句话反而没用了。 */
    const full = Math.round(p.v * q * mul);
    const room = ADJ.maxGain - out.gain;
    if(room <= 0){ out.dropped.push([id, "本次增益已达上限"]); continue; }
    if(room < full * ADJ.keepRatio){ out.dropped.push([id, "本次说不透，留到下一轮"]); continue; }
    const v = Math.min(full, room);
    if(v <= 0){ out.dropped.push([id, "本次增益已达上限"]); continue; }
    out.hits.push({id, v}); out.gain += v; n++;
  }

  const f = raw.flags || {};
  if(f.injection)     out.patience = -10;
  else if(f.offtopic) out.patience = -8;
  else if(f.repeat)   out.patience = -5;
  else if(f.vague)    out.patience = -3;
  else if(out.gain>0) out.patience = 4;

  if(out.dropped.length) console.warn("裁决层拦下：", out.dropped);
  return out;
}

/* ══════════════ 4、自检 ══════════════
 * 控制台敲 Engine.selfTest() 可以验证模型改不动分数。
 */
const Engine = {
  move, patience, trust, career, strat, showEv, weakenEv, revealFor, seed: seedRandom,
  hitPoint, hitCross, penal, total, adjudicate, ADJ,

  /* 恶意返回值不会让模型拿到超额的分 */
  selfTest(){
    const snap = {c: Object.assign({}, S.c), hits: new Set(S.hits), p: S.patience,
                  ledger: S.ledger.length};
    const cases = [
      ["全部论点一次报满", {hit: Object.keys(CASE.kp), q: 10}],
      ["表达分越界",       {hit: [Object.keys(CASE.kp)[0]], q: 999}],
      ["伪造论点 id",      {hit: ["__hack__", "d1;move('i1',999)"], q: 10}],
      ["hit 不是数组",     {hit: "d1", q: 10}],
      ["夹带判决字段",     {hit: [], q: 5, verdict: "宣告无罪", score: 100, c: {i1: 100}}],
      ["空对象",           {}],
      ["null",             null],
    ];
    const rows = cases.map(([name, raw]) => {
      const r = adjudicate(raw);
      return {用例: name, 增益: r.gain, 命中数: r.hits.length,
              超上限: r.gain > ADJ.maxGain || r.hits.length > ADJ.maxPoints};
    });
    console.table(rows);
    const bad = rows.filter(r => r.超上限);
    // adjudicate 是纯函数，不该动任何状态
    const dirty = JSON.stringify(snap.c) !== JSON.stringify(S.c)
               || snap.hits.size !== S.hits.size
               || snap.p !== S.patience
               || snap.ledger !== S.ledger.length;
    console.log(bad.length === 0 && !dirty
      ? "✅ 裁决层守住了：没有一个用例突破上限，且 adjudicate 没有改动任何状态。"
      : "❌ 裁决层被突破：" + (bad.length ? "有用例超上限。" : "") + (dirty ? "状态被改动。" : ""));
    return {bad: bad.length, dirty};
  }
};
