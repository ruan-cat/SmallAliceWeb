# Spec：ai-vue 子包学习 @inkeep/agents-ui 的能力差距与目标

> 文档类型：spec（规范文档）
> 创建日期：2026-09-05
> 所属报告：`reports/2026-9-5-learn-inkeep-agents-repo/`
> 目标子包：`@ruan-cat-drill-doc/ai-vue`（当前版本 0.0.1）
> 参考对象：`@inkeep/agents-ui`（当前版本 0.17.8）

---

## 一、背景与动机

### 1.1 当前 ai-vue 子包的定位

`@ruan-cat-drill-doc/ai-vue` 是 SmallAliceWeb monorepo 内的 Vue 3 组件库，为 VitePress 文档站提供 AI 聊天能力。当前它包含两个组件：

- `AiChat.vue`：嵌入式聊天面板，支持消息列表、来源链接、流式 Markdown 渲染、停止生成
- `AiChatFloatingButton.vue`：悬浮按钮 + 侧边抽屉，点击展开 `AiChat`

配套一个 `useMockAiChat` composable 用于本地无网络的模拟对话。实际的 RAG 聊天由 `ai-vitepress-plugins` 包内的 `useKnowledgeChat` composable 驱动，它基于 `@ai-sdk/vue` 的 `useChat` 与后端 Nitro API 的 `/v1/chat` 通信。

### 1.2 为什么选择 @inkeep/agents-ui 作为学习对象

`@inkeep/agents-ui` 是 Inkeep 公司开源的 React 聊天组件库（独立发布到 npm，当前 0.17.8 版本），是经过生产验证的企业级 AI 聊天 UI 方案。它具备以下值得学习的特质：

1. **多形态部署**：提供 EmbeddedChat（嵌入式）、SidebarChat（侧边栏）、ChatButton（悬浮按钮）、ModalChat（弹窗）、SearchBar（搜索栏）等多种组件形态，覆盖文档站、SaaS 产品、营销页面等不同场景
2. **深度品牌化**：通过 `primaryBrandColor` 单一入口自动生成完整色板，支持 `UserProvidedColorScheme` 精细覆盖、`IkpTheme` 主题令牌系统、CSS 变量前缀定制
3. **Shadow DOM 隔离**：通过 Shadow DOM 将组件样式与宿主页面隔离，避免 CSS 冲突，确保在任何宿主环境下视觉一致
4. **富聊天体验**：支持自定义消息渲染（`ComponentsConfig`）、工具调用审批 UI（`IkpTool`）、表单收集（`openForm`）、反馈机制、消息操作菜单、示例问题、引导消息等
5. **事件驱动架构**：通过 `InkeepCallbackEvent` 暴露完整的用户行为事件链，便于埋点分析和质量优化
6. **双模式嵌入**：既支持 React 组件直接引入，也支持通过 `<script>` 标签 + `Inkeep.EmbeddedChat()` 函数在非 React 环境嵌入

### 1.3 核心矛盾

ai-vue 当前是一个**最小可用**的聊天组件，仅满足"能对话、能看来源"的基本需求。而 SmallAliceWeb 正在向"AI 智能客服"方向演进，需要更丰富的交互能力、更强的品牌定制、更可靠的样式隔离。直接引入 `@inkeep/agents-ui` 不可行（它是 React 组件库，SmallAliceWeb 使用 Vue），但其设计理念和架构模式值得深度借鉴。

---

## 二、能力差距分析

### 2.1 组件形态丰富度

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| 嵌入式聊天 | `InkeepEmbeddedChat` | `AiChat` | 基本对齐 |
| 悬浮按钮 + 抽屉 | `InkeepChatButton` | `AiChatFloatingButton` | 基本对齐 |
| 侧边栏聊天 | `InkeepSidebarChat` | ❌ 无 | 缺失 |
| 弹窗聊天 | `InkeepModalChat` | ❌ 无 | 缺失 |
| 搜索栏 | `InkeepSearchBar` | ❌ 无 | 缺失 |
| 搜索 + 聊天组合 | `InkeepEmbeddedSearchAndChat` | ❌ 无 | 缺失 |

**差距说明**：ai-vue 只有 2 种形态，agents-ui 有 6+ 种。侧边栏和弹窗形态在 SaaS 产品集成场景中需求很高。

### 2.2 品牌化与主题系统

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| 品牌色入口 | `primaryBrandColor` 自动生成色板 | ❌ 无自动色板 | 重大差距 |
| 色板精细覆盖 | `UserProvidedColorScheme`（11 个色阶） | 仅 CSS 变量覆盖 | 重大差距 |
| 主题令牌系统 | `IkpTheme`（colors/fontFamily/fontSize/zIndex） | ❌ 无 | 重大差距 |
| CSS 前缀定制 | `prefix` 配置（默认 `ikp`） | ❌ 固定 `ai-chat` 前缀 | 中等差距 |
| 暗色模式同步 | `ColorModeProviderProps`（system/forced/storage） | 仅 CSS 媒体查询 | 中等差距 |
| 组织名展示 | `organizationDisplayName` | ❌ 无 | 低差距 |

**差距说明**：ai-vue 的品牌化能力非常薄弱。当前 `styles/index.scss` 虽然定义了 CSS 变量（如 `--ai-chat-primary-color`），但需要使用者手动覆盖每个变量，没有"输入一个品牌色，自动生成完整色板"的能力。agents-ui 通过 `colorjs.io` 库从 `primaryBrandColor` 自动派生出 11 个色阶（lighter/light/medium/strong 等），极大降低了品牌定制成本。

### 2.3 样式隔离

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| Shadow DOM 隔离 | ✅ 内置 Shadow 组件 | ❌ 无 | 重大差距 |
| 样式冲突风险 | 极低 | 高（全局 CSS） | 重大差距 |
| 第三方嵌入可行性 | 高 | 低 | 重大差距 |

**差距说明**：ai-vue 当前使用全局 SCSS，当被嵌入到第三方页面时，宿主页面的 CSS 可能污染聊天组件的样式（如 `button`、`input`、`a` 等元素的全局样式）。agents-ui 通过 Shadow DOM 彻底隔离了组件样式，这是"可嵌入"能力的基础。

### 2.4 富聊天体验

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| Markdown 渲染 | ✅ react-markdown + remark-gfm + prism | ✅ markstream-vue | 基本对齐 |
| 来源引用展示 | ✅ citation 组件 | ✅ 来源链接列表 | 基本对齐 |
| 自定义消息渲染 | `ComponentsConfig`（按名称注册渲染器） | ❌ 无 | 重大差距 |
| 工具调用 UI | `IkpTool`（含审批按钮） | ❌ 无 | 重大差距 |
| 表单收集 | `openForm(formSettings)` | ❌ 无 | 中等差距 |
| 反馈机制 | `InkeepFeedback`（正/负面 + 详情） | ❌ 无 | 中等差距 |
| 消息操作菜单 | `CustomMessageAction[]` | ❌ 无 | 中等差距 |
| 示例问题 | `exampleQuestions` | ❌ 无 | 低差距 |
| 引导消息 | `introMessage` | ❌ 无 | 低差距 |
| 文件附件 | `FileUIPart` | ❌ 无 | 中等差距 |

**差距说明**：ai-vue 的聊天体验停留在"文本 + 来源链接"阶段。agents-ui 支持通过 `ComponentsConfig` 注册自定义渲染器，实现工单卡片、订单状态、数据图表等富组件渲染，这是"智能客服"区别于"文档问答"的关键能力。

### 2.5 事件与可观测性

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| 用户行为事件 | `InkeepCallbackEvent`（15+ 事件类型） | ❌ 仅 send/stop/clear-error | 重大差距 |
| 反馈事件 | `AssistantPositiveFeedbackSubmitted` 等 | ❌ 无 | 重大差距 |
| 消息完成事件 | `AssistantAnswerDisplayed` | `onResponseComplete` | 部分对齐 |
| 用户升级事件 | `UserEscalationIndicatedEvent` | ❌ 无 | 中等差距 |

**差距说明**：ai-vue 的事件系统非常简单，只有 3 个 emit 事件。agents-ui 暴露了完整的用户行为事件链，包括消息提交、回复展示、反馈提交、清除点击、分享点击、升级指示等，为数据分析和质量优化提供了基础。

### 2.6 嵌入方式

| 能力 | @inkeep/agents-ui | ai-vue（当前） | 差距评估 |
|------|-------------------|----------------|----------|
| Vue 组件引入 | ❌（React） | ✅ | ai-vue 优势 |
| npm 包安装 | ✅ | ✅ | 对齐 |
| script 标签嵌入 | ✅（`@inkeep/agents-ui-js-cloud`） | ❌ | 重大差距 |
| 函数式挂载 | `Inkeep.EmbeddedChat(target, config)` | ❌ | 重大差距 |

**差距说明**：agents-ui 提供了独立的 JS Cloud 包，允许非 React 环境（如纯 HTML 页面、WordPress、Shopify）通过 `<script>` 标签 + 函数调用的方式嵌入聊天。这极大降低了集成门槛。ai-vue 目前只能在 Vue 环境使用。

---

## 三、目标与非目标

### 3.1 目标

1. **建立品牌化主题系统**：实现"输入一个品牌色，自动生成完整色板"的能力，支持精细覆盖和主题令牌系统
2. **实现 Shadow DOM 样式隔离**：使 ai-vue 组件可安全嵌入任意宿主页面而不受 CSS 污染
3. **扩展组件形态**：新增 SidebarChat 和 ModalChat 两种形态，覆盖更多集成场景
4. **增强富聊天体验**：支持自定义消息渲染器（DataComponent）、消息操作菜单、反馈机制、示例问题
5. **完善事件系统**：暴露完整的用户行为事件链，为埋点分析提供基础
6. **提供函数式嵌入能力**：支持非 Vue 环境通过 script 标签 + 函数调用嵌入聊天

### 3.2 非目标

1. **不直接移植 agents-ui 的 React 代码**：ai-vue 是 Vue 组件库，所有实现基于 Vue 3 Composition API
2. **不引入 Radix UI / Zag.js 等无障碍基础库**：保持 ai-vue 的依赖精简，使用 element-plus 和 vue-element-plus-x 作为 UI 基础
3. **不实现搜索能力**：搜索栏（SearchBar）形态暂不实现，聚焦聊天能力增强
4. **不实现可视化构建器**：agents-ui 的拖拽画布能力不在范围内
5. **不引入 colorjs.io 依赖**：使用更轻量的颜色计算方案（如纯函数或 colord 库）

---

## 四、验收标准

### 4.1 品牌化主题系统

- [ ] 提供 `primaryBrandColor` 配置项，输入一个 CSS 颜色值
- [ ] 从品牌色自动派生出至少 8 个色阶（lighter/light/medium/strong/stronger 等）
- [ ] 支持 `customColorScheme` 精细覆盖任意色阶
- [ ] 支持 `theme` 主题令牌系统（colors/fontFamily/fontSize/zIndex）
- [ ] 支持 `prefix` 配置项自定义 CSS 变量前缀
- [ ] 暗色模式可通过 `colorMode` 配置项控制（light/dark/system）

### 4.2 Shadow DOM 样式隔离

- [ ] 提供 `ShadowRoot` 包装组件，将聊天组件渲染在 Shadow DOM 内
- [ ] Shadow DOM 模式下，宿主页面 CSS 不影响组件内部样式
- [ ] 提供 `variant` 配置项（`no-shadow` / `container-with-shadow`）控制是否启用 Shadow DOM
- [ ] Shadow DOM 内的字体、图标等资源正确加载

### 4.3 组件形态扩展

- [ ] 新增 `AiSidebarChat` 组件，从右侧滑入的侧边栏聊天
- [ ] 新增 `AiModalChat` 组件，居中弹窗式聊天
- [ ] 两种新形态均支持品牌化主题系统和 Shadow DOM 隔离

### 4.4 富聊天体验

- [ ] 支持 `customComponents` 配置项，按名称注册自定义消息渲染器
- [ ] 自定义渲染器接收 `props` 和 `renderMarkdown` 函数
- [ ] 支持 `messageActions` 配置项，为每条消息添加操作菜单（复制、分享、反馈等）
- [ ] 支持 `feedbackOptions` 配置项，启用正/负面反馈按钮
- [ ] 支持 `exampleQuestions` 配置项，在空状态展示示例问题
- [ ] 支持 `introMessage` 配置项，展示引导消息

### 4.5 事件系统

- [ ] 暴露 `onChatEvent` 回调，接收完整的用户行为事件
- [ ] 事件类型至少包含：消息提交、回复展示、反馈提交、清除点击、分享点击
- [ ] 每个事件携带 `conversationId`、`messageId`、`tags` 等上下文信息

### 4.6 函数式嵌入

- [ ] 提供独立的 JS 包（如 `@ruan-cat-drill-doc/ai-vue-embed`），支持 script 标签引入
- [ ] 提供 `mountAiChat(target, config)` 函数，将聊天挂载到指定 DOM 节点
- [ ] 函数式嵌入同样支持品牌化、Shadow DOM、事件回调等全部能力

---

## 五、约束与风险

### 5.1 技术约束

1. **Vue 3 Composition API**：所有组件基于 `<script setup>` 语法，不使用 Options API
2. **TypeScript 严格模式**：所有新增类型必须完整定义，禁止 `any`
3. **peerDependencies 精简**：不新增重型依赖，品牌色计算使用纯函数或轻量库（< 5KB）
4. **构建产物兼容**：保持 Vite 构建产物的 ESM + CJS 双格式，支持 SSR

### 5.2 兼容性约束

1. **向后兼容**：现有 `AiChat` 和 `AiChatFloatingButton` 的 API 不能破坏性变更
2. **VitePress 集成**：`ai-vitepress-plugins` 的 `useKnowledgeChat` 必须无缝对接增强后的组件
3. **element-plus 共存**：不能与宿主页面的 element-plus 版本冲突

### 5.3 风险

1. **Shadow DOM 的 SSR 兼容性**：Shadow DOM 在服务端渲染时需要特殊处理，VitePress 的 SSR 模式可能需要降级为非 Shadow 模式
2. **品牌色自动派生的准确性**：从单一颜色派生完整色板需要颜色空间转换（HSL/OKLCH），不同色相的派生效果可能不一致
3. **函数式嵌入包的体积**：独立 JS 包需要包含 Vue 运行时，体积可能较大（> 100KB），需评估 tree-shaking 和按需加载策略
4. **自定义渲染器的类型安全**：`ComponentsConfig` 的动态注册机制在 TypeScript 中难以实现完全类型安全，需要权衡灵活性与类型严格性

---

## 六、术语表

| 术语 | 含义 |
|------|------|
| 品牌色（primaryBrandColor） | 使用者提供的单一 CSS 颜色值，作为主题色板生成的种子 |
| 色板（ColorScheme） | 从品牌色派生出的多个色阶，用于不同 UI 层级（背景、边框、文字、强调等） |
| 主题令牌（Theme Token） | 结构化的主题配置对象，包含 colors/fontFamily/fontSize/zIndex 四类令牌 |
| Shadow DOM | Web Components 标准，将组件的 DOM 和 CSS 封装在 Shadow Root 内，与宿主页面隔离 |
| 自定义渲染器（Custom Component） | 使用者注册的渲染函数，用于在消息流中渲染特定类型的富组件（如工单卡片） |
| 函数式嵌入 | 通过 JavaScript 函数（如 `mountAiChat(target, config)`）将组件挂载到 DOM，无需框架环境 |
| 事件链（Event Chain） | 用户在聊天过程中的完整行为事件序列，用于埋点分析 |
| Teek 主题 | `vitepress-theme-teek`，SmallAliceWeb 文档站使用的 VitePress 主题，通过 `@ruan-cat/vitepress-preset-config` 引入 |
| 主题色传递链路 | Teek 主题色 → VitePress CSS 变量 → ai-vitepress-plugins 桥接 → ai-vue 消费的完整颜色传递路径 |
| CSS 变量桥接 | 在中间层将上游 CSS 变量（如 `--vp-c-brand-1`）映射为下游 CSS 变量（如 `--ai-chat-primary-color`）的机制 |

---

## 七、Teek 主题色传递链路需求 [新增]

### 7.1 背景与现状

SmallAliceWeb 文档站的颜色体系并非单一来源，而是由三层主题叠加构成：

```
┌─────────────────────────────────────────────────────────┐
│  第1层：VitePress 默认主题变量                            │
│  --vp-c-brand-1/2/3/soft, --vp-c-bg, --vp-c-text-1 等   │
│  定义在 docs/.vitepress/theme/style.css                  │
│  当前映射：--vp-c-brand-1 → --vp-c-indigo-1              │
└──────────────────────────┬──────────────────────────────┘
                           │ extends
┌──────────────────────────▼──────────────────────────────┐
│  第2层：Teek 主题变量（vitepress-theme-teek）             │
│  --tk-theme-color, --tk-color-primary,                   │
│  --tk-el-color-primary-light-3/5/7/8/9,                  │
│  --tk-bg-color, --tk-text-color 等                       │
│  Teek 的 --tk-theme-color 直接引用 --vp-c-brand-1        │
│  支持 html[theme-color=tk-primary] 动态主题色切换         │
└──────────────────────────┬──────────────────────────────┘
                           │ 桥接 style.css
┌──────────────────────────▼──────────────────────────────┐
│  第3层：ai-vitepress-plugins 桥接层                      │
│  --ai-chat-primary-color → var(--vp-c-brand-1)           │
│  --ai-chat-surface-color → var(--vp-c-bg-elv)            │
│  --ai-chat-text-color → var(--vp-c-text-1)               │
│  ... 共 15 个桥接变量                                    │
└──────────────────────────┬──────────────────────────────┘
                           │ 消费
┌──────────────────────────▼──────────────────────────────┐
│  第4层：ai-vue 组件库                                    │
│  .ai-chat { --ai-chat-primary: var(--ai-chat-primary-    │
│  color, #3b82f6); }                                      │
│  当前使用固定深色面板作为 fallback                        │
└─────────────────────────────────────────────────────────┘
```

**当前问题**：

1. **桥接不完整**：ai-vitepress-plugins 的 `style.css` 只桥接了 VitePress 的 `--vp-c-*` 变量，**没有桥接 Teek 主题的 `--tk-*` 变量**。当 Teek 主题切换主题色（通过 `html[theme-color=tk-primary]` 属性选择器）时，AI 聊天组件无法感知。

2. **fallback 不适配**：ai-vue 的 `index.scss` 使用固定深色面板色（`#111318`、`#171a21` 等）作为 fallback，这些 fallback 在浅色主题下会显示为不协调的深色块。

3. **缺少运行时感知**：当前桥接是纯 CSS 变量映射，无法在 JavaScript 运行时获取当前主题色值，限制了品牌色派生（P1 阶段的 `useBrandTheme`）无法获取真实的 Teek 主题色作为种子。

4. **暗色模式不同步**：Teek 主题有自己的暗色模式切换逻辑（`.dark` class + `--tk-*` 变量覆盖），ai-vue 组件没有同步机制。

### 7.2 目标：完整的主题色传递链路

#### 目标 7.2.1：Teek 主题色变量桥接

- [ ] ai-vitepress-plugins 的 `style.css` 新增 Teek 主题变量桥接，将 `--tk-theme-color`、`--tk-color-primary` 等变量映射为 `--ai-chat-*` 变量
- [ ] 桥接优先级为：Teek 变量 > VitePress 变量 > 固定 fallback（Teek 优先，因为 Teek 是最终用户可见的主题层）
- [ ] 支持 Teek 的 `html[theme-color=tk-primary]` 动态主题色切换，确保 AI 聊天组件跟随切换

#### 目标 7.2.2：运行时主题色获取

- [ ] 提供 `useThemeColor()` composable，在运行时通过 `getComputedStyle(document.documentElement)` 获取当前生效的 `--tk-theme-color` / `--vp-c-brand-1` 值
- [ ] 该 composable 返回响应式 ref，当 Teek 主题色切换时自动更新
- [ ] 为 P1 阶段的 `useBrandTheme` 提供真实的主题色种子，而非要求使用者手动传入 `primaryBrandColor`

#### 目标 7.2.3：暗色模式同步

- [ ] ai-vue 组件库感知 Teek/VitePress 的暗色模式切换（监听 `html.dark` class 变化）
- [ ] 暗色模式下自动切换 ai-vue 的 surface/text/border 色阶，无需使用者手动配置
- [ ] 与 P2 阶段的 Shadow DOM 方案兼容（Shadow DOM 内部也能感知外部暗色模式）

#### 目标 7.2.4：品牌色派生与主题色获取的协同

- [ ] `useBrandTheme` composable 优先使用运行时获取的 Teek 主题色作为种子
- [ ] 当运行时获取失败（如 SSR 环境或非 VitePress 嵌入场景）时，降级为使用者传入的 `primaryBrandColor`
- [ ] 当两者都不可用时，降级为默认品牌色 `#3b82f6`

### 7.3 验收标准

- [ ] 在 Teek 主题色为默认 indigo 时，AI 聊天组件的主色调与文档站导航栏主色调视觉一致
- [ ] 通过 Teek 的主题色切换功能（如切换为 green/purple）后，AI 聊天组件的主色调跟随切换
- [ ] 在暗色模式下，AI 聊天组件的背景色、文字色、边框色自动适配为暗色色阶
- [ ] `useThemeColor()` 返回的颜色值与 `getComputedStyle` 获取的值一致
- [ ] 在非 VitePress 环境（如纯 Vue 应用）中，`useBrandTheme` 降级为手动传入的品牌色，不报错

### 7.4 约束

1. **不修改 Teek 主题源码**：所有桥接在 ai-vitepress-plugins 和 ai-vue 层完成，不修改 `vitepress-theme-teek` 包
2. **CSS 变量优先**：颜色传递以 CSS 自定义属性为主要机制，JavaScript 运行时获取仅用于派生场景
3. **SSR 安全**：`useThemeColor()` 在服务端渲染时返回默认值，不访问 `document`
4. **性能无感知**：主题色监听使用 `MutationObserver` 而非轮询，对页面性能无影响
