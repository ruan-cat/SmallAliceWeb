# 复杂依赖与复杂构建场景通用排障方法论

> 日期：2026-08-19
>
> 适用范围：pnpm monorepo、Nuxt/Vite/Nitro，也可迁移到其他 Node.js monorepo、SSR、bundler、serverless / standalone output 场景。
>
> 本文不是某个具体包的修复清单。目标是建立一套**与包名无关、与单次事故无关**的复杂依赖调查方法。
>
> `DEPENDENCY-EXTERNALIZATION-POLICY.md` 负责说明 `vite.ssr.noExternal` / `nitro.externals.inline` 的专项边界；本文负责更一般的复杂依赖诊断框架。

## 1. 核心原则：先定位失败边界，再谈包名

复杂依赖问题最容易犯的错误，是看到：

```text
Cannot find package X
```

就直接开始：

```text
安装 X
inline X
noExternal X
hoist X
alias X
```

这会把“错误消息里出现了哪个包”误当成“根因属于哪个层”。

正确的第一问永远是：

> **这个错误第一次在哪一个生命周期边界发生？**

同一个包名可以在完全不同的阶段失败，而不同阶段需要完全不同的修复。

例如：

- install 阶段失败：resolver / registry / peer / lockfile；
- dev 阶段失败：Node resolution、duplicate singleton、ESM/CJS、conditional exports；
- Vite SSR 阶段失败：transform / externalization；
- Nitro build 阶段失败：Rollup graph / externals / memory；
- `.output` 启动后失败：standalone runtime dependency closure；
- Vercel 才失败：平台、filesystem、native binary、trace/copy、环境变量或 target preset。

因此复杂依赖排障的顶层规则是：

```text
先找 first failing gate
再建立 dependency identity
再分类故障
最后选择最小修复
```

而不是：

```text
看到包名
就往配置列表里加
```

---

## 2. 把整个依赖生命周期拆成独立验收门

建议对任何复杂 Node/SSR 项目使用下面的生命周期：

```text
A. manifest declaration
   ↓
B. dependency solving / lockfile
   ↓
C. installation / node_modules layout
   ↓
D. Node package resolution
   ↓
E. dev runtime
   ↓
F. client/Vite transform
   ↓
G. SSR transform / externalization
   ↓
H. final server bundling
   ↓
I. output tracing / dependency copy
   ↓
J. standalone server startup
   ↓
K. real HTTP runtime
   ↓
L. target platform deployment/runtime
```

必须记录**第一个失败的门**。

后面的错误很可能只是前面错误的派生现象。

### 2.1 为什么必须拆门

以下说法都过于模糊：

- “Nuxt 构建挂了”；
- “Element Plus 有问题”；
- “pnpm 依赖不完整”；
- “Vercel 丢依赖”；
- “SSR 不兼容”。

更有诊断价值的写法是：

```text
install                PASS
Node resolution         PASS
Vite client build       PASS
Vite SSR build          PASS
Nitro prerender         PASS
final Nitro build       PASS
.output startup         PASS
HTTP /                  FAIL -> ERR_MODULE_NOT_FOUND @popperjs/core
Vercel                  not tested
```

只要生命周期写清楚，排查空间会立即缩小。

---

## 3. 为可疑依赖建立“身份账本”

复杂依赖问题的本质通常不是“文件不存在”，而是多个不同的“身份”被混在了一起。

对每一个关键 package，至少记录以下字段：

| 维度 | 要回答的问题 |
| --- | --- |
| logical import specifier | 源码实际写的是 `foo`、`foo/subpath` 还是 alias 名？ |
| declaring package | 到底是谁 import 它？应用、workspace package、第三方 dependency？ |
| manifest owner | 哪个 `package.json` 应当声明它？ |
| dependency kind | dependency / peerDependency / optionalDependency / devDependency？ |
| requested range | manifest 要求什么版本/range？ |
| resolved version | pnpm 实际解出来哪个版本？ |
| real package identity | npm alias 后真实包名是什么？ |
| physical realpath | node_modules 中最终真实路径在哪里？是否 symlink？ |
| package exports | `exports` / `main` / `module` / subpath 如何声明？ |
| active condition | Node/Vite 使用 `import`、`require`、`node`、`browser` 等哪个条件？ |
| runtime instance count | 是否同时存在两个 Vue/H3/React 等 singleton 实例？ |
| bundling status | Vite/Nitro 中是 bundled、transformed 还是 externalized？ |
| output status | standalone output 中是否携带逻辑运行时名称？ |

### 3.1 “逻辑名称”和“物理包”必须分开

本轮典型例子：

```text
logical import: @popperjs/core
real package:   @sxzz/popperjs-es
relationship:   npm alias
```

如果只看物理 `.pnpm/@sxzz+popperjs-es...`，很容易错误判断“包明明在磁盘上，为什么 Node 找不到”。

真正需要回答的是：

> runtime 按 `@popperjs/core` 这个逻辑 specifier 查找时，部署产物是否保留了这个身份？

这条原则同样适用于：

- npm alias；
- package subpath exports；
- workspace alias；
- tsconfig/vite alias；
- patched package；
- fork package；
- dual ESM/CJS package。

---

## 4. 复杂依赖故障分类矩阵

不要把所有依赖问题统一归为“externalization”。至少先分成下面九类。

## 4.1 声明与解析契约错误

典型问题：

- phantom / undeclared dependency；
- runtime import 被错误放在 devDependencies；
- optional dependency 实际却是必需；
- peer dependency 没有被宿主满足；
- npm alias logical name 没有在实际 deployment package 声明；
- semver range 漂移到未验证版本。

优先检查：

```sh
pnpm why <pkg>
pnpm list <pkg> --depth 10
```

以及相关 `package.json` / lockfile。

优先修复：**dependency contract 本身**。

不要先靠 bundler 或 hoist 掩盖。

## 4.2 版本世代与 peer compatibility 错误

典型问题：

- Nuxt 3 生态 package 被解析到 Nuxt 4/H3 2 时代依赖；
- React/Vue/plugin peer 范围表面兼容，实际 API 世代不兼容；
- minor/patch 范围跨过上游未正确表达的兼容边界。

检查：

- 实际 resolved version，不只看 manifest；
- 上游依赖/peer/devDependency；
- lockfile 中实际实例；
- 上游测试使用的框架版本；
- API/exports 是否发生代际变化。

修复优先级：

```text
建立已验证 compatibility matrix
> 精确锁定坏边界
> 整组升级
> 最后才考虑兼容 shim
```

## 4.3 重复 singleton / 多实例错误

对以下包尤其危险：

- Vue；
- React；
- H3；
- Pinia；
- router；
- schema/ORM runtime；
- instrumentation/global state library。

症状可能不是 `MODULE_NOT_FOUND`，而是：

- inject/context 丢失；
- `instanceof` 失败；
- hooks/composables 报上下文错误；
- event 对象 API 不匹配；
- symbol/token 不相等。

排查要回答：

```text
同一个逻辑 runtime 是否存在两个物理实例？
调用方和被调用方各自解析到哪一个实例？
```

不能仅通过“两个版本都安装成功”判断健康。

## 4.4 ESM / CJS / conditional exports 错误

典型错误：

- `ERR_REQUIRE_ESM`；
- `Named export ... not found`；
- `Package subpath ... is not defined by exports`；
- dev 正常、SSR/production 异常；
- import 与 require 解析到不同实现。

必须检查 package：

```json
{
  "type": "module",
  "main": "...",
  "module": "...",
  "exports": { ... }
}
```

以及实际 active conditions。

这类问题有时确实需要 Vite transform / `ssr.noExternal`，但前提是已经证明：

> **externalized Node runtime 路径本身不能正确消费该发布物。**

不能因为它是 ESM 包就默认 noExternal。

## 4.5 workspace source / dist 边界错误

典型场景：

```text
workspace package
├─ src/
├─ dist/
└─ package.json exports -> dist
```

但应用为了“方便”在 production alias 到：

```text
../package/src
```

这会引入：

- 未编译源码；
- TS/Vue transform；
- workspace 外额外依赖；
- source-only imports；
- graph 显著扩大；
- dev/prod 行为分裂。

一般原则：

> production 优先消费 package 正式 exports / dist，而不是绕过 package boundary 直接消费 src。

如果必须消费 source，必须把它作为**架构决策**验证，而不是临时 alias。

## 4.6 bundler transform / externalization 错误

这一类才是：

- `vite.ssr.noExternal`；
- `nitro.externals.inline`；
- Rollup external；
- linked dependency transform。

判断依据应是 exact error：

```text
这个 package 以 external 方式交给 Node 会失败，
而由指定 bundler transform 后能够正确工作。
```

修复必须 narrow、单变量、可删除。

详细规则见：

`DEPENDENCY-EXTERNALIZATION-POLICY.md`。

## 4.7 standalone tracing / dependency copy 错误

典型特征：

```text
dev PASS
build PASS
.output start PASS
HTTP runtime FAIL: MODULE_NOT_FOUND
```

此时优先检查：

- standalone output 是否包含 exact logical package name；
- symlink 是否被 dereference / trace；
- npm alias 是否保留 logical identity；
- optional/native dependency 是否被 tracer 忽略；
- output 是否偷偷从 monorepo 父目录 node_modules 回退解析。

不要直接得出“要 inline 整个上游 package”。

## 4.8 native / optional / platform dependency 错误

典型场景：

- `sharp`；
- `better-sqlite3`；
- swc/esbuild platform binary；
- libc / CPU / OS-specific package；
- optional dependency 在安装平台被跳过。

必须记录：

- build OS/arch；
- runtime OS/arch；
- Node ABI；
- libc；
- package manager 是否选择了正确 optional binary；
- output copy 是否包含 binary。

这类问题通常不能靠 `noExternal` 解决。

## 4.9 构建图 / 资源型依赖错误

典型症状：

- heap OOM；
- transform module 数暴涨；
- bundling 极慢；
- output size 异常；
- 一个 dependency workaround 使 build 从稳定变不稳定。

要比较：

- transformed modules；
- maximum RSS；
- V8 heap；
- build duration；
- output size；
- source alias / wide matcher 是否改变 graph。

不能把 OOM 简化成“机器内存小”。

依赖配置本身也可能是 graph amplifier。

---

## 5. 每次调查先做“五视图快照”

在改配置前，先冻结五类证据。

### 5.1 Manifest view

读取：

- 当前应用 package.json；
- 直接调用方 package.json；
- 报错 package package.json；
- dependency / peer / optional / exports。

### 5.2 Solver view

读取实际安装结果：

```sh
pnpm why <pkg>
pnpm list <pkg> --depth 10
```

重点看：

- 是否多实例；
- 是否 alias；
- 是否 peer variant；
- 是否实际版本漂移。

### 5.3 Resolver view

在**实际失败 package 的 cwd / runtime context** 下测试解析，而不是只在 monorepo 根测试。

ESM 可使用类似：

```sh
node --input-type=module -e "console.log(import.meta.resolve('<pkg>'))"
```

CJS 场景可检查：

```sh
node -e "console.log(require.resolve('<pkg>'))"
```

并在必要时检查 realpath / symlink。

### 5.4 Bundler view

记录：

- Vite aliases；
- `ssr.noExternal`；
- Rollup external；
- Nitro externals / inline / trace；
- production source alias；
- framework preset。

重点不是“有哪些配置”，而是：

> 这个 package 在每一个 bundling stage 到底走 bundled 还是 external path？

### 5.5 Artifact view

直接查看最终产物：

- `.output/server`；
- `.output/server/node_modules`；
- `.vercel/output`；
- serverless function closure；
- package logical name 是否存在；
- 是否有 symlink；
- 是否依赖 monorepo 外部父目录才能运行。

**源码 node_modules 健康不等于 artifact 健康。**

---

## 6. 实验设计：单变量比“聪明配置”重要

复杂依赖调查中，最有价值的不是一次猜中，而是保留因果关系。

### 6.1 每个实验只回答一个问题

例如：

```text
E-A：直接 dependency 能否修 runtime？
E-B：targeted public hoist 能否修 runtime？
E-C：inline 单一 package 能否修 runtime？
```

不要一次同时：

```text
加 dependency
+ 改 noExternal
+ 改 inline
+ 改 nodeLinker
+ 提高 heap
```

即使绿色，也无法知道哪个变量有效。

### 6.2 每个实验必须有控制组

记录：

- base SHA；
- 唯一 diff；
- Node/pnpm/framework versions；
- heap；
- runner/preset；
- 第一个失败门。

### 6.3 失败实验同样是资产

一个失败实验如果证明：

```text
inline element-plus -> 5120 MiB OOM
```

其价值非常高，因为它排除了未来最容易被重复尝试的方向。

不要只记录绿色方案。

---

## 7. 修复优先级：从最小责任边界向外扩

复杂依赖问题建议遵循以下优先级梯子。

```text
1. 正确 package manifest / dependency owner
2. 正确版本与 peer compatibility matrix
3. 正确 package exports / published dist
4. 精确 app/workspace alias
5. 精确 Vite transform exception
6. 精确 Nitro bundling exception
7. 精确 tracing/layout workaround
8. workspace-level hoist/linker policy
9. 全局 bundling / shamefullyHoist / flat linker
```

越往下，blast radius 越大。

### 7.1 为什么 manifest 修复优先

如果真正部署的 package 在运行时使用 `X`，最清晰的契约通常是：

```text
deployment package
└─ dependencies.X
```

而不是：

```text
“某个传递依赖大概会带上 X”
```

也不是：

```text
“bundler 恰好会把 X 卷进去”
```

### 7.2 为什么 workspace 安装策略放到后面

`publicHoistPattern`、`nodeLinker`、`shamefullyHoist` 会改变多个 package 的解析环境。

一个局部依赖故障不应默认改变整个 workspace 的 node_modules 拓扑。

只有当局部修复无效，并有证据证明安装布局本身就是要求时，才应升级到这一层。

---

## 8. 常见错误模式与为什么危险

### 8.1 “缺一个包，就直接 pnpm add 到根”

危险：

- 可能把 dependency 声明到错误 owner；
- 根 hoist 可能让问题暂时消失；
- deployment package 仍不自洽。

正确做法：先问**谁在 runtime import，它应该由谁声明**。

### 8.2 “把报错库整个 noExternal / inline”

危险：

- 改变执行路径而非依赖契约；
- graph 膨胀；
- 隐藏传递依赖问题；
- 无法说明哪一个内部 package 真正需要 transform。

### 8.3 “pnpm 严格，所以 shamefullyHoist”

危险：

- 把缺失声明变成环境偶然可见；
- 破坏包边界；
- 不同 runner / output tracer 行为仍可能不同。

### 8.4 “build 绿了，所以依赖修好了”

错误。

必须继续：

```text
standalone start
→ HTTP request
→ isolated artifact
→ target deployment
```

### 8.5 “同 SHA 就一定完全可复现”

如果没有 frozen lockfile、registry resolution 仍可漂移，或者工具链 range 仍变化，则同 Git SHA 不等于同 dependency graph。

必须记录实际 resolved versions。

### 8.6 “所有 MODULE_NOT_FOUND 都是同一类问题”

至少可能是：

- 未声明 dependency；
- exports 阻止 subpath；
- alias identity；
- output tracer 丢包；
- optional dependency 未安装；
- runtime cwd/lookup boundary；
- native platform package 不匹配。

错误文本相似，根因可以完全不同。

---

## 9. 一般性决策树

```text
出现复杂依赖错误
|
+-- install/resolve 阶段已经失败？
|   |
|   +-- 查 manifest / peer / lockfile / registry / optional dependency
|   +-- 不进入 bundler 调参
|
+-- Node 在源码 workspace 中无法 resolve？
|   |
|   +-- 查 dependency owner / alias / exports / cwd / symlink / duplicate instance
|   +-- 优先修 package contract
|
+-- dev 正常，Vite SSR 失败？
|   |
|   +-- 查 ESM/CJS / conditional exports / linked source / transform requirement
|   +-- 只有证据充分才测试 narrow noExternal
|
+-- SSR 正常，final server build 失败？
|   |
|   +-- 查 Nitro/Rollup graph / externalization / source alias / memory
|   +-- 测单一 bundling variable
|
+-- full build 正常，但 standalone runtime 失败？
|   |
|   +-- 查 artifact dependency closure
|   +-- logical specifier vs real package
|   +-- npm alias / symlink / optional / native / tracer
|   +-- 优先修 deployment package boundary
|
+-- 只在目标平台失败？
|   |
|   +-- 查 OS/arch/libc/Node ABI/preset/filesystem/env/tracing
|   +-- 不把本地 workaround 无条件带到生产
|
+-- 修改依赖配置后 OOM/变慢？
    |
    +-- 比 module count / RSS / heap / output size
    +-- 回查 wide alias / noExternal / inline / linker 改动
```

---

## 10. 验收闭环：任何“已修复”都必须跨越多个门

对复杂 SSR/standalone 项目，一个 dependency fix 至少应验证：

1. **fresh install**：安装结果可重复；
2. **resolution snapshot**：`pnpm why/list` 与关键 resolver 结果符合预期；
3. **dev/runtime probe**：如果问题涉及功能 API，应对真实路径发请求；
4. **full production build**：不是只编译单一 client；
5. **artifact inspection**：确认 standalone closure；
6. **standalone startup**：实际启动 server entry；
7. **HTTP smoke**：不是只看进程不退出；
8. **artifact isolation**：尽量脱离 monorepo 父级 node_modules 运行；
9. **cold runner / rerun**：排除缓存偶然性；
10. **target deployment**：Vercel/容器/目标 Linux 真实验证；
11. **resource regression**：module count、RSS、heap、duration 不出现不可接受退化；
12. **删除条件**：workaround 必须注明何时可以移除。

### 10.1 为什么建议 isolated artifact smoke

如果 `.output` 位于 monorepo 内部：

```text
repo/
├─ node_modules/
└─ packages/app/.output/
```

Node 解析可能沿父目录向上找到 repo 根 `node_modules`，从而“救活”一个本应不完整的 standalone output。

更强的验收是：

```text
copy .output -> temporary directory outside repo
cd temporary directory
node server/index.mjs
HTTP smoke
```

这样才能真正验证 standalone closure。

---

## 11. 记录证据时使用统一模板

每次复杂依赖事故建议至少保存下面的表。

```md
## Failure gate

- first failing stage:
- exact error:
- exact package specifier:
- cwd/runtime owner:

## Dependency identity

- importer:
- manifest owner:
- dependency kind:
- requested range:
- resolved version:
- logical package name:
- real package name:
- physical path/realpath:
- exports condition:
- duplicate instances:

## Bundling/output

- Vite bundled/external:
- Nitro bundled/external:
- trace/copy result:
- standalone package presence:

## Experiment

- base SHA:
- only variable:
- build result:
- runtime result:
- RSS/module count:

## Decision

- chosen fix:
- rejected alternatives:
- blast radius:
- removal condition:
```

统一记录可以避免下一轮只能看到“当时加了某个配置，但不知道为什么”。

---

## 12. 本项目现有事故如何映射到通用分类

### 12.1 H3 事故

```text
分类：版本世代 + phantom dependency + duplicate/错误 runtime instance
```

不是 externalization 列表问题。

### 12.2 Popper 事故

```text
分类：npm alias identity + pnpm symlink + standalone tracing/copy
```

不是“Element Plus 必须整体 inline”。

### 12.3 4 GiB / 5 GiB OOM

```text
分类：production graph / resource regression
```

与 runtime dependency closure 是另一条轴。

### 12.4 Windows trace workaround

```text
分类：platform-specific output tracing
```

本地 workaround 必须条件化，不能默认推广到 Linux/Vercel。

这几个事故故意属于不同类别，说明同一个文档站可以同时存在多条独立故障轴。

---

## 13. 对 AI agent / 后续维护者的强制纪律

处理复杂依赖问题时：

- 不根据 package name 猜根因；
- 不把另一个仓库的 workaround 复制过来；
- 不把 dev success 当 production success；
- 不把 build success 当 runtime success；
- 不把源码 node_modules 可解析当 standalone output 可解析；
- 不把一个 `MODULE_NOT_FOUND` 自动归因于 pnpm strictness；
- 不同时修改 dependency、hoist、alias、noExternal、inline 和 heap；
- 不只保存成功实验；
- 不恢复“神秘依赖白名单”；
- 不把全局 linker/hoist 政策作为局部缺包问题的第一选择。

必须：

- 记录 first failing gate；
- 建 dependency identity ledger；
- 保存 exact error；
- 做单变量实验；
- 选择最小 responsibility boundary；
- 验证 isolated artifact runtime；
- 比较资源退化；
- 记录被拒绝方案与删除条件。

---

## 14. 最终方法论

复杂依赖问题可以压缩为六个动作：

```text
1. Split lifecycle
2. Freeze evidence
3. Identify package identity
4. Classify failure
5. Run one-variable experiments
6. Repair the smallest responsible boundary and verify the artifact
```

中文可记为：

> **分阶段、冻证据、认身份、分类别、做单变量、修最小边界、验真实产物。**

如果一个方案无法回答下面三个问题，就不应作为长期修复：

1. **它修的是哪一个明确失败门？**
2. **为什么必须在这一层修，而不是更小的 package/dependency boundary？**
3. **如何证明它没有靠 workspace、缓存、父级 node_modules 或大范围 bundling 偶然变绿？**

这三问比任何固定的 dependency allowlist / denylist 更值得长期保存。