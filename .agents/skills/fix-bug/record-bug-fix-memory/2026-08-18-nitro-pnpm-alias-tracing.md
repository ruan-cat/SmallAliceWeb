# 2026-08-18 Nitro standalone output 丢失 pnpm npm alias runtime dependency

## 1. 问题现象

`@ruan-cat-drill-doc/ai-vue-doc` 的 Nuxt/Nitro production build 在完成内存与 production graph 收敛后，暴露出第二层独立故障：

- `nuxi build --preset=vercel` 可以完成；
- `.output/server/index.mjs` 可以启动并监听端口；
- 但对 standalone output 发起真实 HTTP `/` 请求时返回 500；
- fresh server log 的首个可信错误是 Element Plus 在运行时导入 `@popperjs/core` 时出现 `ERR_MODULE_NOT_FOUND`。

这打破了“production build 成功即可视为 Nuxt 文档站可部署”的隐含基线。对 Nitro 项目而言，**build 完成、standalone output 可启动、HTTP 可服务、真实云部署**必须视为不同验收门。

本事故与此前的 V8 heap / final Nitro Rollup 峰值属于两个不同问题：5120 MiB old-space 只是构建内存边界，不是 npm alias 丢失的根因修复。

## 2. 实际根因

Element Plus 运行时代码按逻辑包名导入：

```text
@popperjs/core
```

但当前依赖图中它通过 npm alias 指向实际包：

```text
@popperjs/core -> npm:@sxzz/popperjs-es
```

在 pnpm 默认的 isolated / symlink node_modules 布局下，逻辑包名、真实 package identity 和磁盘物理位置并不一一对应。Nitro/Nitro File Trace 在生成 standalone `.output` 的依赖追踪过程中，没有正确保留这个 npm alias 的**逻辑运行时包名**，于是源码 workspace 中“看起来存在”的 transitive dependency 没有以运行时所需名称进入 standalone output。

因此真实故障边界是：

```text
npm alias 逻辑包名
  + pnpm symlink / virtual-store 布局
  + Nitro standalone dependency tracing
  -> .output runtime dependency 不完整
```

这不是“pnpm 完全没有 hoist”。pnpm 默认仍存在 hidden hoisting；问题在于 standalone tracer 对 alias identity 与 symlink graph 的处理边界。Nitro 上游 issue `nitrojs/nitro#1574` 也记录了 pnpm symlink + npm alias tracing，并出现同一组 `@popperjs/core` / `@sxzz/popperjs-es` 依赖关系：

- https://github.com/nitrojs/nitro/issues/1574

本次修复类型应归类为：**部署边界 runtime dependency 显式化 / 依赖入口兼容 / standalone output 依赖完整性修复**。

## 3. 关键误导点

### 3.1 `build` 绿色不等于 standalone runtime 绿色

最大的误导是把：

```text
Nuxt build complete
```

误当成：

```text
.output 已具备完整的独立运行依赖
```

两者并不等价。此次故障只有在真正启动 `.output/server/index.mjs` 并发送 HTTP 请求后才稳定暴露。

### 3.2 `MODULE_NOT_FOUND` 不等于“应该把 pnpm 全局扁平化”

源码 workspace 能解析 transitive dependency，不代表 Nitro 会把它复制进 standalone output。遇到 post-build `MODULE_NOT_FOUND` 时，不能直接从“找不到包”跳到 `shamefullyHoist` 或全局 flat node_modules。

为验证“是不是没有扁平化导致”，本次做了两个单变量实验。

#### E7-A：全局 `nodeLinker: hoisted`

Draft PR #28 只增加：

```yaml
nodeLinker: hoisted
```

结果：

- `pnpm install` 成功；
- 5120 MiB production build 失败；
- runtime smoke 未能进入；
- V8 日志明确出现 `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`；
- GC 已逼近约 5.1 GiB old-space；
- `/usr/bin/time -v` 的 max RSS 为 `5,646,292 kB`；
- 同时 GitHub runner 仍有约 10 GiB 可用物理内存，因此失败边界是 V8 heap，而不是 runner 物理 RAM 耗尽。

这构成仓库级反例：**为一个 alias tracing 缺口把整个 workspace 改成 flat linker，不是无成本根治方案，并且会改变 production graph / working set，使当前已验证的 5120 MiB 构建边界重新失效。**

#### E7-B：只 public-hoist 逻辑 alias 包名

Draft PR #29 只增加：

```yaml
publicHoistPattern:
  - "@popperjs/core"
```

结果：

- 5120 MiB full production build 成功；
- `.output` runtime HTTP smoke 成功。

这个实验说明“依赖可见性 / 物理布局确实参与了故障”，但 `publicHoistPattern` 仍然属于 workspace 级兼容策略。它证明了因果关系，不自动意味着应该把 workspace 安装策略作为生产首选修复。

### 3.3 构建内存与 output 依赖完整性是两条独立轴

此次排错前半段存在 final Nitro Rollup / V8 heap 峰值，后半段存在 standalone dependency 缺失。如果只盯其中一条，会形成错误结论：

- 提高 heap 可以让 build 继续，但不会自动补齐 alias runtime dependency；
- hoist 可以改变 alias 可见性，但也可能重新放大构建 working set；
- 因此必须把“构建是否完成”和“产物是否独立可运行”拆开验证。

### 3.4 推荐排查顺序

以后遇到 Nuxt/Nitro production build 后的 `MODULE_NOT_FOUND`，优先按下面顺序排查：

1. **拆生命周期。** 分别记录 `install -> Nuxt client/server build -> final Nitro build -> .output start -> HTTP runtime -> Vercel` 的首个失败门。
2. **不要停在 build complete。** fresh 启动 `.output/server/index.mjs`，对真实 HTTP 路由做 smoke；只验证进程“没退出”仍然不够。
3. **读取 exact logical missing package name。** 不先猜 peer dependency、hoist 或 Nitro 配置。
4. **检查依赖身份。** 对照 `package.json`、lockfile、npm alias、pnpm symlink / virtual store，区分“逻辑导入名”和“真实 package name”。
5. **比较源码树与 `.output`。** 确认源码 workspace 能解析的包是否真的以运行时需要的名字进入 standalone output。
6. **做单变量实验。** 优先比较：部署包显式 direct dependency、定向 `publicHoistPattern`；全局 `nodeLinker: hoisted` 只作为诊断，不直接当长期方案。
7. **选择爆炸半径最小的修复。** 能局部修部署包依赖边界，就不要改整个 workspace 的解析模型。
8. **同一 SHA 做 fresh 验证。** 至少覆盖 CI full build、fresh `.output` HTTP smoke、独立 cold runner / rerun 和真实 Vercel Git Preview。
9. **进一步强化隔离。** 条件允许时，把 `.output` 复制到完全脱离 monorepo 根 `node_modules` 的临时目录后再 smoke，防止父目录依赖意外“救活”不完整产物。

## 4. 有效修复

最终采用部署包局部显式 dependency，而不是全局改变 pnpm node_modules 拓扑：

```json
{
  "dependencies": {
    "@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
  }
}
```

落点：`packages/ai-vue-doc/package.json`。

同时保留已经通过前序实验验证的最小 production graph，并在 CI 中增加 `.output` 的真实 HTTP runtime smoke。

需要明确区分：

- `--max-old-space-size=5120`：用于已测得的构建内存 headroom；
- 显式 `@popperjs/core` npm alias dependency：用于修复 standalone output runtime dependency 完整性；
- 两者解决的是不同故障门，不能互相替代。

`publicHoistPattern: ["@popperjs/core"]` 已通过单变量实验验证，可作为未来兼容 fallback；但当前不作为生产首选，因为它改变 workspace 级依赖可见性。

禁止把 `shamefullyHoist` 或全局 `nodeLinker: hoisted` 当作此类问题的默认修复。

## 5. 验证方式

最终功能候选 SHA：

```text
a021ce96534360029e579183b8b5841b785f048a
```

fresh 验证证据：

- GitHub Actions run `32118675630`：`completed / success`；
- 同一 run 的“生产构建”步骤成功；
- 同一 run 的“验证 Nuxt 产物可启动”步骤成功，意味着 `.output/server/index.mjs` + HTTP smoke 通过；
- Vercel Git Preview deployment `dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs`：`READY`；
- 对该 Preview `/` 发起实际请求：HTTP 200；
- 查询该 exact deployment 最近两小时 `error` / `fatal` runtime logs：0 条；
- E7-B（PR #29）证明定向 public-hoist 可以规避 alias tracing 缺口；
- E7-A（PR #28）证明全局 hoisted linker 在本仓库会重新触发 5120 MiB V8 heap OOM，因此不能把“整体扁平化”视为低风险根治。

最终验证基于 fresh CI、fresh standalone server、fresh HTTP request 与真实 Vercel Git deployment，不依赖历史缓存或仅看 build 日志。

## 6. 后续约束

1. **Nuxt/Nitro build 成功不能单独标记“可部署”。** 必须验证 `.output` 的 HTTP runtime。
2. post-build `MODULE_NOT_FOUND` 首先检查 npm alias、symlink、Nitro/NFT tracing 与 `.output` dependency copy，不要先全局 hoist。
3. 部署边界缺少 runtime dependency 时，优先在实际部署 package 内显式声明依赖；只有证据表明必要时才使用定向 `publicHoistPattern`。
4. 禁止为了隐藏 phantom dependency 或单个 tracer 缺口启用 `shamefullyHoist`。
5. `nodeLinker: hoisted` 会改变整个 workspace 的依赖布局与 production graph；本仓库已有 5120 MiB OOM 反例，未来若再次考虑必须独立做完整内存与 runtime 回归。
6. 继续把构建内存峰值与 standalone output 依赖完整性视为独立验收轴。
7. 所有“已修复”结论优先基于 fresh process、fresh log、fresh HTTP 页面和 exact-SHA 云部署。
8. 如果 Nitro/Nitro File Trace 上游后续修复 pnpm npm alias tracing，只能在删除本地兼容 dependency 后重新跑 isolated `.output` HTTP smoke + Vercel，再决定移除兜底。
9. 推荐后续把 CI smoke 强化为：将 `.output` 复制到脱离 monorepo 的临时目录后启动，从验证层彻底排除父目录 workspace `node_modules` 的偶然救援。
