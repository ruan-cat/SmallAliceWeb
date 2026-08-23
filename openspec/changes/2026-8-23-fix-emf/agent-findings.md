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
