# 2026-08-10 Vercel pnpm 元数据安装失败事故报告

## 1. 结论摘要

`smallalice-docs-ai-nitro-api` 频繁出现的 `ERR_PNPM_META_FETCH_FAIL`，直接根因不是额外 `git clone`，也不是仓库 `.npmrc` 被污染，而是 Vercel Project 覆盖了自定义 Install Command `pnpm install`，却没有维护：

```ini
ENABLE_EXPERIMENTAL_COREPACK=1
```

Vercel 官方说明，自定义 `pnpm install` 会使用构建容器中最老的 pnpm；没有启用 Corepack 时，根 `package.json` 的 `"packageManager": "pnpm@10.29.2"` 不会成为云端实际版本约束。本项目又没有提交 `pnpm-lock.yaml`，因此云端实际落入旧 pnpm 与新 Node 的不兼容组合，底层 fetch 抛出 `ERR_INVALID_THIS`，最终被 pnpm 包装为 `ERR_PNPM_META_FETCH_FAIL`。

本次已在 Vercel Project 的 Production、Preview、Development 三个环境维护 `ENABLE_EXPERIMENTAL_COREPACK=1`。同一失败 commit 的受控重部署随后明确下载并使用 pnpm `10.29.2`，依赖安装完成，原错误消失。

## 2. 事故影响

- 影响项目：`smallalice-docs-ai-nitro-api`
- 影响方式：Git push 触发的 Vercel 云端安装阶段重复失败
- 失败阶段：Build Command 执行前的 `pnpm install`
- 直接后果：API 新提交无法通过 Git 集成完成生产部署
- 未受影响路径：使用本地 `.vercel/output` 的 prebuilt 部署不会运行云端 install，因此可成功上传，但不能证明 Git 构建链路正确

目标失败部署：<https://vercel.com/ruancat-projects/smallalice-docs-ai-nitro-api/6d69tZcmmESbt6GTX53LU3gL9cpi>

## 3. 问题现象

目标部署和相邻失败部署都在安装阶段出现大量 registry 元数据请求失败：

```log
Running "install" command: `pnpm install`...
WARN GET https://registry.npmjs.org/@types%2Fmarkdown-it error (ERR_INVALID_THIS).
Will retry in 10 seconds. 2 retries left.
WARN GET https://registry.npmjs.org/@types%2Fmarkdown-it error (ERR_INVALID_THIS).
Will retry in 1 minute. 1 retries left.
ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/@types%2Fmarkdown-it:
Value of "this" must be of type URLSearchParams
Error: Command "pnpm install" exited with 1
```

相邻失败有时终止在 `@types/markdown-it`，有时终止在 `@types/node`。日志没有 HTTP 404、429、500 等状态码，而是多个不同包同时抛出相同的客户端运行时异常。

日志还给出了第二个关键事实：

```log
Warning: Detected "engines": { "node": ">=22.14.0" } ...
Project Settings ("22.x") will not apply, Node.js Version "24.x" will be used instead.
```

Node 主版本漂移不是缺少 Corepack 的替代根因，但它扩大了旧 pnpm fetch 实现的兼容风险。

## 4. 排查方法

本次采用“先固定失败阶段，再逐个证伪假设，最后做单变量远程实验”的方式，没有从 `.npmrc` 或网络波动开始盲改。

### 4.1 固定失败阶段

首先读取用户指定部署和相邻部署的完整日志，标记流水线阶段：

```log
源码克隆完成
-> vercel build 启动
-> pnpm install 开始
-> registry metadata fetch 抛 ERR_INVALID_THIS
-> Install Command 退出 1
-> Build Command 尚未执行
```

这一步直接划定边界：任何只会在 Build Command、`postinstall` 之后或文档构建中执行的 `git clone`，都不可能是这次安装失败的直接原因。

### 4.2 对比相邻失败部署

对比多个失败部署，而不是只看最后一条 URL：

|   对比项   |                   观察结果                   |                    推论                    |
| :--------: | :------------------------------------------: | :----------------------------------------: |
| 终止包名称 | `@types/markdown-it`、`@types/node` 等不同包 |            不是某个固定依赖损坏            |
| HTTP 状态  |             没有 4xx、429 或 5xx             |        不是普通 registry HTTP 错误         |
|  底层错误  |          全部为 `ERR_INVALID_THIS`           |     请求客户端在收到 HTTP 响应前已崩溃     |
|  失败阶段  |            全部为根工作区 install            |    与后续子包 Build Command、clone 无关    |
| 运行 Node  |               实际为 Node 24.x               | `engines` 范围覆盖了 Project Settings 22.x |

### 4.3 审计仓库配置与脚本

随后检查仓库中的直接嫌疑项：

- 根 `.npmrc` 只有 `@ruan-cat:registry=https://registry.npmjs.org/`，没有默认 registry 覆盖、代理、鉴权或私服地址。
- 实际失败请求也访问 `https://registry.npmjs.org/`，与 `.npmrc` 一致。
- manifest 与已观察的依赖链没有 `git+`、Git URL 或安装期额外 clone 依赖。
- API 的 Build Command 是 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel`；失败时该命令尚未开始。
- 文档构建中的 clone 脚本不在 API 安装路径内。
- 根 `package.json` 声明 `packageManager: pnpm@10.29.2`，但仓库没有提交 `pnpm-lock.yaml`。

### 4.4 核对 Vercel Project Settings

远程项目配置为：

- Root Directory：`.`
- Install Command：`pnpm install`
- Build Command：`pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel`
- Output Directory：`.vercel/output`
- Project Settings Node：`22.x`

环境变量列表中没有 `ENABLE_EXPERIMENTAL_COREPACK`。

### 4.5 对照官方行为

[Vercel Package Managers](https://vercel.com/docs/package-managers) 明确说明：

- 使用 Corepack 时，Vercel 才会使用 `package.json#packageManager` 指定的包管理器版本。
- 覆盖 Install Command 为 `pnpm install` 时，Vercel 使用构建容器中最老的 pnpm，官方示例即 pnpm 6。
- 无 lockfile 时，不能依靠 lockfile version 帮助 Vercel 选择 pnpm 版本。

pnpm 官方问题 [pnpm/pnpm#6424](https://github.com/pnpm/pnpm/issues/6424) 记录了同型的 `ERR_INVALID_THIS` 与 registry metadata fetch 失败；其修复方向也是更新旧 fetch 实现和 pnpm 版本，而不是修改 `.npmrc`。

### 4.6 单变量远程实验

仅在目标 Vercel Project 增加：

```ini
ENABLE_EXPERIMENTAL_COREPACK=1
```

覆盖 Production、Preview、Development，然后重部署此前失败的同一 commit。新日志出现：

```log
Detected ENABLE_EXPERIMENTAL_COREPACK=1 and "pnpm@10.29.2" in package.json
Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.29.2.tgz
Scope: all 8 workspace projects
Packages: +1958
Done in 2m 8.2s using pnpm v10.29.2
```

该实验保留了同一个 commit、同一套依赖、同一 registry 和当时的 Node 24，只改变 Corepack 是否启用。结果从元数据阶段失败变为完整安装成功，因此足以确认缺少 Corepack 是 `ERR_PNPM_META_FETCH_FAIL` 的直接配置根因。

## 5. 根因分析

### 5.1 直接根因

Vercel Project 自定义 `pnpm install`，但未设置 `ENABLE_EXPERIMENTAL_COREPACK=1`，导致 `packageManager: pnpm@10.29.2` 未兑现，云端使用旧 pnpm。

### 5.2 放大因素

根 `engines.node: ">=22.14.0"` 是开放主版本范围。Vercel 因此忽略 Project Settings 的 Node 22.x，实际使用 Node 24.x，扩大了旧 pnpm 与新 Node URL API 的兼容风险。

### 5.3 关键误导点

|                 初始假设                 |                           证伪依据                           | 结论 |
| :--------------------------------------: | :----------------------------------------------------------: | :--: |
|      额外 `git clone` 改坏 `.npmrc`      |   clone 所属 Build Command 尚未执行；根 `.npmrc` 内容正常    | 排除 |
|        npm registry 短暂网络故障         |   不同包同时抛本地 `URLSearchParams` 异常，没有 HTTP 状态    | 排除 |
|            某个依赖元数据损坏            |                    终止包在不同部署间变化                    | 排除 |
| `packageManager` 已自动保证 pnpm 10.29.2 | Corepack 未启用；Vercel 自定义 Install Command 使用最老 pnpm | 错误 |

`ERR_PNPM_META_FETCH_FAIL` 只是上层包装错误。排查时必须继续读取冒号后的底层异常，不能看到 `FETCH_FAIL` 就直接归因网络。

## 6. 解决方案

### 6.1 已实施的直接修复

在 `smallalice-docs-ai-nitro-api` 项目的三个环境维护非敏感变量：

```ini
ENABLE_EXPERIMENTAL_COREPACK=1
```

PowerShell CLI 命令如下；逗号环境列表必须整体引用：

```powershell
vercel env add ENABLE_EXPERIMENTAL_COREPACK 'production,preview,development' `
	--value 1 `
	--yes `
	--no-sensitive `
	--project smallalice-docs-ai-nitro-api `
	--scope ruancat-projects `
	--no-color
```

### 6.2 仓库侧稳定性修复

根 `package.json#engines.node` 已从开放主版本范围改为：

```json
{
	"engines": {
		"node": "22.x"
	}
}
```

这不是 Corepack 缺失的直接修复，但能防止 Vercel 在新 Node major 发布后自动漂移。

### 6.3 后续暴露的独立产物问题

Corepack 修复让 install 和 Nitro build 继续执行后，Vercel 又暴露了一个独立问题：子包 `.vercel/output/functions/v1/*.func` 是指向 `__server.func` 的符号链接，旧搬运工具在 Linux 保留了指向子包绝对路径的链接。搬到仓库根后，Vercel 无法解析目标函数。

仓库已增加本地搬运脚本，使用 `fs.cp({ dereference: true })` 将链接实体化，并以 `import.meta.url` 锚定 package root 与 monorepo root，在递归删除目标前校验路径边界。

该问题只是在 pnpm 安装修复后才有机会暴露，不应与 `ERR_PNPM_META_FETCH_FAIL` 混为同一根因。

## 7. 验证结果与边界

### 7.1 已完成验证

- Vercel 环境变量回读显示 `ENABLE_EXPERIMENTAL_COREPACK` 覆盖 Production、Preview、Development。
- 受控 Git 重部署明确使用 pnpm `10.29.2`，依赖安装完成，原错误消失。
- `pnpm --dir packages/ai-rag-api run test`：16 个测试文件、51 项测试通过。
- `pnpm --dir packages/ai-rag-api run typecheck`：退出码 0。
- `pnpm --dir packages/ai-rag-api run build:vercel`：退出码 0，Nitro 使用 `nodejs22.x`。
- 根 `.vercel/output` 中 5 个 `.func` 均为物理目录，`config.json` 可解析。
- 独立复核代理最终结论：本地实现 PASS，无阻断项。

### 7.2 未完成边界

仓库修复文件尚未提交、推送，因此还没有一条包含 Node 22 与新产物搬运脚本的远程 Git 部署达到 Ready。当前证据能够确认 Corepack 已修复 pnpm 安装问题；不能把本地未推送改动描述为线上已生效。

## 8. 预防方案

### 8.1 部署前配置门禁

只要项目依赖 `packageManager` 固定 pnpm 版本，就必须同时检查：

1. Vercel Project 是否覆盖自定义 Install Command。
2. `pnpm-lock.yaml` 是否提交，lockfile version 能否参与版本选择。
3. Production、Preview、Development 是否都存在 `ENABLE_EXPERIMENTAL_COREPACK=1`。
4. 构建日志是否明确打印实际 pnpm 版本。

### 8.2 Node 主版本门禁

Vercel 部署项目不要使用 `>=22.14.0` 这类开放 major 范围。需要 Node 22 时使用 `22.x`，并同时核对 Project Settings 与构建日志。

### 8.3 Git 构建与 prebuilt 分开验收

- prebuilt 部署验证本地产物结构与上传路径。
- Git 部署验证云端 clone、install、build 和运行时版本。

Corepack 只影响云端安装阶段，因此不能用 prebuilt 成功代替 Corepack 验收。

### 8.4 错误码分诊规则

看到 `ERR_PNPM_META_FETCH_FAIL` 时，按下面顺序处理：

1. 读取底层错误；区分 HTTP 状态、DNS/TLS/timeout 与客户端运行时异常。
2. 从日志确认实际 Node 和 pnpm 版本，不根据 `package.json` 推断。
3. 检查 lockfile 提交状态、Install Command 和 Corepack 环境变量。
4. 对比相邻失败部署是否总是同一包。
5. 用同 commit 单变量重部署验证配置假设。

### 8.5 技能与知识沉淀

- 全局 `use-vercel-deploy-in-monorepo` 技能增加 Corepack 三环境维护、PowerShell 命令和日志验收标准。
- 项目 `record-bug-fix-memory` 增加本事故案例和摘要索引。
- 后续处理 Vercel pnpm 安装问题时，先检查 Corepack，不再从额外 clone 或 `.npmrc` 开始猜测。

## 9. 最终判断

本次 `ERR_PNPM_META_FETCH_FAIL` 的本质是缺少：

```ini
ENABLE_EXPERIMENTAL_COREPACK=1
```

完整因果链为：自定义 `pnpm install` → Vercel 使用旧 pnpm → `packageManager` 未生效 → 旧 fetch 在新 Node 中抛 `ERR_INVALID_THIS` → pnpm 包装为 `ERR_PNPM_META_FETCH_FAIL`。开启 Corepack 后，同一 commit 使用 pnpm `10.29.2` 完成安装，直接验证了修复有效。
