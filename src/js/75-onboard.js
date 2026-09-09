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
