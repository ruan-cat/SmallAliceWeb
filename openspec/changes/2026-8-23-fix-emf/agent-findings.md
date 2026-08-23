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
