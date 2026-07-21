# 通用的杂项提示词

## 001 <!-- TODO: zcode正在做 --> 开发简单的 AI 对话窗口组件

我要求你制作一个复杂的项目配置。在 packages 目录内新建两个子包项目。

1. 制作设计一个子包，实现特定组件库的对外暴露。这个组件库就只负责暴露一揽子的复杂业务 vue 组件。其本质就是将一个带有独立 AI 应用能力的 vue 组件暴露出来。叫做 `@ruan-cat-drill-doc/ai-vue`
2. 设计一个基于 nuxt 的组件库文档。叫做 `@ruan-cat-drill-doc/ai-vue-doc`
3. 设计一个局部级别的 vitepress 插件子包，并设计好在合适的小爱丽丝文档，即 vitepress 项目内导入 vitepress 插件，展现出这个 AI 对话用途的组件库。并提供必要的 vitepress 插件兼容配置。定位为一个 vitepress 插件。叫做 `@ruan-cat-drill-doc/ai-vitepress-plugins` 。

### 未来拓展级别的设计

我们一期任务先负责打基础，打基础。做好基础架构的，确保组件库、组件库文档、vitepress 文档这三个部分。都能够正常使用，在 vue 组件内能够正常使用。
未来我会要去拓展很多功能的，重点会在 Ai 方向发力，我会要求搭建 RAG、搭建后端。制作一个基于小爱丽丝一揽子的 markdown 文档的 RAG AI 对话项目。这是一个野心勃勃的项目。最终目的是为了体现出我的 AI 能力，方便我求职找工作。

### 整体架构设计

我们已经有一个非常成熟的组件库制作与组件库制作体系了，你直接参考 `D:\code\ruan-cat\eams-component-lib` 目录的做法。

1. 模仿 D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui\package.json 制作 vue 组件库。
2. 模仿 D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\package.json 制作对应的 nuxt 组件库文档。

### 组件库文档的注意事项

我当初丛组件库文档时，遇到了很多坑，你必须先去看看 memorix 在 eams-component-lib 的历史经验教训。你最好是大幅度的照抄 `eams-component-lib\packages\vue-element-cui-nuxt\package.json` 的依赖配置，特别是以下配置文件：

- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\nuxt.config.ts
- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\app.config.ts
- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\tailwind.config.js

我不希望你在 nuxt.config.ts app.config.ts tailwind.config.js 这三个配置文件上出什么问题。这几个太容易出现误区了，我很担心你乱搞。

### `@ruan-cat-drill-doc/ai-vue` 组件库

这是具有 AI 对话能力的组件库，未来要内部直接整合必要的后端能力，完成 AI 对话效果。目前我允许这个组件库本质上成为一个二次封装的 AI 组件库，对现有的 AI 组件库做二次封装。

我能够接受以下的一系列 AI 对话的 vue 组件库和相关的工具：

- x‑markdown‑vue https://github.com/element-plus-x/x-markdown
  > 流式渲染
- vue-element-plus-x https://github.com/element-plus-x/Element-Plus-X
  > 成熟的 AI 对话框组件库
- @shikijs/stream
  > 流式 markdown 渲染时，代码块的高亮渲染
- Markstream https://github.com/Simon-He95/markstream-vue
  > 用于人工智能聊天的流式 Markdown 渲染器
- ai-elements-vue https://github.com/vuepont/ai-elements-vue
  > shadcn-vue 构建的组件库。
- @ai-sdk/vue

我希望你大胆的复用，使用这些库，完成现成的组件开发。快速实现基础的 AI 对话能力，做好 AI 对话需要的前端交互。

#### 允许实现模拟

目前我们还没有正式的实现最基础的 AI 对话能力，和 AI 大模型的 baseUrl 配置。这个内容我放到下一个阶段做，这不是我们这个阶段做的。
我允许你编写假的对话流程，模拟 AI 对话。因为本阶段只负责跑通基础架构，确保基础架构能够完成 monorepo 项目的多包调度和渲染。

### `@ruan-cat-drill-doc/ai-vue-doc` 组件库文档

组件库文档本质上是一个 nuxt 项目。对于这个子包，我唯一的要求就是，你认真的做好模仿，认真看我给你的参考项目的做法，不要乱来。这个小项目只需要完成最基础的组件展示和基础文档说明即可。截止目前，我不需要这个组件库文档质保，承担很复杂的职责。能直接给我显示，能让我对 `@ruan-cat-drill-doc/ai-vue` 组件库做在线的使用交互，就可以了。
高度相关的指导技能是全局技能 `init-shadcn-docs-nuxt` 。

### `@ruan-cat-drill-doc/ai-vitepress-plugins` vitepress 插件

我的最终使用场所是在根包的 `@ruan-cat/drill-doc` 这个 vitepress 项目内使用 AI 对话的组件库，但是我很清楚，在 vitepress 内使用 vue 组件，需要一些额外的处理，也要定义合适的 vitepress 插件格式。你应该要去调研清楚，如何编写 vitepress 插件，并确保这个插件能正常渲染我提供的 `@ruan-cat-drill-doc/ai-vue` AI 对话框组件。

你应该去看看 https://github.com/nolebase/integrations 仓库，看看别人是怎么弄含有 vue 组件的 vitepress 插件的，看看别人是怎么组织一个含有 vue 组件的 vitepress 插件的。

参考项目：

- https://github.com/nolebase/integrations
- https://github.com/okineadev/vitepress-plugin-llms

#### AI 对话组件的布局设计

AI 对话组件对于整个 vitepress 项目来说，其交互和唤起逻辑是这样的。

1. 在 UI 布局上，在 vitepress 文档内，是一个位于右下角的圆圈按钮。
2. 点击右下角圆圈按钮，即可打开一个 AI 对话框，可以开始和 AI 沟通。

### 自我验收

我们的任务确实很复杂，有不同的验收维度。

1. 对于 `@ruan-cat-drill-doc/ai-vue-doc` 组件库文档：
   - 能够在 dev 模式下，看到 nuxt 文档，且能够看到已经完成打包的组件库。并确保 SSR 场景下组件能够正常渲染。毕竟 nuxt 和 vitepress 都是 SSR 场景。
   - 在 preview 模式下，能够正常访问 nuxt 项目。
2. 对于 `@ruan-cat/drill-doc` 根包 vitepress 文档项目。
   - 能够正常的导入 vitepress 插件，并且能在本地 dev 模式下看到整个网站右下角的按钮。点击打开对话框，即可完成沟通。
