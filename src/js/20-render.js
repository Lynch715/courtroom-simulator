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
  if($("#briefBox")){ $("#briefBox").innerHTML = briefHTML(); bindIndict(); }
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
  /* data-n 是给窄屏用的：手机上只显示当前这一格，后面缀个 3/5 */
  if(typeof paintTabs === "function") paintTabs();
  $("#stagebar").innerHTML = PHASES.map((ph,n)=>
    `<i data-n="${n+1}/${PHASES.length}" class="${S.stage<0?"":(n===S.stage?"on":(n<S.stage?"done":""))}">${ph.name}</i>`).join("");
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
  /* 这一格原来只有一条信任进度条，玩家点进来没什么可看的。
     现在主体是「他说了什么」——用他自己的原话，不是第三人称的摘要。
     信任压成顶上一行。 */
  const rows = [];
  S.known.forEach(id=>{
    const sec = m.secrets.find(x=>x.id===id);
    if(!sec) return;
    const quote = String(sec.truth || "").split(/[。？！\n]/).filter(Boolean)[0];
    rows.push(`<div class="e"><q>${esc(quote ? quote + "。" : sec.note)}</q>
      <b>${esc(sec.note)}</b></div>`);
  });
  S.lieBusted.forEach(id=>{
    const l = m.lies.find(x=>x.id===id);
    if(l) rows.push(`<div class="e busted"><q>${esc(l.onBust || "")}</q>
      <b>他改口了：${esc(l.believedNote)}</b></div>`);
  });
  S.lieBelieved.forEach(id=>{
    const l = m.lies.find(x=>x.id===id);
    if(l) rows.push(`<div class="e lie"><q>${esc(String(l.claim||"").split(/[。\n]/)[0] + "。")}</q>
      <b>他说的，你还没核过</b></div>`);
  });
  const port = CASE.cast.client && CASE.cast.client.art
    ? `<div class="meetPortrait">${artImg(CASE.cast.client.art, "portrait", CASE.cast.client.who)}</div>` : "";
  const empty = m.hint ? esc(m.hint) : "他还什么都没说。";
  return port + `<div class="trustBox tight">
      <div class="t"><span>${esc(lab)}</span><i>还能问 ${S.turnsLeft} 轮</i></div>
      <div class="trustBar"><div class="trustFill" style="width:${S.trust}%;background:${col}"></div></div>
      <div class="turnDots">${dots}</div>
    </div>
    <div class="knownList">
      <h2 style="font-size:12px;font-weight:600;color:var(--brass);margin:0 0 9px;letter-spacing:.14em">他说了什么</h2>
      ${rows.join("") || `<div class="e blank">${empty}</div>`}
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

/* ══════════════ 窄屏面板切换 ══════════════
 * 三栏在手机上一次只显示一屏，底部标签栏切换。
 * 标签名跟着阶段走——阅卷时中栏是「材料」，庭审时是「笔录」。
 * 桌面上标签栏是隐藏的，setPane 照样跑，不影响任何东西。
 */
const PANE_LABELS = {
  file:    {left:"卷宗", mid:"材料",   right:"批注"},
  meet:    {left:"材料", mid:"会见",   right:"他说的"},
  cross:   {left:"卷宗", mid:"笔录",   right:"心证"},
  debate:  {left:"卷宗", mid:"笔录",   right:"心证"},
  verdict: {left:"卷宗", mid:"笔录",   right:"心证"},
};
function setPane(p){
  document.body.dataset.pane = p;
  document.querySelectorAll("#tabbar button").forEach(b=>{
    b.classList.toggle("on", b.dataset.pane === p);
    if(b.dataset.pane === "mid"){ const d = b.querySelector(".dot"); if(d) d.hidden = (p === "mid"); }
  });
}
function paintTabs(){
  const ph = (S.stage >= 0 && PHASES[S.stage]) ? PHASES[S.stage].id : null;
  const L = PANE_LABELS[ph] || PANE_LABELS.cross;
  document.querySelectorAll("#tabbar button").forEach(b=>{
    const t = b.querySelector(".ti"); if(t) t.textContent = L[b.dataset.pane] || "";
  });
  if(!document.body.dataset.pane) setPane("mid");
}
/* 轮到你说话了，而人还在别的屏上——给「笔录」那一格点个点 */
function nudgeMid(){
  if(document.body.dataset.pane === "mid") return;
  const d = document.querySelector('#tabbar button[data-pane="mid"] .dot');
  if(d) d.hidden = false;
}
document.querySelectorAll("#tabbar button").forEach(b=>b.onclick=()=>setPane(b.dataset.pane));
setPane("mid");

/* 起诉书那一块。开局就该知道自己在辩什么、辩的是谁。
 * 正文照真实起诉书的格式排：谁、干了什么、凭什么认定、按哪条起诉、要判多少。
 * 长是应该的——这是案子的全部底牌，读不完就上庭是玩家自己的选择。 */
function briefHTML(){
  const m = PACK.meta || {}, c = CASE, ind = c.indictment;
  if(!ind){
    /* 老案件包没写 indictment，退回一句话版本，不让它崩 */
    return `<div class="briefCard">
      <div class="bh">${esc(m.title || c.title || "")}</div>
      <div class="bs">${esc(m.subtitle || c.charge || "")}</div>
      <p class="bb">${esc(c.brief || "")}</p>
    </div>`;
  }
  const para = t => String(t || "").split("\n")
    .filter(x=>x.trim()).map(x=>`<p>${esc(x.trim())}</p>`).join("");
  const fee = m.fee ? `律师费 ${(m.fee/10000).toFixed(1)} 万` : "";
  const title = ind.docTitle || "起诉书";
  return `<div class="briefCard" id="indict">
      <div class="bh">${esc(m.title || c.title || "")}</div>
      <div class="bs">${esc(m.subtitle || c.charge || "")}</div>
      <div class="indHead">
        <div class="indOrg">${esc(ind.org || "")}</div>
        <div class="indTitle">${esc(title)}</div>
        <div class="indNo">${esc(ind.no || "")}</div>
      </div>
      <div class="indBody" id="indBody">
        <div class="indSec"><i>被告人</i>${para(ind.defendant)}</div>
        <div class="indSec"><i>指控事实</i>${para(ind.facts)}</div>
        <div class="indSec"><i>证据</i>${para(ind.proof)}</div>
        <div class="indSec"><i>本院认为</i>${para(ind.charge)}</div>
        ${ind.ask ? `<div class="indSec ask"><i>量刑建议</i>${para(ind.ask)}</div>` : ""}
      </div>
      <div class="indFold"><button class="ghost sm" id="indMore">读全文</button>
        ${fee ? `<span class="hint">${esc(fee)}</span>` : ""}</div>
    </div>`;
}

/* 起诉书默认折起来，点开读全文。左栏放不下整篇。 */
function bindIndict(){
  const b = document.getElementById("indMore");
  if(!b) return;
  b.onclick = ()=>{
    const card = document.getElementById("indict");
    const on = card.classList.toggle("open");
    b.textContent = on ? "收起" : "读全文";
  };
}
