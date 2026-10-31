## MODIFIED Requirements

### Requirement: 3. 来源跳转

来源卡片链接 MUST 为 sourceUrl#headingAnchor；无标题根块（headingIndex 为 -1）的链接 MUST NOT 附加 hash，直接打开文档顶部；页面加载后锚点元素存在时 MUST 跳转到锚点，不存在时 MUST 显式回退到文档顶部；前端 SHALL 把答案内 `[来源N]` 引用编号渲染为可点击锚点，点击 SHALL 能到达对应来源，并 SHALL 展示来源标题与内容片段；前端呈现补强 MUST 以现有 sources 字段与渲染现状的核实为基础，缺什么补什么，MUST NOT 重写已有渲染；系统 MUST NOT 新增从数据库读取 Markdown 的来源阅读器或 Nitro 来源路由。

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

#### Scenario: 答案内引用渲染为可点击锚点

- **WHEN** 答案文本包含 `[来源N]` 引用编号
- **THEN** 前端 SHALL 将该编号渲染为可点击锚点
- **AND** 点击锚点 SHALL 到达对应来源位置（sourceUrl#headingAnchor）

#### Scenario: 来源标题与片段展示

- **WHEN** 展示答案内引用对应的来源
- **THEN** 前端 SHALL 展示来源标题与内容片段
- **AND** 展示数据 SHALL 来自响应 sources 字段，MUST NOT 依赖新增的数据库读取

## ADDED Requirements

### Requirement: 5. 模型上下文来源标识

传给聊天模型的检索上下文 MUST 包含可定位的来源标识：每个片段 SHALL 携带 `sourcePath`、标题路径与 chunk 定位信息（如 `chunkIndex`/`headingAnchor`），使模型输出的 `[来源N]` 来源标注可被对照检测（来源标注幻觉可检测）；来源标识的注入 MUST NOT 改变片段正文内容与检索排序。

#### Scenario: 上下文携带来源标识

- **WHEN** 组装传给模型的检索上下文
- **THEN** 每个片段 MUST 携带可定位的来源标识（`sourcePath`、标题路径与 chunk 定位）
- **AND** 片段正文与检索排序 MUST NOT 因注入来源标识而改变

#### Scenario: 来源标注可对照检测

- **WHEN** 模型在答案中输出 `[来源N]` 标注
- **THEN** 系统 SHALL 能将编号对照到上下文中携带来源标识的对应片段
- **AND** 标注指向与实际片段不符时 SHALL 可被检测
