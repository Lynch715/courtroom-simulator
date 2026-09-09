/* 50-act1-file.js —— 第一幕·阅卷
 * 开庭前一晚。精力有限，卷宗读不完，你得挑。
 * 这一幕的产出（S.read / S.marks）在第三幕兑现：读过的证据让相关论点更有底，
 * 标对的瑕疵让庭上质证更有力。
 */
const FILE_ACT = {authenticity:"真实性", legality:"合法性", relevance:"关联性"};
let curEv = null;

function startFile(){
  S.stage = PH.file;
  document.body.classList.add("phase-file");
  if(typeof setPane === "function") setPane("left");   // 阅卷这一幕，卷宗列表是导航
  curEv = null;
  paint();
  renderDesk(CASE.investigation.intro + "\n\n" + CASE.investigation.deskNote,
             (CASE.scenes && CASE.scenes.file) || null);
  fileActions();
}

/* ---------- 中栏：桌面 ---------- */
function renderDesk(text, scene){
  $("#docview").innerHTML = (scene ? sceneBanner(scene, "开庭前一晚", "卷宗在桌上") : "")
    + `<div class="deskIntro">${esc(text)}</div>`;
}

function renderEvDoc(id){
  setTimeout(()=>{ if(typeof bindLawRef==="function") bindLawRef(); }, 0);
  const e = CASE.ev[id];
  const lv = S.read.has(id) ? 2 : S.skim.has(id) ? 1 : 0;
  const my = S.notes.filter(n=>n.ev === id);
  let body;
  if(lv === 0)      body = `<p class="dim">还没翻开。</p>`;
  else if(lv === 1) body = `<p>${esc(e.note)}</p><p class="dim">只扫了一眼。要看出门道，得细读。</p>`;
  else              body = `<p>${esc(e.note)}</p><div class="detail">${linkLaw(esc(e.detail || "（这份材料没有更多内容）"))}</div>`;

  $("#docview").innerHTML = (lv === 2 && e.art ? `<div class="evShot">${artImg(e.art, "", e.name)}</div>` : "")
    + `<div class="docHead">
      <h3>${esc(e.name)}</h3>
      <span class="tag ${e.holder === "pros" ? "pros" : "def"}">${e.holder === "pros" ? "控方" : "辩方"}</span>
    </div>
    ${body}
    ${(S.marks[id]||[]).length ? `<div class="markRow">你标了：${(S.marks[id]||[]).map(f=>FILE_ACT[f]).join("、")}</div>` : ""}
    ${my.length ? `<div class="myNotes">${my.map(n=>`<div class="${n.think?"think":""}">${esc(n.text)}</div>`).join("")}</div>` : ""}`;
}

/* ---------- 左栏：卷宗清单 ---------- */
function fileListHTML(){
  return Object.entries(CASE.ev).map(([k,e])=>{
    const lv = S.read.has(k) ? "细读" : S.skim.has(k) ? "粗看" : "未看";
    const mk = (S.marks[k]||[]).length ? `<span class="tag weak">已标 ${(S.marks[k]||[]).length}</span>` : "";
    return `<div class="doc pickable ${curEv===k?"on":""} ${lv==="未看"?"dim":""}" data-ev="${k}">
      <div class="t"><span>${e.name}</span>${mk || `<span class="tag">${lv}</span>`}</div>
      <div class="n">${e.holder === "pros" ? "控方证据" : "辩方证据"}</div>
    </div>`;
  }).join("");
}
function bindFileList(){
  document.querySelectorAll("#evList .pickable").forEach(d=>d.onclick=()=>{
    curEv = d.dataset.ev; paint(); renderEvDoc(curEv); fileActions();
    /* 窄屏：挑完就切到材料那一格。全文和粗看/细读的按钮都在那边，
       留在卷宗格里的话，点了一份材料什么反应都看不到。 */
    if(typeof setPane === "function") setPane("mid");
  });
}

/* ---------- 操作区 ---------- */
function cost(k){ return CASE.investigation.costs[k]; }
function canPay(k){ return S.energy >= cost(k); }

function fileActions(){
  const c = CASE.investigation.costs;
  if(!curEv){
    /* 窄屏没有「左边」，卷宗在上面。文案跟着视口走。 */
    const where = window.matchMedia("(max-width:900px)").matches ? "「卷宗」那一格里" : "左边";
    ui(`<div class="prompt">${where}那一沓，粗看一份 ${c.skim} 点，细读一份 ${c.read} 点。<b>今晚你有 ${S.energy} 点。</b></div>
      <div class="row"><button class="ghost" id="leave">直接去法院</button>
      <span class="hint">天亮之前，桌上这些看不完。</span></div>`);
    $("#leave").onclick = confirmLeave;
    return;
  }
  const id = curEv, e = CASE.ev[id];
  const lv = S.read.has(id) ? 2 : S.skim.has(id) ? 1 : 0;
  const btns = [];
  if(lv === 0) btns.push(`<button class="chip" id="aSkim" ${canPay("skim")?"":"disabled"}>粗看（${c.skim} 点）</button>`);
  if(lv < 2)   btns.push(`<button class="chip" id="aRead" ${canPay("read")?"":"disabled"}>细读（${c.read} 点）</button>`);
  if(lv === 2 && S.thinkLeft > 0)
    btns.push(`<button class="chip" id="aThink" ${canPay("think")?"":"disabled"}>想一想（${c.think} 点，还剩 ${S.thinkLeft} 次）</button>`);

  const marks = S.marks[id] || [];
  const markRow = lv === 2 ? `<div class="chips" id="mk">
      ${Object.entries(FILE_ACT).map(([f,cn])=>
        `<button class="chip ${marks.includes(f)?"sel":""}" data-f="${f}">${cn}存疑</button>`).join("")}
    </div>
    <div class="prompt small">标记不花精力。标过的地方，庭上你张口就来；没标的，得现想。</div>` : "";

  /* 窄屏上这一块原来能占掉半屏，正文被压得只剩一段。
     备注框默认收起来，点「记一句」才展开。 */
  ui(`<div class="prompt">${esc(e.name)}　<b>精力 ${S.energy}</b></div>
    <div class="chips">${btns.join("") || `<span class="hint">这份看完了。</span>`}</div>
    ${markRow}
    ${lv === 2 ? `<div class="noteWrap" id="noteWrap" hidden>
        <textarea id="noteBox" placeholder="记一句，给自己看的"></textarea>
        <div class="row"><button class="ghost" id="aNote">记下</button>${voiceBtn("noteBox")}</div>
      </div>` : ""}
    <div class="row">
      ${lv === 2 ? `<button class="ghost" id="aNoteOpen">记一句</button>` : ""}
      <button class="ghost" id="leave">去法院</button>
      <span class="hint">${S.energy <= 0 ? "精力用完了。" : CASE.investigation.deskNote}</span>
    </div>`);
  const nOpen = $("#aNoteOpen");
  if(nOpen) nOpen.onclick = ()=>{
    const w = $("#noteWrap"); if(!w) return;
    w.hidden = !w.hidden; nOpen.hidden = !w.hidden ? true : false;
    if(!w.hidden){ const t = $("#noteBox"); if(t) t.focus(); }
  };

  if($("#aSkim"))  $("#aSkim").onclick  = ()=>{ S.energy -= c.skim; S.skim.add(id); refresh(); };
  if($("#aRead"))  $("#aRead").onclick  = ()=>{ S.energy -= c.read; S.skim.add(id); S.read.add(id); refresh(); };
  if($("#aThink")) $("#aThink").onclick = ()=>doThink(id);
  if($("#aNote"))  $("#aNote").onclick  = ()=>{
    const t = $("#noteBox").value.trim();
    if(t.length < 2) return;
    S.notes.push({ev:id, text:t}); refresh();
  };
  document.querySelectorAll("#mk .chip").forEach(b=>b.onclick=()=>{
    const f = b.dataset.f, arr = S.marks[id] || (S.marks[id] = []);
    const i = arr.indexOf(f);
    if(i >= 0) arr.splice(i,1); else arr.push(f);
    refresh();
  });
  $("#leave").onclick = confirmLeave;
}

function refresh(){ paint(); renderEvDoc(curEv); fileActions(); }

async function doThink(id){
  if(S.busy || S.thinkLeft <= 0 || !canPay("think")) return;
  S.busy = true;
  S.energy -= cost("think"); S.thinkLeft--;
  ui(`<div class="thinking">你盯着这一页</div>`);
  const res = await callLLM("file.think",
    `【案由】${CASE.charge}\n【案情】${CASE.brief}\n【手上这份材料】${CASE.ev[id].name}\n${CASE.ev[id].detail||CASE.ev[id].note}\n【你已经看过的】${[...S.read].map(k=>CASE.ev[k].name).join("、")||"暂时只有这一份"}`);
  const off = CASE.investigation.offlineThink;
  const pool = (off && (off[id] || off._default)) || ["看不出什么。"];
  const text = (res && res.text) || pick(pool.filter(t=>!S.notes.some(n=>n.text===t)).length
      ? pool.filter(t=>!S.notes.some(n=>n.text===t)) : pool);
  S.notes.push({ev:id, text, think:true});
  S.busy = false;
  refresh();
}

/* ---------- 离场 ---------- */
function confirmLeave(){
  const unread = Object.keys(CASE.ev).filter(k=>!S.read.has(k));
  const warn = unread.length
    ? `还有 ${unread.length} 份没细读：${unread.map(k=>CASE.ev[k].name).join("、")}。`
    : `三册都读完了。`;
  ui(`<div class="prompt">${warn}<b>出了这个门就是明天早上。</b></div>
    <div class="row">
      <button class="primary" id="yes">去法院</button>
      <button class="ghost" id="no">再看看</button>
      <span class="hint">还剩 ${S.energy} 点精力</span>
    </div>`);
  $("#no").onclick = fileActions;
  $("#yes").onclick = endFile;
}

function endFile(){
  document.body.classList.remove("phase-file");
  $("#docview").innerHTML = "";
  say("", "sys", CASE.investigation.outro);
  if(CASE.meeting) startMeet();
  else { S.stage = PH.cross; paint(); startTrial(); }
}
