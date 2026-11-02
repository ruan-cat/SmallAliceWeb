# Changelog

**Multiple Packages Updated** - 2026-08-31

## v3.7.4

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/v3.7.3...v3.7.4)

### ✨ 新增功能

- **ai-vue:** 接入 ConfigProvider 主题通道 ([3f4d3f0](https://github.com/ruan-cat/SmallAliceWeb/commit/3f4d3f0))
- **ai-vue:** 新增主题类型定义、颜色派生函数与默认主题令牌 ([899a5ea](https://github.com/ruan-cat/SmallAliceWeb/commit/899a5ea))
- **ai-vue:** 新增 useBrandTheme 品牌主题 composable ([85015d2](https://github.com/ruan-cat/SmallAliceWeb/commit/85015d2))
- **rag-core:** 新增 PageContext 共享契约 schema ([7aa8396](https://github.com/ruan-cat/SmallAliceWeb/commit/7aa8396))
- **rag-api:** 新增 ChatContext 容器与来源归一化 ([04a8597](https://github.com/ruan-cat/SmallAliceWeb/commit/04a8597))
- **rag-api:** 新增函数式 prompt 模板两态渲染 ([b0ff81a](https://github.com/ruan-cat/SmallAliceWeb/commit/b0ff81a))
- **ai-vue:** Complete configurable chat integration ([1181f26](https://github.com/ruan-cat/SmallAliceWeb/commit/1181f26))
- **ai-vue:** 运行时主题色同步与品牌主题协同 ([8aa4227](https://github.com/ruan-cat/SmallAliceWeb/commit/8aa4227))
- **ai-vue:** 新增 AiShadowRoot 包装组件与 shadow-scoped 样式 ([23623ce](https://github.com/ruan-cat/SmallAliceWeb/commit/23623ce))
- **ai-vue:** AiChat 接入 variant 与 Shadow DOM 隔离模式 ([8ad56d0](https://github.com/ruan-cat/SmallAliceWeb/commit/8ad56d0))
- **ai-vue:** AiChatFloatingButton 透传 variant 给内嵌 AiChat ([3f6050e](https://github.com/ruan-cat/SmallAliceWeb/commit/3f6050e))
- **ai-vue:** 扩展 AiChat 类型支持富聊天体验（P3 一段） ([32432a3](https://github.com/ruan-cat/SmallAliceWeb/commit/32432a3))
- **ai-vue:** 新增 AiChat 四个 P3 富聊天子部件 ([f81374f](https://github.com/ruan-cat/SmallAliceWeb/commit/f81374f))
- **ai-vue:** 新增 useChatEvents 事件聚合 composable ([5c63a63](https://github.com/ruan-cat/SmallAliceWeb/commit/5c63a63))
- **ai-vue:** AiChat 与 AiChatFloatingButton 集成 P3 子部件与事件 ([b7c7d32](https://github.com/ruan-cat/SmallAliceWeb/commit/b7c7d32))
- **ai-vue:** P3.5 扩展 types.ts 新增 BuiltinItemType / SearchResultData / itemType + data 字段 ([708dd36](https://github.com/ruan-cat/SmallAliceWeb/commit/708dd36))
- **ai-vue:** P3.5 实现 SearchResultCard 与 SourceListCard 内置结构化卡片 ([811d6e8](https://github.com/ruan-cat/SmallAliceWeb/commit/811d6e8))
- **ai-vue:** P3.5 AiChat #content slot 接入 itemType 分发逻辑 ([0b7b38d](https://github.com/ruan-cat/SmallAliceWeb/commit/0b7b38d))
- **ai-vue:** P3.5 index.ts 导出 SearchResultCard / SourceListCard 与新增类型 ([71bb322](https://github.com/ruan-cat/SmallAliceWeb/commit/71bb322))
- **ai-vue:** P4 新增 AiSidebarChat 侧边栏容器组件 ([a00be6c](https://github.com/ruan-cat/SmallAliceWeb/commit/a00be6c))
- **ai-vue:** P4 新增 AiModalChat 模态弹窗容器组件 ([83b7b3d](https://github.com/ruan-cat/SmallAliceWeb/commit/83b7b3d))
- **ai-vue:** P4 index.ts 导出 AiSidebarChat / AiModalChat / mountAiChat 与安装注册 ([bded4ca](https://github.com/ruan-cat/SmallAliceWeb/commit/bded4ca))
- **ai-rag-api:** CC-4 接线 contracts/chat.ts 接入 pageContext 与 buildSystemPrompt ([65c6ee0](https://github.com/ruan-cat/SmallAliceWeb/commit/65c6ee0))
- **ai-vue:** P3 事件系统新增 response-metadata 事件类型（FC-3 第 1~2 步） ([4840826](https://github.com/ruan-cat/SmallAliceWeb/commit/4840826))
- **ai-vitepress-plugins:** FC-3 useKnowledgeChat 测量 firstChunkAt + 透传 onChatEvent 回调 ([ac6052b](https://github.com/ruan-cat/SmallAliceWeb/commit/ac6052b))
- **ai-vitepress-plugins:** FC-5 conversationId 追溯语义固化 + 历史 chat.append 类型修复 ([deedda7](https://github.com/ruan-cat/SmallAliceWeb/commit/deedda7))
- **ai-vitepress-plugins:** FC-1 页面上下文采集与透传（PageContext 链路打通） ([664de2a](https://github.com/ruan-cat/SmallAliceWeb/commit/664de2a))
- **ai-vue:** FC-4 FeedbackPayload 类型扩展 + useChatEvents.emitFeedback 接受 conversationId ([be49e13](https://github.com/ruan-cat/SmallAliceWeb/commit/be49e13))
- **ai-vue:** FC-4 AiChat handleFeedbackSubmit 附加 conversationId 默认 'knowledge-chat' ([dbd35a7](https://github.com/ruan-cat/SmallAliceWeb/commit/dbd35a7))
- **ai-rag-api:** MS-1 注册表 label + GET /v1/models ([baf3663](https://github.com/ruan-cat/SmallAliceWeb/commit/baf3663))
- **ai-rag-api:** MS-2 chat provider 白名单 + 双 adapter 分发 ([3a156c7](https://github.com/ruan-cat/SmallAliceWeb/commit/3a156c7))
- **ai-vitepress-plugins:** MS-3 useKnowledgeChat 模型切换接线 ([4c03800](https://github.com/ruan-cat/SmallAliceWeb/commit/4c03800))
- **ai-vue:** MS-4 AiChat 模型选择器 UI + types 扩展 ([e7fada3](https://github.com/ruan-cat/SmallAliceWeb/commit/e7fada3))
- **ai-rag-api:** EV-1 evaluation_runs 表与迁移 0005 ([2c231e1](https://github.com/ruan-cat/SmallAliceWeb/commit/2c231e1))
- **ai-rag-api:** EV-2 评估运行仓储与三 CLI 脚本落库接线 ([8276494](https://github.com/ruan-cat/SmallAliceWeb/commit/8276494))
- **ai-rag-api:** EV-3 评估运行只读两枚接口 ([2a71421](https://github.com/ruan-cat/SmallAliceWeb/commit/2a71421))
- **ai-vue:** 收敛 useThemeColor 运行时主题通道至 P1.5 规格契约 ([ceab2ca](https://github.com/ruan-cat/SmallAliceWeb/commit/ceab2ca))

### 🐞 修复缺陷

- **ai-vue-doc:** 修复本地 dev 四层故障与 SSR 兼容 ([c7980d8](https://github.com/ruan-cat/SmallAliceWeb/commit/c7980d8))
- **ai-vue-doc:** 回退 Linux nitro traceInclude 分支避免 nft 硬错误 ([ab78c80](https://github.com/ruan-cat/SmallAliceWeb/commit/ab78c80))
- **ai-vue:** 修正 mock 模式发送事件 id 求值时机回归 ([c6c967c](https://github.com/ruan-cat/SmallAliceWeb/commit/c6c967c))
- **ai-vitepress-plugins:** MS-3 loadModels 跳过守卫误伤生产场景 ([7a81799](https://github.com/ruan-cat/SmallAliceWeb/commit/7a81799))
- **ai-rag-api:** Evaluation_runs 仓储 jsonb 参数改原生对象姿势 ([162e029](https://github.com/ruan-cat/SmallAliceWeb/commit/162e029))
- **ai-rag-api:** Parameter 评估脚本 TEMP TABLE 补 search_text 列 ([fd0f776](https://github.com/ruan-cat/SmallAliceWeb/commit/fd0f776))
- **ai-vue:** 反馈回调参数类型裂缝（TS 严格模式实测修复） ([abd9e65](https://github.com/ruan-cat/SmallAliceWeb/commit/abd9e65))
- **ai-rag-api:** 修复 sync-runs 接口生产 500 ([9f55ba0](https://github.com/ruan-cat/SmallAliceWeb/commit/9f55ba0))
- **ai-vitepress-plugins:** 修正 Teek 桥接色阶 fallback 链与暗色覆盖断言 ([18e4534](https://github.com/ruan-cat/SmallAliceWeb/commit/18e4534))

### 🦄 代码重构

- **ai-vue:** Sender 迁移为 XSender 适配 v2 API ([e5dbe6d](https://github.com/ruan-cat/SmallAliceWeb/commit/e5dbe6d))

### 📖 Documentation

- **ai-rag-phase3:** 归档变更并同步主规范 ([bc4b940](https://github.com/ruan-cat/SmallAliceWeb/commit/bc4b940))
- **prompts:** 标记 phase3 沟通任务完成 ([d5c0ea6](https://github.com/ruan-cat/SmallAliceWeb/commit/d5c0ea6))
- 补全 016 任务标题并附调研报告 PR 链接 ([148b930](https://github.com/ruan-cat/SmallAliceWeb/commit/148b930))
- **memory:** 记录冗余 main-sync worktree 事故纠偏经验 ([429ad71](https://github.com/ruan-cat/SmallAliceWeb/commit/429ad71))
- **prompts:** 记录 017 main-sync worktree 纠偏任务指令 ([4deecf6](https://github.com/ruan-cat/SmallAliceWeb/commit/4deecf6))
- 记录 biome 移除决策闭环 ([994902b](https://github.com/ruan-cat/SmallAliceWeb/commit/994902b))
- **record:** 沉淀 ai-vue-doc 本地 dev 修复事故案例 ([a4d60fb](https://github.com/ruan-cat/SmallAliceWeb/commit/a4d60fb))
- **record:** 事故报告补充 Vercel 部署故障续章 ([a8170d0](https://github.com/ruan-cat/SmallAliceWeb/commit/a8170d0))
- **prompts:** 任务台账 018 闭环并新增 019/020 任务位 ([34d2ffb](https://github.com/ruan-cat/SmallAliceWeb/commit/34d2ffb))
- **record:** 事故报告补充生产验证结果补遗 ([81f12e2](https://github.com/ruan-cat/SmallAliceWeb/commit/81f12e2))
- **changelog:** 新增子包发布变更日志文档 ([50531c4](https://github.com/ruan-cat/SmallAliceWeb/commit/50531c4))
- **prompts:** 任务台账新增 020 调研任务与 021 占位 ([9a3c37c](https://github.com/ruan-cat/SmallAliceWeb/commit/9a3c37c))
- **reports:** 调研 inkeep/agents 仓库子包结构与 AI 智能客服增强价值 ([#30](https://github.com/ruan-cat/SmallAliceWeb/pull/30))
- **prompts:** 任务台账记录 learn-agents-ui 云端沟通与本地接力指令 ([76e9972](https://github.com/ruan-cat/SmallAliceWeb/commit/76e9972))
- **reports:** Spec/plan 新增 vue-element-plus-x v2 升级评估与 P0 实施方案 ([3530df8](https://github.com/ruan-cat/SmallAliceWeb/commit/3530df8))
- **reports:** 新增 docs-assistant 对标分析与升级方案报告 ([cbc527d](https://github.com/ruan-cat/SmallAliceWeb/commit/cbc527d))
- **prompts:** 分离入库 prompts 与 learn-agents-ui 调研文档 ([79f71ce](https://github.com/ruan-cat/SmallAliceWeb/commit/79f71ce))
- **prompts:** 任务台账记录路线约束与四组方案拍板指令 ([225eb58](https://github.com/ruan-cat/SmallAliceWeb/commit/225eb58))
- **reports:** 重调研报告路线修订与 README 评估封印及 D/E 探索笔记 ([1fcf6ec](https://github.com/ruan-cat/SmallAliceWeb/commit/1fcf6ec))
- **reports:** Spec/plan 落档五组方案与执行运行手册 ([6664824](https://github.com/ruan-cat/SmallAliceWeb/commit/6664824))
- **openspec:** 新增 chat 上下文与模型切换变更包（CC-0/MS-0） ([4d31fc7](https://github.com/ruan-cat/SmallAliceWeb/commit/4d31fc7))
- **openspec:** 修订 R1 场景分层矛盾并加固 R10/R11 语义 ([ffd2e76](https://github.com/ruan-cat/SmallAliceWeb/commit/ffd2e76))
- **plan:** 更新 19.6 进度总表（P0 全组与 P1-1..3、CC-0/MS-0 完成） ([2e95dd5](https://github.com/ruan-cat/SmallAliceWeb/commit/2e95dd5))
- **plan:** 标记 19.6 总表 P1.5「Teek 主题色桥接 + useThemeColor」为已完成 ([e3d6e01](https://github.com/ruan-cat/SmallAliceWeb/commit/e3d6e01))
- **plan:** 标记 19.6 总表 P2「Shadow DOM 样式隔离」为已完成 ([6a06954](https://github.com/ruan-cat/SmallAliceWeb/commit/6a06954))
- **plan:** 标记 19.6 总表 P3「富聊天体验增强」为已完成 ([17e3a16](https://github.com/ruan-cat/SmallAliceWeb/commit/17e3a16))
- **plan:** 标记 19.6 总表 P3.5「DataComponent 结构化卡片」为已完成 ([4c41617](https://github.com/ruan-cat/SmallAliceWeb/commit/4c41617))
- **plan:** 标记 19.6 总表 P4「组件形态扩展 + 函数式嵌入」6 行全部为已完成 ([0b63a3a](https://github.com/ruan-cat/SmallAliceWeb/commit/0b63a3a))
- **plan:** 标记 19.6 总表 CC-1~CC-5「ContextConfig 动态上下文改造」5 行全部为已完成 ([4f9734a](https://github.com/ruan-cat/SmallAliceWeb/commit/4f9734a))
- **plan:** 标记 19.6 总表 FC-2「provider 无关契约矩阵」为已完成 ([fb4db4b](https://github.com/ruan-cat/SmallAliceWeb/commit/fb4db4b))
- **plan:** 标记 19.6 总表 FC-3「客户端 TTFT 与 response-metadata 事件」为已完成 ([9344053](https://github.com/ruan-cat/SmallAliceWeb/commit/9344053))
- **plan:** 标记 19.6 总表 FC-5「conversationId 追溯语义固化」为已完成 ([fe2daa5](https://github.com/ruan-cat/SmallAliceWeb/commit/fe2daa5))
- **spec,plan:** 补录「Agent Browser 实测方法学」与对应 plan 实测清单章节 ([e268d10](https://github.com/ruan-cat/SmallAliceWeb/commit/e268d10))
- **evidence:** 补录 P3 / FC-3 / FC-5 浏览器实测证据 + P3.5/P4 限制说明 ([f5f02b9](https://github.com/ruan-cat/SmallAliceWeb/commit/f5f02b9))
- **plan+evidence:** 标记 19.6 总表 FC-1 为已完成 + 浏览器证据文件补录 ([0f0f8c9](https://github.com/ruan-cat/SmallAliceWeb/commit/0f0f8c9))
- **report:** 收尾 FC-4 反馈载荷关联的 plan 总表与浏览器证据 ([c3064c5](https://github.com/ruan-cat/SmallAliceWeb/commit/c3064c5))
- **report:** MS-1/MS-2 浏览器证据 + plan 总表 ✅ ([fd0d224](https://github.com/ruan-cat/SmallAliceWeb/commit/fd0d224))
- **report:** MS-3/MS-4 浏览器证据 + plan 总表 ✅ ([2fe0872](https://github.com/ruan-cat/SmallAliceWeb/commit/2fe0872))
- **report:** MS-3 行更新 hot 修复产出 + Chrome 实测证据 ([4aabf56](https://github.com/ruan-cat/SmallAliceWeb/commit/4aabf56))
- **openspec:** SY-0 新增 GA 知识库同步调度变更包 ([fbb80b5](https://github.com/ruan-cat/SmallAliceWeb/commit/fbb80b5))
- **report:** EV 四行更新产出摘要 + 接口运行时实测证据 ([9150c63](https://github.com/ruan-cat/SmallAliceWeb/commit/9150c63))
- **plan:** 19.6 总表 SY-0/SY-1 行更新产出摘要 ([6381cde](https://github.com/ruan-cat/SmallAliceWeb/commit/6381cde))
- **report:** SY-2 Secrets 落位 + SY-3 首跑实机验证 ([c9c0a81](https://github.com/ruan-cat/SmallAliceWeb/commit/c9c0a81))
- **report:** EV/SY 遗留事项补做回填 + GA 同步假绿口径修正 ([5723166](https://github.com/ruan-cat/SmallAliceWeb/commit/5723166))
- **plan+evidence:** 单文件增量断言正式取消（用户决策 2026-09-29 22:10） ([c17128c](https://github.com/ruan-cat/SmallAliceWeb/commit/c17128c))
- **report:** Chunk embedding 模型、额度消耗与批量频度分析 ([b0bb0b1](https://github.com/ruan-cat/SmallAliceWeb/commit/b0bb0b1))
- **about+readme:** RAG embedding 命令、耗时与额度消耗文档化 ([2e8adcf](https://github.com/ruan-cat/SmallAliceWeb/commit/2e8adcf))
- **report+plan:** E 笔记错误断言修正 + 非功能验收未实测批注 ([2d21570](https://github.com/ruan-cat/SmallAliceWeb/commit/2d21570))
- **decision:** 知识源分发拍板方案 C——本地 CLI 为主手动低频更新 ([231de2b](https://github.com/ruan-cat/SmallAliceWeb/commit/231de2b))
- **plan+archive:** Openspec 工件清退——两变更包合并归档至 plan 体系 ([ff8f981](https://github.com/ruan-cat/SmallAliceWeb/commit/ff8f981))
- **prompt:** 021 任务标记完成并追加 learn-agents-ui 推进上下文 ([6d71e2e](https://github.com/ruan-cat/SmallAliceWeb/commit/6d71e2e))
- **prompt:** 新增 022 UI 改造任务与 023 占位 ([d717ba9](https://github.com/ruan-cat/SmallAliceWeb/commit/d717ba9))
- **prompt:** 019 修复接口错误标记为已完成 ([98506ca](https://github.com/ruan-cat/SmallAliceWeb/commit/98506ca))
- **fix-bug:** 沉淀 sync-runs reserved executor 500 事故经验 ([2b32773](https://github.com/ruan-cat/SmallAliceWeb/commit/2b32773))
- **plan:** P1.5 台账补充收敛修订与浏览器验收证据 ([c23f165](https://github.com/ruan-cat/SmallAliceWeb/commit/c23f165))
- 补全 023 任务并固化 agent browser 操作纪律 ([02ef3d9](https://github.com/ruan-cat/SmallAliceWeb/commit/02ef3d9))
- **agents:** 新增 agent-browser 使用纪律 ([d2be747](https://github.com/ruan-cat/SmallAliceWeb/commit/d2be747))
- **reports:** Agent-browser MCP 故障调研报告 ([8784c2f](https://github.com/ruan-cat/SmallAliceWeb/commit/8784c2f))
- **reports:** SY-3 按方案 C 收官并同步 spec/plan/证据文档 ([f5af21c](https://github.com/ruan-cat/SmallAliceWeb/commit/f5af21c))
- 023 任务追加技能资产边界与 agent browser 能力测试要求 ([a97753a](https://github.com/ruan-cat/SmallAliceWeb/commit/a97753a))
- **openspec:** 新建 2026-10-31-ai-rag-phase4 RAG 质量闭环升级规划 ([4da6c8a](https://github.com/ruan-cat/SmallAliceWeb/commit/4da6c8a))
- **openspec:** Phase4 任务清单与 do-long-task 长任务执行约定 ([56bc046](https://github.com/ruan-cat/SmallAliceWeb/commit/56bc046))
- **openspec:** 预建 phase4 长任务固定产物 agent-progress 与 agent-findings ([c707081](https://github.com/ruan-cat/SmallAliceWeb/commit/c707081))
- 标记 023 任务已完成 ([08154b7](https://github.com/ruan-cat/SmallAliceWeb/commit/08154b7))

### 🔨 构建相关

- **ai-vue-doc:** 固化构建堆参数并补齐 cross-env 与 sharp ([c3db7bf](https://github.com/ruan-cat/SmallAliceWeb/commit/c3db7bf))
- **tsconfig:** 启用 TS 增量编译以降低 tsserver 内存占用 ([dd8300b](https://github.com/ruan-cat/SmallAliceWeb/commit/dd8300b))
- 升级 packageManager 到 pnpm@12.4.1 ([c161561](https://github.com/ruan-cat/SmallAliceWeb/commit/c161561))
- **ai-vue:** P4 新增 mount.ts 函数式入口与多入口构建 ([19fbd0b](https://github.com/ruan-cat/SmallAliceWeb/commit/19fbd0b))

### 🏡 Chore

- Gitignore 忽略 \*.tsbuildinfo 增量编译缓存 ([1cc3ea6](https://github.com/ruan-cat/SmallAliceWeb/commit/1cc3ea6))
- **repo:** 忽略 .zcode/ 本地数据目录 ([06b5d8e](https://github.com/ruan-cat/SmallAliceWeb/commit/06b5d8e))
- 记录提示词进度 ([296149b](https://github.com/ruan-cat/SmallAliceWeb/commit/296149b))

### ✅ Tests

- **ai-vue:** 新增主题模块单元测试并补齐覆盖率工具 ([5d24da4](https://github.com/ruan-cat/SmallAliceWeb/commit/5d24da4))
- **ai-vue:** 覆盖 useThemeColor 运行时通道与 useBrandTheme 协同 ([65f5409](https://github.com/ruan-cat/SmallAliceWeb/commit/65f5409))
- **ai-vue:** 覆盖 AiShadowRoot attachShadow / styles / SSR 降级 ([6a8b67a](https://github.com/ruan-cat/SmallAliceWeb/commit/6a8b67a))
- **ai-vue:** 覆盖 P3 子部件与 useChatEvents ([8cf34d7](https://github.com/ruan-cat/SmallAliceWeb/commit/8cf34d7))
- **ai-vue:** P3.5 覆盖 SearchResultCard / SourceListCard 与 AiChat itemType 分发 ([bb669eb](https://github.com/ruan-cat/SmallAliceWeb/commit/bb669eb))
- **ai-vue:** P4 覆盖 AiSidebarChat / AiModalChat / mountAiChat 三件套 ([f1e59ae](https://github.com/ruan-cat/SmallAliceWeb/commit/f1e59ae))
- **ai-rag-api:** CC-5 补全 chat.test.ts 三态 pageContext 入站校验回归 ([2e8bc6e](https://github.com/ruan-cat/SmallAliceWeb/commit/2e8bc6e))
- **ai-vitepress-plugins:** FC-2 新增 data stream 错误帧（3:）传播与 clearError 恢复用例 ([2ccfc6c](https://github.com/ruan-cat/SmallAliceWeb/commit/2ccfc6c))
- **ai-vue:** FC-4 反馈载荷 conversationId 注入覆盖 ([ee42cd6](https://github.com/ruan-cat/SmallAliceWeb/commit/ee42cd6))
- **ai-rag-api:** EV-4 评估运行 19 用例覆盖 ([71a075d](https://github.com/ruan-cat/SmallAliceWeb/commit/71a075d))

### 🎨 Styles

- **ai-plugins:** 桥接 Teek 主题色变量并补充 html.dark 暗色覆盖 ([1f4ea03](https://github.com/ruan-cat/SmallAliceWeb/commit/1f4ea03))
- **ai-plugins:** Docs 启用 container-with-shadow 默认隔离模式 ([2ee82f1](https://github.com/ruan-cat/SmallAliceWeb/commit/2ee82f1))
- **ai-rag-api:** Prettier 重排同步服务源文件与测试基线 ([425120f](https://github.com/ruan-cat/SmallAliceWeb/commit/425120f))

### 🤖 CI

- **prettier:** 新增云端 PR Prettier 格式化工作流 ([7ac3f95](https://github.com/ruan-cat/SmallAliceWeb/commit/7ac3f95))
- Ci.yaml 迁移到 pnpm/setup 并清理 corepack 死代码 ([2b53b99](https://github.com/ruan-cat/SmallAliceWeb/commit/2b53b99))
- 移除 corepack 预设安装行为适配 pnpm 12 ([b6ea70d](https://github.com/ruan-cat/SmallAliceWeb/commit/b6ea70d))
- **workflow:** SY-1 新增 RAG 知识库同步双触发调度 ([05a0678](https://github.com/ruan-cat/SmallAliceWeb/commit/05a0678))
- **rag-sync:** 调度工作流保留空转留档并修正头注释 ([f277d3c](https://github.com/ruan-cat/SmallAliceWeb/commit/f277d3c))

### 🔧 更新配置

- 关闭 auto-install-peers 防止 biome optional peer 回装 ([10c1dd5](https://github.com/ruan-cat/SmallAliceWeb/commit/10c1dd5))
- **root:** ⚠️ 更新配置。因为 pnpm12 无法识别全局包。 ([17c4670](https://github.com/ruan-cat/SmallAliceWeb/commit/17c4670))
- **docs:** MS-3 dev 联调新增 /v1 同源代理 ([195d319](https://github.com/ruan-cat/SmallAliceWeb/commit/195d319))
- 移除本地文档 dev 脚本的自开浏览器行为 ([2a17d92](https://github.com/ruan-cat/SmallAliceWeb/commit/2a17d92))

#### ⚠️ Breaking Changes

- **root:** ⚠️ 更新配置。因为 pnpm12 无法识别全局包。 ([17c4670](https://github.com/ruan-cat/SmallAliceWeb/commit/17c4670))

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## v3.7.3

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/@ruan-cat-drill-doc/ai-rag-core@0.1.0...v3.7.3)

## @ruan-cat-drill-doc/ai-rag-core@0.1.0 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-rag-core@0.1.0)

### ✨ 新增功能

- **rag-core:** 完善结构化分块与 embedding 文本 ([3f73a81](https://github.com/ruan-cat/SmallAliceWeb/commit/3f73a81))

  将标题路径、父块关系、FAQ/代码原子块和句子边界 overlap 纳入统一 chunk 合同，并提供排除图片地址的确定性 embedding 文本。这样同步与检索可以共享同一份结构化语料语义。

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## @ruan-cat-drill-doc/ai-vitepress-plugins@0.0.1 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-vitepress-plugins@0.0.1)

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## @ruan-cat-drill-doc/ai-vue@0.0.1 (2026-08-31)

[compare changes](https://github.com/ruan-cat/SmallAliceWeb/compare/b3f0d67...@ruan-cat-drill-doc/ai-vue@0.0.1)

### 🔧 更新配置

- **packages:** 开放可发布子包的版本管理 ([239d557](https://github.com/ruan-cat/SmallAliceWeb/commit/239d557))

  移除 ai-vue、ai-vitepress-plugins 和 ai-rag-core 的 private 标记，使 relizy release:sub 能识别并独立升级这些库包。应用、Nitro 服务、临时工具和根包继续保持私有。

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))
