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
