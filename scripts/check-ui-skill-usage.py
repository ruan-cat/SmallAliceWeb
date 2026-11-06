#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-ui-skill-usage.py
统计 12 个 UI 设计技能在 ZCode 会话中的调用情况，输出 Markdown 报告（默认打印到控制台）。

数据源：ZCode 本地 SQLite 数据库（只读打开，绝不写入）
  C:/Users/pc/.zcode/cli/db/db.sqlite
  - part 表        ：消息部件 JSON。Skill 调用入参形如
                     {"type":"tool","tool":"Skill","input":{"skill":"<技能名>"}}
                     技能名字段经 json_extract(data, '$.state.input.skill') 提取；
                     注意该字段可能是完整路径形式（如 ...\\skills\\xxx\\SKILL.md），需归一化
  - session 表     ：会话元数据，directory 为会话工作目录，title 为会话标题
  - tool_usage 表  ：工具调用执行记录（tool_name/status/started_at/duration_ms/cancelled_by_user），
                     用于与 part 表交叉核对 Skill 调用的失败/取消状态

触发词背景：SmallAliceWeb 仓库 AGENTS.md 于 2026-11-06 加入 UI 技能触发词，
本脚本用于验证 agent 是否会按触发词主动加载这 12 个 UI 技能。

用法（注意）：
  本机 python 是 pyenv-win 的 .bat shim，在 bash 内联 -c 会因引号损坏报错，
  必须直呼真实 exe：
    C:/Users/pc/.pyenv/pyenv-win/versions/3.11.9/python.exe D:/code/ruan-cat/SmallAliceWeb/scripts/check-ui-skill-usage.py
    C:/Users/pc/.pyenv/pyenv-win/versions/3.11.9/python.exe D:/code/ruan-cat/SmallAliceWeb/scripts/check-ui-skill-usage.py --out report.md

依赖：仅标准库（sqlite3/os/re/datetime/collections/argparse），无第三方库。
"""

import argparse
import datetime
import os
import sqlite3
from collections import Counter

# ---------- 常量 ----------

# 只读 URI：mode=ro 保证本脚本绝不写入数据库
DB_URI = "file:C:/Users/pc/.zcode/cli/db/db.sqlite?mode=ro"

# 目标仓库过滤关键字：按 session.directory 模糊匹配（与基线口径一致）
DOMAIN_KEYWORD = "SmallAliceWeb"

# 触发词生效日（基线日期）：2026-11-06
BASELINE_DATE = datetime.date(2026, 11, 6)

# 12 个 UI 设计技能（AGENTS.md 触发词清单，与基线核对名单一致）
UI_SKILLS = [
    "frontend-design",
    "web-design-guidelines",
    "ui-design-brain",
    "emil-design-eng",
    "apple-design",
    "animate",
    "animation-performance",
    "animation-vocabulary",
    "break-ui",
    "browser-testing-with-devtools",
    "context-engineering",
    "use-agent-browser",
]


# ---------- 工具函数 ----------

def normalize_skill(raw):
    """技能名归一化：完整路径形式（如 ...\\skills\\xxx\\SKILL.md）取父目录名，
    裸名直接取，末尾 .md 去掉，一律小写比对。"""
    if not raw:
        return raw
    # 统一分隔符后按段切分，兼容 Windows 反斜杠与 POSIX 正斜杠两种写法
    parts = [p for p in raw.replace("/", "\\").split("\\") if p]
    if not parts:
        return str(raw).lower()
    last = parts[-1]
    if last.lower().endswith(".md"):
        # 路径形式 ...\\skills\\<技能名>\\SKILL.md → 技能名是倒数第二段
        name = (parts[-2] if len(parts) >= 2 else last[:-3]).lower()
    else:
        name = last.lower()
    return name


def fmt_date(ts_ms):
    """epoch 毫秒 → 本地日期字符串（YYYY-MM-DD）。"""
    if ts_ms is None:
        return "-"
    return datetime.datetime.fromtimestamp(ts_ms / 1000.0).date().isoformat()


def fmt_dt(ts_ms):
    """epoch 毫秒 → 本地日期时间字符串。"""
    return datetime.datetime.fromtimestamp(ts_ms / 1000.0).strftime("%Y-%m-%d %H:%M:%S")


# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser(description="统计 12 个 UI 设计技能在 ZCode 会话中的调用情况")
    ap.add_argument(
        "--out", metavar="PATH",
        help="将 Markdown 报告同时写入该文件（默认仅打印到控制台）",
    )
    args = ap.parse_args()

    # 数据库只读打开；失败时给出提示，建议重试一次而不是反复重试
    try:
        conn = sqlite3.connect(DB_URI, uri=True)
    except sqlite3.Error as e:
        print(f"[错误] 只读打开数据库失败：{e}")
        print("建议：若是文件被占用，等待约 1 分钟后重试一次；仍失败请检查 db.sqlite 是否存在。")
        return 1
    conn.row_factory = sqlite3.Row

    # 1) part 表：读取全部 Skill 调用（281 条量级，全表 LIKE 扫描）
    skill_rows = conn.execute(
        "SELECT session_id, time_created,"
        " json_extract(data, '$.state.input.skill') AS skill"
        " FROM part WHERE data LIKE '%\"tool\":\"Skill\"%'"
    ).fetchall()

    # 2) 会话目录映射：只取用到的会话 id
    sid_set = {r["session_id"] for r in skill_rows}
    dir_map = {}
    if sid_set:
        placeholders = ",".join("?" * len(sid_set))
        for r in conn.execute(
            f"SELECT id, directory FROM session WHERE id IN ({placeholders})",
            list(sid_set),
        ):
            dir_map[r["id"]] = r["directory"]

    # 3) tool_usage 交叉核对（Skill 调用执行状态）
    tu_rows = conn.execute(
        "SELECT status, cancelled_by_user, started_at FROM tool_usage WHERE tool_name = 'Skill'"
    ).fetchall()

    # 4) 域内会话总数（分母）
    domain_session_total = conn.execute(
        "SELECT COUNT(*) FROM session WHERE directory LIKE ?",
        (f"%{DOMAIN_KEYWORD}%",),
    ).fetchone()[0]
    conn.close()

    # 组装调用记录
    calls = []  # 每项: {sid, ts_ms, raw, norm, domain(bool)}
    for r in skill_rows:
        raw = r["skill"]
        calls.append({
            "sid": r["session_id"],
            "ts_ms": r["time_created"],
            "raw": raw,
            "norm": normalize_skill(raw),
            "domain": (dir_map.get(r["session_id"]) or "").lower().find(DOMAIN_KEYWORD.lower()) >= 0,
        })
    domain_calls = [c for c in calls if c["domain"]]

    # 生效后（>= 基线日期）的域内调用
    post_calls = [c for c in domain_calls if datetime.date.fromtimestamp(c["ts_ms"] / 1000.0) >= BASELINE_DATE]

    # ---------- 汇总 ----------
    g_counter = Counter(c["norm"] for c in calls)
    d_counter = Counter(c["norm"] for c in domain_calls)
    post_counter = Counter(c["norm"] for c in post_calls)

    first_ts_global = {}   # 各技能首次调用时间（全局）
    for c in calls:
        if c["norm"] not in first_ts_global or c["ts_ms"] < first_ts_global[c["norm"]]:
            first_ts_global[c["norm"]] = c["ts_ms"]
    first_ts_domain = {}   # 各技能首次调用时间（域内）
    for c in domain_calls:
        if c["norm"] not in first_ts_domain or c["ts_ms"] < first_ts_domain[c["norm"]]:
            first_ts_domain[c["norm"]] = c["ts_ms"]

    path_form_count = sum(1 for c in calls if c["raw"] and ("\\" in c["raw"] or "/" in c["raw"]))
    domain_sid_with_skill = len({c["sid"] for c in domain_calls})
    normalized_distinct = len(g_counter)

    # ---------- 拼装 Markdown 报告 ----------
    now = datetime.datetime.now()
    L = []
    L.append(f"# UI 技能调用统计报告（{now.strftime('%Y-%m-%d %H:%M')}）")
    L.append("")
    L.append("- 数据源：ZCode 本地库只读查询 `C:/Users/pc/.zcode/cli/db/db.sqlite`（part/session/tool_usage 表）")
    L.append(f"- 目标仓库过滤：`session.directory LIKE '%{DOMAIN_KEYWORD}%'`")
    L.append(f"- 触发词基线：{BASELINE_DATE.isoformat()}（AGENTS.md UI 技能触发词生效日）")
    L.append("")

    L.append("## 1. 12 个 UI 技能调用统计")
    L.append("")
    L.append("| 技能 | 全局调用 | 域内调用 | 全域首次调用 | 域内首次调用 | 触发结论 |")
    L.append("| :--- | :---: | :---: | :--- | :--- | :--- |")
    for sk in UI_SKILLS:
        gc = g_counter.get(sk, 0)
        dc = d_counter.get(sk, 0)
        post = post_counter.get(sk, 0)
        if post >= 1:
            mark = "有——触发证据"
        elif dc == 0:
            mark = "无——生效后 0 次"
        else:
            mark = "仅生效前调用"
        L.append(
            f"| {sk} | {gc} | {dc} | {fmt_date(first_ts_global.get(sk))} | {fmt_date(first_ts_domain.get(sk))} | {mark} |"
        )
    L.append("")

    L.append("## 2. 全部技能调用分布（全局，TOP 30）")
    L.append("")
    L.append("| 排名 | 归一化技能名 | 调用次数 |")
    L.append("| :---: | :--- | :---: |")
    for i, (sk, n) in enumerate(g_counter.most_common(30), 1):
        L.append(f"| {i} | {sk if sk else '(空)'} | {n} |")
    L.append("")
    L.append(f"- 全部 Skill 调用行数：{len(calls)}；归一化后不同技能数：{normalized_distinct}")
    L.append(f"- 含完整路径形式技能名（需归一化）的行数：{path_form_count}")
    L.append("")

    L.append(f"## 3. {DOMAIN_KEYWORD} 域内概况")
    L.append("")
    L.append(f"- 域内 Skill 调用行数：{len(domain_calls)}")
    L.append(f"- 域内不同技能数：{len(d_counter)}")
    L.append(f"- 域内会话总数（分母）：{domain_session_total}")
    L.append(f"- 域内含 Skill 调用的会话数：{domain_sid_with_skill}")
    L.append("")

    L.append("## 4. tool_usage 交叉核对（Skill）")
    L.append("")
    tu_status = Counter(r["status"] for r in tu_rows)
    tu_cancel = sum(1 for r in tu_rows if r["cancelled_by_user"])
    L.append("| 状态 | 次数 |")
    L.append("| :--- | :---: |")
    for st, n in tu_status.most_common():
        L.append(f"| {st} | {n} |")
    L.append("")
    L.append(f"- 被用户取消次数：{tu_cancel}")
    if tu_rows:
        ts_list = [r["started_at"] for r in tu_rows if r["started_at"]]
        if ts_list:
            L.append(f"- 时间跨距：{fmt_dt(min(ts_list))} ~ {fmt_dt(max(ts_list))}")
    L.append("")

    # 结论
    L.append("## 5. 结论（与基线 2026-11-06 对比）")
    L.append("")
    L.append(f"- 基线：{BASELINE_DATE.isoformat()} 生效，基线当日域内 12 技能调用 = 0（历史 Skill 调用 37 次且不含任何 UI 技能）")
    L.append(f"- 本次实测：生效后（>= {BASELINE_DATE.isoformat()}）域内 12 技能调用合计 = {len(post_calls)} 次")
    L.append("")
    evidence = [(sk, post_counter.get(sk, 0)) for sk in UI_SKILLS if post_counter.get(sk, 0) >= 1]
    if evidence:
        for sk, n in evidence:
            L.append(f"- {sk}：{n} 次调用，且发生在触发词生效之后 —— 触发词生效的直接证据")
        L.append("- 判定：**触发生效**，无需人工抽查；按月采样继续观察调用率是否上升。")
    else:
        L.append("- 12 个 UI 技能在触发词生效后均为 0 调用，与基线一致。")
        L.append("- 判定：**暂无触发证据**。需抽查当月 SmallAliceWeb 会话标题（session.title）确认：")
        L.append("  1. 若当月根本没有 UI 设计/前端任务 → 属于「未暴露」，触发词有效性无法判定，继续等待暴露；")
        L.append("  2. 若当月存在明确 UI 任务却仍 0 调用 → 属于「未触发」，需检查触发词表述或 agent 加载链路；")
        L.append("  3. 连续 2 个月 0 调用且当月有 UI 任务 → 判定触发词失效，需调整触发词。")
    L.append("")
    L.append("## 6. 局限声明")
    L.append("")
    L.append("- 触发词是提示而非强制：agent 是否加载技能还受模型判断与任务匹配度影响，0 调用不直接等于触发词无效。")
    L.append("- part 表可回溯到 2026-07，但只记录「实际发生」的调用，不记录「触发词被看到但未调用」的负样本。")
    L.append("- 域内过滤按目录字符串模糊匹配，子目录/子代理会话也会计入，分母口径需与基线保持一致。")
    L.append("")

    md = "\n".join(L)
    print(md)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(md + "\n")
        print(f"[已写入] {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())