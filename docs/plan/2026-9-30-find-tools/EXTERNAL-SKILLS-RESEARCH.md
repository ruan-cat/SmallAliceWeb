# 2026-11-06 外部 UI 设计技能调研报告

## 1. superdesign-skill

### 1.1 基本信息
| 字段 | 值 |
| :--- | :--- |
| 来源 | GitHub |
| 仓库 | https://github.com/superdesigndev/superdesign-skill |
| Stars | ~949 |
| 安装状态 | [待验证] |

### 1.2 核心能力
- design-system-driven UI 生成
- 组件变体（variants）自动推导
- 基于设计系统的约束化组件生成
- 支持多框架输出（React / Vue / HTML）
- 自动生成可访问性友好的组件结构

### 1.3 与本地技能对比
| 维度 | superdesign | frontend-design (本地) |
| :--- | :--- | :--- |
| 输出形态 | 系统化组件库 | 单页面/组件设计 |
| 设计哲学 | 约束驱动（design tokens 优先） | 品味驱动（审美优先） |
| 适用场景 | 已有设计系统需扩展 | 从零设计新页面 |
| 依赖要求 | 需预先定义 design tokens | 自由创意，无前置约束 |
| 输出粒度 | 组件库级批量生成 | 单个页面/组件精修 |

### 1.4 安装建议
- 推荐项目级安装：`.agents/skills/superdesign/`
- 触发词建议：「设计系统」「组件变体」「扩展 design tokens」「系统化 UI」
- 注意事项：需要团队已有 design tokens 或愿意先定义一套 tokens

## 2. tweakcn

### 2.1 基本信息
| 字段 | 值 |
| :--- | :--- |
| 来源 | 官网 + GitHub（可能为闭源或组织内仓库） |
| 官网 | https://tweakcn.com |
| GitHub | 搜索未返回精确匹配，可能为闭源或组织内仓库 |
| Stars | ~10,521（官网引用） |
| 安装状态 | [待验证] |

### 2.2 核心能力
- shadcn/ui 可视化主题编辑器
- 实时预览主题调整效果
- 导出可直接使用的 shadcn/ui 主题配置
- 支持 CSS variables / Tailwind 配置导出
- 无需离开浏览器即可完成视觉调优

### 2.3 与本地技能对比
| 维度 | tweakcn | frontend-design (本地) |
| :--- | :--- | :--- |
| 输出形态 | 主题配置（CSS vars / tailwind config） | 设计稿 + 代码实现 |
| 设计哲学 | 视觉调优（在现有基础上打磨） | 品味驱动（从零到一） |
| 适用场景 | 已有 shadcn 项目需换肤/调优 | 全新页面设计 |
| 依赖要求 | 强依赖 shadcn/ui 生态 | 无特定框架依赖 |
| 使用方式 | 浏览器可视化操作 | AI 对话生成 |

### 2.4 安装建议
- 当前为在线工具，无本地安装步骤
- 使用方式：访问 https://tweakcn.com，导入项目或手动调整后导出配置
- 适用场景：项目已使用 shadcn/ui，需要快速调整主题色、字体、圆角等视觉属性
- 不建议场景：从零开始设计新项目、非 shadcn/ui 技术栈

## 3. 21st / Magic MCP

### 3.1 基本信息
| 字段 | 值 |
| :--- | :--- |
| 来源 | GitHub（推测） |
| 仓库 | https://github.com/21st-dev/magic-mcp |
| Stars | ~6,392 |
| 安装状态 | [待验证] |

### 3.2 核心能力
- AI 驱动的组件生成
- React + Tailwind 专属技术栈
- 自然语言描述 → 可运行组件
- 支持复杂组件（表单、卡片、导航等）
- 输出可直接集成到现有项目

### 3.3 与本地技能对比
| 维度 | 21st / Magic MCP | frontend-design (本地) |
| :--- | :--- | :--- |
| 输出形态 | 单个 React 组件代码 | 设计稿 + 多框架代码 |
| 设计哲学 | AI 生成优先（速度优先） | 品味驱动（质量优先） |
| 适用场景 | 快速生成 React 组件 | 精细打磨的页面设计 |
| 依赖要求 | React + Tailwind 必选 | 无特定框架依赖 |
| 可控性 | 低（AI 决定结构） | 高（人机协作设计） |

### 3.4 安装建议
- 推荐项目级安装（如为 MCP 服务）
- 触发词建议：「生成组件」「React 组件」「Tailwind 组件」
- 限制：仅 React 生态可用，Vue / Svelte / 其他框架不可用
- 适用场景：需要快速原型、简单页面、或作为前端开发的辅助工具

## 4. 综合对比与选型建议

| 技能 | 适用场景 | 不适用场景 | 推荐度 |
| :--- | :--- | :--- | :--- |
| superdesign | 已有 design tokens 需扩展组件库 | 从零设计、无 tokens 体系 | ★★★☆☆ |
| tweakcn | shadcn/ui 项目快速主题调优 | 非 shadcn 栈、全新设计 | ★★★★☆ |
| 21st / Magic MCP | React 项目快速生成单个组件 | Vue 项目、复杂设计需求 | ★★☆☆☆ |
| frontend-design (本地) | 全场景设计、品味训练、多框架 | 需要系统化批量生成组件 | ★★★★★ |

### 选型决策树

```
已有 shadcn/ui 项目需调优？
├─ 是 → tweakcn（推荐）
└─ 否 → 需要生成组件？
    ├─ 是 → 技术栈是 React + Tailwind？
    │   ├─ 是 → 21st / Magic MCP（备选）
    │   └─ 否 → frontend-design（本地）
    └─ 否 → 需要扩展设计系统？
        ├─ 是 → superdesign（备选）
        └─ 否 → frontend-design（本地，推荐）
```

## 5. 信息来源与未核实项

- [ ] superdesign 仓库 clone 验证（需实际安装并测试生成效果）
- [ ] tweakcn GitHub 仓库精确位置（目前仅知官网，未找到公开 GitHub 仓库）
- [ ] 21st MCP 与 Magic MCP 是否为同一项目（repo 命名推测）
- [ ] 各工具的详细配置要求与兼容性矩阵
- [ ] 实际使用案例与社区反馈收集

---

*报告生成时间：2026-11-06*
*调研工具：AI 子代理*
*状态：初版，部分信息基于 GitHub 搜索和官网引用，需进一步验证*
