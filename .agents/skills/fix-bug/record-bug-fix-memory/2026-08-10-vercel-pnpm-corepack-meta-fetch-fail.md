# 2026-08-10 Vercel 自定义 pnpm 安装未启用 Corepack

## 1. 问题现象

`smallalice-docs-ai-nitro-api` 的 Git 集成部署反复在 `pnpm install` 阶段失败。不同部署可能停在 `@types/markdown-it` 或 `@types/node`，共同错误为：

```log
ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/<package>:
Value of "this" must be of type URLSearchParams
```

失败发生在 Build Command 前，已存在的 prebuilt 部署会绕过云端 install，不能作为成功对照。

## 2. 实际根因

Vercel Project 覆盖 Install Command 为 `pnpm install`，但 Production、Preview、Development 都没有 `ENABLE_EXPERIMENTAL_COREPACK=1`。Vercel 因而使用构建容器中最老的 pnpm，没有兑现根 `package.json` 的 `packageManager: pnpm@10.29.2`。

旧 pnpm 的 fetch 实现在实际 Node 24 环境中抛出 `ERR_INVALID_THIS`，随后被包装为 `ERR_PNPM_META_FETCH_FAIL`。根 `engines.node: ">=22.14.0"` 覆盖 Project Settings 22.x、自动漂移到 Node 24，是兼容风险放大因素，但不是缺少 Corepack 的替代根因。

## 3. 关键误导点

- 文档构建中确实存在额外 clone，但失败时 Build Command 尚未运行，因此 clone 不可能改坏本次安装阶段。
- 根 `.npmrc` 只有 `@ruan-cat` scoped registry，失败请求也确实访问 npm 官方 registry，没有 registry 污染证据。
- 终止包在相邻部署间变化，说明不是某个固定依赖元数据损坏。
- 日志没有 HTTP 状态；`META_FETCH_FAIL` 的底层是本地 `URLSearchParams` 异常，不能直接归因网络抖动。
- `packageManager` 只是声明；没有启用 Corepack 时，不能据此推断云端实际 pnpm 版本。

## 4. 有效修复

在目标 Vercel Project 三个环境维护非敏感变量：

```ini
ENABLE_EXPERIMENTAL_COREPACK=1
```

同时把根 `package.json#engines.node` 收紧为 `22.x`，防止 Vercel 自动进入新的 Node major。

Corepack 修复后继续暴露的 Nitro Output 符号链接搬运错误属于独立问题：本地脚本使用 `fs.cp({ dereference: true })` 将 `.func` 链接实体化，并在删除根 `.vercel/output` 前校验路径边界。

## 5. 验证方式

受控重部署保留同一 commit、registry、依赖与当时的 Node 24，只改变 Corepack 变量。新日志明确出现：

```log
Detected ENABLE_EXPERIMENTAL_COREPACK=1 and "pnpm@10.29.2" in package.json
Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.29.2.tgz
Done in 2m 8.2s using pnpm v10.29.2
```

依赖安装与 API Build Command 均完成，原 `ERR_INVALID_THIS` / `ERR_PNPM_META_FETCH_FAIL` 消失。

仓库侧 fresh 验证：

- `pnpm --dir packages/ai-rag-api run test`：16 个测试文件、51 项测试通过。
- `pnpm --dir packages/ai-rag-api run typecheck`：退出码 0。
- `pnpm --dir packages/ai-rag-api run build:vercel`：退出码 0，产物使用 `nodejs22.x`。
- 根 `.vercel/output` 的 5 个 `.func` 均为物理目录。

## 6. 后续约束

1. Vercel Project 只要自定义 `pnpm install` 并依赖 `packageManager` 固定版本，就必须维护 Production、Preview、Development 三环境的 `ENABLE_EXPERIMENTAL_COREPACK=1`。
2. Corepack 验收必须使用会执行云端 install 的 Git 部署；prebuilt 部署不算证据。
3. 必须从构建日志确认 `Detected ENABLE_EXPERIMENTAL_COREPACK=1` 和最终 `using pnpm v<version>`，不能只读仓库声明。
4. Node engines 应固定主版本，如 `22.x`，禁止用开放 major 范围让 Vercel 自动升级。
5. `ERR_PNPM_META_FETCH_FAIL` 必须继续读取底层错误；无 HTTP 状态且出现 `ERR_INVALID_THIS` 时优先检查实际 pnpm、Node 与 Corepack。
6. 本地仓库修复尚未提交、推送时，不得声称新的 Git 部署已经 Ready。
