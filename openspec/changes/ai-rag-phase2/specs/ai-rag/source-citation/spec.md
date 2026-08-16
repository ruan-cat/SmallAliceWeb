## Purpose

定义二期 AI RAG 来源溯源的行为契约：确定性标题锚点生成、sourceUrl 派生映射、来源卡片跳转与 VitePress 构建期锚点注入，保证来源链接在 Markdown 渲染器 slug 规则变化时依然稳定、可跳转、可回退。

## ADDED Requirements

### Requirement: 1. 确定性标题锚点

系统 MUST 为每个 H1/H2/H3 生成确定性锚点 rag-heading-<digest>，digest 为 sourcePath、完整 headingPath 与 headingIndex 以 "\u0000" 分隔拼接后计算的 SHA-256 base64url 摘要；无标题根块 MUST 使用 rag-document-<sourcePath-digest> 且 headingIndex 为 -1；同一父级下的同名标题 MUST 生成不同锚点；锚点 MUST NOT 依赖 Markdown 渲染器默认的标题 slug 规则。

#### Scenario: 有标题内容生成确定性锚点

- **WHEN** 为 H1/H2/H3 标题下的内容生成锚点
- **THEN** 锚点 MUST 为 "rag-heading-" 前缀加 SHA-256 base64url 摘要
- **AND** 摘要 MUST 由 sourcePath、完整 headingPath 与 headingIndex 以 "\u0000" 分隔拼接后计算

#### Scenario: 无标题根块使用文档级锚点

- **WHEN** 内容不属于任何标题（无标题根块）
- **THEN** headingIndex MUST 为 -1
- **AND** 锚点 MUST 为 "rag-document-" 加 sourcePath 摘要

#### Scenario: 同名标题生成不同锚点

- **WHEN** 同一父级下存在同名标题
- **THEN** 每个标题 MUST 生成互不相同的锚点

#### Scenario: 不依赖渲染器默认 slug

- **WHEN** 生成标题锚点
- **THEN** MUST NOT 依赖 Markdown 渲染器默认的标题 slug 规则

### Requirement: 2. 来源 URL 映射

sourceUrl MUST 由 sourcePath 派生：移除 "docs/" 前缀、将 ".md" 替换为 ".html"、并对每个路径段进行 URL 编码；sourceUrl 是展示字段，MUST NOT 作为数据库中的环境相关持久化数据。

#### Scenario: sourceUrl 由 sourcePath 派生

- **WHEN** 需要展示来源地址
- **THEN** sourceUrl MUST 移除 "docs/" 前缀并将 ".md" 替换为 ".html"
- **AND** 每个路径段 MUST 经过 URL 编码

#### Scenario: sourceUrl 不作为持久化数据

- **WHEN** 数据入库或读取
- **THEN** sourceUrl MUST NOT 作为数据库中的环境相关持久化数据存储

### Requirement: 3. 来源跳转

来源卡片链接 MUST 为 sourceUrl#headingAnchor；无标题根块（headingIndex 为 -1）的链接 MUST NOT 附加 hash，直接打开文档顶部；页面加载后锚点元素存在时 MUST 跳转到锚点，不存在时 MUST 显式回退到文档顶部；系统 MUST NOT 新增从数据库读取 Markdown 的来源阅读器或 Nitro 来源路由。

#### Scenario: 来源卡片链接格式

- **WHEN** 展示有标题来源的来源卡片
- **THEN** 链接 MUST 为 sourceUrl#headingAnchor

#### Scenario: 无标题根块不附加 hash

- **WHEN** 来源的 headingIndex 为 -1（无标题根块）
- **THEN** 链接 MUST NOT 附加 hash
- **AND** 点击链接 MUST 直接打开文档顶部

#### Scenario: 锚点存在与缺失回退

- **WHEN** 页面加载后锚点元素存在
- **THEN** 浏览器 MUST 跳转到该锚点
- **AND** 锚点元素不存在时 MUST 显式回退到文档顶部

#### Scenario: 禁止数据库来源阅读器

- **WHEN** 实现来源内容展示
- **THEN** MUST NOT 新增从数据库读取 Markdown 的来源阅读器
- **AND** MUST NOT 新增 Nitro 来源路由

### Requirement: 4. VitePress 构建期注入

VitePress 构建 MUST 使用与知识 chunk 相同的 AST 与 headingPath/headingIndex 算法，为每个 H1/H2/H3 写入 headingAnchor 作为 DOM id；锚点注入 MUST NOT 依赖 VitePress 默认标题 slug。

#### Scenario: 构建期为每个标题写入锚点 id

- **WHEN** VitePress 构建 Markdown 页面
- **THEN** 每个 H1/H2/H3 MUST 被写入 headingAnchor 作为 DOM id
- **AND** 锚点计算 MUST 与知识 chunk 使用相同的 AST 与 headingPath/headingIndex 算法

#### Scenario: 不依赖 VitePress 默认 slug

- **WHEN** 构建期注入标题锚点
- **THEN** MUST NOT 依赖 VitePress 默认标题 slug 规则
