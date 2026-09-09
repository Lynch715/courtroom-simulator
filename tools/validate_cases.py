#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""案件包校验器。build.py 默认先跑一遍，不合法就拒绝出货。
用法：python3 tools/validate_cases.py [src/data/cases]"""
import io, json, os, re, sys

WARN = []

def err(errors, cid, msg): errors.append("[%s] %s" % (cid, msg))

def validate(pack, errors):
    cid = pack.get("id", "?")
    for k in ("id", "meta", "case", "cross", "offline"):
        if k not in pack: err(errors, cid, "缺字段 %s" % k)
    if any(k not in pack for k in ("case", "cross", "offline")): return

    C = pack["case"]
    for k in ("issues", "kp", "ev", "prosArgs", "objections", "verdicts"):
        if k not in C: err(errors, cid, "case 缺字段 %s" % k)
    if any(k not in C for k in ("issues", "kp", "ev", "verdicts")): return

    # 争点权重：引擎按加权平均归一化，所以合计不必是 100，但必须都是正整数。
    # 合计不等于 100 时给一条提醒，方便后续案子统一按百分比写。
    w = 0
    for iid, iv in C["issues"].items():
        wt = iv.get("weight")
        if not isinstance(wt, int) or wt <= 0:
            err(errors, cid, "争点 %s 的 weight 必须是正整数，当前 %r" % (iid, wt))
        else:
            w += wt
    if w and w != 100:
        WARN.append("[%s] 争点权重合计 %d（不影响判定，引擎会归一化；建议新案按百分比写成 100）" % (cid, w))

    # 论点引用的争点必须存在
    for pid, p in C["kp"].items():
        if p.get("issue") not in C["issues"]:
            err(errors, cid, "论点 %s 指向不存在的争点 %s" % (pid, p.get("issue")))
        if not p.get("tag") or not p.get("desc"):
            err(errors, cid, "论点 %s 缺 tag 或 desc" % pid)
        if not isinstance(p.get("v"), int) or p["v"] <= 0:
            err(errors, cid, "论点 %s 的 v 必须是正整数" % pid)

    # 证据
    for eid, e in C["ev"].items():
        if e.get("holder") not in ("pros", "def"):
            err(errors, cid, "证据 %s 的 holder 非法：%s" % (eid, e.get("holder")))
        flaw = e.get("flaw")
        if flaw not in (None, "authenticity", "legality", "relevance"):
            err(errors, cid, "证据 %s 的 flaw 非法：%s" % (eid, flaw))
        if flaw and not e.get("flawText"):
            err(errors, cid, "证据 %s 有 flaw 但缺 flawText" % eid)

    # 必填的称谓与文案
    for k in ("judgeWho", "prosWho", "mainIssue", "debateIntro", "crossGain", "penalties", "closing"):
        if k not in C: err(errors, cid, "case 缺字段 %s" % k)
    if C.get("mainIssue") and C["mainIssue"] not in C.get("issues", {}):
        err(errors, cid, "mainIssue 指向不存在的争点 %s" % C["mainIssue"])
    for k in ("baselessObjection", "missedFlaw", "objectionUpheld", "objectionDenied",
              "skipDebate", "vague", "sound"):
        if k not in C.get("penalties", {}):
            err(errors, cid, "penalties 缺条目 %s" % k)

    # 证人
    wit = C.get("witness")
    if wit:
        for k in ("who", "judgeIntro", "line", "prompt", "hint", "options"):
            if k not in wit: err(errors, cid, "witness 缺字段 %s" % k)
        if wit.get("contradicts") and wit["contradicts"] not in C["ev"]:
            err(errors, cid, "证人 contradicts 指向不存在的证据 %s" % wit["contradicts"])
        if "{ev}" in wit.get("prompt", "") and not wit.get("contradicts"):
            err(errors, cid, "witness.prompt 用了 {ev} 占位但没有 contradicts")
        seen = set()
        for i, o in enumerate(wit.get("options", [])):
            for k in ("v", "label", "lines"):
                if k not in o: err(errors, cid, "witness.options[%d] 缺 %s" % (i, k))
            if o.get("v") in seen: err(errors, cid, "witness.options 的 v 重复：%s" % o.get("v"))
            seen.add(o.get("v"))
            for j, l in enumerate(o.get("lines", [])):
                if not isinstance(l, list) or len(l) != 3:
                    err(errors, cid, "witness.options[%d].lines[%d] 必须是 [说话人, 样式, 台词]" % (i, j))
            if o.get("reveal") and o["reveal"] not in C["ev"]:
                err(errors, cid, "witness.options[%d].reveal 指向不存在的证据" % i)
            if o.get("grants") and o["grants"].get("id") not in C["kp"]:
                err(errors, cid, "witness.options[%d].grants 指向不存在的论点" % i)
            for x in o.get("effects", []):
                if x.get("issue") not in C["issues"]:
                    err(errors, cid, "witness.options[%d].effects 指向不存在的争点" % i)
        for v in ("show", "pass"):
            if not any(o.get("v") == v for o in wit.get("options", [])):
                err(errors, cid, "witness.options 缺 %s 这一项" % v)
        if wit.get("askLimit"):
            if not wit.get("weakSpots"):
                err(errors, cid, "witness 允许发问但没有 weakSpots，问什么都白问")
            if not wit.get("missPool"):
                err(errors, cid, "witness 缺 missPool（没问中时证人怎么打太极）")
            seenW = set()
            for i, ws in enumerate(wit.get("weakSpots", [])):
                for k in ("id", "topic", "match", "reveal", "note"):
                    if not ws.get(k): err(errors, cid, "weakSpots[%d] 缺 %s" % (i, k))
                if ws.get("id") in seenW: err(errors, cid, "weakSpots 的 id 重复：%s" % ws.get("id"))
                seenW.add(ws.get("id"))
                try: re.compile(ws.get("match", ""))
                except re.error as ex: err(errors, cid, "weakSpots[%d].match 正则非法：%s" % (i, ex))
                if ws.get("grants") and ws["grants"] not in C["kp"]:
                    err(errors, cid, "weakSpots[%d].grants 指向不存在的论点" % i)

    # 质证序列
    for i, it in enumerate(pack["cross"]):
        kind = it.get("kind")
        if kind == "witness":
            if not wit: err(errors, cid, "cross[%d] 是证人环节但案件包里没有 witness" % i)
        elif kind == "doc":
            if it.get("ev") not in C["ev"]:
                err(errors, cid, "cross[%d] 指向不存在的证据 %s" % (i, it.get("ev")))
            for k in ("intro", "text"):
                if not it.get(k): err(errors, cid, "cross[%d] 缺 %s" % (i, k))
        else:
            err(errors, cid, "cross[%d] 的 kind 非法：%r（只能是 doc 或 witness）" % (i, kind))

    # 证据出场时机
    for eid, e in C["ev"].items():
        ra = e.get("revealAt")
        if not ra:
            err(errors, cid, "证据 %s 缺 revealAt" % eid)
        elif ra.startswith("cross:"):
            try:
                n = int(ra.split(":")[1])
            except ValueError:
                err(errors, cid, "证据 %s 的 revealAt 格式错误：%s" % (eid, ra)); continue
            if n >= len(pack["cross"]):
                err(errors, cid, "证据 %s 的 revealAt 指向第 %d 格，但质证序列只有 %d 格"
                    % (eid, n, len(pack["cross"])))
        elif ra != "onShow":
            err(errors, cid, "证据 %s 的 revealAt 非法：%s" % (eid, ra))

    # 异议
    for oid, o in C.get("objections", {}).items():
        if not isinstance(o, dict) or "label" not in o:
            err(errors, cid, "异议 %s 必须是 {label, issue} 对象" % oid); continue
        if o.get("issue") not in C["issues"]:
            err(errors, cid, "异议 %s 的 issue 指向不存在的争点" % oid)

    # 公诉人的论点栈
    if "debateMaxRounds" not in C: err(errors, cid, "case 缺 debateMaxRounds")
    if not C.get("debateEndMatch"): err(errors, cid, "case 缺 debateEndMatch（玩家怎么说算发表完毕）")
    else:
        try: re.compile(C["debateEndMatch"])
        except re.error as ex: err(errors, cid, "debateEndMatch 正则非法：%s" % ex)
    seenA, counters = set(), set()
    for i, a in enumerate(C.get("prosArgs", [])):
        for k in ("id", "core", "must", "offline", "rebutMust", "rebutOffline"):
            if not a.get(k): err(errors, cid, "prosArgs[%d] 缺 %s" % (i, k))
        if a.get("id") in seenA: err(errors, cid, "prosArgs 的 id 重复：%s" % a.get("id"))
        seenA.add(a.get("id"))
        for d in a.get("counteredBy", []):
            if d not in C["kp"]:
                err(errors, cid, "prosArgs[%d].counteredBy 指向不存在的论点 %s" % (i, d))
            counters.add(d)
        if not a.get("counteredBy"):
            err(errors, cid, "prosArgs[%d] 没有 counteredBy，这条论点永远驳不倒" % i)
        for b in a.get("basedOn", []):
            if b not in C["ev"]:
                err(errors, cid, "prosArgs[%d].basedOn 指向不存在的证据 %s" % (i, b))
        o = a.get("objection")
        if o and o not in C.get("objections", {}):
            err(errors, cid, "prosArgs[%d] 的 objection %s 不在 objections 里" % (i, o))
        req = a.get("requires")
        if req:
            if not isinstance(req, dict):
                err(errors, cid, "prosArgs[%d].requires 必须是对象" % i)
            else:
                for k, v in req.items():
                    if k == "evWeak" and v not in C["ev"]:
                        err(errors, cid, "prosArgs[%d].requires.evWeak 指向不存在的证据" % i)
                    elif k == "shown" and v not in C["ev"]:
                        err(errors, cid, "prosArgs[%d].requires.shown 指向不存在的证据" % i)
                    elif k == "point" and v not in C["kp"]:
                        err(errors, cid, "prosArgs[%d].requires.point 指向不存在的论点" % i)
                    elif k not in ("evWeak", "shown", "point"):
                        err(errors, cid, "prosArgs[%d].requires 有未知条件 %s" % (i, k))
                if req.get("evWeak") and not C["ev"][req["evWeak"]].get("flaw"):
                    err(errors, cid, "prosArgs[%d] 要求证据 %s 被削弱，但它没有 flaw" % (i, req["evWeak"]))
    # 至少要有一条论点能驳倒他的东西，否则辩论没有意义
    if C.get("prosArgs") and not counters:
        err(errors, cid, "没有任何论点能驳倒公诉人，辩论打不动")

    # 判决档位按 min 降序，且必须有兜底
    mins = [v.get("min") for v in C["verdicts"]]
    if mins != sorted(mins, reverse=True):
        err(errors, cid, "verdicts 必须按 min 降序排列")
    if not mins or mins[-1] > -900:
        err(errors, cid, "verdicts 缺兜底档位（最后一档 min 应 <= -900）")
    for i, v in enumerate(C["verdicts"]):
        for k in ("r", "t"):
            if not v.get(k): err(errors, cid, "verdicts[%d] 缺 %s" % (i, k))

    # 判决档位要和结局档位对齐。结局在引擎里是写死的 50 / 20 / 0（70-career.js
    # 的 epilogueOf），判决档位如果错开，就会出现「判五年，配无罪的结局文案」。
    for band in (50, 20, 0):
        if band not in mins:
            WARN.append("[%s] 判决档位没有 min=%d 这一档。结局文案按 50/20/0 分段，"
                        "错开会让判决和结局对不上（如判五年却走无罪结局）" % (cid, band))

    # 离线兜底
    off = pack["offline"]
    for pid, src in off.get("keyword", {}).items():
        if pid not in C["kp"]:
            err(errors, cid, "离线关键词 %s 不是本案的论点" % pid)
        try:
            rx = re.compile(src)
        except re.error as ex:
            err(errors, cid, "离线关键词 %s 正则非法：%s" % (pid, ex)); continue
        # 关键词不能被常见法律套话误触发——"民法"会在"人民法院"里命中。
        # 但明写在关键词表里的整词是有意的（d4 就是要认"最高人民法院"），放行。
        alts = set(a.strip() for a in src.split("|") if a.strip())
        for phrase in ("最高人民法院", "人民检察院", "中华人民共和国", "审判长", "公诉人",
                       "辩护人", "被告人", "合议庭", "本院认为", "人民法院"):
            if phrase in alts:
                continue
            if rx.search(phrase):
                err(errors, cid, "离线关键词 %s 会被「%s」误触发（是哪一项自己找一下），收紧它"
                    % (pid, phrase))
    for pid in C["kp"]:
        if pid not in off.get("keyword", {}):
            err(errors, cid, "论点 %s 没有离线关键词，离线模式下永远立不住" % pid)

def main(d=None):
    if d is None:
        args = [a for a in sys.argv[1:] if not a.startswith("-")]
        d = args[0] if args else os.path.join("src", "data", "cases")
    files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
    if not files:
        print("没有找到案件包：%s" % d); return 1
    errors, ids = [], set()
    for f in files:
        with io.open(os.path.join(d, f), encoding="utf-8") as fh:
            try:
                pack = json.load(fh)
            except ValueError as ex:
                errors.append("[%s] JSON 解析失败：%s" % (f, ex)); continue
        if pack.get("id") in ids: errors.append("[%s] id 重复" % f)
        ids.add(pack.get("id"))
        validate(pack, errors)
    if errors:
        print("案件包校验未通过，共 %d 处：" % len(errors))
        for e in errors: print("  " + e)
        return 1
    for w in WARN: print("提醒 " + w)
    print("案件包校验通过：%d 个案件（%s）" % (len(files), "、".join(sorted(ids))))
    return 0

if __name__ == "__main__":
    sys.exit(main())
