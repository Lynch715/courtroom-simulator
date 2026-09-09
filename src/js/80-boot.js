/* 80-boot.js —— 启动 */
/* ============================================================
   开场
   ============================================================ */
function boot(){
  rec.innerHTML="";
  document.querySelector(".brand span").textContent = PACK.meta.headerLine;
  S.playing = true;
  startFile();
}

/* 开局：有没打完的案子就问一句，没有就回事务所 */
function start(){
  const d = savedGame();
  if(!d) return officeScreen();
  useCase(d.caseId);            // 先切回存档里那个案子，标题、卷宗、关键词都跟着换
  document.querySelector(".brand span").textContent = PACK.meta.headerLine;
  const when = new Date(d.at);
  const ph = PHASES[d.s.stage] ? PHASES[d.s.stage].name : "";
  rec.innerHTML = "";
  say("", "sys", `上次打到一半：《${PACK.meta.title}》，${ph}。\n${when.getMonth()+1}月${when.getDate()}日 ${String(when.getHours()).padStart(2,"0")}:${String(when.getMinutes()).padStart(2,"0")}`);
  ui(`<div class="prompt">要接着打吗？</div>
    <div class="row">
      <button class="primary" id="go">接着打</button>
      <button class="ghost" id="fresh">不了，回事务所</button>
      <span class="hint">重来就是从卷宗那一晚开始</span>
    </div>`);
  $("#go").onclick = ()=>{ applySave(d); resumeGame(); };
  $("#fresh").onclick = ()=>{ clearSave(); officeScreen(); };
}

/* 从存档接着走。笔录只留了摘要，所以补一行分隔。 */
function resumeGame(){
  S.playing = true;
  document.querySelector(".brand span").textContent = PACK.meta.headerLine;
  rec.innerHTML = "";
  $("#docview").innerHTML = ""; $("#talk").innerHTML = "";
  document.body.classList.remove("phase-office", "phase-file", "phase-meet");
  const id = PHASES[S.stage] ? PHASES[S.stage].id : "file";
  if(S.digest && S.digest.length && id !== "file")
    say("", "sys", "（接上次）\n" + S.digest.slice(-6).join("\n"));
  paint();
  if(id === "file"){
    document.body.classList.add("phase-file");
    curEv = null; renderDesk(CASE.investigation.intro, (CASE.scenes||{}).file); fileActions();
  }else if(id === "meet"){
    document.body.classList.add("phase-meet");
    $("#talk").innerHTML = `<div class="line sys"><div class="body">${esc("（接上次）")}</div></div>`;
    S.talk.slice(-6).forEach(l=>{
      const d2 = document.createElement("div"); d2.className = "line sys";
      d2.innerHTML = `<div class="body">${esc(l)}</div>`; $("#talk").appendChild(d2);
    });
    meetInput();
  }else if(id === "cross"){ stageCross(); }
  else if(id === "debate"){ nextRound(); }
  else { judge(); }
}

/* 阅卷结束，进法庭 */
function startTrial(){
  if(typeof setPane === "function") setPane("mid");
  if(CASE.scenes && CASE.scenes.trial)
    rec.insertAdjacentHTML("beforeend", sceneBanner(CASE.scenes.trial, (CASE.lex && CASE.lex.venue) || "第一审判庭", ""));
  say("", "sys", CASE.openingNote);
  say(CASE.judgeWho, "judge", CASE.crossIntro || ("现在进行法庭调查中的举证质证。" + L("pros") + "出示证据。"));
  setTimeout(stageCross, 400);
}
$("#btnLaw").onclick=()=>{ const d=$("#lawDrawer"); (d && !d.hidden) ? d.hidden=true : openLaw(""); };
$("#btnFile").onclick=()=>document.body.classList.toggle("showfile");
if(window.innerWidth<=900) $("#btnFile").style.display="flex";
paint();
/* 第一次来先看说明，看过就直接进设置/续档 */
try{ localStorage.getItem(SEEN_KEY) ? openCfg(true) : welcome(); }
catch(e){ welcome(); }
