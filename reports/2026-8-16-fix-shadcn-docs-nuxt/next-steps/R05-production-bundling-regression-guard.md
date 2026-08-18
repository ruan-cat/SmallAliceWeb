# R05 production bundling graph 可能被历史配置重新放大

- **优先级**：P0
- **状态**：OPEN
- **类型**：构建配置 / 回归防护
- **权威策略**：[`../DEPENDENCY-EXTERNALIZATION-POLICY.md`](../DEPENDENCY-EXTERNALIZATION-POLICY.md)

## 风险说明

E1 已经提供强证据：历史 production source alias、blanket `vite.ssr.noExternal` 和 blanket `nitro.externals.inline` 会显著放大文档站 production graph。

收敛这些配置后，server transformed modules 从历史约 4028 降到 2449，约减少 39%，并把默认 heap 下的死亡点推迟到完整 prerender 之后。

当前问题已经修复，但仓库没有任何自动化护栏阻止未来 agent 或依赖兼容修复再次加入类似的“大范围 inline / noExternal / 直接消费 workspace src”配置。由于这些配置短期常能让某些 ESM/SSR/alias 错误消失，因此具有很强的诱惑性。

必须明确：`ssr.noExternal` 与 `nitro.externals.inline` 都是合法工具，但它们解决的是**特定 transform/bundle 路径**问题，而不是通用 dependency resolution。真正风险不是“出现这两个字段”，而是把它们退化成一张持续增长、在 Vite 与 Nitro 之间互相复制的传递依赖白名单。

## 高风险模式

后续变更若出现以下模式，应默认触发专项审查：

- `vite.ssr.noExternal` 使用大量包名或宽泛正则；
- `nitro.externals.inline` 使用大量包名、宽泛正则或接近 blanket 的规则；
- Vite 与 Nitro 出现高度重合、机械镜像的 package-family 列表；
- production alias 把 workspace package 指向 `../*/src`；
- 为修一个 runtime dependency 把整个 UI 库 inline；
- 为解决 pnpm alias / `MODULE_NOT_FOUND` 问题改成大范围 bundling；
- 为了“防止漏包”一次加入一串 transitive dependencies。

## 已知反例

- E1 移除历史 source alias / blanket bundling 后 graph 明显缩小：server transformed modules 约 `4028 -> 2449`，下降约 39%。
- E6-B **仅 inline `element-plus`** 就让 5120 MiB production build 失败，说明即使“只 inline 一个大 UI 包”也可能重新跨过内存边界。
- E6-A 没有恢复 bundling 列表，只在部署包中显式声明 `@popperjs/core -> npm:@sxzz/popperjs-es`，5120 build + `.output` HTTP smoke 成功。
- E7-A 全局 `nodeLinker: hoisted` 也重新触发 5120 MiB V8 OOM，说明改变整个依赖拓扑同样不是低风险捷径。

## narrow exception 准入条件

### 新增 `vite.ssr.noExternal`

必须同时满足：

1. exact error 明确发生在 Vite SSR transform/load；
2. 有证据证明 package 需要 Vite pipeline 转换，而不是缺 runtime dependency；
3. 单变量只增加一个精确 package/path matcher；
4. 不自动加入它的 transitive dependencies；
5. module count / RSS / build time 有前后对比；
6. `.output` HTTP + Vercel 仍通过。

### 新增 `nitro.externals.inline`

必须同时满足：

1. exact error 明确发生在 Nitro server bundling/externalized code path；
2. 有证据证明代码必须由 Nitro/Rollup bundle，例如 external package 内部使用应用 alias；
3. 单变量只 inline 最小 package/path；
4. 5120 MiB full build 仍通过；
5. module count / RSS / output size 有前后对比；
6. standalone HTTP smoke + Vercel 通过；
7. 记录 upstream issue 与删除条件。

**Vite 中存在某个 `noExternal` matcher，不能作为 Nitro 中复制同一 `inline` matcher 的理由。两个阶段必须独立举证。**

## 建议加固任务

1. 写一个轻量静态检查脚本，扫描 `packages/ai-vue-doc/nuxt.config.ts` 与相关配置：
   - 对 blanket/wide regex `noExternal` / `inline` 给出 failure；
   - 对 Vite/Nitro 高度重合的依赖族列表给出 failure；
   - 对 production alias 指向 workspace `src` 给出 failure 或强警告。
2. 若确实需要 narrow exception，要求在代码旁写清 exact error、对应 issue/实验和删除条件。
3. 将 R04 的 module count / RSS 基线作为第二层动态护栏。
4. 对 runtime `MODULE_NOT_FOUND` 优先检查 package identity、direct dependency、npm alias、Nitro output tracing，不要先扩大 bundling。
5. 在 AGENTS 或项目级构建说明中加入一句高信号约束：不要恢复 E1 已移除的图放大器。

## 验收标准

- [ ] CI 能识别明显 blanket `noExternal` / `externals.inline`。
- [ ] CI 能识别把同一大依赖列表镜像到 Vite/Nitro 的模式。
- [ ] production source alias 指向 workspace `src` 时会被检查发现。
- [ ] narrow exception 有 exact error、理由、单变量证据和回滚条件。
- [ ] 任意相关配置变更都伴随 module count / RSS 对比。
- [ ] 任意相关配置变更都通过 5120 full build + standalone HTTP smoke。

## 不要做什么

- 不要把静态规则写成完全禁止 Nuxt/Vite 官方支持的 `noExternal` / `inline`；真正目标是禁止无边界使用。
- 不要为了通过 guard 把宽泛正则拆成几十个包名，实质 graph 若一样大仍然是同一风险。
- 不要看到 `MODULE_NOT_FOUND` 就把报错包的父级 UI 框架 inline。
- 不要把 Vite 的 matcher 列表机械复制到 Nitro，或反过来。
- 不要仅以“CI build 现在能过”证明 bundling 方案健康；必须验证 standalone runtime。
