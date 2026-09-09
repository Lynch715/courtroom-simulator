#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 lawtext/laws 抽出游戏用得到的条文，生成 src/data/laws.json。

一次性生产脚本：产物已提交进仓库，日常构建不需要跑它。
只有要加新法条时才重跑：
    git clone --depth 1 https://github.com/lawtext/laws.git
    python3 tools/extract_laws.py laws/content src/data/laws.json

数据来源：国家法律法规数据库 https://flk.npc.gov.cn
法律法规属《著作权法》第五条排除对象，不受著作权保护。
"""
import io, json, os, re, sys

# 要抽的法，以及每部法要哪些条。条号用阿拉伯数字，"之一"写成 133-1
WANT = {
"刑法": """13 14 15 16 20 21 22 23 24 25 26 27 30 31 61 62 63 64 65 67 68 72
  114 115 128 133 133-1 141 176 192 205 213 214 215 221 225 232 233 234 235
  264 266 271 272 274 275 285 286 287-1 287-2 291-2 312 341 363 364 382 385 389 393""",
"刑事诉讼法": "50 52 54 55 56 57 58 61 62 64 190 192 193 195 198 200 201 236 253",
"民法典": """7 132 143 153 154 1004 1024 1032 1034 1035 1062 1064 1133 1143
  1165 1166 1167 1173 1174 1176 1179 1183 1184 1188 1198 1218 1219 1222 1254""",
"民事诉讼法": "66 67 68 79 88 152",
"行政处罚法": "5 6 28 32 33 34 40 41 44 45 54 57 60 63 76",
"行政诉讼法": "6 34 35 37 70 74 76 78",
"枪支管理法": "46",
"野生动物保护法": "2 27 28",
"药品管理法": "98 124",
"著作权法": "3 10 24 52 53",
"个人信息保护法": "4 5 6 13 14 26 28 29 69",
}

# 罪名和常用说法，正文里不一定有这几个字。搜「高空抛物」得能找到刑法二百九十一条之二。
ALIAS = {
"高空抛物": ["刑法:291-2", "民法典:1254"],
"危险驾驶": ["刑法:133-1"],
"醉驾":     ["刑法:133-1"],
"帮信":     ["刑法:287-2"],
"帮助信息网络犯罪活动": ["刑法:287-2"],
"掩饰隐瞒犯罪所得": ["刑法:312"],
"人脸":     ["个人信息保护法:28", "个人信息保护法:26", "民法典:1034"],
"生物识别": ["个人信息保护法:28", "个人信息保护法:26"],
"个人信息": ["个人信息保护法:4", "个人信息保护法:13", "民法典:1034"],
"非法经营": ["刑法:225"],
"职务侵占": ["刑法:271"],
"集资诈骗": ["刑法:192"],
"非法集资": ["刑法:176", "刑法:192"],
"假药":     ["刑法:141", "药品管理法:98"],
"假冒注册商标": ["刑法:213", "刑法:214", "刑法:215"],
"损害商业信誉": ["刑法:221"],
"虚开增值税专用发票": ["刑法:205"],
"珍贵濒危野生动物": ["刑法:341", "野生动物保护法:2"],
"淫秽物品": ["刑法:363", "刑法:364"],
"非法证据排除": ["刑事诉讼法:56", "刑事诉讼法:58"],
"疑罪从无": ["刑事诉讼法:200"],
"举证责任倒置": ["行政诉讼法:34"],
"夫妻共同债务": ["民法典:1064"],
"遗嘱":     ["民法典:1133", "民法典:1143"],
"公序良俗": ["民法典:8", "民法典:153"],
"医疗损害": ["民法典:1218", "民法典:1222"],
"名誉权":   ["民法典:1024"],
"缓刑":     ["刑法:72"],
"从犯":     ["刑法:27"],
"自首":     ["刑法:67"],
"减轻处罚": ["刑法:63"],
"退赃退赔": ["刑法:64"],
"意外事件": ["刑法:16"],
"正当防卫": ["刑法:20"],
"盗窃":     ["刑法:264"],
}

CN = {"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9}

def cn2num(s):
    """把「二百六十四」这种中文数字转成 264"""
    s = s.strip()
    if not s: return None
    total, section, num = 0, 0, 0
    for ch in s:
        if ch in CN:
            num = CN[ch]
        elif ch == "十":
            section += (num or 1) * 10; num = 0
        elif ch == "百":
            section += (num or 1) * 100; num = 0
        elif ch == "千":
            section += (num or 1) * 1000; num = 0
        else:
            return None
    return section + num

ART = re.compile(r"^- \*\*第([一二三四五六七八九十百千零]+)条(之([一二三四五六七八九十]+))?\*\*[　\s]*(.*)$")

def pick_file(dirs, title):
    """同一部法有多个版本，挑 status 有效 且 effective_date 最新的那个"""
    best = None
    for d in dirs:
        for fn in os.listdir(d):
            if not fn.endswith(".md"): continue
            p = os.path.join(d, fn)
            with io.open(p, encoding="utf-8") as f:
                head = f.read(1200)
            m = re.search(r"^title:\s*(.+)$", head, re.M)
            if not m or m.group(1).strip().strip('"') != "中华人民共和国" + title: continue
            st = re.search(r"^status:\s*(.+)$", head, re.M)
            dt = re.search(r"^effective_date:\s*'?([\d-]+)", head, re.M)
            ok = st and st.group(1).strip() == "有效"
            key = (1 if ok else 0, dt.group(1) if dt else "")
            if best is None or key > best[0]: best = (key, p)
    return best[1] if best else None

def parse(path):
    """返回 {条号: {"n": 中文条名, "t": 正文}}"""
    out, cur = {}, None
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            m = ART.match(line.rstrip("\n"))
            if m:
                n = cn2num(m.group(1))
                if n is None: cur = None; continue
                sub = cn2num(m.group(3)) if m.group(3) else None
                key = "%d-%d" % (n, sub) if sub else str(n)
                name = "第" + m.group(1) + "条" + ("之" + m.group(3) if m.group(3) else "")
                cur = key
                out[key] = {"n": name, "t": m.group(4).strip()}
            elif cur:
                s = line.rstrip()
                if not s.strip():
                    continue
                if s.startswith("#") or s.startswith("- **"):
                    cur = None; continue
                out[cur]["t"] += "\n" + s.strip()
    return out

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "laws/content"
    dest = sys.argv[2] if len(sys.argv) > 2 else os.path.join("src", "data", "laws.json")
    dirs = [os.path.join(root, d) for d in ("法律", "宪法") if os.path.isdir(os.path.join(root, d))]
    data, miss, total = {}, [], 0
    for title, want in WANT.items():
        path = pick_file(dirs, title)
        if not path:
            miss.append(title + "（整部没找到）"); continue
        arts = parse(path)
        keep = {}
        for k in want.split():
            k = k.strip()
            if k in arts: keep[k] = arts[k]
            else: miss.append("%s 第%s条" % (title, k))
        data[title] = keep
        total += len(keep)
        print("%-14s 全文 %4d 条，取 %3d 条" % (title, len(arts), len(keep)))
    # 别名表：只留指向确实抽到了的条文的那些
    alias = {}
    for k, refs in ALIAS.items():
        keep = [r for r in refs if r.split(":")[0] in data and r.split(":")[1] in data[r.split(":")[0]]]
        if keep: alias[k] = keep
        else: miss.append("别名「%s」指向的条文一条都没抽到" % k)
    data["_alias"] = alias
    print("别名 %d 条" % len(alias))
    if miss:
        print("没找到：" + "、".join(miss))
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with io.open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("→ %s  %d 部法 %d 条 %d 条别名  %.0f KB"
          % (dest, len(data) - 1, total, len(alias), os.path.getsize(dest)/1024.0))

if __name__ == "__main__":
    main()
