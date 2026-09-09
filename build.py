#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《心证》构建脚本。零依赖，macOS 自带 python3 即可。

    python3 build.py            → index.html（配 art/ 目录，推 GitHub Pages）
    python3 build.py --embed    → 心证-单文件版.html（图片一并 base64 内嵌）
    python3 build.py --check    → 只跑案件包校验，不出货

构建前默认先跑 tools/validate_cases.py，任何一个案件包不合法就拒绝出货。
"""
import base64, datetime, io, json, mimetypes, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(ROOT, "src")
JS   = os.path.join(SRC, "js")
DATA = os.path.join(SRC, "data")
ART  = os.path.join(ROOT, "art")
VERSION = "1.0.0-b0"


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def js_safe(text):
    """内联进 <script> 的 JSON 里不能出现裸的 </script>。"""
    return text.replace("</script>", "<\\/script>").replace("<!--", "<\\!--")


def collect_data():
    parts = []

    laws = os.path.join(DATA, "laws.json")
    if os.path.exists(laws):
        parts.append("const LAWS = %s;" % js_safe(read(laws).strip()))
    else:
        parts.append("const LAWS = {};   /* 法条库在批次 B7 接入 */")

    cdir = os.path.join(DATA, "cases")
    files = sorted(f for f in os.listdir(cdir) if f.endswith(".json"))
    packs = [read(os.path.join(cdir, f)).strip() for f in files]
    parts.append("const CASES = [\n%s\n];" % ",\n".join(packs))
    return js_safe("\n".join(parts)), files


def scan_art():
    """构建时扫一遍 art/，把有哪些图记下来。
    没有的图直接画占位，连请求都不发——否则空目录会在控制台刷一串 404。
    代价是补图之后要重新构建一次，反正就一条命令。"""
    have = {}
    if not os.path.isdir(ART):
        return have
    for sub in sorted(os.listdir(ART)):
        d = os.path.join(ART, sub)
        if not os.path.isdir(d) or sub in ("source", "delivery"):
            continue
        for f in sorted(os.listdir(d)):
            stem, ext = os.path.splitext(f)
            if ext.lower() in (".webp", ".png", ".jpg", ".jpeg"):
                have["%s/%s" % (sub, stem)] = ext.lower().lstrip(".")
    return have


def collect_js():
    """按文件名排序拼接——文件名前缀的数字就是加载顺序。"""
    files = sorted(f for f in os.listdir(JS) if f.endswith(".js"))
    out = []
    for f in files:
        out.append("/* ─────── src/js/%s ─────── */" % f)
        out.append(read(os.path.join(JS, f)).rstrip("\n"))
    return "\n".join(out), files


def embed_art(html):
    """把 art/ 下的图片转成 base64 填进 ART_DATA。"""
    if not os.path.isdir(ART):
        print("  没有 art/ 目录，跳过图片内嵌")
        return html, 0
    data, total = {}, 0
    for sub in sorted(os.listdir(ART)):
        d = os.path.join(ART, sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if not os.path.isfile(p):
                continue
            mime = mimetypes.guess_type(p)[0] or "application/octet-stream"
            with open(p, "rb") as fh:
                raw = fh.read()
            key = "%s/%s" % (sub, os.path.splitext(f)[0])
            data[key] = "data:%s;base64,%s" % (mime, base64.b64encode(raw).decode())
            total += len(raw)
    if not data:
        print("  art/ 是空的，跳过图片内嵌")
        return html, 0
    blob = ("\nconst ART_DATA = %s;\nconst ART_HAVE = %s;\n"
            % (json.dumps(data, ensure_ascii=False),
               json.dumps(dict((k, "webp") for k in data), ensure_ascii=False)))
    html = html.replace("<!--INJECT:ARTDATA-->", blob)
    print("  内嵌图片 %d 张，原始 %.1f MB" % (len(data), total / 1048576.0))
    return html, len(data)


def build(embed=False):
    tpl = read(os.path.join(SRC, "index.template.html"))
    css = read(os.path.join(SRC, "style.css")).rstrip("\n")
    data, case_files = collect_data()
    js, js_files = collect_js()

    stamp = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M")
    head = ("<!-- 心证 v%s · build %s · %d cases · %d js modules%s -->\n"
            % (VERSION, stamp, len(case_files), len(js_files), " · art embedded" if embed else ""))

    html = tpl.replace("<!--INJECT:CSS-->", css)
    html = html.replace("<!--INJECT:DATA-->", data)
    html = html.replace("<!--INJECT:JS-->", js)
    if "<!--INJECT:ARTDATA-->" not in html:
        html = html.replace("<!DOCTYPE html>", "<!DOCTYPE html>", 1)
    html = head + html

    if embed:
        html, _ = embed_art(html)
    have = scan_art()
    html = html.replace("<!--INJECT:ARTDATA-->",
        "const ART_DATA = {};   /* 走 art/ 目录 */\nconst ART_HAVE = %s;"
        % json.dumps(have, ensure_ascii=False))
    print("  美术资源 %d 张%s" % (len(have), "（art/ 是空的，全部走 SVG 占位）" if not have else ""))

    out = os.path.join(ROOT, "心证-单文件版.html" if embed else "index.html")
    with io.open(out, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(out)
    print("→ %s  %.0f KB" % (os.path.basename(out), size / 1024.0))
    print("  案件 %d 个：%s" % (len(case_files), "、".join(f[:-5] for f in case_files)))
    print("  JS 模块 %d 个" % len(js_files))
    return out


def check():
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import validate_cases
    return validate_cases.main(os.path.join(DATA, "cases"))


def main():
    args = sys.argv[1:]
    if "--check" in args:
        return check()
    if check() != 0:
        print("构建中止。")
        return 1
    build(embed="--embed" in args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
