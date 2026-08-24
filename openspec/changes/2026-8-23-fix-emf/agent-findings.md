## 持久发现

1. **结论**：EMF 中文丢失的主因是字体 faceName 未映射与字体子集缺字，不是 UTF-8 解码失败。
   **证据**：`reports/2026-08-23-emf-text-loss-research.md` §2–§4。
   **状态**：active。
   **后续动作**：在 proposal、delta spec 与 design 中定义字体映射兜底、字形覆盖与容器产物验收。

2. **风险**：Windows 本地字体回退会掩盖容器问题，不能作为最终验收。
   **证据**：`reports/2026-08-23-emf-text-loss-research.md` §4 根因 3。
   **状态**：active。
   **后续动作**：任务清单必须纳入 Vercel 生产部署后的视觉抽查。

3. **结论**：正文字符集必须以 `emf-converter` 实际传入 Canvas `fillText` 的可读文本为准；直接猜测 EMF 二进制偏移会产生乱码。7 个含控制前缀的错误解码扩展字符不属于正文，已由 fixture 说明排除。
   **证据**：本会话对 182 个 DOCX / 382 个 EMF 的运行时拦截；异常 faceName 为 `\\u0004㄀黑体` 与 `\\u0004∀Calibri`。
   **状态**：active。
   **后续动作**：新文档引入字符时复跑同一运行时提取方式，更新 fixture 与字体资产后再通过 cmap 测试。

4. **风险**：当前 `origin/main` 落后 `dev` 7 个提交，快进会发布本 change 之外的 6 个历史 EMF/文档提交。
   **证据**：`origin/main=0a81861`，`git log origin/main..dev` 显示 7 个提交，且 `git merge-base --is-ancestor origin/main dev` 为真。
   **状态**：resolved。
   **后续动作**：用户已授权，`main` 已通过 rebase 更新并推送；以后仍须在发现历史提交随附发布时先取得授权。

5. **风险**：生产视觉验收已证明文本可读，但未完成 Word 原图逐像素保真比对。
   **证据**：`evidence/2026-08-23-production-visual-verification.md` §2–§3；009 原始问题截图与当前生产截图。
   **状态**：active。
   **后续动作**：若未来要求字形风格或像素保真，另建变更并以 Word 原图进行人工对照。

6. **结论**：第二批质量回归包含三个独立根因：`offDx` 被整串绘制忽略、mapping-mode 文本未减去 `rclBounds.left/top`、`ETO_GLYPH_INDEX` 被误当 Unicode。
   **证据**：真实样本 RED：5→17 次 `fillText`、X/Y 偏差 +25/+46、黑体 glyph id 266 渲染为 `Ċ`；Windows GDI+ 原图与 patched PNG 对照。
   **状态**：resolved。
   **后续动作**：后续新 glyph-index 样本仍须先反查 source font/glyph id，再扩展受版本控制映射；不得猜测 Unicode。

7. **风险**：补丁提交 `e62d11b` 的首个 CI 被后续用户提交自动取消；替代 CI 已成功，但 `dev` 还包含用户提交 `8cd6fc7` 与未提交工作区改动。
   **证据**：GitHub Actions `32642386364=cancelled`、`32642480630=success`；`git status` 和 `git log`。
   **状态**：resolved。
   **后续动作**：用户授权后，工作区已分类提交，`main` 已正常 rebase/push 至 `305ad8b`；生产 Vercel Ready 作为发布完成证据。

8. **风险**：五页 EMF 验收无图片加载失败，但 Agent Browser 控制台累计报告 6 次 hydration mismatch。
   **证据**：`evidence/2026-08-23-text-layout-regression-verification.md` §4。
   **状态**：active。
   **后续动作**：由站点 SSR/client hydration 链路单独定位；不得将其归因于 EMF PNG 转换。

9. **结论**：上一轮 mapping-mode 修复错误地将 `rclBounds.left/top` 从已经按 window/viewport 映射的坐标再次扣除，并继续以 816×208 的 `rclBounds` 裁剪本应使用 841×335 frame 的 EMF。
   **证据**：真实 title fixture RED：首字符 X 差 25、Y 差 46，输出 816×208；Windows GDI+ 原图为 841×335。回退重复扣减并按 frame/device/millimeters 计算 mapping EMF 画布后，子包 25/25 通过，本机 Google Chrome 的五个指定页面视觉正常。
   **状态**：resolved。
   **后续动作**：后续所有 mapping EMF 改动均须保留 frame 尺寸和文字坐标回归门禁，并用本机 Google Chrome 先验收本地再验收生产。

10. **风险**：SVG POC 可重放真实 fixture，但它复用 Canvas 回放语义，不能因 SVG 文件生成成功就宣称修复 GDI+ 保真。
    **证据**：`tasks.md` 6.2–6.5 的 RED→GREEN；`patches/emf-converter@2.0.2.patch` 的 SVG API；`@napi-rs/canvas` SVGCanvas 对 ROP2/复杂合成的探针结论。
    **状态**：active。
    **后续动作**：6.6 必须分类 399 个当前源 EMF，6.7 必须在本机 Chrome 逐图截图并与 GDI+ 参照判读；不通过类别保持 PNG 默认或显式回退。

11. **风险**：2026-08-24 当前会话的新建 Chrome/CDP 控制不可靠，但现存 Agent Browser 会话可截图，不能把控制链故障误判为 VitePress SSR 或图片不可见。
    **证据**：`agent-browser --headed --executable-path` 同时输出标题/图片数与 daemon EOF；typed `agent_browser_open` 连续 3 个 10 秒等待无输出；其后默认会话成功保存并人工查看 `C:\Users\pc\AppData\Local\Temp\smallalice-emf-agent-browser-diagnostic.png`，图中为客户端渲染页面。
    **状态**：active。
    **后续动作**：复用已响应的会话做目标图视口截图与 console 记录；不要再以“SSR 拿不到图片”作为解释，也不得将首屏截图或加载统计当视觉通过。

12. **发现**：高级角色肖像低对比图的真实输入已定位为 DOCX `word/media/image4.emf`，但此类别的浏览器复验不能靠页面标题关闭。
    **证据**：`evidence/2026-08-24-svg-quality-audit.md`；`portrait-high-contrast.emf`；GDI+ 参照与 Agent Browser 截图路径均记录在证据文件。
    **状态**：active。
    **后续动作**：WPS 原图已推翻“低对比”为主因；改为验证 EMF+ Dual 中 GDI 回退层和 EMF+ 主层双回放造成的几何错位，浏览器 daemon 恢复后重做目标图视口截图。

13. **根因假设**：`portrait-high-contrast.emf` 的错位来自 EMF+ Dual 双回放，而不是 COLORREF 或白底蓝字设计。
    **证据**：原始二进制含 79 个 EMF+ comment、28 个 GDI `EMR_EXTTEXTOUTW`、112 个 GDI UTF-16 字符；当前 Canvas `fillText` 也恰为 112 次。WPS 与 GDI+ 图显示正常紧凑布局，当前 SVG/PNG 却使文本与 EMF+ path 层相对漂移。
    **状态**：active。
    **后续动作**：编写 Dual 分派 RED 用例，实验性跳过重复 GDI 图形但保留文本/状态，使用 WPS/GDI+ 对照确认后才固化补丁。
