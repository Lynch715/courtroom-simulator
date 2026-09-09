/* 47-art.js —— 美术资源
 *
 * 三层回落：内嵌 base64 → art/<key>.webp → 内置 SVG 占位。
 * 图挂了静默回落，所以可以一张一张往里补，补一张生效一张；
 * 整个 art/ 目录清空，游戏也要零报错能玩到底。
 */
const ART_BASE = "art/";

function artHas(key){
  if(typeof ART_DATA !== "undefined" && ART_DATA[key]) return true;
  return typeof ART_HAVE !== "undefined" && !!ART_HAVE[key];
}
function artUrl(key){
  if(typeof ART_DATA !== "undefined" && ART_DATA[key]) return ART_DATA[key];
  const ext = (typeof ART_HAVE !== "undefined" && ART_HAVE[key]) || "webp";
  return ART_BASE + key + "." + ext;
}

/* 占位图。按 key 的前缀分三种：人、场景、证据。 */
function artSvg(key){
  const kind = String(key).split("/")[0];
  const c = 'stroke="var(--line2)" fill="none" stroke-width="1.4"';
  if(kind === "cast")
    return `<svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="45" cy="42" r="18" ${c}/><path d="M12 118c0-19 15-31 33-31s33 12 33 31" ${c}/></svg>`;
  if(kind === "ev")
    return `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="30" y="12" width="60" height="70" ${c}/>
      <path d="M40 30h40M40 42h40M40 54h28" ${c}/></svg>`;
  return `<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="8" y="8" width="144" height="74" ${c}/><path d="M8 62l40-26 30 20 24-14 42 24" ${c}/></svg>`;
}

function artFallback(key, cls){
  return `<span class="art ph ${cls || ""}">${artSvg(key)}</span>`;
}

/* 一张图。加载失败就地换成占位，不报错、不破版。 */
function artImg(key, cls, alt){
  if(!key) return "";
  /* 构建时没扫到这张图，就地画占位，连请求都不发 */
  if(!artHas(key)) return artFallback(key, cls);
  return `<img class="art ${cls || ""}" src="${artUrl(key)}" alt="${esc(alt || "")}" loading="lazy"
    onerror="this.outerHTML=artFallback('${key}','${cls || ""}')">`;
}

/* 表情差分。<key>_frown 皱眉、<key>_grim 凝重。
   没出这两张图就自动用原图，所以出一张生效一张。 */
function artMood(key, mood){
  if(!key || !mood) return key;
  const k = key + "_" + mood;
  return artHas(k) ? k : key;
}

/* ---------- 说话人 → 立绘 ---------- */
/* 用 var 不用 let：00-const.js 里的 useCase() 在脚本最前面就会调 resetArtCache()，
   那时候 let 还在暂时性死区里，一碰就抛。 */
var _whoMap = null;
function resetArtCache(){ _whoMap = null; }
function castKeyByWho(who){
  if(!_whoMap){
    _whoMap = {};
    for(const k in CASE.cast) if(CASE.cast[k].who) _whoMap[CASE.cast[k].who] = k;
  }
  const k = _whoMap[who];
  return k && CASE.cast[k].art ? CASE.cast[k].art : null;
}

/* 笔录里每条发言左边的小像 */
function avatarFor(who){
  const key = castKeyByWho(who);
  return key ? artImg(key, "avatar", who) : "";
}

/* ---------- 场景转场 ---------- */
function sceneBanner(key, title, sub){
  return `<div class="sceneBanner">
    ${artImg(key, "scene", title)}
    <div class="sceneCap"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>
  </div>`;
}

/* ---------- 关键时刻的立绘滑入 ---------- */
let _flashTimer = null;
function portraitFlash(castKey, line, mood){
  const c = CASE.cast[castKey];
  if(!c || !c.art) return;
  const art = artMood(c.art, mood);
  let box = $("#flash");
  if(!box){
    box = document.createElement("div");
    box.id = "flash";
    document.body.appendChild(box);
  }
  box.innerHTML = `${artImg(art, "flashArt", c.who)}
    <div class="flashCap"><b>${esc(c.who)}</b>${line ? `<span>${esc(line)}</span>` : ""}</div>`;
  box.classList.add("on");
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(()=>box.classList.remove("on"), 1800);
}
