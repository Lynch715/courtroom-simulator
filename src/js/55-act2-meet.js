/* 55-act2-meet.js —— 第二幕·会见当事人
 *
 * 前提：他不会跟你说实话。这一幕全部的设计都从这句话来。
 * 秘密要信任够了才肯说；谎话要你手上有卷宗才戳得穿；
 * 戳不穿的谎你信了，庭上引用出来，公诉人当场打你的脸。
 */

function startMeet(){
  S.stage = PH.meet;
  document.body.classList.add("phase-meet");
  if(typeof setPane === "function") setPane("mid");
  $("#talk").innerHTML = "";
  paint();
  const m = CASE.meeting;
  if(CASE.scenes && CASE.scenes.meet)
    $("#talk").innerHTML = sceneBanner(CASE.scenes.meet, m.place, "开庭前");
  talkSys(m.place + "。" + "\n" + m.intro);
  talkSay("client", m.firstLine);
  meetInput();
}

/* ---------- 对话区 ---------- */
function talkSay(who, text){
  const c = CASE.cast[who] || CASE.cast.client;
  const d = document.createElement("div");
  const av = avatarFor(c.who);
  d.className = "line" + (av ? " hasAv" : "");
  d.innerHTML = `${av}<div class="who ${c.cls}">${c.who}</div><div class="body">${esc(text)}</div>`;
  $("#talk").appendChild(d); $("#talk").scrollTop = $("#talk").scrollHeight;
  S.talk.push((who === "you" ? "你" : "他") + "：" + text);
  if(S.talk.length > 20) S.talk.shift();
}
function talkSys(text){
  const d = document.createElement("div");
  d.className = "line sys";
  d.innerHTML = `<div class="body">${esc(text)}</div>`;
  $("#talk").appendChild(d); $("#talk").scrollTop = $("#talk").scrollHeight;
}

/* ---------- 输入 ---------- */
function meetInput(){
  const m = CASE.meeting;
  if(S.turnsLeft <= 0) return endTalk();
  const canBust = m.lies.some(l =>
    S.lieOut.indexOf(l.id) >= 0 && S.lieBusted.indexOf(l.id) < 0 &&
    S.lieBusted.indexOf(l.id) < 0 && l.bustBy && S.read.has(l.bustBy));

  ui(`<div class="prompt">还有 <b>${S.turnsLeft}</b> 次机会。${m.hint}</div>
    ${canBust ? `<div class="chips"><button class="chip" id="bust">出示卷宗里的记载</button></div>` : ""}
    ${voiceHint()}
    <textarea id="talkSay" placeholder="像跟一个人说话那样问。问得急，他会闭嘴。"></textarea>
    <div class="row">
      <button class="primary" id="go">说</button>
      ${voiceBtn("talkSay")}
      <button class="ghost" id="stop">谈完了</button>
      <span class="hint">信任 ${S.trust}</span>
    </div>`);
  if($("#bust")) $("#bust").onclick = ()=>doBust();
  $("#stop").onclick = endTalk;
  $("#go").onclick = async()=>{
    if(S.busy) return;
    const txt = $("#talkSay").value.trim();
    if(txt.length < 2) return;
    S.busy = true;
    talkSay("you", txt);
    ui(`<div class="thinking">他没马上说话</div>`);
    const res = await meetReply(txt);
    applyMeet(res, txt);
    S.busy = false;
    S.turnsLeft--;
    paint();
    meetInput();
  };
  paint();
}

/* 用卷宗里的记载当面戳穿 */
function doBust(){
  const m = CASE.meeting;
  const l = m.lies.find(x => S.lieOut.indexOf(x.id) >= 0 && S.lieBusted.indexOf(x.id) < 0 && S.read.has(x.bustBy));
  if(!l) return;
  talkSay("you", l.bustLine);
  talkSay("client", l.onBust);
  if(l.onBustAfter) talkSay("client", l.onBustAfter);
  S.lieBusted.push(l.id);
  portraitFlash("client", l.onBust, "grim");
  const i = S.lieBelieved.indexOf(l.id); if(i >= 0) S.lieBelieved.splice(i, 1);
  trust(-5, "当面戳穿了他");
  talkSys("他不再说那句话了。庭上你也不必替他说。");
  S.turnsLeft--;
  paint(); meetInput();
}

/* ---------- 把模型/离线的结果落到状态上 ---------- */
function applyMeet(res, txt){
  const m = CASE.meeting;

  /* 语气 → 信任。数值由前端定，模型只判语气 */
  const t = m.tone[res.tone] || m.tone.neutral;
  trust(t.trust, {warm:"你问得体贴", neutral:"例行发问", pressing:"你追得太紧", hostile:"你伤了他"}[res.tone] || "发问");

  /* 答应办不到的事 */
  if(res.flags && res.flags.promise && !S.promised){
    S.promised = true;
    trust(10, "你给了他一个承诺");
    career("conscience", -5, m.promiseNote);
  }

  /* 秘密：信任够了才说得出口 */
  (res.reveals || []).forEach(id=>{
    const sec = m.secrets.find(x=>x.id === id);
    if(!sec || S.known.indexOf(id) >= 0) return;
    if(S.trust < sec.trust) return;              // 白名单 + 门槛，模型说了不算
    S.known.push(id);
    talkSay("client", sec.truth);
    if(sec.after) talkSay("client", sec.after);
    talkSys("记下了：" + sec.note);
  });

  /* 他的回答 */
  if(res.reply) talkSay("client", res.reply);

  /* 该抛谎话了 */
  const lie = m.lies.find(l =>
    S.lieOut.indexOf(l.id) < 0 &&
    ((l.triggerMatch && new RegExp(l.triggerMatch).test(txt)) ||
     (l.triggerTurn != null && (m.turns - S.turnsLeft) >= l.triggerTurn)));
  if(lie){
    S.lieOut.push(lie.id);
    S.lieBelieved.push(lie.id);
    talkSay("client", lie.claim);
    if(S.read.has(lie.bustBy)) talkSys("你手上那份材料里，写的不是这个。");
  }

  /* 玩家自己打字戳穿 */
  const busting = m.lies.find(l =>
    S.lieOut.indexOf(l.id) >= 0 && S.lieBusted.indexOf(l.id) < 0 &&
    S.read.has(l.bustBy) && new RegExp(l.bustMatch).test(txt));
  if(busting){
    talkSay("client", busting.onBust);
    if(busting.onBustAfter) talkSay("client", busting.onBustAfter);
    S.lieBusted.push(busting.id);
    const i = S.lieBelieved.indexOf(busting.id); if(i >= 0) S.lieBelieved.splice(i, 1);
    trust(-5, "当面戳穿了他");
  }
}

/* ---------- 收尾：定辩护策略 ---------- */
function endTalk(){
  const m = CASE.meeting;
  talkSys(m.outro);
  ui(`<div class="prompt">最后一件事：<b>这个案子你打算怎么辩。</b>定了就不改了。</div>
    <div class="chips" id="st">
      ${m.strategies.map(s=>`<button class="chip" data-v="${s.id}">${s.label}</button>`).join("")}
    </div>
    <div class="prompt small" id="stDesc">选一个看看他怎么说。</div>
    <div class="row"><button class="primary" id="go" disabled>就这么定</button>
    <span class="hint">他有他的想法，不一定跟你一样</span></div>`);
  let picked = null;
  document.querySelectorAll("#st .chip").forEach(b=>b.onclick=()=>{
    document.querySelectorAll("#st .chip").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");
    picked = m.strategies.find(x=>x.id === b.dataset.v);
    $("#stDesc").textContent = picked.desc;
    $("#go").disabled = false;
  });
  $("#go").onclick = ()=>{
    S.strategy = picked.id;
    talkSay("you", "这个案子，我打算做" + picked.label + "。");
    talkSay("client", picked.clientLine);
    if(picked.clientWants){
      trust(10, "他要的就是这个");
    }else{
      trust(-15, "他不想这么打");
      talkSys("他不同意，但他没有别的选择。");
    }
    /* 定完策略不直接开庭。开庭是玩家自己按的一步——
       这是第三幕的门，藏在一个 setTimeout 里不合适。 */
    setTimeout(goCourtGate, 900);
  };
  paint();
}

/* 会见结束到开庭之间的那一步。写清楚这一趟去哪、带着什么去。 */
function goCourtGate(){
  const st = (CASE.meeting.strategies || []).find(x=>x.id === S.strategy);
  const known = S.known.length, kp = Object.keys(CASE.kp).length;
  const venue = (CASE.lex && CASE.lex.venue) || "第一审判庭";
  const going = (CASE.lex && CASE.lex.courtN) || "法院";
  /* 一条都没问出来的时候别硬报个 0，那句话读着像结算面板。 */
  const gain = known
    ? `你手上有<b>${known} 条他亲口说的事</b>，庭上有 ${kp} 个论点可以立。`
    : `他什么也没多说。庭上那 ${kp} 个论点，得你自己一个人立。`;
  ui(`<div class="prompt">会见结束。${gain}
      这个案子你打算做<b>${esc(st ? st.label : "")}</b>。</div>
    <div class="row">
      <button class="primary big" id="toCourt">去${going}</button>
      <span class="hint">${esc(venue)}　·　进去了就不能再回来问他</span>
    </div>`);
  $("#toCourt").onclick = endMeet;
}

function endMeet(){
  document.body.classList.remove("phase-meet");
  $("#talk").innerHTML = "";
  S.stage = PH.cross;
  paint();
  startTrial();
}
