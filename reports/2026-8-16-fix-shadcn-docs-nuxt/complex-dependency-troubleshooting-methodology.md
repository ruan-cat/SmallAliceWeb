# 复杂依赖与复杂构建场景通用排障方法论

> 更新：2026-08-20
>
> 适用范围：pnpm monorepo、Nuxt/Vite/Nitro，以及其他 Node.js SSR、bundler、standalone/serverless output 场景。
>
> 本文不绑定具体包名。专项 externalization 规则见 [`dependency-externalization-policy.md`](./dependency-externalization-policy.md)。

## 1. 总原则

复杂依赖问题不要从“报错里出现了哪个包”开始修，而要先回答：

> **第一个失败发生在哪一个生命周期门？运行时认为自己在加载谁？最终产物实际上携带了谁？**

推荐固定顺序：

```text
分生命周期
→ 冻结证据
→ 建依赖身份账本
→ 分类故障
→ 单变量实验
→ 修最小责任边界
→ 验真实产物
→ 删除临时诊断工具
```

## 2. 生命周期必须拆开

把 Node/SSR 构建拆成独立验收门：

```text
A. manifest declaration
B. dependency solving / lockfile
C. installation / node_modules layout
D. Node resolution
E. dev runtime
F. client/Vite transform
G. SSR transform / externalization
H. final server bundling
I. output tracing / dependency copy
J. standalone startup
K. real HTTP runtime
L. target platform deployment/runtime
```

必须记录 first failing gate。以下说法诊断价值很低：

- “Nuxt 挂了”；
- “pnpm 缺包”；
- “Element Plus 不兼容”；
- “Vercel 丢依赖”。

应该记录成：

```text
install                  PASS
Vite client/server       PASS
Nitro prerender          PASS
final Nitro build        PASS
.output startup          PASS
HTTP /                   FAIL -> ERR_MODULE_NOT_FOUND @popperjs/core
Vercel                   not tested
```

## 3. 为可疑依赖建立身份账本

至少记录：

| 维度 | 要回答的问题 |
| --- | --- |
| logical import specifier | 源码实际 import 的逻辑名称是什么？ |
| importer | 谁在 import？应用、workspace package 还是第三方？ |
| manifest owner | 哪个 package.json 应负责声明？ |
| dependency kind | dependency / peer / optional / dev？ |
| requested range | manifest 要求什么？ |
| resolved version | pnpm 实际解析到什么？ |
| real package identity | npm alias/fork 后真实包是谁？ |
| physical realpath | 磁盘真实路径、symlink、virtual store 在哪？ |
| exports/conditions | import/require/node/browser 命中了哪个入口？ |
| instance count | Vue/H3/React 等 singleton 是否重复？ |
| bundling status | Vite/Nitro 中 bundled、transformed 还是 external？ |
| artifact status | standalone output 是否保留运行时逻辑名称？ |

逻辑包名与物理包必须分开。例如：

```text
logical import: @popperjs/core
real package:   @sxzz/popperjs-es
relationship:   npm alias
```

磁盘上存在真实包，并不能证明 runtime 按逻辑 specifier 能解析它。

## 4. 至少区分九类复杂依赖故障

### 4.1 声明与解析契约

典型问题：phantom dependency、runtime dependency 放错 devDependencies、peer 未满足、optional 实际必需、npm alias logical name 没有由部署包声明、semver 漂移。

优先检查：

```sh
pnpm why <pkg>
pnpm list <pkg> --depth 10
```

优先修 manifest/owner，而不是先 hoist 或 bundle。

### 4.2 版本世代与 peer compatibility

框架生态经常出现“semver 表面兼容、运行时代际不兼容”。Nuxt/Content/H3、React/plugin、Vue/plugin 都可能发生。

必须看实际 resolved version、peer、上游测试版本和 API/exports 变化。必要时建立已验证 compatibility matrix。

### 4.3 duplicate singleton / 多实例

Vue、React、H3、Pinia、router、ORM runtime 等重复实例可能表现为 context/inject 丢失、`instanceof` 失败、Symbol/token 不相等，而不是 MODULE_NOT_FOUND。

必须比较调用方和被调用方各自解析到的物理实例。

### 4.4 ESM / CJS / conditional exports

典型症状：

- `ERR_REQUIRE_ESM`；
- named export 不存在；
- package subpath 未在 `exports` 声明；
- dev 正常而 SSR/production 失败；
- import 与 require 命中不同实现。

只有已经证明 externalized Node 路径无法消费发布物时，才考虑 narrow `ssr.noExternal`。不能因为一个包是 ESM 就默认 noExternal。

### 4.5 workspace source / dist 边界

production alias 到 `../package/src` 会绕过 package exports/dist，把未编译源码和额外传递依赖拖入 production graph。

生产默认应消费正式 package boundary；必须消费 source 时，应作为明确架构决策单独验证。

### 4.6 bundler transform / externalization

这一类才讨论：

- `vite.ssr.noExternal`；
- `nitro.externals.inline`；
- Rollup external；
- linked source transform。

判断标准是 exact error 证明“external path 失败，而由对应 bundler transform 后正确”。详细准入规则见 [`dependency-externalization-policy.md`](./dependency-externalization-policy.md)。

### 4.7 standalone tracing / dependency copy

典型形态：

```text
dev PASS
build PASS
.output start PASS
HTTP runtime FAIL -> MODULE_NOT_FOUND
```

优先检查 logical specifier、npm alias、symlink、optional/native dependency、tracer copy，以及产物是否偷偷从 monorepo 父级 node_modules 回退解析。

### 4.8 native / optional / platform dependency

例如 sharp、better-sqlite3、swc/esbuild platform binary。记录 build/runtime OS、arch、libc、Node ABI、optional binary 选择和产物复制结果。

这类问题通常不是 noExternal 能解决的。

### 4.9 构建图 / 资源型问题

典型症状：heap OOM、module count 暴涨、RSS 增长、构建突然变慢、output size 异常。

比较：

- transformed modules；
- max RSS；
- V8 heap；
- build duration；
- output size；
- source alias / noExternal / inline / linker 变化。

不能把 OOM 简化成“机器内存不足”。配置本身可能是 graph amplifier。

## 5. 修改前先做五视图快照

### Manifest view

读取应用、importer、报错 package 的 package.json，关注 dependencies、peer、optional、exports。

### Solver view

记录 `pnpm why/list`、实际 resolved versions、peer variants、alias、多实例。

### Resolver view

在真正失败的 cwd/runtime context 下测试：

```sh
node --input-type=module -e "console.log(import.meta.resolve('<pkg>'))"
node -e "console.log(require.resolve('<pkg>'))"
```

必要时检查 realpath/symlink。

### Bundler view

记录 Vite alias、SSR externalization、Nitro externals/inline/trace、Rollup external、preset。核心问题是：每一阶段该 package 走 bundled 还是 external path？

### Artifact view

直接检查 `.output/server`、`.output/server/node_modules`、`.vercel/output` 或函数 closure。源码 node_modules 健康不等于 artifact 健康。

## 6. 错误收集必须在诊断层完成

高信号诊断至少应保留：

- first failing gate；
- exact command；
- exact exit code；
- stdout/stderr；
- V8 heap limit；
- `/usr/bin/time -v` max RSS；
- module count / build duration；
- standalone server log；
- HTTP status；
- response headers；
- 有长度上限的 response body；
- exact Git SHA、Node/pnpm/framework versions；
- failure artifact 或长期可复核摘要。

### 6.1 为什么要实际发 HTTP 请求

进程能监听端口不代表依赖 closure 完整。SmallAliceWeb 的 Popper 事故就是 server 已监听，直到请求 `/` 才触发 `ERR_MODULE_NOT_FOUND`。

### 6.2 为什么建议 isolated artifact smoke

如果 `.output` 仍位于：

```text
repo/
├─ node_modules/
└─ packages/app/.output/
```

Node 可能向父级寻找依赖，意外救活不完整产物。更强验证是把 `.output` 复制到仓库树外再启动和 HTTP smoke。

## 7. 临时 wrapper / shim 的纪律

排障期间可以使用 process wrapper、shim、额外日志脚本，但它们必须被视为**控制变量和观测工具**，不是自动成为长期架构。

创建临时 wrapper 时必须同时记录：

1. 它只控制什么变量；
2. 它不解决什么根因；
3. 原始命令是什么；
4. 如何保留 stdout/stderr/exit code；
5. 删除条件是什么；
6. 退役后需要通过哪些 exact-SHA 验收门。

### 7.1 不要把观测能力绑死在 wrapper 里

长期观测应优先放在 CI/test harness：

```text
native package command
→ CI 注入必要环境
→ resource measurement
→ artifact startup
→ HTTP smoke
→ failure diagnostics
```

而不是：

```text
package build
→ 永久自定义 wrapper
→ 所有平台都必须依赖它才能运行
```

### 7.2 wrapper 退役流程

```text
根因已修复
→ 恢复 package 原生命令
→ 删除 wrapper 文件
→ 保留必要的 CI 资源约束
→ exact-SHA GitHub full build + runtime smoke
→ exact-SHA 云平台 fresh build/deploy
→ 记录退役证据
```

不能因为 wrapper 曾帮助调查就永久保留。

## 8. 单变量实验

一次实验只回答一个问题。例如：

```text
E-A: direct dependency 能否修 runtime？
E-B: targeted public hoist 能否修 runtime？
E-C: inline 单一 package 能否修 runtime？
```

不要同时改 dependency + noExternal + inline + nodeLinker + heap。

每个实验记录 base SHA、唯一 diff、工具链、heap/preset、first failing gate、build/runtime 结果和资源指标。失败实验也是资产，因为它能阻止未来重复高诱惑错误方向。

## 9. 修复优先级：从最小责任边界向外扩

推荐梯子：

```text
1. 正确 manifest / dependency owner
2. 正确版本与 peer compatibility
3. 正确 package exports / dist
4. 精确 app/workspace alias
5. 精确 Vite transform exception
6. 精确 Nitro bundling exception
7. 精确 tracing/layout workaround
8. workspace-level hoist/linker policy
9. 全局 bundling / shamefullyHoist / flat linker
```

越往下 blast radius 越大。能在 deployment package 声明一个真实 runtime dependency，就不要先改变整个 workspace node_modules 拓扑。

## 10. 常见错误模式

禁止把以下做法当默认修复：

- 缺包就 `pnpm add` 到仓库根；
- 把报错库整个 noExternal/inline；
- pnpm 严格就 shamefullyHoist；
- build 绿就宣布可部署；
- 同 Git SHA 就假定依赖输入完全相同；
- 所有 MODULE_NOT_FOUND 都归成一种问题；
- 一个实验同时改多个 dependency/bundling/heap 变量；
- 把另一个仓库的 workaround 直接复制过来。

## 11. 一般决策树

```text
install/resolve 已失败？
→ manifest / peer / lockfile / registry / optional

源码 workspace 中 Node 无法 resolve？
→ owner / alias / exports / cwd / symlink / duplicate instance

Dev 正常、Vite SSR 失败？
→ ESM/CJS / conditional exports / transform requirement

SSR 正常、final server build 失败？
→ Rollup graph / externals / source alias / memory

Full build 正常、standalone runtime 失败？
→ artifact closure / logical identity / alias / tracer

只有目标平台失败？
→ OS/arch/libc/ABI/preset/filesystem/env

改依赖配置后 OOM？
→ module count / RSS / heap / output size / graph amplifier
```

## 12. 验收闭环

复杂 SSR/standalone dependency fix 至少验证：

1. fresh install；
2. resolution snapshot；
3. dev/runtime probe（如相关）；
4. full production build；
5. artifact inspection；
6. standalone startup；
7. real HTTP smoke；
8. 尽可能 isolated artifact；
9. cold runner/rerun；
10. target deployment；
11. resource regression；
12. workaround removal condition。

## 13. SmallAliceWeb 的映射

- H3/Content 事故：版本世代 + phantom/错误 runtime instance；
- Popper 事故：npm alias identity + pnpm symlink + standalone tracing/copy；
- 4–5 GiB OOM：production graph/resource；
- Windows `trace:false`：platform-specific tracing；
- `run-nuxt-with-memory.mjs`：阶段性 process wrapper，不是根修复。

### 13.1 wrapper 退役实证

最终退役提交：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
🐞 fix: 退役 Nuxt 临时内存包装脚本
```

该提交：

- 删除 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`；
- `packages/ai-vue-doc/package.json` 恢复原生 `nuxt prepare` / `nuxt build`；
- 保留 `@popperjs/core -> npm:@sxzz/popperjs-es` 根因修复；
- GitHub CI 仍只在 build step 直接提供已测得的 5120 MiB budget。

exact-SHA 验证：

- GitHub Actions run `32335097226` / job `96323008840`：success；
- production build：success；
- `.output` startup + HTTP smoke：success；
- Vercel deployment `dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt`：READY；
- Vercel 日志确认 `packages/ai-vue-doc postinstall$ nuxt prepare` 与 package build 直接执行 `nuxt build`，wrapper 不再参与。

这证明正确的长期形态是：**恢复原生命令，把诊断和资源观测留在 CI。**

## 14. 事故记录模板

```md
## Failure gate
- first failing stage:
- exact error:
- command/exit code:

## Dependency identity
- importer:
- manifest owner:
- dependency kind:
- resolved version:
- logical/real package:
- realpath:
- exports condition:
- duplicate instances:

## Bundling/output
- Vite bundled/external:
- Nitro bundled/external:
- trace/copy result:
- standalone presence:

## Experiment
- base SHA:
- only variable:
- build/runtime result:
- RSS/module count:

## Decision
- chosen fix:
- rejected alternatives:
- blast radius:
- temporary tooling:
- removal condition:
```

## 15. 最终口诀

> **分阶段、冻证据、认身份、分类别、做单变量、修最小边界、验真实产物、退临时工具。**

长期方案必须回答：它修哪个明确失败门？为什么必须在这一层修？如何证明没有靠缓存、父级 node_modules、大范围 bundling 或临时 wrapper 偶然变绿？
