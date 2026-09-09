/* 58-laws.js —— 法条速查
 *
 * 纯本地数据，不联网、不调模型。条文来自国家法律法规数据库，
 * 法律法规属《著作权法》第五条排除对象，不受著作权保护。
 *
 * 两个入口：右上角的「法条」按钮，和笔录里被点亮的条文号。
 */
const LAW_NAMES = Object.keys(LAWS || {}).filter(k => k[0] !== "_");
const LAW_ALIAS = (LAWS && LAWS._alias) || {};
const CN_NUM = {"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9};

function cn2num(s){
  s = String(s).trim();
  if(/^[0-9]+$/.test(s)) return parseInt(s, 10);
  let total = 0, num = 0;
  for(const ch of s){
    if(ch in CN_NUM) num = CN_NUM[ch];
    else if(ch === "十"){ total += (num || 1) * 10; num = 0; }
    else if(ch === "百"){ total += (num || 1) * 100; num = 0; }
    else if(ch === "千"){ total += (num || 1) * 1000; num = 0; }
    else return null;
  }
  return total + num;
}

/* 笔录里的条文号点亮成可点的 */
const LAW_RE = LAW_NAMES.length
  ? new RegExp("(" + LAW_NAMES.join("|") + ")?第?([一二三四五六七八九十百千零0-9]{1,9})条(?:之([一二三四五六七八九十0-9]+))?", "g")
  : null;

function linkLaw(html){
  if(!LAW_RE || !LAW_NAMES.length) return html;
  LAW_RE.lastIndex = 0;
  return html.replace(LAW_RE, (all, law, num, sub)=>{
    const n = cn2num(num);
    if(n === null) return all;
    const key = sub ? n + "-" + cn2num(sub) : String(n);
    const which = law || (CASE.mainLaw || "刑法");
    if(!LAWS[which] || !LAWS[which][key]) return all;
    return `<span class="lawRef" data-law="${which}" data-art="${key}">${all}</span>`;
  });
}

/* ---------- 抽屉 ---------- */
function lawDrawer(){
  let d = $("#lawDrawer");
  if(d) return d;
  d = document.createElement("div");
  d.id = "lawDrawer";
  d.hidden = true;
  d.innerHTML = `<div class="lawHead">
      <b>法条速查</b>
      <span class="lawSrc">条文来自国家法律法规数据库</span>
      <button class="iconbtn" id="lawClose">关闭</button>
    </div>
    <input id="lawQ" placeholder="条号或关键词：264 / 第二百六十四条 / 正当防卫">
    <div id="lawResults"></div>`;
  document.body.appendChild(d);
  $("#lawClose").onclick = ()=>{ d.hidden = true; };
  $("#lawQ").oninput = ()=>renderLaw($("#lawQ").value);
  return d;
}

function openLaw(q){
  const d = lawDrawer();
  d.hidden = false;
  $("#lawQ").value = q || "";
  renderLaw(q || "");
  if(!q) $("#lawQ").focus();
}

function lawSearch(q){
  q = String(q || "").trim();
  if(!q) return [];
  const out = [];
  /* 先按条号找 */
  const m = q.match(new RegExp("^(?:(" + LAW_NAMES.join("|") + ")\\s*)?第?([一二三四五六七八九十百千零0-9]{1,9})条?(?:之([一二三四五六七八九十0-9]+))?$"));
  if(m){
    const n = cn2num(m[2]);
    if(n !== null){
      const key = m[3] ? n + "-" + cn2num(m[3]) : String(n);
      const laws = m[1] ? [m[1]] : LAW_NAMES;
      for(const law of laws){
        if(LAWS[law] && LAWS[law][key]) out.push({law, key, a: LAWS[law][key]});
      }
      if(out.length) return out;
    }
  }
  /* 罪名和常用说法。「高空抛物」是罪名，刑法二百九十一条之二正文里写的是
     「从建筑物或者其他高空抛掷物品」，光搜正文找不到。 */
  for(const k in LAW_ALIAS){
    if(k.indexOf(q) < 0 && q.indexOf(k) < 0) continue;
    for(const ref of LAW_ALIAS[k]){
      const [law, key] = ref.split(":");
      if(LAWS[law] && LAWS[law][key] && !out.some(x=>x.law===law && x.key===key))
        out.push({law, key, a: LAWS[law][key]});
    }
  }
  if(out.length) return out.slice(0, 24);

  /* 再按关键词找正文，整串命中的排前面 */
  for(const law of LAW_NAMES){
    for(const key in LAWS[law]){
      const a = LAWS[law][key];
      if(a.t.indexOf(q) >= 0 || a.n.indexOf(q) >= 0) out.push({law, key, a});
    }
  }
  if(out.length) return out.slice(0, 24);

  /* 整串搜不到就拆词再试一遍。
     「非法持有枪支」在刑法一百二十八条里写作「非法持有、私藏枪支」，中间隔着顿号，
     整串对不上，但拆成 非法/持有/枪支 三个词就都在。 */
  const terms = q.match(/[\u4e00-\u9fa5]{2}|[A-Za-z0-9]+/g);
  if(!terms || terms.length < 2) return out;
  for(const law of LAW_NAMES){
    for(const key in LAWS[law]){
      const a = LAWS[law][key];
      if(terms.every(t=>a.t.indexOf(t) >= 0)){
        out.push({law, key, a});
        if(out.length >= 24) return out;
      }
    }
  }
  return out;
}

function renderLaw(q){
  const box = $("#lawResults");
  if(!box) return;
  const hits = lawSearch(q);
  if(!String(q).trim()){
    box.innerHTML = `<div class="lawTip">本案常用的几条：</div>` +
      (CASE.lawRefs || []).map(r=>{
        const [law, key] = r.split(":");
        const a = LAWS[law] && LAWS[law][key];
        return a ? lawCard(law, key, a) : "";
      }).join("") || `<div class="lawTip">输入条号或关键词。</div>`;
    bindLawRef();
    return;
  }
  box.innerHTML = hits.length
    ? hits.map(h=>lawCard(h.law, h.key, h.a)).join("")
    : `<div class="lawTip">没找到。这一部法只收了本作用得到的条文，不是全文。</div>`;
}

function lawCard(law, key, a){
  return `<div class="lawCard"><div class="lawT">${esc(law)}${esc(a.n)}</div>
    <div class="lawB">${esc(a.t)}</div></div>`;
}

/* 笔录里点条文号 */
function bindLawRef(){
  document.querySelectorAll(".lawRef").forEach(el=>{
    if(el._bound) return;
    el._bound = true;
    el.onclick = ()=>{
      const parts = el.dataset.art.split("-");
      openLaw(el.dataset.law + "第" + parts[0] + "条" + (parts[1] ? "之" + parts[1] : ""));
    };
  });
}
