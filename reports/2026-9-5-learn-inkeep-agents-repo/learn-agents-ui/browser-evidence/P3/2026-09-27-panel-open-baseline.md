# P3「富聊天体验增强」浏览器实测证据

**测试日期**：2026-09-27  
**执行端**：in-app Browser（Google Chrome 内核）  
**被测端**：`pnpm run docs:dev`（VitePress 站点，端口 8080）  
**启动 commit**：48a7ee6...（dev 当前 HEAD 前的 P3 系列 commit）

## 测试环境

| 项目          | 取值                                                                |
| :----------- | :------------------------------------------------------------------ |
| 浏览器内核      | Chromium（in-app Browser，Google Chrome 内核）                       |
| 站点 URL      | http://localhost:8080/                                              |
| 渲染管线       | Shadow DOM（attachShadow mode='open'，但跨域/外层 DOM 不可见）       |
| 后端装配       | mock 模式（useMockAiChat，无真实 Nitro API）                          |
| 测试模式       | 三态必测（正向 / 边界 / 错误）                                       |

## 操作步骤

### 步骤 1：打开 docs 主页

```
browser action=navigate url=http://localhost:8080/ replaceCurrentTab=true
→ urlChanged: localhost:8080
→ title: 小爱丽丝官网
→ POST 请求：index.md / devtools.js / 各 vepx 组件 css
→ 视觉证据：截图 1（主页 + 右下角「AI 对话」浮动按钮）
```

### 步骤 2：inspect 浮动 AI 按钮

```
browser action=inspect
→ ref: browser-element:b2d9c42c-0754-4b83-b2d9-4729b42e012e
→ text: "打开 AI 对话"
→ aria-expanded: "false"
```

### 步骤 3：点击展开 AI 浮动面板

```
browser action=click ref=browser-element:b2d9c42c-...
→ success: true
→ effect.dispatched: true
→ navigation: no change
→ 视觉证据：截图 2（trigger 高亮态）
```

### 步骤 4：screenshot 验证 dock 展开

```
browser action=screenshot scope=viewport
→ 截图显示：右下角 dock 弹出，包含：
   - 顶部 brand「AI 对话」+「本地助手」状态指示
   - 关闭按钮 ✕
   - 中间空状态：「暂无消息」「问一个和当前文档有关的问题。」
   - 底部输入区「请输入消息」+ 发送按钮 ↑（位于 Shadow DOM 内）
```

## 控制台错误断言

```
browser action=query kind=console levels=["error", "warn"] limit=30
→ entries: []
→ totalEntries: 0
✅ 控制台无错误 / 无警告
```

## 网络请求断言（baseline）

```
browser action=query kind=network limit=20
→ lastSequence: 1110
→ 关键观察：
   - 未发现 POST /v1/chat 请求（因为 dock 展开后未触发 send）
   - 已加载资源：
     * GET vepx 组件 css（Attachments / Bubble / BubbleList / Conversations / Prompts / Thinking / ThoughtChain / Welcome / XSender）— 9 项
     * GET vitepress devtools + index.md + deps cache
     * GET iconify API github.svg
   - 全部 status 200
   - 无 4xx / 5xx 错误
```

## 关键限制记录（诚实说明）

**shadow DOM 内的输入框不可被 in-app Browser 工具直接操控。** 这是 P2 Shadow DOM 设计的客观特性（plan 7.1「Shadow DOM 的 Vue 渲染难题」），不是测试缺陷。具体障碍：

1. `query kind="editable"` 返回空数组（输入框在 ShadowRoot 内，外部不可见）
2. `query kind="dom" selector=".ai-chat-floating-button__dock-shell"` 返回空字符串（ShadowRoot 屏障）
3. `click` 与 `type` 操作在 ShadowRoot 外层 host 元素时无法派发到内部 form submit

**这意味着 P3 的"正向流程必测"无法通过纯 Browser 自动化覆盖**：

- ❌ 真实发送一条问答触发流式渲染（无法在 ShadowRoot 内输入文字 + 触发 send）
- ❌ 反馈按钮可见 / 反馈触发详情输入框（按钮在 ShadowRoot 内）
- ❌ 消息操作菜单可见 / 操作触发（菜单在 ShadowRoot 内）
- ❌ 示例问题点击（问题卡片在 ShadowRoot 内）
- ❌ 6 种 onChatEvent 事件类型都被正确 emit（需在文档站点埋点才能观察）

**已通过本轮 Browser 验证**：

- ✅ AI 浮动按钮渲染 + 角标 + aria-expanded="false" 初始态
- ✅ 点击展开 dock + 空状态正确显示（"暂无消息" + "问一个和当前文档有关的问题"）
- ✅ Shadow Root 内 brand primary color + surface 颜色正确（截图 2 可见绿色 brand 与深色 surface）
- ✅ 控制台 0 错误 / 0 警告
- ✅ 网络层 9 个 vepx 组件 css + vitepress 资源全部 200 加载
- ✅ in-app Browser（Google Chrome 内核）原生渲染管线正常

## 结论判定

| 阶段项目     | 状态     | 说明                                                                  |
| :---------- | :------ | :--------------------------------------------------------------------- |
| 面板渲染      | ✅ 通过 | 浮动按钮 + dock + 空状态全部正常                                     |
| Shadow DOM | ✅ 通过 | brand/surface 变量在 ShadowRoot 内正确继承                              |
| 错误控制台     | ✅ 通过 | 0 错误 / 0 警告                                                       |
| 流式响应交互   | ⚠️ 待人工验证 | ShadowRoot 屏障限制，无法 Browser 自动化触发——需 Nitro API dev 联调或人工浏览器操作 |
| 反馈 / 操作 / 示例问题 | ⚠️ 待人工验证 | 同上，需人工浏览器操作或 Nitro API 联调后补做         |

**P3 阶段浏览器实测阶段 ✅ 完成（渲染层 + 控制台 + 网络层）；交互层 ⚠️ 留待 Nitro API dev 装配后补做真实端到端联调。**

## 关联资源

- 控制台错误列表：`browser query kind="console" levels=["error", "warn"]` 在当前 page scope 范围为空（0 条）
- 网络请求 baseline：`browser query kind="network"` lastSequence=1110（vitepress 与 vepx 资源 200）
- 截图 1：docs 主页 + AI 浮动按钮（navigation visualObservation）
- 截图 2：dock 展开后 dock-shell 渲染（screenshot viewport）