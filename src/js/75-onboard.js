/* 75-onboard.js —— 设置页 */
/* ============================================================
   设置
   ============================================================ */
$("#btnCfg").onclick=openCfg;
function openCfg(first){
  const mask=document.createElement("div"); mask.className="mask";
  mask.innerHTML=`<div class="modal">
    <h3>接一个模型进来</h3>
    <p class="sub">密钥只存在你自己的浏览器里，不会发到别处。也可以先离线试手感。</p>
    <label class="switch" for="off">
      <input type="checkbox" id="off" ${S.cfg.offline?"checked":""}>
      <div><b>离线试玩</b>不调用任何接口。公诉人说预写好的台词，你的辩论按关键词判定。用来摸机制手感够了，但对方不会真的回应你。</div>
    </label>
    <label class="f">接口地址<input id="base" value="${S.cfg.base}" placeholder="https://api.deepseek.com"></label>
    <label class="f">模型<input id="model" value="${esc(S.cfg.model)}" placeholder="deepseek-v4-flash" list="modelList">
      <datalist id="modelList">
        <option value="deepseek-v4-flash">DeepSeek V4 Flash（快，够用）</option>
        <option value="deepseek-v4-pro">DeepSeek V4 Pro（慢一点，答得细）</option>
      </datalist>
    </label>
    <div class="chips" id="mdl">
      <button class="chip" data-v="deepseek-v4-flash">V4 Flash</button>
      <button class="chip" data-v="deepseek-v4-pro">V4 Pro</button>
    </div>
    <label class="f">API Key<input id="key" type="password" value="${S.cfg.key}" placeholder="sk-..."></label>
    <div class="row"><button class="primary" id="ok">开庭</button>
    <span class="hint">任何 OpenAI 兼容接口都行</span></div>
  </div>`;
  document.body.appendChild(mask);
  mask.querySelectorAll("#mdl .chip").forEach(b=>b.onclick=()=>{
    mask.querySelector("#model").value = b.dataset.v;
    mask.querySelectorAll("#mdl .chip").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");
  });
  mask.querySelector("#ok").onclick=()=>{
    S.cfg.offline=mask.querySelector("#off").checked;
    S.cfg.base=mask.querySelector("#base").value.trim()||"https://api.deepseek.com";
    S.cfg.model=mask.querySelector("#model").value.trim()||"deepseek-v4-flash";
    S.cfg.key=mask.querySelector("#key").value.trim();
    saveCfg(); mask.remove();
    if(first) start();
  };
}

/* ============================================================
   开场：先说这是什么，再谈接口
   陌生人点开链接第一眼不该是 API Key 输入框。
   ============================================================ */
const SEEN_KEY = "xinzheng_seen";
function welcome(){
  const mask = document.createElement("div"); mask.className = "mask";
  mask.innerHTML = `<div class="modal welcome">
    <div class="wtitle">心证</div>
    <p class="wsub">一个中文庭审模拟。你是辩护人，案子是真的。</p>
    <div class="wsteps">
      <div><b>一</b><span>看卷宗</span><i>一晚上的精力有限。读得细，庭上才有底。</i></div>
      <div><b>二</b><span>见当事人</span><i>他不会主动说实话，还会撒一句谎。戳穿它要靠你读过的那份材料。</i></div>
      <div><b>三</b><span>上庭辩护</span><i>想说什么说什么。法官有耐心，说空话会被打断。</i></div>
    </div>
    <p class="wnote">结果不是输赢，是<b>心证</b>——法官对每个争议焦点的内心倾向。
      打完会把每一分的来路摊给你看，包括你没说出口的那些话。</p>
    <div class="row">
      <button class="primary" id="wgo">开始（离线试玩）</button>
      <button class="ghost" id="wcfg">我要接一个模型</button>
    </div>
    <p class="wtiny">离线也能从接案打到宣判，只是对方说的是预写台词。接了模型，庭上每一句都是现算的。</p>
  </div>`;
  document.body.appendChild(mask);
  const done = cfg => { try{ localStorage.setItem(SEEN_KEY, "1"); }catch(e){}
                        mask.remove(); cfg ? openCfg(true) : (saveCfg(), start()); };
  mask.querySelector("#wgo").onclick  = ()=>{ S.cfg.offline = true; done(false); };
  mask.querySelector("#wcfg").onclick = ()=>done(true);
}
