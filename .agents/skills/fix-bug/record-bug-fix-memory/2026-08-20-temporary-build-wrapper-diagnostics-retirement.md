# 2026-08-20 临时构建 wrapper、错误取证与安全退役

## 1. 适用场景

适用于 Node/Nuxt/Vite/Nitro 等构建故障中，为固定 heap、cwd、环境变量、子进程行为或额外日志而临时引入 process wrapper / shim 的情况。

本案例中的临时工具：

```text
packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs
```

它曾用于：

- 统一 `--max-old-space-size=5120`；
- Windows 使用 `pnpm.cmd`；
- 固定 package cwd；
- 继承 stdout/stderr；
- 透传子进程退出码。

它**不是** Nuxt OOM 根因修复，也**不是** standalone Popper 缺包根因修复。

## 2. 核心教训：临时 wrapper 是控制变量，不是默认长期架构

排障期间 wrapper 很容易因为“它让实验可重复”而被误认为最终方案。

创建 wrapper 时必须同时写明：

1. 它控制的唯一变量；
2. 它不解决的根因；
3. 被包装前的原生命令；
4. stdout/stderr/exit code 如何保留；
5. 删除条件；
6. 退役后必须通过哪些 exact-SHA 验收门。

如果没有 removal condition，临时诊断代码会自然腐化为永久依赖。

## 3. 错误收集不应依赖 wrapper 存活

高信号 observability 应放在 CI/test harness，而不是 package build wrapper 内。

本轮最终有效的错误取证包括：

- lifecycle first failing gate；
- exact command / exit code；
- V8 heap limit；
- `/usr/bin/time -v` max RSS；
- server transformed modules；
- 实际启动 `.output/server/index.mjs`；
- 发真实 HTTP 请求；
- server process 状态；
- server log；
- HTTP status / headers；
- bounded response body；
- failure diagnostics artifact；
- exact Git SHA / runner / Node / pnpm / framework versions。

真正关键的 runtime error：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

只有在 `.output` 已启动后发送真实 HTTP 请求才稳定暴露。

因此：

> **观测能力应该包围原生命令，而不是迫使原生命令永远经过临时 wrapper。**

## 4. 推荐结构

长期结构：

```text
package.json: native command
    ↓
CI: inject measured resource budget
    ↓
resource measurement
    ↓
production build
    ↓
artifact startup
    ↓
HTTP smoke
    ↓
failure diagnostics/artifact
```

不推荐：

```text
package.json
→ custom wrapper
→ wrapper 再决定 heap/cwd/command
→ 所有平台长期依赖 wrapper 才能 build
```

## 5. 退役前必须先证明根因已经独立修复

SmallAliceWeb 最终根因修复位于：

1. production graph：删除 source alias、blanket noExternal/inline；
2. runtime dependency：部署 package 显式声明 `@popperjs/core -> npm:@sxzz/popperjs-es`；
3. build capacity：graph 收敛后实测 4608 fail / 5120 pass / 6144 pass。

wrapper 本身不参与这三条因果链。

## 6. 退役操作

退役 commit：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
🐞 fix: 退役 Nuxt 临时内存包装脚本
```

实际操作：

- 删除 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`；
- `predev` 恢复 `nuxt prepare`；
- `prebuild` 恢复 `nuxt prepare`；
- `build` 恢复 `nuxt build`；
- `postinstall` 恢复 `nuxt prepare`；
- 保留真实 Popper runtime dependency；
- GitHub workflow build step 继续直接设置 5120 MiB。

## 7. exact-SHA GitHub 验证

```text
SHA  ba810875c7680a3a0631a0b5e1880259aba67fac
run  32335097226
job  96323008840
```

结果：`completed / success`。

已通过：

- install；
- production build；
- `.output` startup；
- HTTP smoke。

因此 GitHub 构建不需要 wrapper，只需要 workflow 在 build 生命周期提供已验证的资源 budget。

## 8. exact-SHA Vercel 验证

```text
deployment dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt
state      READY
```

Vercel 日志明确显示：

```text
packages/ai-vue-doc postinstall$ nuxt prepare
...
@ruan-cat-drill-doc/ai-vue-doc#build
> nuxt prepare
> nuxt build
```

这证明真实 Vercel Git build 已执行原生命令，而不是因为 wrapper 文件仍在或 Turbo 只复用旧 wrapper 产物。

## 9. 历史无 wrapper 对照

E5-B SHA：

```text
88d17073a5937cb17c992b1940404034152ea2e0
```

当时 package scripts 同样是原生 Nuxt 命令，GitHub build 仅由 workflow 设置 5120 MiB并成功。

Vercel deployment：

```text
dpl_631K2XorTLoUSX7Sg9pcUYT5HbAY
```

日志写明 `Previous build caches not available`，fresh install 后 `nuxt prepare`，最终 build/deploy READY。

该历史对照进一步证明 wrapper 不是平台构建的必要条件。

## 10. 一般化退役清单

- [ ] 根因修复位于 wrapper 之外；
- [ ] 原生命令已恢复；
- [ ] wrapper 文件已删除；
- [ ] 必要 resource/env policy 有明确的新 owner（例如 CI）；
- [ ] stdout/stderr/exit code 仍可观测；
- [ ] full production build 通过；
- [ ] artifact startup 通过；
- [ ] real HTTP smoke 通过；
- [ ] 云平台 exact-SHA build/deploy 通过；
- [ ] 文档不再把 wrapper 写成最终方案；
- [ ] 风险/TODO 中删除已完成的 wrapper 退役事项。

## 11. 禁止模式

- 不要因为 wrapper 曾帮助排障就永久保留；
- 不要把“提高 heap”包装成根因修复；
- 不要把所有诊断只写在 wrapper 内；
- 不要退役 wrapper 的同时删除 CI resource measurement；
- 不要只验证 build complete，不验证 runtime；
- 不要在未做 exact-SHA 云部署前宣称跨平台退役完成。

## 12. 可复用原则

> **临时工具应帮助暴露根因，而不是成为根因修复本身；根因修好后恢复原生命令，把观测能力留在 CI，并用 exact-SHA build + runtime + cloud deployment 证明可以删除临时工具。**
