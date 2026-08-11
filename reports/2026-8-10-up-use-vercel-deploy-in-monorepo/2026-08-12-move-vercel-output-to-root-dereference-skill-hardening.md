# 2026-08-12 `use-vercel-deploy-in-monorepo` 搬运工具 `--dereference` 技能加固建议

## 1. 目的与结论

本文件为全局技能 `C:\Users\pc\.agents\skills\use-vercel-deploy-in-monorepo` 的后续升级提供可直接落地的内容，不修改该技能本体。

`move-vercel-output-to-root` 的职责是模式 A 中的产物路径桥接：将子包生成的 `.vercel/output` 放到 Vercel 在仓库根读取的 `.vercel/output`。`--dereference` 是其新增的、默认关闭的复制策略开关；它不是 Nitro 配置开关，也不是 pnpm/Corepack 安装错误的修复手段。

在本仓库的已验证部署中，Vercel 已完成 Git 构建并识别根输出；构建命令使用：

```json
{
	"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel"
}
```

子包命令中的关键阶段为：

```sh
nitro build --preset vercel && move-vercel-output-to-root --dereference
```

## 2. 参数合同

应在技能的“构建、产物与框架路由”章节增加以下参数表，并明确其语义以当前已发布 CLI `--help` 为准。

|         参数          |        默认值         |                       行为                       |                          使用边界                          |
| :-------------------: | :-------------------: | :----------------------------------------------: | :--------------------------------------------------------: |
|  `--root-dir <path>`  | 自动发现 workspace 根 |               指定 monorepo 根目录               |               仅在自动根发现不适用时显式传入               |
| `--source-dir <path>` | 子包 `.vercel/output` |             指定待搬运的构建产物目录             |                必须是本次构建实际写入的目录                |
| `--target-dir <path>` |  根 `.vercel/output`  |           指定 Vercel 将读取的最终目录           |        必须与 Project 的 Output Directory 口径一致         |
|    `--skip-clean`     |        `false`        |            搬运前保留既有目标目录内容            | 仅在明确需要合并多个独立产物，且已验证不会遗留旧函数时使用 |
|      `--dry-run`      |        `false`        |     只打印解析后的路径与策略，不复制、不清理     |          用于部署前路径排查，不可替代真实产物检查          |
|    `--dereference`    |        `false`        | 复制时将符号链接指向的实体文件或目录写入目标目录 |      仅对受信任构建产物、且证据表明确需要实体化时启用      |

编程式 API 的等价选项是 `dereference?: boolean`。解析后的结果中应始终存在 `dereference: boolean`，并记录到构建日志，方便从 Vercel 日志确认实际策略。

## 3. `--dereference` 的适用判定

### 3.1 必须先确认的事实

使用该选项前，按以下顺序收集证据：

1. 确认已选模式 A：Vercel 从仓库根 `.vercel/output` 读取产物，Nitro 在子包输出 `.vercel/output`。
2. 本地执行真实 `build:vercel`，分别检查源目录和根目标目录的 `.vercel/output/functions`。
3. 用 `lstat` 或等价检查确认需要搬运的 `.func` 项是否是符号链接；不要依据目录名称、Nitro 版本或猜测决定。
4. 在不启用该选项的同一提交上，保留 Vercel 对函数拓扑的精确错误、路由缺失或运行时表现作为对照证据。
5. 启用后重新检查根输出：原先需要实体化的 `.func` 必须不再是链接，并完成 Git Integration 的构建日志与目标 API 冒烟验收。

### 3.2 何时启用

当且仅当以下条件同时成立时，构建命令可以加入 `--dereference`：

- 已确定使用模式 A，且搬运步骤不可省略；
- 子包 Nitro 输出中存在需要被复制的符号链接；
- 保留链接后有可复现的 Vercel 函数拓扑、路由或产物消费失败证据；
- 链接和其目标均来自本次受信任构建产物；
- 实体化后通过根输出检查和真实 Git 部署验证。

推荐写法：

```json
{
	"scripts": {
		"build:vercel": "pnpm --filter <core-package> build && nitro build --preset vercel && move-vercel-output-to-root --dereference"
	}
}
```

若项目已通过 Turbo 定义独立的 `move-vercel-output-to-root` 任务，应把该标志加到该原子搬运任务，而不是在根构建命令额外复制一遍搬运逻辑。

### 3.3 何时不要启用

- 模式 B（Vercel 直接读取子包产物）或独立仓库：不存在根产物搬运时，不应添加该命令。
- 根输出没有符号链接，或 Vercel 已能正确消费现有链接：维持默认值 `false`。
- 仅因 `ERR_PNPM_META_FETCH_FAIL`、Corepack、Node 版本漂移、依赖安装失败而启用：这些属于安装阶段问题，搬运发生在构建之后，不能修复它们。
- 仅因 `compatibilityDate` 未确认而启用：`compatibilityDate` 应按 Nitro 规范配置和验证，但它不定义 Node `fs.cp` 是否解引用符号链接。
- 产物或链接目标不可信、可能越出受控构建目录：不得解引用，先消除来源与路径风险。

## 4. 与 Nitro、Corepack 的职责边界

|     问题层     |                     典型证据                      |                                         正确处理                                          |             不应误用             |
| :------------: | :-----------------------------------------------: | :---------------------------------------------------------------------------------------: | :------------------------------: |
|    安装阶段    |    `ERR_PNPM_META_FETCH_FAIL`、pnpm 初始化异常    | 核对 Node、pnpm、`.npmrc` 与 Vercel 环境变量；本事故中为 `ENABLE_EXPERIMENTAL_COREPACK=1` |         `--dereference`          |
| Nitro 构建契约 | Nitro preset、`serverDir`、兼容日期不符合项目规范 |        在 `nitro.config.ts` 明确 `compatibilityDate: "2024-09-19"`，并核验构建日志        |    以移动脚本替代 Nitro 配置     |
|    产物搬运    |         子包与根 `.vercel/output` 不一致          |                  使用 `move-vercel-output-to-root`，保持模式 A 路径一致                   | 修改无关的 Vercel Root Directory |
|    函数拓扑    |  目标根输出残留不被消费的符号链接，且有失败对照   |                            经过判定后显式使用 `--dereference`                             |        默认对所有项目开启        |
|     运行时     |            构建 READY 后 API 返回 5xx             |                  读取 Runtime Logs，排查数据库、模型、环境变量或应用异常                  |       回头修改产物复制策略       |

## 5. 建议写入全局技能的流程与验收

建议在 `use-vercel-deploy-in-monorepo` 中的模式 A 与 Nitro 路由说明后增加“符号链接产物搬运”小节，并在首次 Git E2E checklist 增加以下项目：

- [ ] 已确认 Vercel 的 Root Directory、Output Directory 与模式 A 的根 `.vercel/output` 口径一致。
- [ ] 已分别检查子包输出和根输出的 `.func` 项是否为符号链接；记录 `--dereference` 为 `true` 或 `false` 的原因。
- [ ] 若使用 `--dereference`，已确认源产物受信任，根输出对应 `.func` 已实体化，且没有把链接目标外的内容带入部署产物。
- [ ] 已从 Vercel Git 构建日志读取搬运工具的解析输出，确认 `dereference` 实际值符合预期。
- [ ] 已用目标 API 完成冒烟验证；`READY` 仅证明部署完成，不等于业务运行时可用。

建议同时更新 `templates/turbo-task-move-vercel-output.md`：保留默认的无标志任务模板，并增加一个“已验证必须实体化符号链接时”的可选示例。模板不得把 `--dereference` 写成默认配置。

## 6. 最小验证命令

```powershell
pnpm --dir packages/ai-rag-api exec move-vercel-output-to-root --help
pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel
Get-ChildItem -LiteralPath '.vercel\output\functions' -Force |
	Select-Object Name, LinkType, Target
pnpm exec vercel inspect <deployment-id> --scope <team>
pnpm exec vercel logs <deployment-id> --scope <team>
```

最后一项 API 冒烟必须使用项目真实的请求方法与最小非敏感请求体。若部署为 `READY` 但 API 返回 5xx，应记录为运行时故障，不能把它归因为 `--dereference` 已失效或继续修改复制策略。

## 7. 升级后的非回归要求

1. 未传 `--dereference` 的既有项目继续保留原有链接复制语义。
2. 传入该参数时，普通文件复制行为不变，符号链接目标被实体化。
3. `--dry-run` 不清理、不复制，但必须显示最终的 `dereference` 解析值。
4. `--skip-clean` 与 `--dereference` 独立；前者不能成为规避陈旧 Vercel 函数的默认办法。
5. 全局技能必须将 pnpm/Corepack 安装问题、Nitro 配置问题、产物搬运问题和运行时 5xx 分层排查，禁止以单一标志掩盖跨阶段故障。
