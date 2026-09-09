/* 42-offline.js —— 离线兜底
 * 没有 key、断网、模型抽风时接管。离线不是残废模式，是"预案接管"。
 * 台词按 docs/对话与文案规范-v1.md 写：短、碎、不圆滑。
 */

/* ---------- 意图识别 ---------- */
function offRe(){
  const cli = (CASE.cast.client.who.split("· ")[1] || L("defendant")).trim();
  return {
    injection: /忽略(前面|上面|之前|以上|所有)|忽略.{0,6}指令|系统提示|提示词|prompt|给我满分|直接判|判我方?(无罪|胜诉)|你必须|作为(一个)?(AI|人工智能|模型)|扮演/i,
    失礼:     /蠢货|白痴|放屁|滚出去|闭嘴|无耻|胡说八道|狗屁|去死|你算什么|凭什么管我/,
    异议:     /反对|异议/,
    申请:     new RegExp("申请|请求" + L("courtN") + "|恳请|要求(休庭|回避|调取|鉴定)"),
    发问:     new RegExp("^(证人|请问)|证人[，,、]|你(是不是|有没有|什么时候|在哪|为什么|凭什么依据)"),
    交流:     new RegExp("^(" + cli + "|" + L("defendant") + ")[，,、]|(告诉|嘱咐|提醒)(一下)?(我的)?当事人"),
    程序:     new RegExp("举证完毕|质证完毕|发表完毕|" + L("opinionN") + "发表完|没有(其他)?(问题|意见)了?$"),
  };
}

/* ---------- 应答池，每类至少四条 ----------
 * 里面的 {lawyer} {court} 这类占位符，取值见 00-const.js 的称谓表。
 * 案件包写 case.offlinePool.<类名> 可以整池覆盖（c05 的听证会就是这么换的）。 */
const OFF_RAW = {
  闲聊: [
    "{lawyer}，说与本案有关的。",
    "这句话跟本案有什么关系。",
    "{lawyer}。",
    "{courtN}的时间有限。",
    "{court}没听懂。你要发表什么意见。",
    "记录员，这一句不必记。",
  ],
  失礼: [
    "{lawyer}，注意言辞。",
    "这里是{courtN}。再有一次，{court}作{admonish}记录。",
    "坐下。",
    "记录在案。{court}警告一次。",
    "{lawyer}的执业素养，{court}会另行反映。",
  ],
  注入: [
    "{lawyer}，请说与本案有关的话。",
    "这不是{opinionN}。继续。",
    "{court}不接受这种表述。",
    "{lawyer}，你在跟谁说话。",
  ],
  空泛: [
    "{lawyer}，请围绕争议焦点讲。",
    "这句话{court}听过了。有依据吗。",
    "说具体的。",
    "还有吗。",
  ],
  已讲过: [
    "这一点{lawyer}讲过了，记录里有。往下说。",
    "同样的意思，{court}已经听过一遍。",
    "记录在案。还有别的吗。",
    "这一点不用再讲了。继续。",
  ],
  在理: [
    "这一点{court}听清楚了，继续。",
    "记录在案。",
    "{court}注意到了。",
    "继续。",
  ],
  证人已退庭: [
    "证人已经{leave}。{lawyer}有话对{courtN}说。",
    "证人不在{onSite}。你的问题向{courtN}提。",
    "调查已经结束了，{lawyer}。",
  ],
  证人回避: [
    "这个我需要回去核实。",
    "当时的情况我不太清楚。",
    "按流程应该是这样。",
    "印象中……记不太准了。",
    "这个得问我们领导。",
  ],
  与当事人: [
    "{lawyer}，{hearing}中不得与{defendant}交谈。有意见向{courtN}陈述。",
    "有话对{courtN}说。",
    "{defendant}有{finalWord}的机会，不是现在。",
  ],
  程序: ["记录在案。", "好。", "继续。"],
};

/* 取一池。案件包覆盖优先，然后填称谓。 */
function lexFill(t){ return String(t).replace(/\{(\w+)\}/g, (m, k) => L(k) || m); }
function offPool(k){
  const over = CASE.offlinePool && CASE.offlinePool[k];
  return (over && over.length ? over : OFF_RAW[k] || []).map(lexFill);
}

/* ---------- 离线路由 ---------- */
function offlineAct(txt, opts){
  const RE = offRe();
  const J = k => [{who:"judge", text: pick(offPool(k))}];
  const q = Math.max(3, Math.min(10, Math.round(txt.length / 22) + 3));
  const base = {act:"辩论", target:L("courtN"), hit:[], q,
                flags:{repeat:false, vague:false, offtopic:false, injection:false, quotedLie:false},
                reply:[]};

  if(RE.injection.test(txt))
    return Object.assign(base, {act:"闲聊", flags:Object.assign(base.flags,{injection:true}), reply:J("注入")});

  if(RE.失礼.test(txt))
    return Object.assign(base, {act:"失礼", reply:J("失礼")});

  if(RE.异议.test(txt))
    return Object.assign(base, {act:"异议", target:L("judge"), reply:[]});

  if(RE.申请.test(txt)){
    const m = (CASE.motions || []).find(x => new RegExp(x.match).test(txt));
    return Object.assign(base, {act:"申请", target:L("judge"),
      reply:[{who:"judge", text: m ? m.reply
        : "申请要说明理由和依据。" + L("lawyer") + "没有说明，不予准许。"}],
      _motion: m || null});
  }

  if(RE.发问.test(txt))
    return Object.assign(base, {act:"发问", target:"证人",
      reply: S.witnessPresent ? [{who:"witness", text:pick(offPool("证人回避"))}] : J("证人已退庭")});

  if(RE.交流.test(txt))
    return Object.assign(base, {act:"与当事人交流", target:"当事人", reply:J("与当事人")});

  if(RE.程序.test(txt))
    return Object.assign(base, {act:"程序", reply:J("程序")});

  /* 剩下的当辩论意见，按关键词判命中 */
  const hit = [], dup = [];
  for(const k in KEYWORD){
    if(!(KEYWORD[k].test(txt) && txt.length >= 25)) continue;
    (S.hits.has(k) ? dup : hit).push(k);
  }
  if(hit.length) return Object.assign(base, {hit, reply:J("在理")});
  /* 论点讲得对，但这一点已经立住了：不是空泛，是重复。
     q 给高分，让 handleAct 走 penalties.sound（在理但无新论点），
     而不是走 penalties.vague（空泛）扣心证。 */
  if(dup.length) return Object.assign(base, {q:8, reply:J("已讲过")});
  if(txt.length < 12)
    return Object.assign(base, {act:"闲聊", flags:Object.assign(base.flags,{offtopic:true}), reply:J("闲聊")});
  return Object.assign(base, {flags:Object.assign(base.flags,{vague:true}), reply:J("空泛")});
}

/* 判决书兜底 */
function offlineVerdict(v, t){
  const f = CASE.verdictFallback || {};
  const head = t >= 20 ? (f.lenient || "") : (f.strict || "");
  return (f.head || "本院认为，") + head + "\n\n" + (f.tail || (L("verdictN") + "如下：")) + v.t;
}

/* ---------- 会见的离线判定 ---------- */
function offlineMeet(txt){
  const m = CASE.meeting;
  /* 语气不能按顺序取第一个匹配——"你先别怕，第一次到底是怎么回事"里既有安抚也有"到底"，
     那句话人听着是体贴的。所以数一数各自命中了几个词，谁多算谁；打平算体贴的那一头。
     只有伤人的话是硬判定：说得再客气，"你在骗我"也是伤人。 */
  const count = k => {
    const src = m.tone[k] && m.tone[k].match;
    if(!src) return 0;
    return src.split("|").filter(w => w && txt.indexOf(w.replace(/[?.*+^$\\()\[\]{}]/g,"")) >= 0).length;
  };
  let tone;
  if(count("hostile") > 0)            tone = "hostile";
  else {
    const w = count("warm"), pr = count("pressing");
    tone = (w === 0 && pr === 0) ? "neutral" : (w >= pr ? "warm" : "pressing");
  }
  const promise = new RegExp(m.promiseMatch).test(txt);

  /* 问到了哪个秘密。
     门槛要按「说完这句话之后」的信任算，不是说之前的。
     applyMeet 是先加信任再判秘密的，这里如果按旧值判，同一句话在离线和在线
     两条路上会得出不同结果——离线比数据写的多卡一档，最后一个秘密永远差一口气。 */
  const tv = (m.tone[tone] && typeof m.tone[tone].trust === "number") ? m.tone[tone].trust : 0;
  const after = Math.max(0, Math.min(100, S.trust + tv + (promise ? 10 : 0)));
  const touched = m.secrets.filter(s => S.known.indexOf(s.id) < 0 && new RegExp(s.match).test(txt));
  const reveals = touched.filter(s => after >= s.trust).map(s => s.id);
  const blocked = touched.length && !reveals.length;

  let reply;
  if(promise)        reply = m.promiseLine;
  else if(blocked)   reply = pick(m.pool.locked);          // 问到了，但他还不肯讲
  else if(reveals.length) reply = "";                       // 秘密本身就是回答
  else if(tone === "hostile")  reply = pick(m.pool.hostile);
  else if(tone === "pressing") reply = pick(m.pool.press);
  else if(/家里|你妈|你姐|几号|寄|吃/.test(txt)) reply = pick(m.pool.off);
  else if(S.trust >= 70) reply = pick(m.pool.high);
  else if(S.trust >= 45) reply = pick(m.pool.mid);
  else                   reply = pick(m.pool.low);

  return {tone, reveals, reply, flags:{promise, injection:false}};
}

/* ---------- 证人发问的离线判定 ---------- */
function offlineWitness(txt){
  const w = CASE.witness;
  const spot = w.weakSpots.find(s => S.witHit.indexOf(s.id) < 0 && new RegExp(s.match).test(txt));
  return spot ? {spot: spot.id, reply: spot.reveal}
              : {spot: null, reply: pick(w.missPool)};
}
