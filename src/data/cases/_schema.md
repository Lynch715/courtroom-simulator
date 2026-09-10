# 案件包 schema

B0 版本：字段与切片的 `CASE` 常量一一对应，只是搬进了 JSON。
三幕结构（`investigation` 阅卷 / `client` 会见）在 B1 扩展，届时更新本文。

```
{
  id            案件 id，与文件名一致，全局唯一
  meta {
    title       游戏内案名
    subtitle    副标题（罪名 · 审级）
    headerLine  顶栏那一行
    type        criminal | civil | administrative
    playable    可扮演方，一期只有 ["defense"]
    difficulty  1-5
    tags        []
    estMinutes  预计时长
    origin { tier: "A"|"B"|"fiction", note: 原型说明 }
              A 级复盘页明示原型；B 级只写"同类案件"，见设计文档 2.2.1
  }
  case {
    title, truth, charge
    issues  { 争点id: {name, weight, c} }        weight 为正整数，引擎按加权平均归一化
    kp      { 论点id: {issue, v, tag, desc} }    v 为该论点立住时的基准分
    ev      { 证据id: {name, holder, flaw, flawText, note} }
                                                 holder: pros|def
                                                 flaw: null|authenticity|legality|relevance
    witness { name, line, contradicts }
    rounds  [ {must, objection, requires} ]       控方每轮必须表达的内容与可成立的异议
    objections { 异议id: 异议文案 }
    verdicts [ {min, r, t, rep, con} ]            按 min 降序，最后一档兜底 min<=-900
  }
  cross   [ {ev, intro, text} ]                   举证质证的出场顺序
  offline {
    pros    [ 每轮公诉人的预写台词 ]                条数不得少于 rounds
    keyword { 论点id: 正则源码字符串 }              每个论点都必须有，否则离线模式永远立不住
  }
}
```

**校验**：`python3 tools/validate_cases.py`（`build.py` 默认先跑，不通过就拒绝出货）

---

## B1 变更（引擎通用化）

案件专属的逻辑全部搬进了案件包，引擎里不再有任何 c01 的痕迹。新增/变更：

```
case {
  judgeWho / prosWho / clientWho   出庭人员称谓，笔录里显示的名字
  mainIssue        主争点 id。程序性加减分（质证无据、放弃发言等）都打到这里
  brief            案情摘要，喂给模型
  patience0        法官初始耐心，默认 70
  crossGain        质证击中瑕疵的得分
  debateIntro      进入法庭辩论时审判长那段话
  closing { judgeWho, judgeLine, clientWho, clientLine }   最后陈述

  penalties {      程序性加减分，七个条目都必填
    baselessObjection  质证无据      {v, why, patience}
    missedFlaw         漏掉瑕疵
    objectionUpheld    异议成立
    objectionDenied    异议被驳回
    skipDebate         放弃发言
    vague              发言空泛
    sound              在理但无新论点
  }

  ev.<id> {
    revealAt   "cross:N" 第 N 格质证时进入视野 | "onShow" 玩家出示时才进
    detail     阅卷时细读看到的全文（B3 用）
  }

  kp.<id> {
    readEv     阅卷时细读过这份证据 → 该论点 ×1.15   （B3 起生效）
    markEv     配合 markFlag：阅卷时对这份证据标对了三性 → ×1.3
    markFlag   authenticity | legality | relevance
    grantedBy  会见时问出的秘密 id → ×1.2            （B4 起生效）
    requires   立住前必须先出示的证据 id
  }

  objections.<id> { label, issue }    label 是显示文案，issue 是异议成立后加分落在哪个争点

  rounds[].requires   从字符串改成对象：
                      {"evWeak":"e3"} 该证据的证明力已被削弱
                      {"shown":"e2"}  该证据已出示
                      {"point":"d1"}  该论点已立住

  witness {          证人环节整段数据化，引擎里零硬编码
    who, judgeIntro, line, contradicts, prompt（可用 {ev} 占位）, hint,
    options[ { v, label, lines[[说话人,样式,台词]], reveal, grants{id,v,why},
               effects[{issue,v,why}], patience } ]
  }
}

cross[] {
  kind   "doc"（书证质证，要有 ev/intro/text）| "witness"（证人环节，读 case.witness）
}
```

**三幕字段**（`investigation` 阅卷 / `client` 会见）随 B3、B4 落地，届时补进本文。
引擎侧的接口已经就位：`S.read` / `S.marks` / `S.known` 和 `adjudicate()` 里的三个乘数。

---

## B2 变更（自由发言与意图路由）

```
case {
  cast {                      出庭人员。reply[].who 用的就是这里的 key
    judge / pros / client / witness / you {
      who      笔录里显示的名字，如「审判长 · 周维山」
      cls      笔录样式：judge | pros | you | sys
      persona  人格卡，注入 prompt（you 不需要）
      voice    说话方式，注入 prompt。写法见 docs/对话与文案规范-v1.md 第四节
    }
  }

  motions [                   玩家可能提的申请。没匹配上的走通用驳回
    { id, match: 正则源码字符串, grant: false, reply: 审判长的回应, patience: 扣多少耐心 }
  ]

  kp.<id>.rubric              算命中的标准，注入 prompt。写清楚"只说什么不算"

  verdictFallback {           离线时的判决书兜底
    lenient   心证 >= 20 时的「本院认为」
    strict    否则
  }
}
```

**离线应答池**在 `src/js/42-offline.js` 的 `OFF_POOL`，是引擎级的通用台词，不进案件包。
案件如果需要专属的法官口吻，再考虑加 `case.offlineReply` 覆盖。

**意图九类**：质证 / 辩论 / 发问 / 异议 / 申请 / 与当事人交流 / 程序 / 闲聊 / 失礼。
离线时由 `offRe()` 的正则判定，在线时由模型判定，两边返回同一个结构。

---

## B3 变更（第一幕·阅卷）

```
case {
  openingNote                 阅卷结束、进法庭时的第一句系统提示

  investigation {             第一幕的全部数据
    energy      精力总量（c01 是 8）
    costs { skim, read, think }   粗看 / 细读 / 想一想 各花几点
    thinkLimit  「想一想」每案上限次数
    intro       开场：桌上有什么
    outro       离场：天亮了
    deskNote    操作区常驻的一句提示
    offlineThink {            离线内心独白池，按证据 id 分组
      <evId>    [ 四条以上，短句，只给方向不给结论 ]
      _default  [ 看不出门道时的兜底 ]
    }
  }

  kp.<id>.readEv              阅卷时细读过这份证据 → 该论点 ×1.15
}
```

**质证的「有备而来」加成**不需要配数据：阅卷时对某份证据标对了它真实存在的
`flaw`，庭上就该项提异议时自动 ×1.3，且审判长换一句台词。

**内心独白怎么写**（`offlineThink`，也是给模型的口径）：
只说你看见了什么，不说该怎么用。「末页只有一个签名。」可以，
「这里可以提合法性异议」不行——那是攻略，不是律师在想事。

---

## B4 变更（第二幕·会见）

```
case {
  cast.<key> {
    tag              左栏「出庭人员」里那个小标签
    blurb            玩家看得见的一行介绍
    blurbAfterMeet   会见之后换成这一行（只有 client 用）
  }

  meeting {
    place, intro, firstLine, outro, hint
    trust0           初始信任（c01 是 30）
    turns            会见轮次（c01 是 10）

    secrets [ {     他不主动讲的事
      id, trust     信任达到这个数才肯说
      topic         这条秘密是关于什么的，给模型看
      match         离线判定用的正则源码：玩家问到这个话题算触及
      truth, after  他说出口的话，分两句更像人
      grants        问出来之后，哪个论点在庭上 ×1.2（可为 null）
      note          右栏「你知道的事」里记的一行
    } ]

    lies [ {        他主动说的假话
      id, claim     他会说的那句谎
      triggerTurn   第几轮之后自动抛出
      triggerMatch  玩家问到这个话题就抛出
      bustBy        戳穿它需要阅卷时读过哪份证据
      bustMatch     玩家打字戳穿的正则
      bustLine      「出示卷宗里的记载」按钮点下去，你说的那句
      onBust/onBustAfter  他的松口
      believedNote  右栏里标红的那一行
      courtMatch    你在庭上复述了这个谎的正则
      courtProsLine 公诉人当庭反驳的话
      courtJudgeLine 审判长的话
      penalty {issue, v, why, patience}
    } ]

    strategies [ {  会见结尾定的辩护方向，定了不改
      id, label, desc
      clientWants   当事人想不想这么打。不想就扣 15 点信任
      clientLine    他听完你的决定说的话
      mul {论点id: 系数}   这条路让哪些论点更好使
      crossMul      质证得分的系数
    } ]

    promiseMatch / promiseLine / promiseNote    答应办不到的事
    tone { warm|neutral|pressing|hostile: {match, trust} }
  indictment                          起诉书全文。玩家点开案子第一眼看的就是它，必填。
      org        起诉机关全称
      no         文号，形如「城南检刑诉〔2025〕412 号」
      docTitle   文书名，默认「起诉书」。听证、复核这类案子写自己的名字
      defendant  被告人一段：姓名、性别、年龄、籍贯、文化程度、职业、
                 强制措施经过（拘留/逮捕日期、现羁押何处或取保）
      facts      指控事实。「经依法审查查明：」起头，\n 分段，两到三段
      proof      「上述事实，有……等证据证实，足以认定。」
      charge     「本院认为，……应当以某罪追究其刑事责任。」
      ask        量刑建议。没有就省略
      ※ 通篇是公文腔，干、编号、一句废话没有——正好和游戏里别的文字拉开距离。
        全长五百到八百字。别写成剧情简介。

    pool { low, mid, high, press, hostile, off, locked }   离线应答池，每类四条以上
        ※ 长度有下限。每池至多两条在十字以内当节奏，其余不短于二十字。
          戒备的人不是没词，是绕开正题说别的：身上的东西、屋里的东西、
          别人怎么说他、他这两天在想谁。写「嗯。」「我说了。」就等于没写这一条。
  }
}
```

**语气怎么判**：不是按顺序取第一个匹配的词——「你先别怕，第一次到底是怎么回事」里
既有安抚也有「到底」，那句话人听着是体贴的。所以数各自命中了几个词，谁多算谁，
打平算体贴那一头。只有伤人的话是硬判定：说得再客气，「你在骗我」也是伤人。

**信任门槛由前端把关**。模型只报「玩家问到了哪个话题」，够不够格说，前端说了算。

---

## B5 变更（辩论导演器 + 证人可追问）

`rounds` **已废弃**，改成 `prosArgs` 论点栈。公诉人不再按轮次念稿：

```
case {
  debateMaxRounds   辩论轮次上限（c01 是 5）
  debateEndMatch    玩家怎么说算「辩论意见发表完毕」的正则

  prosArgs [ {
    id, core        这条指控的核心，一句话。被驳倒时系统提示会引用它
    must            推进这条时他必须表达的内容（给模型）
    offline         推进这条时的预写台词（离线兜底）
    rebutMust       他回应你的反驳时必须表达的内容
    rebutOffline    回应你时的预写台词
    basedOn  []     这条建立在哪些证据上
    counteredBy []  哪些辩方论点能驳倒它。**必填**，否则这条永远驳不倒
    objection       针对这条提哪个异议能成立
    requires        异议成立的前置条件 {evWeak|shown|point}
  } ]

  witness {
    askLimit        能向证人发问几次
    askPrompt       发问输入框的 placeholder
    loopHint        操作区的提示
    missPool  []    没问中时他怎么打太极，四条以上
    weakSpots [ {
      id, topic, match          问到什么算戳中（正则源码）
      reveal                    他松口时说的话
      grants                    戳中后给哪个论点加成（可为 null）
                                注意：B10 起 grants 不再直接把论点记成「立住」。
                                它只把论点 id 记进 S.witGrants，裁决层 ×1.25，
                                玩家仍须在辩论里把这个事实说成理由才算立住。
                                （旧写法会让问对问题的人反而少拿 20~30 分）
      gv                        戳中当场给多少心证
      issue                     可选。这份心证加到哪个争点。
                                不写时：grants 指向哪个论点就加到那个论点的争点上，
                                grants 为 null 则加在 mainIssue 上。
                                c07 的「不吃这个药会怎么样」不解锁任何论点，
                                但它属于危害性那条线，就得写 issue: "i2"。
      note                      笔录里「记录在案」的一行
    } ]
  }
}
```

**他怎么挑下一句说什么**：
1. 你上一轮立住的论点正冲着他说过的某条 → 他先回你那一句（rebut，每条只回一次）
2. 否则推进一条还没说过的；**已经被你驳倒的，他直接跳过**，笔录里出现「公诉人没有再提「…」。」
3. 都没有了 → 辩论提前收场

所以轮次是浮动的：一路空泛打满 3 轮（他把论点推完），把三条都驳倒可能 4 轮就结束，
第一句就说「辩论意见发表完毕」就 1 轮。**背轮次没用，得听他到底在说什么。**

**离线关键词的坑**：`民法` 会在「最高人民**法院**」里命中。校验器现在会拦这类误伤，
但明写在关键词表里的整词放行（d4 就是要认「最高人民法院」）。

---

## B9 变更（生涯外壳）

```
meta {
  fee          这个案子的律师费，结案时进金钱轨
  blurb        接案卡片上那两行案情
  clientMood   接案卡片上「当事人什么状态」，一句话
}

case {
  scenes.office             事务所那一屏的场景图（默认 scene/law_office）

  epilogue {                结案后那一段。按最终心证挑一条
    acquit   心证 ≥50
    light    ≥20
    heavy    ≥0
    worst    其余
  }

  postmortem {              复盘页的延伸阅读
    title, body             A 级案件在这里明示原型；B 级只写同类案件的现实处理
    refs []                 "刑法:264" 这样的引用，渲染成可点的条文
  }
}
```

**良心怎么算**（`settleCase`，在案件包给的 `verdicts[].con` 之上叠加）：

| 情况 | 良心 | 说的话 |
|---|---|---|
| 选罪轻辩护，但打到了本可无罪（心证 ≥50） | −8 | 你选了认罪求轻判。这个案子本来是能做无罪的 |
| 选无罪辩护且赢了 | +12 | 你顶着他的意思做了无罪辩护，你赌赢了 |
| 选无罪辩护且判重了（心证 <0） | −15 | 他想认罪求个轻判，你没听 |
| 许过办不到的承诺且没赢 | −5 | 你答应过他一件你办不到的事 |
| 庭上被戳穿过谎话 | 声誉 −3 | 这事会传出去 |

**存档分两层**：`xinzheng_meta` 是生涯（跨案：三轨、打过哪些案、每案最好结局），
`xinzheng_save` 是当前这个案子打到哪了（换案或换 SAVE_VERSION 自动作废）。
笔录只存最近 20 条摘要，续上时补一行「（接上次）」，不重播全文。

---

## B10 变更（第二个案子暴露出来的）

```
case {
  finalWordRounds    辩论终结前的补充发言轮数上限，默认 3
}
```

**为什么要这个字段**：论点栈空了不等于玩家说完了。如果他在质证和证人环节就把
控方论点全驳倒，公诉人无话可说，辩论会直接结束——玩家剩下的论点永远没机会讲。
现在辩论终结前审判长会问一句「你还有什么要说的」，给几轮补充发言。真实庭审也是这么走的。

**写第二个案子验证到的**：

- `kp.<id>.requires`（论点的前置证据）在 c01 没用上，c02 的 d3 用了：
  没出示进货单就论证「来源公开」，裁决层直接丢弃，一分不给。
- 争点权重按百分比写（55/45），校验器不再提醒。
- 出庭人员可以整套换：c02 的证人是鉴定人，不撒谎也不帮忙，
  三个破绽全是技术事实。引擎不需要改一行。


---

## B10 补充：裁决层的两条新规则

这两条不写在案件包里，是引擎行为，写案子时要知道：

**1. 证人破绽 ×1.25**
`witness.weakSpots[].grants` 指到的论点，在辩论里被讲到时乘 1.25。
和 `readEv`（×1.15）、`markEv+markFlag`（×1.3）、`grantedBy`（×1.2）、
`secrets[].grants`（×1.2）、策略 `mul` 一样，是可叠乘的功课系数。
写案子时给同一个论点挂两三个来源是有意的：前两幕做足功课，庭上这一句就特别重。

**2. 单次发言的增益上限会整点丢弃，不打折**
`ADJ = { maxPoints: 2, maxGain: 25, keepRatio: 0.6 }`。
一次发言最多立 2 个论点、最多涨 25 分心证。
如果第二个论点被上限截到不足应得的 60%，它**整个不立**，
笔录里记「本次说不透，留到下一轮」，留给玩家下一轮专门讲。

对写案子的影响：**关键词别写太宽**。
如果 d1 的论证句顺带命中了 d2 的关键词，d2 会被这一句吃掉一部分或整个推迟。
两个论点如果本来就该分两句讲，关键词就要能把这两句分开。
c03 的 d1（罪过形式）和 d2（撞后有制动）就是一对——d2 的关键词必须含
「制动灯 / 八秒 / 拖印」这类只有专讲那一句才会出现的词。

---

## B10 补充二：第四案带出来的三条

**1. `witness.contradicts` 和「出示」的那份证据，可以不是同一份**

`contradicts` 只管两件事：证人提示语里的 `{ev}` 占位，以及「这个证人跟哪份证据对不上」
这层语义。**出示按钮的开关看的是 `options` 里 `v:"show"` 那条的 `reveal`**，
和 `contradicts` 无关。

c04 就是分开的：证人是当晚出警的民警，他的证言抵触的是控方的接处警记录（`contradicts: e2`），
而辩护人要在这个环节出示的是辩方的借款凭证（`reveal: e4`）。

**2. `verdicts[].min` 必须和结局档位对齐：50 / 20 / 0**

结局文案在引擎里按 `心证 >= 50 / >= 20 / >= 0 / 其余` 分四段挑（`epilogueOf()`）。
案件包的判决档位如果写成 50/25/5，就会出现**判五年却播无罪结局**这种事。
校验器现在会提醒。**新案的 `verdicts` 前三档的 min 就写 50、20、0。**

**3. 争点权重要跟「一个争点单独打满能不能赢」一起算**

加权平均没法表达「A 且 B」。如果某个争点的权重超过 50，而它又能被打到接近 +100，
那玩家可以在另一个争点全输的情况下拿到最好结局。

c04 初稿是 i1（防卫前提）55 / i2（限度）45。一次好的庭审里 i1 光靠质证和证人发问
就能到 +98，单这一项 ×0.55 就 54 分，直接过了无罪线——**限度那条线一分没拿也能无罪**，
这在这个案子上说不通。改成 45 / 55 之后：

| 打法 | i1 | i2 | 心证 | 判决 |
|---|---|---|---|---|
| 前提、限度都打透 | 98 | 26 | 58 | 无罪 |
| 只打前提，不出示借款凭证也不讲量刑 | 94 | −8 | 38 | 防卫过当，五年 |
| 庭上引用了当事人的谎话 | 59 | 0 | 27 | 防卫过当，五年 |

**写新案时的检查动作**：把权重最大的那个争点假设成 +100、其余为 0，算一遍加权总分，
看落在哪个判决档位。如果落在最好的那一档，权重就得调。

---

## B11 变更（称谓表：同一套流程，换一个场合）

引擎里所有「审判长」「本庭」「退庭」「判决」这类词，原来是写死在代码里的。
c05 是检察院的不起诉听证——没有审判长，没有判决，也不叫开庭。后面的民事案
（16–19）和行政案（20）同样要换：法官不叫审判长，对方不叫公诉人。

所以这些词收进了一张表，案件包写 `case.lex` 覆盖其中几条就行，不写的走默认。

```
case.lex {
  court       "本庭"        主持者的自称。用在「……本庭注意到了」
  courtN      "法庭"        这个地方。用在「法庭的时间有限」「向法庭说一句」
  judge       "审判长"      主持者的称呼。用在「审判长，辩护人提出异议」
  pros        "公诉人"      对方的称呼
  defendant   "被告人"
  lawyer      "辩护人"
  presider    "法官"        「谁的耐心」里的那个人
  hearing     "庭审"
  onSite      "庭上"
  leave       "退庭"
  admonish    "训诫"
  silence     "责令停止发言"
  finalWord   "最后陈述"
  objection   "异议"
  crossN      "质证意见"    对一份证据发表的意见叫什么
  crossV      "质证"        这个动作叫什么
  opinionN    "辩论意见"    玩家在第三阶段发表的那一坨叫什么
  verdictN    "判决"        结论这个东西叫什么
  verdictV    "宣判"
  phaseFile   "阅卷"        ↓ 阶段条上那五格
  phaseMeet   "会见"
  phaseCross  "举证质证"
  phaseDebate "法庭辩论"
  phaseEnd    "评议宣判"
  venue       "第一审判庭"  场景横幅上那一行
  weighWho    "合议庭评议时" 「该证据的证明力，__会一并考虑」
  patienceOut "法官的耐心用尽了。本阶段你不能再发言。"
}
```

配套的三个整句覆盖（不在 lex 里，直接写在 `case` 下）：

```
case.crossIntro      进入举证阶段时主持者的第一句。默认「现在进行法庭调查中的举证质证。公诉人出示证据。」
case.debateEndLine   辩论终结那一句。默认「法庭辩论终结。被告人，最后陈述。」
case.sayHint         第三阶段输入框的 placeholder
case.offlinePool {   离线应答池整池覆盖，键同 OFF_RAW（闲聊/失礼/注入/空泛/已讲过/在理/…）
  <类名>: [ 四条以上 ]
}
case.verdictFallback.head / .tail   离线判决书的开头和「判决如下：」那一句
```

**默认池里的占位符**：`42-offline.js` 的 `OFF_RAW` 用 `{lawyer}` `{court}` 这类
占位符写台词，取值走 lex。所以大部分场合根本不用写 `offlinePool`——
把 lex 里那十几个词换掉，一整池台词自己就改口了。

**c01~c04 不写 `lex`，行为与改造前逐字一致**（回归探针三条路线全绿）。

---

## B11 补充：会见的信任门槛怎么算

`secrets[].trust` 是**说完这句话之后**的信任值，不是说之前的。

判定顺序：语气加成（`tone.<x>.trust`）→ 承诺加成（+10，如果触发）→ 拿这个值和
`secrets[].trust` 比。在线和离线两条路走的是同一个数。

**写案子时怎么算门槛**：`trust0` 起步，一句体贴话 +6，一句平常话 +2，
戳穿谎话 −5，选当事人不要的策略 −15。一共 `turns` 轮，其中还得留出
问问题的轮次。拿这几个数算一遍：**全程走暖，第三个秘密问不问得到。**
算不到就是死内容。

现在三个案子的标定（都验证过能问出全部三条）：

| 案 | trust0 | turns | 门槛 |
|---|---|---|---|
| c03 | 30 | 10 | 40 / 55 / 68 |
| c04 | 30 | 10 | 40 / 55 / 68 |
| c05 | 30 | 10 | 40 / 55 / 68 |
| c06 | 30 | 10 | 40 / 55 / 68 |

30 + 6×8 = 78，减去戳穿的 5 是 73。第三条门槛 68，留了一轮的余量——
玩家可以在中间浪费一句平常话，但浪费两句就问不出来了。**这个余量是有意的。**

---

## B15 变更（申请可以准了）

```
motions[] {
  id, match, reply, patience        原有字段
  grant     true 时这个申请会被准许。到 c08 为止全是 false，
            于是「申请」这个动作等于纯扣耐心，玩家试一次就不再用。
  reveals   准了之后把哪份证据调进卷宗（会走 showEv，可出示、可当论点前置）
  effect    可选。准了之后给哪个争点加多少分 {issue, v, why}
}
```

**准不准由引擎说了算，不是模型。** 在线时模型只报「这是一个申请」，
`handleAct` 会按原文重新匹配 `motions[].match`，并**用案件包里的 `reply` 盖掉模型那句话**——
否则模型会自己演一句「准许」，而卷宗里什么都没多出来。

**怎么用它设计一个案子**：把胜负手放在卷外。c09 的同案人笔录没随案移送，
线索是讯问笔录附注里的一行字，玩家得自己想到要申请调取。
`kp` 里那条论点写 `requires` 指向它，没调到就在裁决层直接丢弃，一分不给。
