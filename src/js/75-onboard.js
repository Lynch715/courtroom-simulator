/* 75-onboard.js —— 设置页 */
/* ============================================================
   设置
   ============================================================ */
/* 不能写成 onclick=openCfg——那样点击事件对象会当成 first 参数传进去，
   于是从顶栏进设置、按「开庭」，会走 first 分支调 start()，把正在打的这一局踢回事务所。 */
$("#btnCfg").onclick = ()=>openCfg(false);
/* ══════════════ 存档那一栏 ══════════════
 * 原来没有任何入口：想重开一局只能清浏览器数据。
 * 这里给两件事——当前这一局怎么办，生涯记录怎么办。两件事分开，别混。 */
function saveBoxHTML(){
  const d = (typeof savedGame === "function") ? savedGame() : null;
  let cur;
  if(d){
    const pack = CASES.find(c=>c.id === d.caseId);
    const nm = pack ? pack.meta.title : d.caseId;
    const ph = (PHASES[d.s.stage] || {}).name || "";
    const t = new Date(d.at);
    const when = `${t.getMonth()+1}月${t.getDate()}日 ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
    cur = `<div class="svRow"><div><b>《${esc(nm)}》</b><span>${esc(ph)}　·　存于 ${when}</span></div>
      <button class="ghost sm" id="svDrop">重开这一局</button></div>`;
  }else{
    cur = `<div class="svRow"><div><b>手上没有没打完的案子</b><span>开一局，进度自动存，随时关掉都不丢</span></div></div>`;
  }
  const done = (META.done || []).length;
  const cash = (META.cash != null) ? (META.cash/10000).toFixed(1) + " 万" : "";
  const meta = `<div class="svRow"><div><b>生涯记录</b><span>打完 ${done} 个案子　·　声誉 ${META.rep||0}　·　良心 ${META.conscience||0}　·　${cash}</span></div>
      <button class="ghost sm" id="svWipe">全部清空</button></div>`;
  return `<div class="fLab">存档</div><div class="svBox">${cur}${meta}</div>`;
}

/* 存档按钮的事，接在设置弹层上 */
function bindSaveBox(mask, close){
  const drop = mask.querySelector("#svDrop");
  if(drop) drop.onclick = ()=>{
    drop.outerHTML = `<span class="svAsk">当前进度会没掉。<button class="ghost sm" id="svYes">确定重开</button></span>`;
    mask.querySelector("#svYes").onclick = ()=>{
      clearSave(); close(); S.playing = false; officeScreen("这一局不算了。重新挑一个。");
    };
  };
  const wipe = mask.querySelector("#svWipe");
  if(wipe) wipe.onclick = ()=>{
    wipe.outerHTML = `<span class="svAsk">声誉、良心、钱和打过的案子全部归零，回不来。<button class="ghost sm" id="svYes2">确定清空</button></span>`;
    mask.querySelector("#svYes2").onclick = ()=>{
      clearSave();
      try{ localStorage.removeItem(META_KEY); }catch(e){}
      META = metaLoad();
      close(); S.playing = false; officeScreen("从头开始。桌上又是空的。");
    };
  };
}

function openCfg(first){
  const mask=document.createElement("div"); mask.className="mask";
  mask.innerHTML=`<div class="modal">
    <h3>接一个模型进来</h3>
    <p class="sub">密钥只存在你自己的浏览器里，不会发到别处。也可以先离线试手感。</p>
    <label class="switch" for="off">
      <input type="checkbox" id="off" ${S.cfg.offline?"checked":""}>
      <div><b>离线试玩</b>不调用任何接口。公诉人说预写好的台词，你的辩论按关键词判定。用来摸机制手感够了，但对方不会真的回应你。</div>
    </label>
    <div class="fLab">屏幕亮度</div>
    <div class="chips" id="thm">
      <button class="chip${S.cfg.theme==="light"?"":" sel"}" data-v="dark">暗色 · 庭上那种</button>
      <button class="chip${S.cfg.theme==="light"?" sel":""}" data-v="light">亮色 · 白天看着不累</button>
    </div>
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
    <div id="testOut" class="testOut" hidden></div>
    ${first ? "" : saveBoxHTML()}
    <div class="row"><button class="primary" id="ok">开庭</button>
    <button class="ghost" id="test">测试连接</button>
    <span class="hint">任何 OpenAI 兼容接口都行</span></div>
  </div>`;
  document.body.appendChild(mask);
  if(!first) bindSaveBox(mask, ()=>mask.remove());
  /* 主题即点即换，不用等「开庭」 */
  mask.querySelectorAll("#thm .chip").forEach(b=>b.onclick=()=>{
    mask.querySelectorAll("#thm .chip").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); S.cfg.theme = b.dataset.v; applyTheme();
  });
  mask.querySelectorAll("#mdl .chip").forEach(b=>b.onclick=()=>{
    mask.querySelector("#model").value = b.dataset.v;
    mask.querySelectorAll("#mdl .chip").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");
  });
  /* 测试连接：用输入框里当下的值试，不用先保存 */
  const tBtn = mask.querySelector("#test"), tOut = mask.querySelector("#testOut");
  tBtn.onclick = async ()=>{
    if(tBtn.disabled) return;
    tBtn.disabled = true; const label = tBtn.textContent; tBtn.textContent = "测试中…";
    tOut.hidden = false; tOut.className = "testOut wait"; tOut.textContent = "正在连接…";
    const r = await testLLM(
      mask.querySelector("#base").value.trim(),
      mask.querySelector("#model").value.trim(),
      mask.querySelector("#key").value.trim(),
      s => { tOut.textContent = s; });
    tOut.className = "testOut " + (r.ok ? "good" : "bad");
    tOut.innerHTML = `<b>${esc(r.title)}</b>${r.detail ? `<span>${esc(r.detail)}</span>` : ""}`;
    /* 测通了就把离线开关关掉——他要的显然是接模型 */
    if(r.ok){ const off = mask.querySelector("#off"); if(off) off.checked = false; }
    tBtn.disabled = false; tBtn.textContent = label;
  };

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
