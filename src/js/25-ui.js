/* 25-ui.js —— 操作区构建器 */
/* ============================================================
   操作区构建器
   ============================================================ */
function ui(html){ $("#action").innerHTML=html; if(typeof bindVoice==="function") bindVoice(); }
function multi(sel){ return [...document.querySelectorAll(sel+".sel")].map(e=>e.dataset.v); }
function bindChips(sel){
  document.querySelectorAll(sel).forEach(c=>c.onclick=()=>{
    if(c.classList.contains("solo")){
      document.querySelectorAll(sel).forEach(x=>x.classList.remove("sel"));
      c.classList.add("sel");
    }else{
      document.querySelector(sel+".solo")?.classList.remove("sel");
      c.classList.toggle("sel");
    }
  });
}
