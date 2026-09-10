/* 62-act.js —— 玩家发言的统一处理
 * 玩家在庭上说的每一句话都经过这里：多角色应答 → 按意图付出代价 → 耐心的后果。
 * 分数由 30-engine.js 的 adjudicate() 说了算，本文件只负责流程和表演。
 */

function sayAs(key, text){
  const c = CASE.cast[key] || CASE.cast.judge;
  return say(c.who, c.cls, text);
}

/* 耐心低于 40 时，长发言有概率被审判长打断，只记前半句 */
function maybeInterrupt(txt){
  if(S.patience >= 40 || txt.length < 20) return {text: txt, cut: false};
  if(rnd() > 0.30 + (40 - S.patience) / 200) return {text: txt, cut: false};
  return {text: txt.slice(0, Math.max(8, Math.floor(txt.length * 0.6))) + "——", cut: true};
}

/* 耐心见底的后果 */
function patienceFallout(){
  if(S.patience <= 0 && !S.silenced){
    S.silenced = true;
    sayAs("judge", L("lawyer") + "，你的发言到此为止。");
    say("", "sys", (CASE.lex && CASE.lex.patienceOut) || (L("presider") + "的耐心用尽了。本阶段你不能再发言。"));
    career("rep", -5, "被" + L("silence"));
    return true;
  }
  if(S.patience < 20 && !S.admonished){
    S.admonished = true;
    sayAs("judge", L("court") + "对" + L("lawyer") + "予以" + L("admonish") + "，记录在案。");
    portraitFlash("judge", L("court") + "予以" + L("admonish") + "。", "grim");
    career("rep", -3, "当场" + L("admonish"));
  }
  return false;
}

function renderReply(res){
  (res.reply || []).slice(0, 3).forEach(r=>{
    if(r && r.text) sayAs(r.who, String(r.text));
  });
}

/* 处理一次发言。opt.phase: "cross" | "debate" | "interject" */
function handleAct(res, opt){
  opt = opt || {};
  const out = {names: [], gained: 0, stopped: false};
  const act = res.act || "辩论";
  const f = res.flags || {};

  /* 申请准不准，是引擎说了算，不是模型说了算。
     离线路由已经把 _motion 挑好了；在线时模型只报「这是一个申请」，
     所以在这儿按原文再匹配一次，并且用案件包里写好的那句回应盖掉模型的话——
     否则模型可能自己演一句「准许」，而卷宗里什么都没多出来。 */
  if(act === "申请" && res._motion === undefined){
    const txt = String(opt.text || "");
    res._motion = (CASE.motions || []).find(x => new RegExp(x.match).test(txt)) || null;
    if(res._motion && res._motion.reply) res.reply = [{who:"judge", text: res._motion.reply}];
  }

  /* 论点只有在发表辩论/质证意见时才算数。骂人骂出一个论点是不算的。 */
  let adj = null;
  if(act === "辩论" || act === "质证"){
    adj = adjudicate(res);
    adj.hits.forEach(h=>{
      hitPoint(h.id, h.v, "立住论点：" + CASE.kp[h.id].tag);
      out.names.push(CASE.kp[h.id].tag);
      out.gained += h.v;
    });
  }

  renderReply(res);

  /* 你在庭上替他说了那句谎话 */
  /* 这一句被当庭戳穿的话，代价已经在这儿收过了。
     下面就不要再按「空泛」补一刀——那句话不空泛，它是假的，两个罚名不该叠。 */
  const quoted = opt.phase === "debate" ? checkQuotedLie(res, opt.text) : false;

  switch(act){
    case "闲聊":
      patience(f.injection ? -10 : -8, f.injection ? "答非所问" : "与本案无关");
      break;
    case "失礼":
      patience(-12, "言辞不当");
      career("rep", -1, L("onSite") + "失礼");
      break;
    case "申请": {
      const mo = res._motion;
      /* 到 c08 为止，所有申请都是驳回——申请这个动作等于纯扣耐心，没人会用第二次。
         c09 起有真能准的申请：没有证人的案子，辩方证据只能靠申请调取。
         准了就把那份东西调进来，当场进卷宗，可以出示、可以当论点前置。 */
      if(mo && mo.grant){
        if(mo.reveals) showEv(mo.reveals);
        if(typeof mo.patience === "number" && mo.patience) patience(mo.patience, "申请准许");
        if(mo.effect) move(mo.effect.issue, mo.effect.v, mo.effect.why || "申请准许");
        if(mo.reveals && CASE.ev[mo.reveals])
          say("", "sys", "《" + CASE.ev[mo.reveals].name + "》调取到庭，已入卷。");
        paint();
      }else{
        patience((mo && mo.patience) || -4, "申请不予准许");
      }
      break;
    }
    case "与当事人交流":
      patience(-5, L("hearing") + "中与" + L("defendant") + "交谈");
      break;
    case "发问":
      patience(S.witnessPresent ? -1 : -3, S.witnessPresent ? "发问" : "证人已" + L("leave"));
      break;
    case "异议":
      if(opt.phase !== "objection"){
        sayAs("judge", L("objection") + "应当在对方发言之后立即提出。现在提，晚了。");
        patience(-3, "异议不合时宜");
      }
      break;
    case "程序":
      break;
    default:  /* 辩论 / 质证 */
      if(out.names.length) patience(4, "论证有力");
      else if(quoted) break;
      else if(adj && adj.needEv){
        /* 讲的是对的，可是这一节的证据还没出示。这不是空泛，是漏了一步，
           法官会说出漏了哪一步——不然玩家只看见「空泛」，不知道自己错在哪。 */
        const ev = CASE.ev[adj.needEv];
        say(CASE.judgeWho, "judge",
            L("lawyer") + "主张的这一节，相应证据没有出示。" + (ev ? "《" + ev.name + "》不在" + L("onSite") + "。" : ""));
        patience(-2, "论点缺前置证据");
      }
      else penal(((res && res.q) || 5) >= 7 ? "sound" : "vague");
  }

  if(out.names.length)
    say("", "sys", "本轮立住：" + out.names.join("、") + "　表达评分 " + ((res && res.q) || 7) + "/10");

  out.stopped = patienceFallout();
  return out;
}

/* 会见时没戳穿的谎，庭上引用出来就是这个下场 */
function checkQuotedLie(res, txt){
  const m = CASE.meeting;
  if(!m || S.lieFired || !S.lieBelieved.length) return false;
  const byModel = !!(res.flags && res.flags.quotedLie);
  const l = m.lies.find(x => S.lieBelieved.indexOf(x.id) >= 0 &&
    (byModel || (x.courtMatch && new RegExp(x.courtMatch).test(txt || ""))));
  if(!l) return false;
  S.lieFired = true;
  portraitFlash("pros", "这句话，" + L("lawyer") + "怎么解释？");
  sayAs("pros",  l.courtProsLine);
  sayAs("judge", l.courtJudgeLine);
  move(l.penalty.issue, l.penalty.v, l.penalty.why);
  patience(l.penalty.patience, "被当庭戳穿");
  say("", "sys", "你替他说了一句他自己都不敢再说的话。");
  return true;
}
