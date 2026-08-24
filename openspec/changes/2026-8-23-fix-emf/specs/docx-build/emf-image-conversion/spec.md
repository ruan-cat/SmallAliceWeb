## MODIFIED Requirements

### Requirement: EMF 内嵌文本的字体保障

EMF 内嵌文本 MUST 通过随包注册的中文字体与字体族映射完成渲染，MUST NOT 因 Vercel 构建容器缺少系统中文字体而产生整段空白或豆腐块。随包字体的字形集合 MUST 覆盖该版本记录的 EMF 正文字符集合，且该覆盖关系 MUST 由自动化校验验证。

#### Scenario: 容器内中文文本渲染

- **WHEN** EMF 记录中的文本使用宋体、Calibri 等 Office/中文字体，且运行环境（Vercel 构建容器）未安装任何中文字体
- **THEN** 通过随包携带的 OFL 字体文件完成 `GlobalFonts.registerFromPath` 注册，并以 `fontFamilyMap` 小写键映射到注册字体完成渲染
- **AND** 转换产物中的中文文本不出现整片空白或豆腐块

#### Scenario: 容器内已知中文与 Office 字体文本渲染

- **WHEN** EMF 记录中的文本使用宋体、黑体、微软雅黑、Calibri、Tahoma、Franklin Gothic Book 或 Segoe UI，且运行环境（Vercel 构建容器）未安装任何中文字体
- **THEN** 转换使用随包携带并已注册的 OFL 字体完成渲染
- **AND** 产物中的中文文本不出现整片空白或豆腐块

#### Scenario: 未预先列举的字体名使用兼容兜底

- **WHEN** EMF 记录声明的字体族不在显式映射表中
- **THEN** 转换使用已注册的兼容中文字体作为该字体族的回退
- **AND** 对于随包字体已覆盖的字符，PNG 文本不因字体族未映射而丢失

#### Scenario: 已记录 EMF 正文字形完整覆盖

- **WHEN** 更新随包字体资产或其字符清单
- **THEN** 自动化测试校验记录的 EMF 正文字符集合是字体 cmap 的子集
- **AND** 校验发现任一缺字时失败，阻止将不完整的字体资产作为通过状态

#### Scenario: GDI 逐字符文本定位

- **WHEN** `EMR_EXTTEXTOUTW` 提供有效的 `offDx` 字符 advance 数组
- **THEN** 转换按每个 UTF-16 字符的 X advance 绘制文本
- **AND** 当 `ETO_PDY` 存在时，同步应用每字符的 Y advance
- **AND** 文本标签不因整串绘制而重叠、错位或脱离对应图形框

#### Scenario: mapping-mode 文本与图形对齐

- **WHEN** EMF 通过 `SetWindowOrg/SetWindowExt` 进入 mapping mode，且 header `rclBounds.left/top` 非零
- **THEN** 文本与普通图形使用相同的裁剪原点
- **AND** 带 world transform 的文本不在 PNG 内产生固定 X/Y 偏移或被裁切

#### Scenario: Glyph index 文本可读

- **WHEN** `EMR_EXTTEXTOUTW` 设置 `ETO_GLYPH_INDEX`
- **THEN** 已记录的 source faceName 与 glyph id 使用受版本控制的 Unicode 映射绘制
- **AND** 图内标点和逻辑符号不显示为豆腐块或占位符

#### Scenario: 生产容器产物视觉验收

- **WHEN** 字体映射或字体资产变更部署至生产文档站点
- **THEN** 验收抽查 009 对应图像及至少五张包含中文 EMF 文本的样本
- **AND** 抽查结论以生产容器生成的 PNG 为准，不以 Windows 本地系统字体回退结果替代

#### Scenario: 字体注册失败不中断构建

- **WHEN** 字体文件缺失或注册失败
- **THEN** 构建输出警告并继续处理后续文档
- **AND** 该失败只影响相关图片文字渲染质量，不构成整次构建失败

### Requirement: SVG 输出 POC 必须保留真实矢量语义与 PNG 兼容路径

转换模块 MUST 为 EMF/WMF 提供 SVG 输出，并将文档转换链中的 EMF/WMF 图片落盘为 `.svg`。SVG MUST 使用由真实 SVG 图元组成的根 `<svg>`，MUST NOT 仅用单张全画布 PNG 作为 SVG 内容。源 EMF 自带 DIB、位图或嵌入图片时，转换 MAY 使用局部 SVG `<image>` 表达该原始位图内容。既有显式 PNG API MUST 保留，供回归和非 EMF 图像分支使用。

#### Scenario: SVG POC 生成真实混合矢量输出

- **WHEN** 调用方显式请求 EMF/WMF 的 SVG POC 输出
- **THEN** 转换返回 MIME 为 `image/svg+xml` 的非空 SVG 数据
- **AND** SVG 具有根 `<svg>`、有效 viewBox，且至少保留输入图中可表达的路径、文字或裁剪图元
- **AND** 输出不得退化成唯一一个覆盖完整画布的 PNG `<image>`

#### Scenario: SVG 默认转换不改变非 EMF 图片和显式 PNG API

- **WHEN** 调用方处理 PNG/JPEG 等非 EMF 图片，或显式调用 PNG 转换 API
- **THEN** 输出仍是通过 PNG 文件签名校验的 PNG Buffer
- **AND** SVGCanvas、SVG 导出器或文字轮廓化设置不得污染显式 PNG 主画布和 DIB 临时 Raster Canvas

#### Scenario: 真实文本布局 fixture 在 SVG 中不退化

- **WHEN** SVG POC 转换包含 `offDx`、mapping-mode 或 `ETO_GLYPH_INDEX` 的真实 EMF fixture
- **THEN** `offDx`/`ETO_PDY` 的每字符定位、frame 尺寸和已映射 glyph 文本保持与 PNG 回归约束一致
- **AND** 浏览器渲染后的 SVG 不得因合并整串文本、重复扣减裁剪原点或把 glyph id 当 Unicode 而出现已知错位或乱码

#### Scenario: 高风险类别不静默宣称 SVG 保真

- **WHEN** 全量审计发现 ROP2、复杂裁剪、EMF+ DrawDriverString 或递归内嵌 metafile
- **THEN** 审计记录该类别和真实输入标识，并以 Windows GDI+ 对照或明确 PNG 回退结论处置
- **AND** 不得因为 SVG 文件可以解析或浏览器可以加载，就将该类别标记为质量通过
