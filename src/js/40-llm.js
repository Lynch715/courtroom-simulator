/* 40-llm.js —— 模型接口
 * 施工规范 三：所有调用走 callLLM 一个入口，业务代码里禁止散写 fetch。
 * 表演层的返回值不得直接进状态，必须先过 30-engine.js 的 adjudicate()。
 */
const LLM = { timeout: 30000, maxTokens: 1400 };   // 放开长度之后 700 不够用了

async function callLLM(kind, user, {retries = 1, temp = 0.8} = {}){
  if(S.cfg.offline || !S.cfg.key) return null;
  const sys = PROMPTS[kind] && PROMPTS[kind]();
  if(!sys){ console.warn("没有这个 prompt：" + kind); return null; }

  for(let attempt = 0; attempt <= retries; attempt++){
    const strict = attempt > 0;
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), LLM.timeout);
    try{
      const r = await fetch(S.cfg.base.replace(/\/+$/,"") + "/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: {"Content-Type":"application/json", "Authorization":"Bearer " + S.cfg.key},
        body: JSON.stringify({
          model: S.cfg.model,
          temperature: strict ? 0.3 : temp,
          max_tokens: LLM.maxTokens,
          response_format: {type: "json_object"},
          messages: [
            {role: "system", content: sys},
            {role: "user",   content: user + (strict ? "\n\n只输出 JSON，不要任何其他字符。" : "")}
          ]
        })
      });
      clearTimeout(timer);
      const j = await r.json();
      const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      const obj = parseJSON(txt);
      if(obj) return obj;
      console.warn("模型返回的不是 JSON，第 " + (attempt+1) + " 次");
    }catch(e){
      clearTimeout(timer);
      console.warn("模型调用失败（" + (e.name === "AbortError" ? "超时" : e.message) + "），第 " + (attempt+1) + " 次");
    }
  }
  return null;   // 交给离线兜底
}

function parseJSON(txt){
  const s = String(txt).replace(/```json|```/g, "").trim();
  try{ return JSON.parse(s); }catch(e){}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");        // 掐头去尾再试一次
  if(a >= 0 && b > a){ try{ return JSON.parse(s.slice(a, b+1)); }catch(e){} }
  return null;
}

/* ══════════════ 上下文 ══════════════ */
const FLAW_CN = {authenticity:"真实性", legality:"合法性", relevance:"关联性"};

function ctx(){
  const issues = Object.entries(CASE.issues)
    .map(([k,v])=>`${v.name} ${S.c[k]>0?"+":""}${S.c[k]}`).join("；");
  const weak = [...S.evWeak]
    .map(id=>`${CASE.ev[id].name}（${FLAW_CN[CASE.ev[id].flaw]||"证明力"}存疑）`).join("、") || "无";
  const shown = [...S.shown].map(id=>CASE.ev[id].name).join("、") || "无";
  const out = `【案由】${CASE.charge}
【案情】${CASE.brief || CASE.truth}
【真相，只有你知道，不得直接说破】${CASE.truth}
【出庭人员】
${castCard()}
【当前阶段】${PHASES[S.stage].name}
【当前心证】${issues}（正数利辩方）
【法官耐心】${S.patience}/100${S.patience < 40 ? "（已经不耐烦，说话会打断人）" : ""}
【已出示的证据】${shown}
【已被削弱的控方证据】${weak}
【辩方已立住的论点】${[...S.hits].map(h=>CASE.kp[h]?.tag).filter(Boolean).join("、")||"无"}
【证人是否在庭】${S.witnessPresent ? "在庭" : "已退庭"}
【最近的笔录】
${S.digest.slice(-6).join("\n") || "（尚无）"}`;
  if(out.length > 1800) console.warn("上下文超预算：" + out.length + " 字");
  return out;
}

/* ══════════════ 三种调用 ══════════════ */

/* 玩家说的任何一句话 */
async function playerAct(txt, opts){
  S.lastPlayer = txt;
  const left = Object.entries(CASE.kp).filter(([k])=>!S.hits.has(k))
    .map(([k,p])=>`${k}=${p.tag}：${p.desc}${p.rubric?"｜算命中的标准："+p.rubric:""}`).join("\n") || "（全部已立住）";
  const res = await callLLM("player.act",
    ctx() + `\n【尚未立住的论点】\n${left}\n【玩家此刻的处境】${opts && opts.note || "在法庭上发言"}\n` + fence(txt));
  return res && typeof res === "object" ? res : offlineAct(txt, opts);
}

/* 会见：一次调用同时判语气、判问到了什么、给回答 */
async function meetReply(txt){
  const m = CASE.meeting;
  const secrets = m.secrets.map(s=>
    `${s.id}=${s.topic}${S.known.indexOf(s.id)>=0?"（已经说过了）":""}`).join("\n");
  const said = S.lieOut.filter(id=>S.lieBusted.indexOf(id)<0)
    .map(id=>m.lies.find(l=>l.id===id).claim).join("；") || "无";
  const res = await callLLM("meet.reply",
`【案由】${CASE.charge}
【你做过的事，只有你自己知道】${CASE.truth}
【你现在对这个律师的信任】${S.trust}/100
【你不想主动讲的事】\n${secrets}
【你已经跟他说过的假话】${said}
【刚才的对话】\n${S.talk.slice(-6).join("\n")||"（刚坐下）"}
【律师这一句】\n` + fence(txt));
  return res && typeof res === "object" ? res : offlineMeet(txt);
}

async function prosSpeak(arg, mode){
  const isRebut = mode === "rebut";
  const res = await callLLM("pros.speak",
    ctx() + `\n【模式】${mode}
【这一条指控的核心】${arg.core}
【本轮你必须表达的内容】${isRebut ? arg.rebutMust : arg.must}
【辩护人上一轮说的】${S.lastPlayer || "（尚未发言）"}
【你上一轮说的，不要重复】${S.lastPros || "（尚未发言）"}`);
  if(res && res.text) return res.text;
  return (isRebut ? arg.rebutOffline : arg.offline) || arg.offline;
}

/* 证人被当庭发问 */
async function witnessAnswer(txt){
  const w = CASE.witness;
  const list = w.weakSpots.filter(s=>S.witHit.indexOf(s.id) < 0)
    .map(s=>`${s.id}=${s.topic}｜松口时说：${s.reveal}`).join("\n") || "（没有剩下的破绽了）";
  const res = await callLLM("witness.answer",
    ctx() + `\n【你作过的证】${w.line}
【你身上还没被问出来的破绽】\n${list}
【辩护人这一问】\n` + fence(txt));
  return res && typeof res === "object" ? res : offlineWitness(txt);
}

async function verdictDoc(v, t){
  const res = await callLLM("verdict.doc",
    ctx() + `\n【合议庭已确定的结果，不得更改】${v.t}\n【辩方立住的论点】${[...S.hits].map(h=>CASE.kp[h]?.tag).filter(Boolean).join("、")||"无"}`,
    {temp: 0.5});
  return (res && res.text) || offlineVerdict(v, t);
}

/* ══════════════ 连通性自检 ══════════════
 * 设置页那个「测试连接」按钮。一次往返，把游戏真正依赖的三件事全试一遍：
 *   1. 地址、密钥、模型名对不对
 *   2. 浏览器能不能直接调这个接口（跨域）
 *   3. 这个模型认不认 response_format:json_object——游戏全靠它，
 *      不认的话在线模式会一路悄悄走离线兜底，玩家还以为接上了
 * 返回 {ok, title, detail, ms}，不抛异常。
 */
async function testLLM(base, model, key, onStep){
  const url = String(base||"").replace(/\/+$/,"") + "/chat/completions";
  const say = s => { if(typeof onStep === "function") onStep(s); };

  if(!/^https?:\/\//i.test(base||""))
    return {ok:false, title:"接口地址不像个网址", detail:"要以 http:// 或 https:// 开头，例如 https://api.deepseek.com"};
  if(!key) return {ok:false, title:"没填 API Key", detail:"离线试玩不需要密钥；要接模型就得填一个。"};
  if(!model) return {ok:false, title:"没填模型名", detail:"比如 deepseek-v4-flash。"};

  async function shot(withJson){
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), 20000);
    const t0 = Date.now();
    const body = {
      model, temperature: 0, max_tokens: 40,
      messages: [
        {role:"system", content:"你是一个连通性自检端点。只输出 JSON。"},
        {role:"user",   content:'返回 {"ok":1}，不要任何其他字符。'}
      ]
    };
    if(withJson) body.response_format = {type:"json_object"};
    try{
      const r = await fetch(url, {method:"POST", signal:ctl.signal,
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
        body: JSON.stringify(body)});
      clearTimeout(timer);
      const txt = await r.text();
      let j = null; try{ j = JSON.parse(txt); }catch(e){}
      return {status:r.status, ok:r.ok, j, txt, ms:Date.now()-t0};
    }catch(e){
      clearTimeout(timer);
      return {net:true, name:e.name, msg:e.message, ms:Date.now()-t0};
    }
  }

  say("正在连接…");
  let r = await shot(true);

  /* 连都没连上 */
  if(r.net){
    if(r.name === "AbortError")
      return {ok:false, title:"超时（20 秒没回）", detail:"接口地址可能写错了，或者这个网络到不了对方服务器。", ms:r.ms};
    return {ok:false, title:"连不上",
      detail:"浏览器直接被挡住了，多半是这三种之一：地址写错、当前网络到不了对方、或者对方不允许网页直接调用（跨域）。\n"
           + "浏览器控制台里会有一条更具体的报错。原始信息：" + (r.msg||"—"), ms:r.ms};
  }

  const errMsg = (r.j && r.j.error && (r.j.error.message || r.j.error.code)) || (r.txt||"").slice(0,160);

  if(r.status === 401 || r.status === 403)
    return {ok:false, title:"密钥不对（" + r.status + "）", detail:"地址通了，对方不认这个 Key。检查有没有多复制空格，或者这个 Key 有没有被停用。\n" + errMsg, ms:r.ms};
  if(r.status === 402 || /insufficient|balance|quota|欠费|余额/i.test(errMsg))
    return {ok:false, title:"余额不足", detail:"密钥是对的，但账户没钱了或者额度用完了。\n" + errMsg, ms:r.ms};
  if(r.status === 429)
    return {ok:false, title:"被限流了（429）", detail:"接口和密钥都没问题，就是这会儿请求太密。等一下再试。\n" + errMsg, ms:r.ms};
  if(r.status === 404)
    return {ok:false, title:"找不到（404）", detail:"要么接口地址不对（末尾不要带 /v1/chat/completions，游戏会自己拼），要么这个模型名对方没有。\n" + errMsg, ms:r.ms};
  if(r.status >= 500)
    return {ok:false, title:"对方服务器出错（" + r.status + "）", detail:"不是你这边的问题，过一会儿再试。\n" + errMsg, ms:r.ms};

  if(r.status === 400){
    /* 400 分两种：模型名不对，还是这个模型不支持 JSON 模式 */
    if(/response_format|json_object|json mode/i.test(errMsg)){
      say("这个模型可能不支持 JSON 模式，再试一次…");
      const r2 = await shot(false);
      if(r2.ok)
        return {ok:false, title:"接口通了，但这个模型不支持 JSON 模式",
          detail:"游戏靠 response_format:json_object 拿结构化结果，这个模型不认。\n"
               + "换一个支持 JSON 模式的模型（DeepSeek 的 v4-flash / v4-pro 都支持）。\n"
               + "不换的话，在线模式会一路悄悄退回离线兜底。", ms:r.ms+r2.ms};
    }
    if(/model/i.test(errMsg))
      return {ok:false, title:"模型名不对（400）", detail:"地址和密钥都通了，对方不认这个模型名。\n" + errMsg, ms:r.ms};
    return {ok:false, title:"请求被拒（400）", detail:errMsg, ms:r.ms};
  }
  if(!r.ok)
    return {ok:false, title:"没通过（" + r.status + "）", detail:errMsg, ms:r.ms};

  /* 200 了，看看内容 */
  const content = (r.j && r.j.choices && r.j.choices[0] && r.j.choices[0].message && r.j.choices[0].message.content) || "";
  const parsed = parseJSON(content);
  const served = (r.j && r.j.model) || model;
  if(!parsed)
    return {ok:false, title:"通了，但这个模型没按 JSON 回",
      detail:"接口和密钥都对，" + served + " 返回的是：" + JSON.stringify(content).slice(0,90) + "\n"
           + "游戏需要它只输出 JSON。换个模型更稳。", ms:r.ms};

  return {ok:true, title:"通了",
    detail:"模型 " + served + "，往返 " + r.ms + " 毫秒，JSON 模式正常。庭上每一句都会是现算的。", ms:r.ms};
}
