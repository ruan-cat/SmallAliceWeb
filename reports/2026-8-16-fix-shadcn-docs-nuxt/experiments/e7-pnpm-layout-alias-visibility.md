# E7：pnpm node_modules 拓扑与 npm alias 可见性实验

> 状态：已完成
>
> 目的：验证 `.output` 缺失 `@popperjs/core` 是否与 pnpm 安装布局/alias 可见性有关，并判断 workspace 级拓扑改动是否适合作为长期修复。

## 背景

E6 已确认一个独立的 post-build runtime 故障：Nuxt production build 可以成功，但 `.output/server/index.mjs` 在真实 HTTP 请求时因 Element Plus 导入逻辑包名 `@popperjs/core` 而 `ERR_MODULE_NOT_FOUND`。

依赖关系为：

```text
@popperjs/core -> npm:@sxzz/popperjs-es
```

E7 不再修改 Nitro bundling，而是直接测试 pnpm node_modules 拓扑是否参与了 alias tracing / visibility 问题。

## E7-A：全局 `nodeLinker: hoisted`

- PR：#28
- branch：`2026-8-18-nuxt-e7-hoisted-linker`
- head：`ed7ce2812325269e0976eb07a8f6762b22486886`
- 唯一变量：

```yaml
nodeLinker: hoisted
```

### 结果

- `pnpm install`：成功；
- GitHub Actions run `32117268637`：失败；
- job `95649504369`：`生产构建` 步骤失败，runtime smoke 未进入；
- 日志确认 final production build 再次触发 `Reached heap limit`；
- maximum RSS：`5,646,292 kB`；
- runner 仍有充足物理内存，因此失败边界仍是 5120 MiB V8 old-space，而不是主机 RAM 耗尽。

### 结论

全局 flat/hoisted linker 确实改变依赖可见性，但同时改变整个 workspace 的安装拓扑与 production working set，直接破坏已经验证的 5120 MiB 构建预算。

因此：

> **不能为了一个 alias tracing 缺口，把整个 workspace 改成 `nodeLinker: hoisted`。**

## E7-B：只 public-hoist 逻辑 alias 包名

- PR：#29
- branch：`2026-8-18-nuxt-e7-popper-public-hoist`
- head：`39c6fef7142eb0fcd07a54faf439d17714bb1626`
- 唯一变量：

```yaml
publicHoistPattern:
  - "@popperjs/core"
```

### 结果

- GitHub Actions run `32117424893`：成功；
- 5120 MiB full production build：成功；
- `.output` runtime HTTP smoke：成功。

### 结论

这个实验说明**依赖可见性 / pnpm 物理布局确实参与了故障**。但是 `publicHoistPattern` 仍然属于 workspace 级安装策略，它的责任边界大于实际部署 package。

因此它被保留为已验证 fallback，而不是最终首选。

## E7 最终判断

E7-A 与 E7-B 联合支持下面的因果模型：

```text
npm alias logical identity
+ pnpm symlink / visibility layout
+ Nitro standalone tracing/copy
-> runtime dependency closure 可能不完整
```

但这不意味着“pnpm 必须扁平化”。更准确的修复优先级是：

1. 先在实际部署 package 明确声明运行时需要的逻辑 dependency；
2. 再考虑 targeted visibility workaround；
3. 全局 linker/hoist 只作为高爆炸半径诊断或迁移方案，不作为局部缺包问题的默认修复。

最终采用 E6-A 的 app-local dependency：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

而没有采用 E7-A/E7-B 作为生产默认配置。

## 与其他实验的关系

- E1：证明 blanket bundling/source alias 会扩大 production graph；
- E5：测得 4608 MiB 失败、5120/6144 MiB 成功；
- E6：确认 runtime 缺包属于 npm alias standalone output 问题；
- E7：证明 pnpm 拓扑参与 alias visibility，但同时证明全局 hoist 会产生明显构建回归。

E7 是最终根因模型的一部分，而不是新的长期配置要求。