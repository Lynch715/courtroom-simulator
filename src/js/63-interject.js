/* 63-interject.js —— 插话
 * 庭上你随时可以举手说一句。说什么都行，但法庭会当真——包括当真地驳回你。
 * 和主流程分开挂在 #aside，不会被 ui() 覆盖。
 */
function mountAside(){
  const box = $("#aside");
  if(!box) return;
  if(S.stage < PH.cross || S.stage > PH.debate || S.silenced){ box.innerHTML = ""; return; }
  box.innerHTML = `<button class="ghost tiny" id="asideBtn">${L("lawyer")}，我有话说</button>`;
  $("#asideBtn").onclick = openInterject;
}

function openInterject(){
  const box = $("#aside");
  box.innerHTML = `<div class="interject">
    ${voiceHint()}
    <textarea id="asideSay" placeholder="向${L("courtN")}说一句。申请、发问、程序性意见都行——没轮到你的话，${L("judge")}会让你坐下。"></textarea>
    <div class="row">
      <button class="primary" id="asideGo">说</button>
      ${voiceBtn("asideSay")}
      <button class="ghost" id="asideCancel">算了</button>
      <span class="hint">插话有代价，法官的耐心是有限的</span>
    </div></div>`;
  bindVoice();
  $("#asideSay").focus();
  $("#asideCancel").onclick = mountAside;
  $("#asideGo").onclick = async()=>{
    if(S.busy) return;
    const raw = $("#asideSay").value.trim();
    if(raw.length < 2) return;
    S.busy = true;
    box.innerHTML = `<div class="interject"><div class="thinking">${L("judge")}看了你一眼</div></div>`;

    const cut = maybeInterrupt(raw);
    say(CASE.cast.you.who, "you", cut.text);
    if(cut.cut){ say(CASE.judgeWho, "judge", L("lawyer") + "，停。"); patience(-2, "被" + L("judge") + "打断"); }

    const res = await playerAct(cut.text, {note: "未轮到发言时的插话"});
    /* 插话不算辩论意见，论点不在这里计分 */
    if(res.act === "辩论" || res.act === "质证"){
      res.hit = [];
      if(!res.reply || !res.reply.length)
        res.reply = [{who: "judge", text: "这些话留到" + L("opinionN") + "里说。"}];
    }
    handleAct(res, {phase: "interject"});
    S.busy = false;
    mountAside();
  };
}
