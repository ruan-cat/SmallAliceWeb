# E0：8 GiB heap 稳定控制组

## 目的

先回答“当前故障是否主要受 V8 old-space headroom 控制”，并建立可重复的成功基线。E0 不是长期根修复。

## 主要配置

- Node 22.x；
- root docs build 使用 Turbo `--concurrency=1`；
- CI `NODE_OPTIONS=--max-old-space-size=8192`；
- `ai-vue-doc` prepare/build 通过 package-level memory wrapper；
- CI 打印 heap limit / `free -h`，并使用 `/usr/bin/time -v`；
- Windows-only Nitro tracing workaround 保留。

## 结果

| 场景 | Run / Job | 结果 |
| --- | --- | --- |
| 主 PR #11 初次 CI | run `32074711921` / job `95525290142` | success |
| 主 PR 同功能 SHA rerun | job `95537958369` | success |
| 独立临时 PR #12 | run `32079043977` / job `95538188859` | success |
| 独立临时 PR #13 | run `32079230457` / job `95538748834` | success |
| Vercel 同功能 SHA | 对应部署检查 | success |

功能基线 SHA：`9864aaea67394e2db1e917b1ee0ea86c6ddfd0e1`。

## 结论

E0 证明：在串行 workspace build 条件下，增加到 8 GiB old-space 可以稳定绕过当前 OOM，并且结果可跨 rerun/cold runner/Vercel 重复。

E0 **不能**证明：

- 存在经典 memory leak；
- 8 GiB 是合理的最低需求；
- production dependency graph 已经健康；
- 8192 应成为永久默认值。

因此 E0 只作为后续 E1/E2 的成功控制组。

## 尚需补录的定量字段

如果 GitHub 历史 job 日志仍可完整读取，最终复盘时继续补录 E0 成功 job 的：

- client/server transformed modules；
- final Nitro build duration；
- maximum resident set size；
- 实际 V8 heap limit。

这些字段用于与 E1/E2 做精确资源差分，但不影响 E0 已有的“可重复成功控制组”结论。