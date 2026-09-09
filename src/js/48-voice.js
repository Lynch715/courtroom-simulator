/* 48-voice.js —— 语音输入
 *
 * 文字和语音是并列的两条路，不是主从。所以按住说话是个和「发言」并排的按钮，
 * 不是输入框角落里的小话筒。
 *
 * 三件必须守住的事（施工规范 四）：
 *   1. file:// 打开时浏览器不给麦克风。这时候不渲染按钮，改成一行常驻提示，
 *      明确告诉玩家还有输入法话筒键这条路——不藏起来。
 *   2. 一次失败就永久降级。Chrome 的实现要把音频发给 Google，国内多半连不上，
 *      不要让玩家一遍遍撞墙。
 *   3. 语音永不自动提交。庭上说错话不能撤回，游戏里得能改。
 */
const VOICE = (function(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let off = false;
  try{ off = !!localStorage.getItem(VOICE_OFF_KEY); }catch(e){}
  /* 注意：Chromium 把 file:// 也算 isSecureContext，但它照样不给麦克风权限。
     所以协议要单独判，不能只看 isSecureContext。 */
  const local = location.protocol === "file:";
  return {
    SR: SR,
    ok: !!SR && window.isSecureContext && !local && !off,
    why: !SR ? "这个浏览器不支持页内语音"
       : local ? "本地双击打开的网页用不了麦克风"
       : !window.isSecureContext ? "这个页面不是安全上下文"
       : off ? "页内语音上次没能用起来" : "",
    rec: null, ta: null, btn: null
  };
})();

function voiceDisable(reason){
  VOICE.ok = false;
  try{ localStorage.setItem(VOICE_OFF_KEY, "1"); }catch(e){}
  voiceStop();
  console.warn("页内语音已关闭：" + reason);
  toast("页内语音不可用，用输入法的话筒键口述");
  document.querySelectorAll("[data-voice]").forEach(b=>{
    const d = document.createElement("div");
    d.className = "voiceHint";
    d.textContent = VOICE_HINT;
    b.replaceWith(d);
  });
}

/* ---------- 渲染 ---------- */
const VOICE_HINT = "用输入法的话筒键口述：iOS 键盘上的话筒，macOS 连按两下 Fn。";

function voiceBtn(targetId){
  if(!VOICE.ok) return "";
  return `<button class="chip voice" type="button" data-voice="${targetId}">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <rect x="5.6" y="1.6" width="4.8" height="8" rx="2.4"/><path d="M3 7.4a5 5 0 0 0 10 0M8 12.4v2"/>
    </svg>按住说话</button>`;
}
function voiceHint(){
  return VOICE.ok ? "" : `<div class="voiceHint">${VOICE_HINT}</div>`;
}

/* ui() 每次重绘后调用，把按钮接上 */
function bindVoice(){
  if(!VOICE.ok) return;
  document.querySelectorAll("[data-voice]").forEach(b=>{
    if(b._bound) return;
    b._bound = true;
    b.addEventListener("pointerdown", e=>{ e.preventDefault(); voiceStart(b, b.dataset.voice); });
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>
      b.addEventListener(ev, e=>{ e.preventDefault(); voiceStop(); }));
  });
}

/* ---------- 录 ---------- */
function voiceStart(btn, targetId){
  if(!VOICE.ok || VOICE.rec) return;
  const ta = document.getElementById(targetId);
  if(!ta) return;
  let r;
  try{ r = new VOICE.SR(); }catch(e){ return voiceDisable("构造失败"); }
  r.lang = "zh-CN"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  VOICE.rec = r; VOICE.ta = ta; VOICE.btn = btn;
  btn.classList.add("on");
  interim(ta, "");

  r.onresult = e=>{
    let fin = "", itm = "";
    for(let i = e.resultIndex; i < e.results.length; i++){
      const t = e.results[i][0].transcript;
      if(e.results[i].isFinal) fin += t; else itm += t;
    }
    if(fin) ta.value = ta.value + tidy(fin);     // 只有定稿才落进输入框，中途的只是浮层
    interim(ta, itm);
  };
  r.onerror = e=>{
    if(e.error === "no-speech" || e.error === "aborted") return;   // 这两个不算故障
    voiceDisable(e.error);
  };
  r.onend = ()=>{ if(VOICE.rec === r) voiceStop(); };
  try{ r.start(); }catch(e){ voiceDisable("start 抛错"); }
}

function voiceStop(){
  const r = VOICE.rec;
  VOICE.rec = null;
  if(VOICE.btn){ VOICE.btn.classList.remove("on"); VOICE.btn = null; }
  if(VOICE.ta){ interim(VOICE.ta, ""); VOICE.ta.focus(); VOICE.ta = null; }
  if(r){ try{ r.stop(); }catch(e){} }
}

/* 中途结果的浮层。定稿之前不动输入框，玩家才改得动。 */
function interim(ta, text){
  let box = ta.previousElementSibling;
  if(!box || !box.classList.contains("interim")){
    box = document.createElement("div");
    box.className = "interim";
    ta.parentNode.insertBefore(box, ta);
  }
  box.textContent = text;
  box.classList.toggle("on", !!text || !!VOICE.rec);
}

/* 后处理只做正则级：去空白、折叠语气词、句尾补句号。不调模型润色。 */
function tidy(s){
  return String(s).trim()
    .replace(/\s+/g, "")
    .replace(/(嗯|呃|那个|就是说)\1+/g, "$1")
    .replace(/([^。！？…，、；：])$/, "$1。");
}
