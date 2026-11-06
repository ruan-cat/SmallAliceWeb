# Phase 1: 浏览器工具链标准化（2026-11-06）

> 执行说明：本文档由 ZCode agent 的蜂群子代理编写，基于对生产站点 `https://drill.ruan-cat.com/` 的实测验证。
>
> 背景：此前对生产站点的调试依赖手工逐条调用工具（7 步调用链）。Phase 1 的目标是把这条调用链固化为「发现病灶 → 定位元素 → 取证 → 修复 → 验证」的标准化流程，供后续 agent 直接照抄复用。

## 1. 目标与范围

### 1.1 目标

- **固化 7 步调用链**：navigate → snapshot → click → snapshot → evaluate → console → screenshot，作为一切浏览器诊断的标准骨架。
- **统一取证格式**：病灶描述必须携带 element / computedStyle / boxModel / consoleErrors / screenshots 五类证据，杜绝「凭感觉改、无证据修」。
- **双栈模板化**：chrome-devtools MCP（交互式、逐步取证）与 agent-browser CLI（脚本化、可 diff）双栈命令模板，后续 agent 直接复制修改参数即可使用。
- **零新装原则**：本阶段不安装任何新工具，全部使用已具备的三套工具。

### 1.2 范围

- 仅覆盖**浏览器 UI 诊断与修复验证**流程（样式缺失、按钮状态、hydration、层级遮挡、颜色冲突等生产站点病灶）。
- 不覆盖：性能剖析（Lighthouse/trace）、接口联调、部署发布流程。

### 1.3 已知病灶清单（Phase 1 启动时的基线，修复时按 #7 验收）

| # | 病灶 | 症状 | 取证要点 |
| :--- | :--- | :--- | :--- |
| B1 | 通知按钮样式缺失 | 按钮无样式（裸元素） | computedStyle：预期有背景色/圆角，实测为默认值 |
| B2 | 发送按钮恒 disabled | 输入内容后仍不可点 | `is enabled` / disabled 属性 + 输入后状态不变 |
| B3 | Vue hydration mismatch | 控制台报 hydration 错误 | consoleErrors：`Hydration ... mismatch` |
| B4 | z-index 遮挡 TOC | 目录被其他元素盖住 | boxModel：TOC 区域命中元素为非预期节点 |
| B5 | pink H1 冲突 | 标题颜色与设计不符 | computedStyle：`color` 为 pink，规则来源冲突 |

## 2. 工具矩阵（已具备，零新装）

| 工具 | 版本 | 能力 | 适用场景 |
| :--- | :--- | :--- | :--- |
| chrome-devtools MCP | 当前会话内置 | a11y 快照（take_snapshot）、页面交互（click/fill）、脚本执行（evaluate_script）、控制台取证（list_console_messages）、截图（take_screenshot）、网络请求（list_network_requests） | 交互式逐步诊断；`evaluate_script` 可读取 computedStyle / boxModel；首选主栈 |
| agent-browser CLI | 0.41.0（`~/.agent-browser/`，config 已写 `{"headed": true}`） | `open` / `snapshot`（a11y + ref）/ `click @ref` / `eval` / `screenshot` / `get styles` / `is enabled` / `diff screenshot --baseline` / `diff snapshot` | 脚本化复现、修复前后 diff 验证、无头环境批量跑；主栈的验证副栈 |
| browser-use CLI | 0.1.13（uv + Python 3.12） | 长流程自主浏览（多步任务自然语言驱动） | 端到端回归、需要「自主探索」的场景；不作为取证手段，仅作回归通道 |

> 主栈定义：**chrome-devtools MCP 取证 + agent-browser CLI 验证**。browser-use 是第三通道，仅在需要长链路自主回归时启用（如修复后整站走查）。

## 3. 标准工作流（7 步闭环）

所有浏览器诊断必须按以下 7 步执行，不允许跳步（跳步 = 取证不完整，禁止进入修复）。

```text
① navigate    → 打开目标 URL
② snapshot    → a11y 快照，拿到元素 UID（或 agent-browser ref）
③ click/fill  → 复现病灶所需的交互动作
④ snapshot    → 交互后状态快照，确认病灶出现/状态变化
⑤ evaluate    → 脚本取证：computedStyle / boxModel / 属性
⑥ console     → 控制台取证：报错（hydration / JS 异常）
⑦ screenshot  → 视觉取证：修复前后对比底稿
```

| 步骤 | chrome-devtools MCP | 输入 | 输出 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| ① navigate | `navigate_page { url }` | URL | 页面加载完成 | 生产站 `https://drill.ruan-cat.com/` |
| ② snapshot | `take_snapshot` | 无 | a11y 树 + 元素 UID | 定位下一步操作的锚点；样式缺失的裸按钮在快照中可见 |
| ③ click | `click { uid }` | ② 的 UID | 交互生效 | 复现病灶；输入类用 `fill { uid, value }` |
| ④ snapshot | `take_snapshot` | 无 | 交互后 a11y 树 | 对比 ② 与 ④，确认状态变化（如按钮是否仍 disabled） |
| ⑤ evaluate | `evaluate_script { function }` | 取证 JS | computedStyle / boxModel JSON | 样式类病灶的**唯一权威来源**（见 §4 Schema） |
| ⑥ console | `list_console_messages` | 无 | 控制台消息列表 | hydration mismatch、JS 异常在此暴露，须与 ⑤ 交叉引用 |
| ⑦ screenshot | `take_screenshot` | 无 | PNG 截图 | 写报告/对比时的视觉底稿，修复前必须留一张 |

## 4. 病灶 JSON Schema

标准取证输出格式。任何病灶进入修复前，必须能填充以下字段（至少 element + 一项证据）。

```json
{
  "schemaVersion": "1.0",
  "url": "https://drill.ruan-cat.com/",
  "capturedAt": "2026-11-06T00:00:00.000Z",
  "bugId": "B1",
  "element": {
    "uid": "<take_snapshot 返回的 UID>",
    "selector": "button.notice-btn",
    "tag": "button",
    "text": "通知",
    "attrs": { "class": "notice-btn", "disabled": null }
  },
  "computedStyle": {
    "color": "rgb(102, 102, 102)",
    "backgroundColor": "rgba(0, 0, 0, 0)",
    "borderRadius": "0px",
    "fontSize": "16px",
    "display": "inline-block"
  },
  "boxModel": {
    "x": 120, "y": 84,
    "width": 88, "height": 32,
    "zIndex": "auto",
    "hitTarget": "button.notice-btn"
  },
  "consoleErrors": [
    { "level": "error", "text": "[Vue warn]: Hydration node mismatch" }
  ],
  "screenshots": {
    "before": "docs/toolchain/evidence/b1-before.png",
    "after": "docs/toolchain/evidence/b1-after.png"
  }
}
```

字段约束：

- `schemaVersion` 固定为 `"1.0"`，升级字段时递增。
- `element.uid` **必须**来自最近一次 `take_snapshot`，过期 UID 需要重新快照。
- `computedStyle` 只记录与病灶相关的属性名（全量转储会让 diff 失去焦点）。
- `boxModel.zIndex` 为 `auto`/数字；`hitTarget` 记录该坐标下实际命中的元素（用于 z-index 遮挡类病灶 B4）。
- `consoleErrors` 无报错时为 `[]`，禁止省略该字段（证明「已查过」）。
- `screenshots.before` 是进入修复前的硬性前置；`after` 在修复验证后回填。

## 5. 验证闭环

统一验证次序：**修复前截图 → 修复 → 修复后截图 → diff**。缺失任何一环都不算闭环。

```text
取证（§4 JSON）→ 截图 before → 实施修复 → 跑第 3 步 7 步链复查 → 截图 after → diff
```

- **视觉 diff**：agent-browser CLI 提供基线对比能力：

  ```bash
  # 修复前打基线
  agent-browser screenshot docs/toolchain/evidence/b1-before.png
  # 修复后对比
  agent-browser diff screenshot --baseline docs/toolchain/evidence/b1-before.png
  ```

- **结构 diff**：修复前后 a11y 快照对比，确认按钮状态等属性变化：

  ```bash
  agent-browser diff snapshot
  ```

- **判定标准**：
  - computedStyle 关键属性符合预期（如背景色、圆角生效）；
  - `is enabled` 或 disabled 属性翻转（B2）；
  - 控制台 `consoleErrors` 中该病灶相关错误消失（B3）；
  - `boxModel.hitTarget` 指向预期元素（B4）；
  - 截图 diff 无异常像素区域（B1/B5）。

## 6. 可复用模板（后续 agent 直接使用）

### 6.1 双栈总览

| 用途 | 栈 | 说明 |
| :--- | :--- | :--- |
| 取证（发现/定位/控制台） | chrome-devtools MCP | 交互式逐步操作 |
| 验证（修复后回归/diff） | agent-browser CLI | 脚本化可对比 |
| 长链路自主回归 | browser-use CLI | 端到端走查 |

### 6.2 模板 A：chrome-devtools MCP（取证链，步骤固定）

```text
1. navigate_page   url = https://drill.ruan-cat.com/
2. take_snapshot                 # 记录全页 a11y 树，锁定目标元素 UID
3. click / fill    uid = <步骤2的UID>
4. take_snapshot                 # 交互后状态快照
5. evaluate_script               # 取证 JS，返回 §4 格式 JSON：
```
```js
// evaluate_script 取证脚本（按病灶裁剪）
() => {
  const el = document.querySelector('button.notice-btn');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    element: { selector: 'button.notice-btn', tag: el.tagName, text: el.textContent.trim() },
    computedStyle: { color: cs.color, backgroundColor: cs.backgroundColor, borderRadius: cs.borderRadius },
    boxModel: { x: r.x, y: r.y, width: r.width, height: r.height,
                zIndex: cs.zIndex, hitTarget: hit ? hit.tagName + '.' + hit.className : null },
  };
}
```
```text
6. list_console_messages        # 查 hydration / JS 报错，与步骤5交叉印证
7. take_screenshot  # 保存为 before 底稿，路径写入 §4 JSON
```

### 6.3 模板 B：agent-browser CLI（验证链，双端复现）

```bash
# 打开生产站（headed 已配置）
agent-browser open https://drill.ruan-cat.com/

# a11y 快照拿 ref（注意：agent-browser 的 ref 与 MCP 的 UID 不通用，本栈内自洽）
agent-browser snapshot

# 复现交互（B2：输入内容后按钮仍 disabled）
agent-browser click '@send-input'
agent-browser type '@send-input' 'Hello'
agent-browser is enabled '@send-btn'      # 期望 true，实测 false → 病灶坐实

# 样式取证（B1/B5）
agent-browser get styles 'button.notice-btn'

# 修复前基线 + 修复后 diff（§5）
agent-browser screenshot docs/toolchain/evidence/b1-before.png
agent-browser diff screenshot --baseline docs/toolchain/evidence/b1-before.png
```

### 6.4 模板 C：browser-use CLI（回归通道）

```bash
# 修复完成后跑一遍自主回归（自然语言任务）
uv run browser-use "打开 https://drill.ruan-cat.com/，点击通知按钮，确认样式正常；输入消息并发送，确认按钮可用"
```

### 6.5 使用规则

1. 模板 B 中的 `@ref` 来自**同一次** `agent-browser snapshot`，换了页面必须重新 snapshot。
2. MCP 的 UID 只在本会话内有效；需要跨会话交接病灶时，一律以 §4 JSON 为准，不要交接 UID。
3. 每个病灶必须产出 §4 JSON 一份（内嵌 before/after 截图路径），修复完成后更新 `after` 字段。
4. 模板 C 只用于修复后的整体回归，不作为定位/取证手段。

## 7. 验收标准

以下清单全部通过，本阶段才算完成。完成状态记录在本文档末尾「完成记录」节。

- [ ] 7 步调用链已固化：navigate → snapshot → click → snapshot → evaluate → console → screenshot，缺步即视为流程违规。
- [ ] §4 病灶 JSON Schema 已定稿（schemaVersion 1.0），后续病灶一律按此取证。
- [ ] 双栈模板（§6.2 MCP 取证链 / §6.3 agent-browser 验证链）可直接照抄运行，无需语义猜测。
- [ ] 三套工具能力与 §2 工具矩阵一致，全阶段零新装。
- [ ] 基线病灶 B1–B5 逐一按流程修复，且每个病灶都有 before/after 截图与 diff 结论的完整证据链。
- [ ] consoleErrors 中 B3 的 hydration 报错消失，且 `list_console_messages` 无新增错误。
- [ ] 修复后浏览器-use 回归通道跑通（模板 C），无新增病灶。
- [ ] 文档经用户复核确认，方可标记「已完成」。

## 完成记录

> 状态：进行中。全部验收项通过的日期与证据文件路径记录于此（由后续执行 agent 回填）。