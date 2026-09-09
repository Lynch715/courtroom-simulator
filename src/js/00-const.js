/* 00-const.js —— 版本、存档键、案件包解包 */
const APP_VERSION  = "1.0.0-b9";

/* ══════════════ 称谓表 ══════════════
 * 引擎里所有「审判长」「本庭」「退庭」「判决」这类词，都从这儿取。
 * 案件包写 case.lex 覆盖其中几条，就能把同一套流程换成另一种场合——
 * c05 是检察院的不起诉听证，没有审判长，也没有判决；
 * 民事和行政那几个案子还要换成法官、原告代理人、宣判改成判决书送达。
 * 只覆盖需要改的键，其余走默认。 */
const LEX_DEF = {
  court:      "本庭",        // 主持者的自称
  courtN:     "法庭",        // 「法庭」这个地方
  judge:      "审判长",
  pros:       "公诉人",
  defendant:  "被告人",
  lawyer:     "辩护人",
  hearing:    "庭审",
  onSite:     "庭上",
  leave:      "退庭",
  admonish:   "训诫",
  silence:    "责令停止发言",
  finalWord:  "最后陈述",
  objection:  "异议",
  verdictN:   "判决",        // 结论这个东西叫什么
  verdictV:   "宣判",        // 宣布结论这个动作
  opinionN:   "辩论意见",    // 玩家发表的那一坨叫什么
  crossN:     "质证意见",    // 对一份证据发表的意见叫什么
  crossV:     "质证",        // 这个动作叫什么
  presider:   "法官",        // 「谁的耐心」里的那个人
  phaseFile:  "阅卷",
  phaseMeet:  "会见",
  phaseCross: "举证质证",
  phaseDebate:"法庭辩论",
  phaseEnd:   "评议宣判"
};
function L(k){
  const o = (typeof CASE !== "undefined" && CASE && CASE.lex) || null;
  return (o && o[k]) || LEX_DEF[k] || "";
}

/* 一个案子的流程。名字走称谓表，所以换了场合阶段条也跟着换。 */
const PHASES = [
  {id:"file",    key:"phaseFile"},
  {id:"meet",    key:"phaseMeet"},
  {id:"cross",   key:"phaseCross"},
  {id:"debate",  key:"phaseDebate"},
  {id:"verdict", key:"phaseEnd"}
];
Object.defineProperty(PHASES[0], "name", {get(){ return L("phaseFile"); }});
Object.defineProperty(PHASES[1], "name", {get(){ return L("phaseMeet"); }});
Object.defineProperty(PHASES[2], "name", {get(){ return L("phaseCross"); }});
Object.defineProperty(PHASES[3], "name", {get(){ return L("phaseDebate"); }});
Object.defineProperty(PHASES[4], "name", {get(){ return L("phaseEnd"); }});
const PH = {file:0, meet:1, cross:2, debate:3, verdict:4};
const SAVE_VERSION = 1;
const CFG_KEY  = "xinzheng_cfg";
const SAVE_KEY = "xinzheng_save";
const META_KEY = "xinzheng_meta";
const VOICE_OFF_KEY = "xinzheng_voice_off";

/* 当前案件包。B0 只有 c01；接案流程在 B9 接入后由玩家选择。
   引擎代码继续用 CASE / CROSS / OFFLINE_PROS / KEYWORD 这四个名字，
   与切片保持一致，只是数据来源改成了案件包。 */
let PACK, CASE, CROSS, KEYWORD;
function useCase(id){
  PACK  = (id && CASES.find(c=>c.id === id)) || CASES[0];
  CASE  = PACK.case;
  CROSS = PACK.cross;
  KEYWORD = {};
  for(const k in PACK.offline.keyword) KEYWORD[k] = new RegExp(PACK.offline.keyword[k]);
  if(typeof resetArtCache === "function") resetArtCache();
  return PACK;
}
useCase(null);
