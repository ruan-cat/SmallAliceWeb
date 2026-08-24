# 2026-08-23 EMF 文本布局与 glyph-index 生产验收

## 1. 验收范围与部署身份

本次验收针对 `EMR_EXTTEXTOUTW.offDx`、mapping-mode 裁剪原点和 `ETO_GLYPH_INDEX` 三项修复。生产部署由 Vercel Git Integration 触发，而不是本地上传。

|       项目        |                结果                |
| :---------------: | :--------------------------------: |
| Vercel deployment | `dpl_6NR7NzxS5uihgNgWJ8kzRu6akgCv` |
|     生产 URL      |    `https://drill.ruan-cat.com`    |
|   Git checkout    |           `main@305ad8b`           |
|     最终状态      |               Ready                |
|   EMF/WMF 转换    |       成功 421 张，失败 0 张       |

Vercel 日志记录了 `Cloning github.com/ruan-cat/SmallAliceWeb (Branch: main, Commit: 305ad8b)`、`文档构建完成` 和 `所有文件处理成功`。

## 2. 可见 Chrome 验收

使用可见 Chrome 的 Agent Browser session `emf-production` 打开每个生产页面，等待 `networkidle`，检查 `img.naturalWidth === 0`，再在页面和目标 PNG 中人工查看文字。五页的失败加载数均为 0。

|       页面       | 图片数 | 失败加载 |                                目标图截图                                |
| :--------------: | :----: | :------: | :----------------------------------------------------------------------: |
|  技能窗口块元素  |   17   |    0     | `C:\Users\pc\AppData\Local\Temp\emf-production-skill-window-target.png`  |
|   战斗活动镜头   |   34   |    0     | `C:\Users\pc\AppData\Local\Temp\emf-production-battle-camera-target.png` |
| 全自定义标题界面 |   12   |    0     |     `C:\Users\pc\AppData\Local\Temp\emf-production-title-target.png`     |
|      素材库      |   31   |    0     | `C:\Users\pc\AppData\Local\Temp\emf-production-asset-library-target.png` |
|  数据存储的载体  |   8    |    0     | `C:\Users\pc\AppData\Local\Temp\emf-production-data-storage-target.png`  |

目标图人工结论：

- 技能窗口标签可读，不再出现整段空白。
- 战斗关系图的中英文标签按框定位，没有整串重叠。
- 标题关系图文本随图形框对齐，未出现固定的 header origin 偏移。
- 素材库与数据存储图中的中文、逻辑关系文字和 `……` 均可见，未显示 glyph-id 占位字符。

## 3. 对照与限制

Windows GDI+ 原图与本地 patched PNG 已用于定位和回归对照；本次生产验收以生产容器生成的 PNG 为最终依据，不声称逐像素或原字体风格保真。

`ETO_GLYPH_INDEX` 仅映射已经从真实样本反查的黑体与 Calibri glyph id。未记录的源字体/glyph id 保留原值并应在后续样本中补充映射，不能猜测 Unicode。

## 4. 非 EMF 观察项

Agent Browser 控制台累计报告 6 次 `Hydration completed but contains mismatches`。五页图片没有未加载项，这些 hydration 信息不构成此次 EMF 文本回归失败，但也不属于本 change 已修复的问题，应由站点渲染链路单独排查。

## 5. 验收结论修正

本记录最初把“图片已加载且文字可见”误作为布局通过。用户随后提供的生产截图证明标题、战斗和数据存储关系图仍有背景框与文字层错位、重复或裁断；因此第 2 节的布局通过结论已撤销。

后续验证必须同时满足：使用 Windows GDI+ frame 尺寸对照、在本机 Google Chrome 的页面视口观察图形/文字相对位置、并在生产部署后复测相同 URL。仅检查 `naturalWidth` 或资源加载状态不足以关闭该回归。

## 6. 2026-08-24 修正后本地与生产复验

修复提交 `7b6a528` 后，先基于用户更新的本地 `drill-docx` 全量重建 `docs/docx`，再以本机 `C:\Program Files\Google\Chrome\Application\chrome.exe` 的独立 profile 通过 Agent Browser CDP 控制页面。随后将 `main` 推进至 `9f71dd5`，生产 deployment `dpl_C5xJT8wJBoBRRkhEBnLR7cwJEaQM` Ready；日志确认从 `main@9f71dd5` checkout、EMF/WMF 成功 421 张、失败 0 张。

|       页面       | 本地 Google Chrome | 生产 Google Chrome | 图片数 / 失败加载 |                                    生产截图                                    |
| :--------------: | :----------------: | :----------------: | :---------------: | :----------------------------------------------------------------------------: |
|  技能窗口块元素  |        通过        |        通过        |      17 / 0       |    `C:\Users\pc\AppData\Local\Temp\emf-production-google-skill-target.png`     |
|   战斗活动镜头   |        通过        |        通过        |      34 / 0       |    `C:\Users\pc\AppData\Local\Temp\emf-production-google-battle-target.png`    |
| 全自定义标题界面 |        通过        |        通过        |      12 / 0       |    `C:\Users\pc\AppData\Local\Temp\emf-production-google-title-target.png`     |
|      素材库      |        通过        |        通过        |      31 / 0       |    `C:\Users\pc\AppData\Local\Temp\emf-production-google-asset-target.png`     |
|  数据存储的载体  |        通过        |        通过        |       8 / 0       | `C:\Users\pc\AppData\Local\Temp\emf-production-google-data-storage-target.png` |

视觉结论：标题图恢复为三个单层框，底部启动界面未裁断；战斗图没有第二套深色关系图；素材库的中文与 `……` 可读；技能窗口文字正常；数据存储图的静态/动态数据框、箭头和文字对齐。所有 URL 均严格使用用户指定的 `.html` 路径。
