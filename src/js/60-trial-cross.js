/* 60-trial-cross.js —— 第三幕·举证质证
 * 本文件不含任何案件专属内容，全部读案件包。
 */
const FLAW_LABEL = {authenticity:"真实性", legality:"合法性", relevance:"关联性"};

function stageCross(){
  const item = CROSS[S.step];
  if(!item) return startDebate();
  revealFor("cross:" + S.step);
  if(item.kind === "witness") return crossWitness();
  return crossDoc(item);
}

/* ---------- 书证质证 ---------- */
function crossDoc(item){
  const e = CASE.ev[item.ev];
  say(item.intro, "pros", item.text);
  ui(`<div class="prompt">对<b>${e.name}</b>发表${L("crossN")}。可就三性分别提出，也可表示无${L("objection")}。</div>
    <div class="chips" id="tri">
      <button class="chip" data-v="authenticity">真实性有异议</button>
      <button class="chip" data-v="legality">合法性有异议</button>
      <button class="chip" data-v="relevance">关联性有异议</button>
      <button class="chip solo" data-v="none">无异议</button>
    </div>
    ${voiceHint()}
    <textarea id="say" placeholder="${"补充一句" + L("crossV") + "理由（可留空。写了会被" + L("presider") + "听进去，也会被记下来）"}"></textarea>
    <div class="row"><button class="primary" id="go">发表${L("crossN")}</button>
    ${voiceBtn("say")}
    <span class="hint">说不出依据的异议，${L("presider")}记着呢</span></div>`);
  bindChips("#tri .chip");
  $("#go").onclick = async()=>{
    const picks = multi("#tri .chip");
    if(!picks.length) return;
    const txt = $("#say").value.trim();
    const none = picks.includes("none");
    say(CASE.cast.you.who, "you", none
      ? ("对该组证据无异议。" + (txt ? "\n" + txt : ""))
      : (L("lawyer") + "对该组证据的" + picks.map(p=>FLAW_LABEL[p]).join("、") + "提出" + L("objection") + "。" + (txt ? "\n" + txt : "")));

    if(e.flaw && picks.includes(e.flaw)){
      /* 阅卷时标对了这份证据的这一项，庭上说出来就更有分量 */
      const prepared = (S.marks[item.ev] || []).indexOf(e.flaw) >= 0;
      say(CASE.judgeWho, "judge", prepared
        ? (L("lawyer") + "的意见" + L("court") + "注意到了。" + e.flawText + "。看得出" + L("lawyer") + "是看过卷的。")
        : (L("lawyer") + "的意见" + L("court") + "注意到了。" + e.flawText + "，该证据的证明力，" + (L("weighWho") || "合议庭评议时") + "会一并考虑。"));
      weakenEv(item.ev);
      const stMul = (strat() && strat().crossMul) || 1;
      hitCross(item.ev, Math.round(CASE.crossGain * (prepared ? 1.3 : 1) * stMul),
               L("crossV") + "击中" + FLAW_LABEL[e.flaw] + "瑕疵" + (prepared ? "（有备而来）" : ""));
      patience(prepared ? 5 : 3, L("crossV") + "有据");
    }else if(!none && !e.flaw){
      say(CASE.judgeWho, "judge", "辩护人，异议要有依据。这份证据来源清楚，你说说具体哪里有问题？");
      penal("baselessObjection");
    }else if(none && e.flaw){
      say(CASE.judgeWho, "judge", "记录在案。");
      penal("missedFlaw");
    }else{
      say(CASE.judgeWho, "judge", "记录在案。");
    }
    S.step++; setTimeout(stageCross, 450);
  };
  paint();
}

/* ---------- 证人 ----------
 * 发问和出示证据不冲突。先问出破绽再拿日志压上去，和上来就摊牌，不是一回事。
 */
function crossWitness(){
  const w = CASE.witness;
  S.witnessPresent = true;
  say(CASE.judgeWho, "judge", w.judgeIntro);
  say(w.who, "pros", w.line);
  witnessLoop();
}

function witnessLoop(){
  const w = CASE.witness;
  const evName = w.contradicts ? CASE.ev[w.contradicts].name : "";
  const canAsk  = S.witAsked < (w.askLimit || 0);
  /* 出示按钮的开关，看的是这个选项要出示的那份证据出没出示过。
     以前看的是 w.contradicts——c01~c03 里这两个恰好是同一份，c04 不是：
     证人证言抵触的是控方的接处警记录，要出示的是辩方的借款凭证。 */
  const showOpt = (w.options || []).find(o => o.v === "show");
  const showEvId = showOpt && (showOpt.reveal || w.contradicts);
  const canShow = !!showEvId && !S.shown.has(showEvId);
  const did = S.witAsked > 0 || S.shown.has(w.contradicts);

  ui(`<div class="prompt">${w.prompt.replace("{ev}", evName)}</div>
    <div class="chips" id="wit">
      ${canAsk  ? `<button class="chip" data-v="ask">向证人发问（还剩 ${w.askLimit - S.witAsked} 次）</button>` : ""}
      ${canShow ? `<button class="chip" data-v="show">${esc(w.options.find(o=>o.v==="show").label)}</button>` : ""}
      <button class="chip" data-v="pass">${did ? "没有问题了" : "无异议"}</button>
    </div>
    <div id="witAskBox" style="display:none">
      ${voiceHint()}
      <textarea id="witSay" placeholder="${esc(w.askPrompt || "向证人发问。")}"></textarea>
    </div>
    <div class="row"><button class="primary" id="go" disabled>提交</button>
    ${voiceBtn("witSay")}
    <span class="hint">${w.loopHint || w.hint}</span></div>`);

  let pick = null;
  document.querySelectorAll("#wit .chip").forEach(c=>c.onclick=()=>{
    document.querySelectorAll("#wit .chip").forEach(x=>x.classList.remove("sel"));
    c.classList.add("sel"); pick = c.dataset.v;
    $("#witAskBox").style.display = pick === "ask" ? "block" : "none";
    $("#go").disabled = false;
    if(pick === "ask") $("#witSay").focus();
  });

  $("#go").onclick = async()=>{
    if(S.busy) return;
    if(pick === "ask"){
      const txt = $("#witSay").value.trim();
      if(txt.length < 3) return;
      S.busy = true;
      say(CASE.cast.you.who, "you", txt);
      ui(`<div class="thinking">证人在想</div>`);
      const res = await witnessAnswer(txt);
      applyWitness(res);
      S.witAsked++;
      S.busy = false;
      paint(); witnessLoop(); return;
    }
    if(pick === "show"){
      const o = w.options.find(x=>x.v === "show");
      o.lines.forEach(l=>say(l[0], l[1], l[2]));
      portraitFlash("witness", "……这个我需要回去核实。");
      if(o.reveal) showEv(o.reveal);
      if(o.grants) hitPoint(o.grants.id, o.grants.v, o.grants.why);
      (o.effects || []).forEach(x=>move(x.issue, x.v, x.why));
      if(typeof o.patience === "number") patience(o.patience, o.label);
      paint(); witnessLoop(); return;
    }
    /* 结束 */
    const o = w.options.find(x=>x.v === "pass");
    if(!did){
      o.lines.forEach(l=>say(l[0], l[1], l[2]));
      (o.effects || []).forEach(x=>move(x.issue, x.v, x.why));
    }else{
      say(CASE.cast.you.who, "you", "对证人没有问题了。");
      say(CASE.judgeWho, "judge", "证人" + L("leave") + "。");
    }
    S.witnessPresent = false;
    S.step++; setTimeout(stageCross, 450);
  };
  paint();
}

/* 把问出来的破绽落到状态上 */
function applyWitness(res){
  const w = CASE.witness;
  const id = res && res.spot;
  const spot = id && w.weakSpots.find(x=>x.id === id && S.witHit.indexOf(id) < 0);
  if(!spot){
    say(w.who, "pros", (res && res.reply) || pick(w.missPool));
    patience(-1, "发问未指向要害");
    return;
  }
  S.witHit.push(spot.id);
  say(w.who, "pros", spot.reveal);
  say("", "sys", "记录在案：" + spot.note);
  /* 问出来的事实不等于论点立住。
     你把事实从证人嘴里挖出来了，但还得自己在辩论里把它说成理由。
     所以这里只记在案 + 让这个论点更有底（裁决层 ×1.25），不占用 S.hits。
     ——不这么写的话，问对了问题反而比不问少拿分（gv 8~10 换掉了辩论里的 20~40）。*/
  if(spot.grants){
    if(S.witGrants.indexOf(spot.grants) < 0) S.witGrants.push(spot.grants);
    move(spot.issue || (CASE.kp[spot.grants] ? CASE.kp[spot.grants].issue : CASE.mainIssue),
         spot.gv || 8, "问出破绽：" + spot.topic);
    say("", "sys", "这一点你问出来了。" + L("phaseDebate") + "时把它说成理由，才算立住。");
  }
  /* 不指向论点的破绽，默认加在主争点上；写了 issue 就加到那个争点。
     c07 的「不吃这个药会怎么样」不解锁任何论点，但它属于危害性那条线，
     加到主争点上就跑错地方了。 */
  else move(spot.issue || CASE.mainIssue, spot.gv || 4, "问出破绽：" + spot.topic);
  patience(3, "发问指向要害");
}
