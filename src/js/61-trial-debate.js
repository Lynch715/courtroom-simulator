/* 61-trial-debate.js —— 第三幕·法庭辩论
 *
 * 公诉人不是念稿的。他有一摞论点，你把哪条驳倒了他就不再提哪条；
 * 你刚立住的论点冲着谁去，他下一轮先回你那一句，再谈别的。
 */
function startDebate(){
  S.stage = PH.debate; S.round = 0; paint();
  say(CASE.judgeWho, "judge", CASE.debateIntro);
  nextRound();
}

/* 挑下一条：先回应你，再推进他自己的。都没有了就收场。 */
function pickArg(){
  /* 1) 你上一轮立住的论点，正冲着他说过的某一条 —— 他得先回这一句 */
  for(const a of CASE.prosArgs){
    if(S.argSaid.indexOf(a.id) < 0) continue;
    if(S.argRebutted.indexOf(a.id) >= 0) continue;
    if(!(a.counteredBy || []).some(d => S.lastHits.indexOf(d) >= 0)) continue;
    return {arg: a, mode: "rebut"};
  }
  /* 2) 推进一条还没说过的。已经被你驳倒的，他不会再提 */
  for(const a of CASE.prosArgs){
    if(S.argSaid.indexOf(a.id) >= 0) continue;
    if((a.counteredBy || []).some(d => S.hits.has(d))){
      S.argSaid.push(a.id);
      S.argDropped.push(a.id);
      continue;
    }
    return {arg: a, mode: "advance"};
  }
  return null;
}

async function nextRound(){
  if(S.debateOver || S.round >= CASE.debateMaxRounds) return endDebate();
  const picked = pickArg();
  /* 被你驳倒、他没再提的那些，说一句给你听 */
  while(S.argDropped.length){
    const id = S.argDropped.shift();          // 先取出来再找，别把 shift 写进 find 的回调里
    const a = CASE.prosArgs.find(x => x.id === id);
    if(a) say("", "sys", L("pros") + "没有再提「" + a.core + "」。");
  }
  if(!picked) return endDebate();

  ui(`<div class="thinking">${L("pros")}正在组织语言</div>`);
  const text = await prosSpeak(picked.arg, picked.mode);
  S.lastPros = text;
  say(CASE.prosWho, "pros", text);
  if(picked.mode === "rebut") S.argRebutted.push(picked.arg.id);
  else S.argSaid.push(picked.arg.id);
  S.curArg = picked.arg;
  offerObjection(picked.arg, picked.mode);
}

/* 论点栈空了不等于你说完了。
   你在法庭调查阶段就把他打垮的情况下，公诉人无话可说，但你自己可能还有几条没讲。
   真实庭审里辩论终结前审判长会问一句「还有没有」——这里也问。 */
function endDebate(){
  const left = Object.keys(CASE.kp).filter(k=>!S.hits.has(k));
  const canMore = !S.debateOver && !S.silenced
                  && S.finalRounds < (CASE.finalWordRounds || 3)
                  && S.round < CASE.debateMaxRounds + (CASE.finalWordRounds || 3);
  if(left.length && canMore){
    if(S.finalRounds === 0)
      say(CASE.judgeWho, "judge", L("pros") + "没有其他意见。" + L("lawyer") + "，你还有什么要说的。");
    S.finalRounds++;
    return debateInput(S.curArg || {objection: null, requires: null}, true);
  }
  say(CASE.judgeWho, "judge", CASE.debateEndLine || (L("phaseDebate") + "终结。" + L("defendant") + "，" + L("finalWord") + "。"));
  setTimeout(judge, 500);
}

/* 每轮公诉人发言后开放一次异议窗口 */
function offerObjection(arg, mode){
  if(S.silenced) return debateInput(arg);
  ui(`<div class="prompt">${L("pros")}${mode === "rebut" ? "回应了你刚才那一点" : "发言完毕"}。要提${L("objection")}吗？<b>${L("objection")}成立能直接掐掉对方的论据，不成立会挨一句。</b></div>
    <div class="chips" id="obj">
      ${Object.entries(CASE.objections).map(([k,v])=>`<button class="chip" data-v="${k}">${v.label}</button>`).join("")}
      <button class="chip solo sel" data-v="skip">不提异议</button>
    </div>
    <div class="row"><button class="primary" id="go">确定</button>
    <span class="hint">这一轮的异议窗口只有一次</span></div>`);
  bindChips("#obj .chip");
  $("#go").onclick = ()=>{
    const p = multi("#obj .chip")[0] || "skip";
    if(p !== "skip"){
      say(CASE.cast.you.who, "you", L("judge") + "，" + L("lawyer") + "提出" + L("objection") + "：" + CASE.objections[p].label);
      if(mode !== "rebut" && objectionValid(arg, p)){
        say(CASE.judgeWho, "judge", L("objection") + "成立。" + L("pros") + "，这一点请你回避，不要作为指控依据。");
        portraitFlash("judge", "异议成立。");
        penal("objectionUpheld", CASE.objections[p].issue);
        S.argSaid.indexOf(arg.id) >= 0 || S.argSaid.push(arg.id);
        S.argRebutted.push(arg.id);          // 被掐掉的论点，他不会再回头
      }else{
        say(CASE.judgeWho, "judge", L("objection") + "不成立。" + L("lawyer") + "，" + L("courtN") + "的时间有限，请把话留到" + L("opinionN") + "里。");
        portraitFlash("judge", "异议不成立。", "frown");
        penal("objectionDenied");
      }
    }
    debateInput(arg);
  };
  paint();
}

/* 异议成立的条件：提对了类型，且前置条件已满足 */
function objectionValid(a, p){
  if(a.objection !== p) return false;
  const req = a.requires;
  if(!req) return true;
  if(req.evWeak) return S.evWeak.has(req.evWeak);
  if(req.shown)  return S.shown.has(req.shown);
  if(req.point)  return S.hits.has(req.point);
  console.warn("未知的异议前置条件", req);
  return false;
}

function debateInput(arg, isFinal){
  if(S.silenced){
    ui(`<div class="prompt">你已被责令停止发言。只能等下一轮。</div>
      <div class="row"><button class="primary" id="go">坐下</button></div>`);
    $("#go").onclick = ()=>{ S.round++; S.lastHits = []; (isFinal ? endDebate : nextRound)(); };
    paint(); return;
  }
  const left = Object.keys(CASE.kp).filter(k=>!S.hits.has(k));
  const alive = CASE.prosArgs.filter(a=>!(a.counteredBy||[]).some(d=>S.hits.has(d))).length;
  ui(`<div class="prompt">${isFinal
      ? `${L("pros")}已经没话说了。<b>你还有 ${left.length} 个论点没立住</b>——趁现在。`
      : `第 ${S.round+1} 轮 · 发表你的${L("opinionN")}。
      <b>你还有 ${left.length} 个论点没立住，他还有 ${alive} 条没被驳倒。</b>`}
      说完了就说「${L("opinionN")}发表完毕」。</div>
    ${voiceHint()}
    <textarea id="say" placeholder="${esc(CASE.sayHint || ("像在" + L("onSite") + "说话那样写。空泛的话不会命中任何论点。"))}"></textarea>
    <div class="row"><button class="primary" id="go">发言</button>
    ${voiceBtn("say")}
    <button class="ghost" id="skip">放弃本轮</button>
    <span class="hint">${S.cfg.offline?"离线试玩：按规则判定":"由模型评估命中与表达"}</span></div>`);
  $("#skip").onclick = ()=>{ penal("skipDebate"); S.round++; S.lastHits = [];
    (isFinal ? endDebate : nextRound)(); };
  $("#go").onclick = async()=>{
    if(S.busy) return;
    const raw = $("#say").value.trim();
    if(raw.length < 8) return;
    S.busy = true;

    const cut = maybeInterrupt(raw);
    say(CASE.cast.you.who, "you", cut.text);
    if(cut.cut){
      say(CASE.judgeWho, "judge", "辩护人，停。");
      patience(-2, "被" + L("judge") + "打断");
    }
    ui(`<div class="thinking">${L("courtN")}在听</div>`);

    const res = await playerAct(cut.text, {note: L("phaseDebate") + "第 " + (S.round+1) + " 轮"});
    const out = handleAct(res, {phase: "debate", round: arg, text: cut.text});
    S.lastHits = out.names.map(n => Object.keys(CASE.kp).find(k => CASE.kp[k].tag === n)).filter(Boolean);
    if(new RegExp(CASE.debateEndMatch).test(cut.text)){
      S.debateOver = true;
      say(CASE.judgeWho, "judge", "记录在案。");
    }
    S.busy = false;
    S.round++;
    setTimeout(isFinal ? endDebate : nextRound, 500);
  };
  paint();
}
