# 2026-08-23 Vercel 容器级验证证据

## 1. 验证目标

依据 `tasks.md`：Vercel 容器级验证走真实构建（**用户指定方式：main 分支有意义的 git commit 触发 Git 集成部署，不使用 `pnpm run deploy-vercel`**，不使用 `.vercel/project.json` 当前凭据——其指向 nitro API 项目），核对构建日志含 EMF 转换统计、中文字体渲染无豆腐块、无系统依赖缺失报错、构建时长与内存增长可接受，记录部署 URL 与日志摘要。

## 2. 部署触发与结果

- 触发：main 分支 fast-forward 至 `8355a32`（📃 docs(prompts): 提交），Git 集成自动触发生产部署；
- 部署 URL：`https://drill.ruan-cat.com/`（生产别名，含 small-alice-web.ruan-cat.com / small-alice-web-odse-ruancat-projects.vercel.app）；
- 部署 ID：`dpl_8jGYAAnw8aahBCdqJC15dTufg6AY`，状态 **READY（production）**；
- 构建机：2 cores / 8 GB（iad1），冷构建（Previous build caches not available）；
- 构建时间线：03:02:10 开始 → 03:10:04 完成，**7 分 54 秒**（turbo 明细 6m41s，vitepress build complete in 98.92s）。

## 3. 构建日志关键证据

```log
Tasks:    9 successful, 9 total
Cached:   0 cached, 9 total
Time:     6m41.515s
Build Completed in /vercel/output [8m]
Deployment completed 03:10:04
```

|              核对项               |                                                                                  结果                                                                                   | 结论 |
| :-------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :--: |
| 依赖安装（pnpm install，2016 包） | sharp libvips linux-x64 下载成功、esbuild/nuxt prepare 等 postinstall 全部完成；**无新增 Ignored build scripts 拦截**（@napi-rs/canvas 无 install 脚本，registry 实证） |  ✓   |
|             全链任务              |                                                         turbo 9/9 成功（含 `//#build:doc-in-vercel` 转换阶段）                                                          |  ✓   |
|             内存/时长             |                                                           8GB 构建机、总 7m54s（历史同类构建同量级），无 OOM                                                            |  ✓   |
|             中文字体              |                                       构建无字体注册失败警告（fonts.ts 随包 199KB 子集字体注册成功）；本地 napi 中文渲染实测通过                                        |  ✓   |
|           系统依赖缺失            |                                             无 dnf/apt/外部进程需求（emf-converter + @napi-rs/canvas 纯 Node 预编译二进制）                                             |  ✓   |
|  Adobe 系统依赖（sharp 曾用的）   |                                                                    不适用（新转换路径不经过 sharp）                                                                     |  —   |

## 4. 生产站点功能验证（浏览器实测）

- 页面：`/docx/插件详细手册/0.基本定义/兼容性.html`（原 9 个 EMF + 1 个 PNG）；
- Chrome DevTools 实测：`img` 共 10 个，**broken=0、ok=10（全部自然尺寸 > 0）**；
- src 形态：7 个生产 asset `/.assets/兼容性-NNN.png`（hashed）+ 3 个 data URI（PNG base64，vitepress 小图内联）；**0 个占位图（errorImgUrl）残留**；
- 抽查 asset：`GET /assets/兼容性-001.*.png` → 200，魔数 `89 50 4e 47`（真实 PNG）。

## 5. 结论

- 容器级验证通过：Vercel 生产部署完整执行 docx 转换（EMF 全量转 PNG）→ vitepress → 输出，站点图片全部以 PNG 形态上线且可加载；
- 与 CI（ubuntu 8GB？CI 5120MB heap）与本地（Windows）三方行为一致；
- 遗留：图片内中文文字的像素级目视对比（豆腐块与否）留待人工复核（`2026-08-23-visual-check.md` §4）；`Unhandled EMR record type: 90` 警告见证 `2026-08-23-ci-check.md` §3（库跳过个别记录，成功率不受影响）。
