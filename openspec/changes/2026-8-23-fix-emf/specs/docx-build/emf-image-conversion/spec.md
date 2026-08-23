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

#### Scenario: 生产容器产物视觉验收

- **WHEN** 字体映射或字体资产变更部署至生产文档站点
- **THEN** 验收抽查 009 对应图像及至少五张包含中文 EMF 文本的样本
- **AND** 抽查结论以生产容器生成的 PNG 为准，不以 Windows 本地系统字体回退结果替代

#### Scenario: 字体注册失败不中断构建

- **WHEN** 字体文件缺失或注册失败
- **THEN** 构建输出警告并继续处理后续文档
- **AND** 该失败只影响相关图片文字渲染质量，不构成整次构建失败
