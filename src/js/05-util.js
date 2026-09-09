/* 05-util.js —— 小工具 */
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

/* 可播种的随机数。
   种子为 0（默认）时用真随机；测试时 Engine.seed(42) 让整局可复现。 */
let _rng = 0;
function seedRandom(n){ _rng = n >>> 0; }
function rnd(){
  if(!_rng) return Math.random();
  _rng = (_rng * 1664525 + 1013904223) >>> 0;
  return _rng / 4294967296;
}
function pick(a){ return a[Math.floor(rnd() * a.length)]; }

/* 轻反馈。不打断流程，不弹窗。 */
let _toastTimer = null;
function toast(msg){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>el.classList.remove("on"), 3200);
}
