# 2026-08-10 Nitro Vercel 产物搬运脚本设计复核报告

## 1. 结论

`packages/ai-rag-api/scripts/move-vercel-output-to-root.ts` 不是修复 `ERR_PNPM_META_FETCH_FAIL` 所必需的文件，也不是 `use-vercel-deploy-in-monorepo` 技能要求新建的文件。原始 pnpm 安装失败的直接修复只有 Vercel 三环境中的 `ENABLE_EXPERIMENTAL_COREPACK=1`，以及避免 Node 版本漂移的根 `engines.node` 约束。

这个项目内脚本解决的是 Corepack 修复后才暴露的第二个问题：Nitro 生成的多个路由 `.func` 目录是指向 `__server.func` 的符号链接，而现有 `@ruan-cat/utils@4.24.0` 搬运命令复制时保留符号链接。产物从子包搬到仓库根以后，链接仍指向原子包构建路径，Vercel 无法把这些路由识别为有效函数。

因此，需要“把链接实体化”的能力是真实的，不属于凭空设计；但把整套搬运逻辑长期复制到 `ai-rag-api` 子包内，不是最优的最终架构。它可以作为受控的临时止血方案，长期应该把 `dereference` 能力补到共享的 `@ruan-cat/utils`，然后删除项目内脚本和对应的项目内测试。

更直接地说：**能力有必要，当前落点有重复；短期修复合理，长期保留会形成过度设计。**

## 2. 本次质疑对应的实际变更

### 2.1 原设计链路

2026-08-07 的部署设计选择了 `use-vercel-deploy-in-monorepo` 技能所说的“形态 1 / 模式 A”：Vercel 在仓库根安装依赖，从仓库根用 `--filter` 触发 Nitro 子包构建，最后从仓库根 `.vercel/output` 读取 Build Output API 产物。

原 `build:vercel` 链路是：

```log
构建 ai-rag-core
-> nitro build --preset vercel
-> move-vercel-output-to-root
```

最后一步不是项目自定义脚本，而是 `@ruan-cat/utils` 提供的同名 bin。也就是说，技能和原设计确实要求“搬运”，但要求的是复用共享工具，并没有要求新增 `packages/ai-rag-api/scripts/move-vercel-output-to-root.ts`。

### 2.2 当前未提交链路

当前工作区把最后一步改成了：

```json
{
	"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel && tsx scripts/move-vercel-output-to-root.ts"
}
```

项目内脚本承担了四项职责：从脚本位置推导子包与仓库根目录、清理根 `.vercel/output`、递归复制子包产物、通过 `dereference: true` 把链接复制为实体目录。

## 3. 为什么原架构存在搬运步骤

### 3.1 当前 Vercel 项目读取仓库根产物

`smallalice-docs-ai-nitro-api` 当前采用仓库根模式：Root Directory 留空，Install Command 为 `pnpm install`，Build Command 在仓库根过滤到 `@ruan-cat-drill-doc/ai-rag-api`，Output Directory 是 `.vercel/output`。

Nitro 命令在 `packages/ai-rag-api` 内运行，因此原生输出位置是：

```log
packages/ai-rag-api/.vercel/output
```

Vercel 当前配置读取的位置则是：

```log
.vercel/output
```

只要保持这套模式 A 配置，两个路径之间就必须有一座桥。技能把这座桥定义为 `move-vercel-output-to-root`。因此，“需要搬运”不是脚本作者自行增加的需求，而是已选部署拓扑的直接结果。

### 3.2 为什么没有直接切换 Root Directory

`ai-rag-api` 依赖 `workspace:*` 的 `ai-rag-core`。原设计选择仓库根安装，是为了让 pnpm 从 workspace 根解析依赖，并让同一 Git 仓库内两个 Vercel 项目保持一致的安装口径。

把 Root Directory 改成 `packages/ai-rag-api` 并非绝对不可行，但需要一起重做 Install Command、Build Command、Output Directory、外部 workspace 文件可见性和 `.vercel/project.json` 绑定位置。它不是删除一个脚本这么简单，而是切换整套部署模式。

## 4. 为什么共享搬运命令没有满足本次 Nitro 产物

### 4.1 Nitro 产物包含链接

当前本地构建产物中，`__server.func` 是实体目录，而下列四个路由函数是 Junction 或符号链接：

```log
functions/v1/chat.func
functions/v1/search.func
functions/v1/knowledge/sync.func
functions/v1/knowledge/sync-runs.func
```

这些链接都复用 `__server.func`。这是 Nitro 为多个路由复用同一服务端入口而生成的产物结构，不是业务代码主动创建的链接。

### 4.2 共享工具保留链接

当前安装的 `@ruan-cat/utils@4.24.0` 使用下面的复制选项：

```typescript
fs.cpSync(sourceEntry, targetEntry, {
	force: true,
	recursive: true,
});
```

Node.js `fs.cpSync` 的 `dereference` 默认值是 `false`，所以复制结果仍然是链接。该工具的选项接口和 CLI 也没有暴露 `dereference`；实际执行 `move-vercel-output-to-root --dereference` 会得到：

```log
ERROR 不支持的参数：--dereference
```

因此，当时不能仅通过在 `package.json` 命令末尾增加一个参数来完成修复。

### 4.3 搬运使链接目标失效

链接在子包 `.vercel/output` 内生成，目标属于子包构建路径。共享工具把它原样复制到仓库根后，链接本身的位置改变，目标却没有同步变成根产物内的相对实体。Vercel 随后读取仓库根 `.vercel/output`，无法从部署产物边界内正确解析这些函数。

项目内脚本使用：

```typescript
await cp(sourceOutput, targetOutput, {
	dereference: true,
	force: true,
	recursive: true,
});
```

本地实测结果是：子包输出中的四个路由 `.func` 仍为链接，仓库根输出中的同名 `.func` 均为实体目录。这证明脚本解决的行为差异真实存在。

## 5. 当时为什么选择项目内 TypeScript 脚本

### 5.1 当时的决策动机

Corepack 修复后，依赖安装和 Nitro 构建已经能继续执行，但部署又在产物阶段失败。为了在不等待另一个仓库修改、发版和升级依赖的情况下验证完整部署链，我选择把修复限制在 `ai-rag-api` 包内。

TypeScript 脚本的优点是可以直接使用 Node 22 已支持的 `fs.cp`，能显式设置 `dereference: true`，同时在 Windows 本地与 Vercel Linux 构建环境中使用同一实现。它也比 PowerShell、`cp -L` 或依赖 shell 差异的命令更容易测试。

### 5.2 为什么脚本不只有一行复制

脚本会递归删除仓库根 `.vercel/output`。只要存在递归删除，目标路径就不能依赖调用时的当前目录，也不能允许它落到仓库根外或仓库根本身。因此，使用 `import.meta.url` 固定 package root、校验目标位于 monorepo 内、拒绝源目标相同，并不是为了增加抽象，而是为了限制删除范围。

对应测试只覆盖两个真实风险：从任意工作目录运行时仍定位到正确路径，以及链接复制后变成实体目录。这里的安全校验和回归测试本身不属于过度设计。

## 6. 这项改动是否过度设计

### 6.1 不属于过度设计的部分

在已经决定继续打通 Vercel 全链路的前提下，处理 `.func` 链接不是可选优化。保留无效链接会直接让 Vercel 无法接受产物，`dereference: true` 对应明确的失败现象和可重复的本地产物差异。

递归删除前的路径边界检查也是必要防护。为了把代码缩短而删除这些校验，会让一个构建辅助脚本拥有不受约束的目录删除能力，不是合理的简化。

### 6.2 属于范围扩张的部分

原始排查任务聚焦 `ERR_PNPM_META_FETCH_FAIL`。当 Corepack 变量使安装成功后，我继续追踪了下一个 Nitro 产物问题，并直接修改了项目代码。这把任务从“修复依赖安装”扩展成了“让整个 API 部署继续通过”。

这种扩张有端到端交付的动机，但它引入了一个新的、长期存在的项目文件，而且没有先把“临时本地兜底”和“修改共享工具”两个方案交给用户选择。这个决策过程不够克制。

### 6.3 属于长期重复设计的部分

`@ruan-cat/utils` 已经拥有完整的 monorepo 根发现、路径解析、目标清理、dry-run、CLI 参数和测试。项目内脚本重新实现其中一部分，只为了增加 `dereference: true`。

如果两套实现长期并存，共享工具将继续演进，而项目内脚本需要单独维护路径、安全和复制语义。它还把 `packages/ai-rag-api` 与当前两级目录结构硬绑定。这个重复所有权才是主要的过度设计风险。

## 7. 可选方案复核

### 7.1 方案一：保留项目内脚本

该方案改动局限在当前仓库，不需要等待外部包发布，适合紧急验证或临时部署。缺点是重复共享工具能力，并让业务子包长期维护部署基础设施代码。

裁决：可以作为临时止血方案，但不建议作为最终合并形态。

### 7.2 方案二：扩展 `@ruan-cat/utils`

在共享工具的 `MoveVercelOutputToRootOptions` 中增加 `dereference?: boolean`，CLI 增加 `--dereference`，默认仍为 `false`，避免无意改变其他项目现有行为。随后发布补丁版本，并把本项目命令改为：

```json
{
	"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel && move-vercel-output-to-root --dereference"
}
```

符号链接回归测试应放在共享工具仓库，验证默认保留链接、显式参数实体化链接。SmallAliceWeb 只需要保留对最终命令或产物边界的轻量验收。

裁决：这是推荐的长期方案。它保留技能规定的模式 A 和共享 bin，同时消除项目内重复实现。

### 7.3 方案三：让 Vercel 直接读取子包 `.vercel/output`

理论上可以保持 Root Directory 在仓库根，把 Output Directory 改为 `packages/ai-rag-api/.vercel/output`，从而取消搬运。这样链接仍处于 Nitro 创建它们的原始目录树中，可能避免搬运导致的目标失效。

但当前技能把 Nitro 明确归入模式 A，模式 B 的成熟模板主要面向固定静态产物。当前也没有一条受控 Git 部署证明 Vercel 会接受这个嵌套的 Nitro Build Output API 目录和其中的链接。因此不能把“理论上少一个脚本”写成已验证方案。

裁决：值得单独实验，但在实验成功前不应直接替换现有架构。

### 7.4 方案四：把 Vercel Root Directory 切到子包

这能让 Nitro 原生把 `.vercel/output` 生成在 Vercel 项目根下，但会改变 workspace 安装与构建口径，并要求重新验证 `workspace:*` 依赖、仓库外文件访问、Project Settings 和 CLI 绑定。相对于一个复制语义缺口，这个方案的变更面明显更大。

裁决：不作为本问题的优先修复。

### 7.5 方案五：使用 shell 命令或内联 Node 命令

`cp -L`、PowerShell 复制或长内联 `node -e` 可以减少一个文件，但会引入跨平台差异、转义问题和难以隔离测试的问题。`shx` 是否完整提供所需的链接解引用语义也没有现成证据。

裁决：代码行数更少，但整体维护成本和验证成本更高，不构成真正简化。

## 8. 推荐的最终设计

### 8.1 短期状态

在没有发布新版 `@ruan-cat/utils` 前，现有项目内脚本只能被视为临时补丁。它已经通过本地测试、类型检查与构建验证，但尚未提交、推送，也没有一条包含它的远程 Git 部署达到 Ready，因此不能描述为已上线的最终方案。

### 8.2 长期收敛

推荐在 `@ruan-cat/utils` 中新增非破坏性的 `dereference` 选项和 CLI 参数，发布补丁版本后升级 SmallAliceWeb。完成升级与真实 Git 部署验证后，删除：

```log
packages/ai-rag-api/scripts/move-vercel-output-to-root.ts
packages/ai-rag-api/tests/move-vercel-output-to-root.test.ts
```

同时把 `packages/ai-rag-api/package.json` 恢复为共享命令加显式参数。这样既保留模式 A 的部署契约，也让链接处理能力回到正确的公共所有者。

### 8.3 决策门槛

在决定保留或删除当前脚本前，需要先选择业务优先级。如果目标是立即验证远程 Nitro 部署，可以暂时保留并部署验证；如果目标是形成可长期合并的干净实现，应先修改和发布共享工具，不把临时代码提交为最终架构。

如果想彻底取消搬运，则应创建一次隔离的 Vercel Preview 实验，只改 Output Directory 为 `packages/ai-rag-api/.vercel/output`，确认安装、Nitro 构建、五个函数识别和四条 API 路由全部通过后，再决定是否把 Nitro 纳入技能的模式 B。没有这条证据之前，不应把模式切换建立在推断上。

## 9. 对本次决策过程的复盘

本次技术判断中，正确的部分是继续读取真实 Vercel 失败、定位到共享工具的链接复制语义，并为递归删除增加安全边界。需要纠正的部分是：在原始安装错误已经修复后，我没有先报告“出现第二个独立问题”和它的多种解决路径，而是直接选择了项目内代码兜底。

以后遇到同类情况，应把“原问题的直接修复”和“继续打通全链路发现的新问题”分成两个检查点。新问题如果需要引入长期文件、重复公共工具或改变部署拓扑，先提交设计选择，再实施。Owner 意识不等于无限扩张范围；真正的端到端负责也包括控制长期维护成本。

## 10. 本报告边界

本报告只解释并复核现有未提交脚本的设计动机，没有删除脚本、修改 `package.json`、修改 Vercel Project Settings、发布 `@ruan-cat/utils` 或触发新部署。后续采用哪一种收敛方案，需要用户确认后再执行。
