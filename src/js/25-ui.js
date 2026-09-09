/* 25-ui.js —— 操作区构建器 */
/* ============================================================
   操作区构建器
   ============================================================ */
function ui(html){
  $("#action").innerHTML = html;
  if(typeof bindVoice === "function") bindVoice();
  /* 轮到你说话了。人要是还在卷宗那一屏，给「笔录」那一格点个点。 */
  if(typeof nudgeMid === "function") nudgeMid();
}
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
