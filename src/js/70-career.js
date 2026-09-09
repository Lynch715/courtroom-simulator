/* 70-career.js —— 生涯外壳
 *
 * 律所一屏：三轨、上一案的余波、接下一个案子。
 * 存档分两层：META 是生涯（跨案），SAVE 是当前这个案子打到哪了。
 */

/* ══════════════ 1、生涯存档 ══════════════ */
const CAREER0 = {rep: 0, cash: 50000, conscience: 0, done: [], best: {}, log: []};

function metaLoad(){
  try{
    const s = localStorage.getItem(META_KEY);
    if(s) return Object.assign({}, CAREER0, JSON.parse(s));
  }catch(e){}
  return JSON.parse(JSON.stringify(CAREER0));
}
function metaSave(m){ try{ localStorage.setItem(META_KEY, JSON.stringify(m)); }catch(e){} }

let META = metaLoad();

/* ══════════════ 2、当前案件的存档 ══════════════ */
const SET_KEYS = ["hits", "crossHits", "shown", "evWeak", "skim", "read"];
let _saveTimer = null;

function saveGame(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(()=>{
    try{
      const o = {};
      for(const k in S){
        if(k === "cfg") continue;
        o[k] = (S[k] instanceof Set) ? [...S[k]] : S[k];
      }
      o.digest = S.digest.slice(-20);
      localStorage.setItem(SAVE_KEY, JSON.stringify(
        {v: SAVE_VERSION, caseId: PACK.id, at: Date.now(), s: o}));
    }catch(e){ console.warn("存档失败", e); }
  }, 400);
}

function savedGame(){
  try{
    const s = localStorage.getItem(SAVE_KEY);
    if(!s) return null;
    const d = JSON.parse(s);
    /* 存档存的是哪个案子，就按哪个案子恢复。
       以前这里拿 d.caseId 和当前绑定的 PACK.id 比——刷新之后 PACK 还是默认那个案子，
       所以只有存的正好是默认案时才续得上，存别的案一律当作废，直接回事务所。 */
    if(d.v !== SAVE_VERSION) return null;                        // 版本对不上就作废
    if(!CASES.some(c => c.id === d.caseId)) return null;         // 案件包没了也作废
    return d;
  }catch(e){ return null; }
}
function clearSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }

function applySave(d){
  const o = d.s;
  for(const k in o){
    if(SET_KEYS.indexOf(k) >= 0) S[k] = new Set(o[k]);
    else if(k !== "cfg") S[k] = o[k];
  }
}

/* ══════════════ 3、律所一屏 ══════════════ */
function officeScreen(note){
  S.stage = -1;                       // 不在任何一幕里
  S.playing = false;
  document.querySelector(".brand span").textContent = "事务所";
  document.body.classList.remove("phase-file", "phase-meet");
  document.body.classList.add("phase-office");
  if(typeof setPane === "function") setPane("mid");
  $("#docview").innerHTML = "";
  $("#talk").innerHTML = "";
  rec.innerHTML = "";

  /* 案子全列出来。以前只列三张——库里八个案子，玩家只看得见三个，
     像是游戏只做了三关。没打过的排前面，打过的接着排。 */
  const pool = CASES.map(c=>c);
  const fresh = pool.filter(c=>META.done.indexOf(c.id) < 0);
  const old   = pool.filter(c=>META.done.indexOf(c.id) >= 0);
  const show  = fresh.concat(old);

  rec.innerHTML = sceneBanner((CASE.scenes && CASE.scenes.office) || "scene/law_office",
                              "你的事务所", "")
    + (note ? `<div class="line sys"><div class="body">${esc(note)}</div></div>` : "")
    + `<div class="office">
        <div class="tracks">
          ${track("声誉", META.rep, "接得到什么案子，看它")}
          ${track("良心", META.conscience, "你对当事人做过什么，它记着")}
          ${track("金钱", META.cash, "房租、调查取证、请人", true)}
        </div>
        ${META.log.length ? `<div class="wake"><h3>上一案之后</h3>${
          META.log.slice(-3).map(l=>`<p>${esc(l)}</p>`).join("")}</div>` : ""}
        <h3 class="pickH">接哪个案子<em class="pickN">${fresh.length ? fresh.length + " 个没打过" : "都打过了"}</em></h3>
        <div class="caseCards">${show.map(cardOf).join("")}</div>
        ${fresh.length === 0 ? `<p class="sub">这一期的案子你都打过了。再打一次也行——同一个案子，换个打法，结果不一样。</p>`
          : (old.length ? `<p class="sub">打过的案子也能重接。换个策略，结果不一样。</p>` : "")}
      </div>`;
  ui(`<div class="prompt">桌上这几份委托，<b>接了就是你的案子。</b></div>
      <div class="row"><span class="hint">卷宗架上一共 ${CASES.length} 份，还在往里添</span></div>`);
  document.querySelectorAll(".caseCard").forEach(el=>el.onclick=()=>takeCase(el.dataset.id));
  paint();
}

function track(name, v, sub, money){
  const s = money ? (v >= 10000 ? (v/10000).toFixed(1) + " 万" : v + " 元")
                  : (v > 0 ? "+" + v : String(v));
  const col = money ? "var(--paper)" : v > 0 ? "var(--ok)" : v < 0 ? "var(--pros)" : "var(--muted)";
  return `<div class="tk"><b style="color:${col}">${s}</b><span>${name}</span><i>${sub}</i></div>`;
}

function cardOf(c){
  const done = META.done.indexOf(c.id) >= 0;
  const best = META.best[c.id];
  return `<div class="caseCard" data-id="${c.id}">
    <div class="cc-h"><b>${esc(c.meta.title)}</b>
      <span class="tag">${"★".repeat(c.meta.difficulty || 1)}</span></div>
    <div class="cc-s">${esc(c.meta.subtitle || "")}</div>
    <div class="cc-b">${esc(c.meta.blurb || "")}</div>
    <div class="cc-f">
      <span>律师费 ${((c.meta.fee||0)/10000).toFixed(1)} 万</span>
      <span>${esc(c.meta.clientMood || "")}</span>
      ${done ? `<span class="tag weak">打过：${esc(best || "")}</span>` : ""}
    </div>
  </div>`;
}

function takeCase(id){
  clearSave();
  useCase(id);
  resetCase();
  document.body.classList.remove("phase-office");
  document.querySelector(".brand span").textContent = PACK.meta.headerLine;
  rec.innerHTML = "";
  S.playing = true;
  startFile();
}

/* ══════════════ 4、结案结算 ══════════════ */
function settleCase(v, t){
  const st = strat();
  const notes = [];
  let con = v.con, rep = v.rep;

  /* 良心的账，算在你对当事人做过什么上，不算在你替谁说话上 */
  if(st && st.id === "lenient" && t >= 50){
    con -= 8; notes.push("你选了认罪求轻判。庭审打到最后，这个案子本来是能做无罪的。");
  }
  if(st && st.id === "innocent"){
    if(t >= 50){ con += 12; notes.push("你顶着他的意思做了无罪辩护，你赌赢了。"); }
    else if(t < 0){ con -= 15; notes.push("他想认罪求个轻判，你没听。现在他要多坐几年。"); }
  }
  if(S.promised && t < 20){
    con -= 5; notes.push("你答应过他一件你办不到的事。他记着。");
  }
  if(S.lieFired){
    rep -= 3; notes.push("你在庭上替他说了一句被当场戳穿的话。这事会传出去。");
  }

  const fee = (PACK.meta && PACK.meta.fee) || 0;
  META.rep += rep;
  META.conscience += con;
  META.cash += fee;
  if(META.done.indexOf(PACK.id) < 0) META.done.push(PACK.id);
  const prev = META.best[PACK.id];
  if(!prev || t > (META.bestT && META.bestT[PACK.id] || -999)){
    META.best[PACK.id] = v.r;
    META.bestT = META.bestT || {}; META.bestT[PACK.id] = t;
  }
  META.log = notes.length ? notes : ["这个案子过去了。"];
  metaSave(META);
  clearSave();
  return {rep, con, fee, notes};
}

/* 结局那一段。按最终心证挑。 */
function epilogueOf(t){
  const e = CASE.epilogue || {};
  if(t >= 50) return e.acquit;
  if(t >= 20) return e.light;
  if(t >= 0)  return e.heavy;
  return e.worst;
}
