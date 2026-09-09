/* 10-state.js —— 全局状态与设置存档
 *
 * 状态只读不写。任何写入都走 30-engine.js 的通道函数。
 * 存档（S 的持久化）随 B9 生涯外壳一起做，B1 不碰。
 */
const S = {
  /* 流程 */
  stage:0, step:0, round:0,
  busy:false, lastPros:"", lastPlayer:"",
  witnessPresent:false,       // 证人是否还在庭上
  witAsked:0,                 // 已经向证人发问几次
  witHit:[],                  // 问出来的破绽 id
  witGrants:[],               // 庭上问出来、能给论点加成的破绽所指向的论点 id
  argSaid:[],                 // 公诉人已经说过的论点
  argRebutted:[],             // 他已经回应过你的那些
  argDropped:[],              // 被你驳倒、他不再提的（渲染一次就清空）
  lastHits:[],                // 你上一轮立住的论点，决定他下一轮回不回你
  curArg:null,
  debateOver:false,
  finalRounds:0,   // 辩论终结前的补充发言用了几次
  silenced:false,             // 已被责令停止发言
  admonished:false,           // 已被训诫过一次
  digest:[],                  // 笔录摘要，喂给模型的上下文

  /* 心证与法庭 */
  c:{},                       // 各争点的心证，boot 时按案件包初始化
  patience:70,                // 法官耐心 0-100
  ledger:[],                  // 全部变动流水，带 ch 频道：心 / 耐 / 涯

  /* 局面 */
  shown:new Set(),            // 已进入玩家视野的证据
  evWeak:new Set(),           // 证明力已被削弱的证据
  hits:new Set(),             // 已立住的辩护论点
  crossHits:new Set(),        // 已击中瑕疵的证据（质证得分，与论点分开）

  /* 第一幕 阅卷 */
  energy:0,                   // 精力，boot 时按案件包初始化
  thinkLeft:0,                // 「想一想」还剩几次
  skim:new Set(),             // 粗看过的证据
  read:new Set(),             // 细读过的证据
  marks:{},                   // 三性标记 {evId:[flag]}
  notes:[],                   // 批注本
  /* 第二幕 会见 */
  trust:0,                    // 当事人对你的信任 0-100
  turnsLeft:0,                // 会见还剩几轮
  known:[],                   // 问出来的秘密 id
  lieOut:[],                  // 当事人已经抛出的谎话 id
  lieBusted:[],               // 你当场戳穿的谎话 id
  lieBelieved:[],             // 你信了的谎话 id（庭上引用会被打脸）
  strategy:null,              // 辩护策略 id
  promised:false,             // 有没有答应过办不到的事
  lieFired:false,             // 庭上的打脸事件已经触发过
  talk:[],                    // 会见对话记录

  /* 生涯 */
  career:{rep:0, cash:50000, conscience:0},

  cfg:{base:"https://api.deepseek.com", key:"", model:"deepseek-v4-flash", offline:true, theme:"dark"}
};
/* 按案件包初始化。换案子时再调一次。 */
function resetCase(){
  Object.assign(S, {
    stage:0, step:0, round:0, busy:false, lastPros:"", lastPlayer:"",
    witnessPresent:false, witAsked:0, witHit:[], witGrants:[],
    argSaid:[], argRebutted:[], argDropped:[], lastHits:[], curArg:null, debateOver:false, finalRounds:0,
    silenced:false, admonished:false, digest:[], talk:[],
    c:{}, patience:70, ledger:[],
    shown:new Set(), evWeak:new Set(), hits:new Set(), crossHits:new Set(),
    energy:0, thinkLeft:0, skim:new Set(), read:new Set(), marks:{}, notes:[],
    trust:0, turnsLeft:0, known:[], lieOut:[], lieBusted:[], lieBelieved:[],
    strategy:null, promised:false, lieFired:false, playing:false
  });
  for(const k in CASE.issues) S.c[k] = CASE.issues[k].c || 0;
  if(typeof CASE.patience0 === "number") S.patience = CASE.patience0;
  if(CASE.investigation){ S.energy = CASE.investigation.energy; S.thinkLeft = CASE.investigation.thinkLimit; }
  if(CASE.meeting){ S.trust = CASE.meeting.trust0; S.turnsLeft = CASE.meeting.turns; }
}
for(const k in CASE.issues) S.c[k] = CASE.issues[k].c || 0;
if(CASE.investigation){
  S.energy    = CASE.investigation.energy;
  S.thinkLeft = CASE.investigation.thinkLimit;
}
if(CASE.meeting){
  S.trust     = CASE.meeting.trust0;
  S.turnsLeft = CASE.meeting.turns;
}
if(typeof CASE.patience0 === "number") S.patience = CASE.patience0;

try{ const s=localStorage.getItem(CFG_KEY); if(s) Object.assign(S.cfg, JSON.parse(s)); }catch(e){}
/* 老存档里存的是已经下线的模型名，静默升级一次，免得玩家开局就报 404 */
if(/^deepseek-(chat|reasoner)$/.test(S.cfg.model || ""))
  S.cfg.model = S.cfg.model === "deepseek-reasoner" ? "deepseek-v4-pro" : "deepseek-v4-flash";
function applyTheme(){
  const light = (S.cfg.theme === "light");
  document.documentElement.dataset.theme = light ? "light" : "dark";
  /* 加到桌面按独立应用起的时候，状态栏那一条要跟着换，
     不然亮色主题顶上还挂着一条黑边。 */
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.remove());
  const m = document.createElement("meta");
  m.name = "theme-color";
  m.content = light ? "#F2EFE8" : "#1C232B";
  document.head.appendChild(m);
}
function saveCfg(){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(S.cfg)); }catch(e){} applyTheme(); }
applyTheme();

const $ = s=>document.querySelector(s);
const rec = $("#record");
