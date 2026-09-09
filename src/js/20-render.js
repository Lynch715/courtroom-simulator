/* 20-render.js —— 笔录、心证、三栏渲染 */
/* ============================================================
   渲染
   ============================================================ */
function say(who,cls,text,delta){
  const d=document.createElement("div");
  d.className="line "+(cls==="sys"?"sys":"");
  const av = (cls !== "sys" && typeof avatarFor === "function") ? avatarFor(who) : "";
  if(av) d.className += " hasAv";
  let h=`${av}<div class="who ${cls}">${who}</div><div class="body">${linkLaw(esc(text))}</div>`;
  if(delta) h+=`<div class="delta ${delta.v<0?"bad":""}">${delta.text}</div>`;
  d.innerHTML=h; rec.appendChild(d); rec.scrollTop=rec.scrollHeight;
  if(typeof bindLawRef==="function") bindLawRef();
  if(cls!=="sys" && who){
    S.digest.push(who.replace(/^.+· /,"") + "：" + String(text).slice(0,60));
    if(S.digest.length > 24) S.digest.shift();
  }
  return d;
}
function esc(s){return String(s).replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}

/* move() 与 total() 已移入 30-engine.js —— 写入通道集中在一处 */

function paint(){
  // 争点条。开庭前只知道焦点是什么，不知道法官怎么想。
  if(S.stage < 0 || S.stage === PH.file || S.stage === PH.meet){
    $("#issueList").innerHTML = Object.entries(CASE.issues).map(([k,v])=>
      `<div class="issue"><div class="h"><b>${v.name}</b><em class="pend">待${L("hearing")}</em></div></div>`).join("");
  }else
  $("#issueList").innerHTML = Object.entries(CASE.issues).map(([k,v])=>{
    const c=S.c[k], pct=Math.abs(c)/2;
    const col = c>=0?"var(--def)":"var(--pros)";
    const style = c>=0 ? `left:50%;width:${pct}%` : `right:50%;width:${pct}%`;
    const hit=[...S.hits].filter(h=>CASE.kp[h]&&CASE.kp[h].issue===k).map(h=>CASE.kp[h].tag);
    return `<div class="issue">
      <div class="h"><b>${v.name}</b><em style="color:${col}">${c>0?"+":""}${c}</em></div>
      <div class="meter"><div class="mid"></div><div class="fill" style="${style};background:${col}"></div></div>
      <div class="k">${hit.length?"已立住："+hit.join(" / "):"尚未立住任何论点"}</div>
    </div>`;
  }).join("");
  // 证据：阅卷阶段是可点的卷宗清单，庭上是在卷证据
  if($("#evTitle")) $("#evTitle").textContent =
    S.stage === PH.file ? "卷宗" : S.stage === PH.meet ? "你手上的材料" : "在卷证据";
  if(S.stage < 0){ /* 事务所：左右栏都不用渲染 */ }
  else if(S.stage === PH.file){
    $("#evList").innerHTML = fileListHTML();
    bindFileList();
    $("#fileSide").innerHTML = energyHTML();
  }else if(S.stage === PH.meet){
    $("#evList").innerHTML = meetEvHTML();
    $("#meetSide").innerHTML = trustHTML();
  }else
  $("#evList").innerHTML = Object.entries(CASE.ev).map(([k,e])=>{
    const tag = e.holder==="pros"?`<span class="tag pros">控方</span>`:`<span class="tag def">辩方</span>`;
    const weak = S.evWeak.has(k)?`<span class="tag weak">证明力已削弱</span>`:"";
    return `<div class="doc ${S.shown.has(k)?"":"dim"}"><div class="t"><span>${e.name}</span>${weak||tag}</div><div class="n">${e.note}</div></div>`;
  }).join("");
  // 出庭人员
  if($("#castList")) $("#castList").innerHTML = castListHTML();
  // 天平
  const t=total(), a=Math.max(-13,Math.min(13,-t/3.2));
  $("#beam").setAttribute("transform",`rotate(${a} 110 31)`);
  $("#panL").setAttribute("transform",`rotate(${-a} 34 31)`);
  $("#panR").setAttribute("transform",`rotate(${-a} 186 31)`);
  $("#sVal").textContent=(t>0?"+":"")+t;
  $("#sVal").style.color = t>8?"var(--def)":t<-8?"var(--pros)":"var(--paper)";
  $("#sLab").textContent = t>35?"法官明显倾向辩方":t>8?"略偏辩方":t<-35?"法官明显倾向控方":t<-8?"略偏控方":"势均力敌";
  // 流水
  $("#ledger").innerHTML = ledgerRows().slice(-14).map(e=>
    `<div class="e"><span>${e.why}</span><b class="${e.v<0?"dn":"up"}">${e.v>0?"+":""}${e.v}</b></div>`).join("")
    || `<div class="e"><span>尚无记录</span><b></b></div>`;
  // 法官耐心
  const pf = $("#patFace");
  if(pf && CASE.cast.judge && CASE.cast.judge.art){
    const mood = S.patience > 55 ? "" : S.patience > 30 ? "frown" : "grim";
    const want = artMood(CASE.cast.judge.art, mood);
    if(pf.dataset.art !== want){
      pf.innerHTML = artImg(want, "face", CASE.cast.judge.who);
      pf.dataset.art = want;
    }
  }
  if(pf) pf.className = "patFace " + (S.patience>55?"calm":S.patience>30?"warn":"bad");
  const pw = $("#patFill");
  if(pw){
    pw.style.width = S.patience + "%";
    pw.style.background = S.patience>55?"var(--ok)":S.patience>30?"var(--brass)":"var(--pros)";
    $("#patLab").textContent = S.patience>75?(L("courtN") + "在听你说"):S.patience>55?"尚有耐心"
      :S.patience>30?"开始不耐烦了":S.patience>0?"再废话就要被打断了":("已被" + L("silence"));
  }
  if(S.playing && typeof saveGame === "function") saveGame();
  // 插话入口（正在输入时不打扰）
  if(typeof mountAside === "function" && !document.querySelector("#asideSay")) mountAside();
  // 阶段条。在事务所时一格都不亮。
  $("#stagebar").innerHTML = PHASES.map((ph,n)=>
    `<i class="${S.stage<0?"":(n===S.stage?"on":(n<S.stage?"done":""))}">${ph.name}</i>`).join("");
}

/* 心证流水（复盘页和右栏共用）。只取心证频道，耐心和生涯不混进来。 */
function ledgerRows(){ return S.ledger.filter(e=>e.ch==="心"); }

/* 阅卷阶段的右栏：精力与批注本 */
function energyHTML(){
  const max = CASE.investigation.energy;
  const dots = Array.from({length:max}, (_,i)=>`<i class="${i<S.energy?"on":""}"></i>`).join("");
  const notes = S.notes.slice(-12).map(n=>
    `<div class="e"><b>${esc(CASE.ev[n.ev].name)}</b>${esc(n.text)}</div>`).join("")
    || `<div class="e">还没记什么。</div>`;
  return `<div class="energy">
      <div class="dots">${dots}</div>
      <div class="lab">精力 ${S.energy} / ${max}</div>
    </div>
    <div class="noteList">
      <h2 style="font-size:12px;font-weight:600;color:var(--brass);margin:0 0 9px;letter-spacing:.14em">批注本</h2>
      ${notes}
    </div>`;
}

/* 会见阶段的左栏：你手上的材料。读过的能看见内容，没读的只有个名字。 */
function meetEvHTML(){
  return Object.entries(CASE.ev).map(([k,e])=>{
    const read = S.read.has(k), skim = S.skim.has(k);
    return `<div class="doc ${read||skim?"":"dim"}">
      <div class="t"><span>${e.name}</span><span class="tag">${read?"细读过":skim?"扫过一眼":"没看"}</span></div>
      ${read ? `<div class="evRead">${esc(e.detail || e.note)}</div>`
             : skim ? `<div class="n">${esc(e.note)}</div>` : `<div class="n">你没翻开过它。</div>`}
    </div>`;
  }).join("");
}

/* 会见阶段的右栏：信任、剩余轮次、你已经知道的事 */
function trustHTML(){
  const m = CASE.meeting;
  const dots = Array.from({length:m.turns}, (_,i)=>`<i class="${i<S.turnsLeft?"on":""}"></i>`).join("");
  const col = S.trust>=70?"var(--ok)":S.trust>=40?"var(--def)":"var(--pros)";
  const lab = S.trust>=75?"他开始跟你说实话":S.trust>=55?"他愿意说"
            :S.trust>=35?"他还在掂量你":S.trust>=15?"他不太信你":"他不想跟你说话";
  const rows = [];
  S.known.forEach(id=>{
    const sec = m.secrets.find(x=>x.id===id);
    if(sec) rows.push(`<div class="e">${esc(sec.note)}</div>`);
  });
  S.lieBusted.forEach(id=>{
    const l = m.lies.find(x=>x.id===id);
    if(l) rows.push(`<div class="e busted">已戳穿：${esc(l.believedNote)}</div>`);
  });
  S.lieBelieved.forEach(id=>{
    const l = m.lies.find(x=>x.id===id);
    if(l) rows.push(`<div class="e lie">他说：${esc(l.believedNote)}</div>`);
  });
  const port = CASE.cast.client && CASE.cast.client.art
    ? `<div class="meetPortrait">${artImg(CASE.cast.client.art, "portrait", CASE.cast.client.who)}</div>` : "";
  return port + `<div class="trustBox">
      <div class="t"><span>信任</span><i>${lab}</i></div>
      <div class="trustBar"><div class="trustFill" style="width:${S.trust}%;background:${col}"></div></div>
      <div class="turnDots">${dots}</div>
    </div>
    <div class="knownList">
      <h2 style="font-size:12px;font-weight:600;color:var(--brass);margin:0 0 9px;letter-spacing:.14em">你知道的事</h2>
      ${rows.join("") || `<div class="e">还没问出什么。</div>`}
    </div>`;
}

/* 出庭人员。会见之后，当事人那一栏的说明会变。 */
function castListHTML(){
  return Object.entries(CASE.cast).filter(([k,c])=>c.blurb).map(([k,c])=>{
    const note = (k === "client" && S.stage > PH.meet && c.blurbAfterMeet) ? c.blurbAfterMeet : c.blurb;
    const cls = k === "pros" || k === "witness" ? "pros" : k === "client" ? "def" : "";
    return `<div class="doc"><div class="t"><span>${esc(c.who)}</span>
      <span class="tag ${cls}">${esc(c.tag)}</span></div><div class="n">${esc(note)}</div></div>`;
  }).join("");
}
