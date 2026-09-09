/* 65-verdict.js —— 评议宣判与复盘 */
/* ============================================================
   阶段三：评议宣判
   ============================================================ */
async function judge(){
  S.stage=PH.verdict; paint();
  const cl = CASE.closing;
  say(cl.judgeWho, "judge", cl.judgeLine);
  say(cl.clientWho, "pros", cl.clientLine);
  say("","sys","合议庭评议中");
  ui(`<div class="thinking">合议庭评议中</div>`);
  const t=total();
  const v=CASE.verdicts.find(x=>t>=x.min);
  const doc = await verdictDoc(v, t);
  const st = settleCase(v, t);
  career("rep", st.rep, "结案：" + v.r);
  career("conscience", st.con, "结案：" + v.r);
  S.playing = false;
  showVerdict(v, t, doc, st);
}
function showVerdict(v,t,doc,st){
  st = st || {rep:v.rep, con:v.con, fee:0, notes:[]};
  const rows=ledgerRows().map(e=>`<div class="e"><span>${e.why}</span><b class="${e.v<0?"dn":"up"}">${e.v>0?"+":""}${e.v}</b></div>`).join("");
  const missed=Object.entries(CASE.kp).filter(([k])=>!S.hits.has(k));
  const m = SVGMissed(missed);
  const epi = typeof epilogueOf === "function" ? epilogueOf(t) : "";
  const pm = postmortemHTML();
  const mask=document.createElement("div"); mask.className="mask";
  mask.innerHTML=`<div class="modal">
    <div class="vhead">
      <div class="lab" style="font-size:11.5px;color:var(--muted);letter-spacing:.14em">${L("verdictN")}结果</div>
      <div class="r">${v.r}</div>
    </div>
    <div class="verdict">${linkLaw(esc(doc))}</div>
    ${epi ? `<div class="epilogue">${esc(epi)}</div>` : ""}
    ${st.notes && st.notes.length ? `<div class="conNotes">${st.notes.map(n=>`<p>${esc(n)}</p>`).join("")}</div>` : ""}
    <h3 style="margin-top:24px;font-size:15px">这场${L("hearing")}你是怎么走到这里的</h3>
    <p class="sub">最终心证 ${t>0?"+":""}${t}　声誉 ${st.rep>0?"+":""}${st.rep}　良心 ${st.con>0?"+":""}${st.con}　律师费 ${((st.fee||0)/10000).toFixed(1)} 万</p>
    <div class="ledger" style="padding:0">${rows}</div>
    ${m}
    ${pm}
    <div class="row" style="margin-top:20px">
      <button class="primary" id="office">回事务所</button>
      <button class="ghost" id="again">再打一次</button>
      <button class="ghost" id="close">留在${L("onSite")}</button>
    </div>
  </div>`;
  document.body.appendChild(mask);
  mask.querySelector("#again").onclick=()=>{ mask.remove(); takeCase(PACK.id); };
  mask.querySelector("#office").onclick=()=>{ mask.remove(); officeScreen(); };
  mask.querySelector("#close").onclick=()=>mask.remove();
  bindLawRef();
}
function SVGMissed(missed){
  if(!missed.length) return `<p class="sub" style="margin-top:14px;color:var(--ok)">四个论点你全立住了。这种打法在现实里极少见。</p>`;
  return `<h3 style="margin-top:22px;font-size:15px">没说出口的话</h3>
  <p class="sub">这些论点在卷宗里立得住，你这场没用上：</p>
  <div class="ledger" style="padding:0">${missed.map(([k,p])=>
    `<div class="e"><span>${p.tag}：${p.desc}</span><b class="dn">未用</b></div>`).join("")}</div>`;
}

/* 案子的原型。A 级案件明示，B 级只写同类案件的现实处理。 */
function postmortemHTML(){
  const pm = CASE.postmortem;
  if(!pm) return "";
  const refs = (pm.refs || []).map(r=>{
    const [law, key] = r.split(":");
    return LAWS[law] && LAWS[law][key]
      ? `<span class="lawRef" data-law="${law}" data-art="${key}">${law}${LAWS[law][key].n}</span>` : "";
  }).filter(Boolean).join("　");
  return `<h3 style="margin-top:24px;font-size:15px">${esc(pm.title || "延伸阅读")}</h3>
    <div class="postmortem">${esc(pm.body || "")}</div>
    ${refs ? `<p class="sub" style="margin-top:8px">${refs}</p>` : ""}`;
}
