/* 40-llm.js —— 模型接口
 * 施工规范 三：所有调用走 callLLM 一个入口，业务代码里禁止散写 fetch。
 * 表演层的返回值不得直接进状态，必须先过 30-engine.js 的 adjudicate()。
 */
const LLM = { timeout: 25000, maxTokens: 700 };

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
