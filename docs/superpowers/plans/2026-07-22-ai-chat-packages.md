# AI 对话组件三包一期 Implementation Plan

> **给执行代理的要求：** 实施本计划时必须使用 `subagent-driven-development` 或等价的探索 / 编辑 / 复核分工。任务使用 checkbox 语法跟踪。不要擅自执行 `git commit`，除非用户在当前对话中明确授权。

**目标：** 在 `@ruan-cat/drill-doc` monorepo 中新增 `ai-vue`、`ai-vue-doc`、`ai-vitepress-plugins` 三个包，跑通 mock AI 对话组件在 Nuxt 文档站和根 VitePress 文档站中的 client-only 使用链路。

**架构：** `@ruan-cat-drill-doc/ai-vue` 是唯一组件能力源；`@ruan-cat-drill-doc/ai-vue-doc` 负责 Nuxt 文档站演示；`@ruan-cat-drill-doc/ai-vitepress-plugins` 负责 VitePress theme 客户端接入。真实 LLM、RAG、Nitro 后端、LangGraph、baseUrl 配置全部留到后续 OpenSpec change。

**技术栈：** Vue 3、Vite library mode、Vitest、Element Plus、vue-element-plus-x、Nuxt 3、shadcn-docs-nuxt、VitePress 1、pnpm workspace。

## 1. Global Constraints

- 所有新增 Markdown 文档使用简体中文，二级和三级标题必须带数字序号。
- Markdown 表格必须使用居中对齐格式。
- Vue 代码片段必须使用 `vue` 代码块并包含 `<template>` 标签。
- TypeScript / JavaScript 注释使用 JSDoc，不使用普通双斜线注释。
- 不修改用户已有 dirty 文件 `prompts/index.md`。
- 不提交 commit，不暂存无关文件。
- 一期 `ai-vue` 只做 mock AI 对话前端壳，不接真实 LLM、RAG、Nitro、LangGraph、baseUrl。
- Nuxt 和 VitePress 的页面 shell 要 SSR 构建成功；AI 对话主体使用 client-only 策略。
- `pnpm-workspace.yaml` 需要从只包含 `scripts/*` 扩展为同时包含 `packages/*`。
- 文档站配置优先参考 `D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt`，尤其是 `nuxt.config.ts`、`app.config.ts`、`tailwind.config.js`。

---

## 2. 文件结构

|                路径                |                  职责                   |
| :--------------------------------: | :-------------------------------------: |
|       `pnpm-workspace.yaml`        |       注册 `packages/*` workspace       |
|           `package.json`           | 视需要新增根级检查脚本和 workspace 依赖 |
|        `packages/ai-vue/**`        |            Vue AI 对话组件库            |
|      `packages/ai-vue-doc/**`      |     Nuxt + shadcn-docs-nuxt 文档站      |
| `packages/ai-vitepress-plugins/**` |        VitePress 客户端主题插件         |
|  `docs/.vitepress/theme/index.ts`  |       根 VitePress 安装客户端插件       |
| `docs/.vitepress/theme/style.css`  |      根 VitePress AI 浮层样式兜底       |
|    `docs/.vitepress/config.mts`    |     SSR noExternal 和 Vite 兼容配置     |

---

## 3. Task 1：注册 workspace 与依赖边界

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Update by install: `pnpm-lock.yaml`

**Interfaces:**

- Produces: pnpm 能识别 `packages/*` 下三个新包。
- Consumes: 根项目现有 `pnpm@10.29.2` 与 Node `>=22.14.0`。

- [ ] **Step 1: 修改 workspace globs**

将 `pnpm-workspace.yaml` 调整为：

```yaml
onlyBuiltDependencies:
  - "@biomejs/biome"
  - "@parcel/watcher"
  - better-sqlite3
  - esbuild
  - sharp
packages:
  - "scripts/*"
  - "packages/*"
```

- [ ] **Step 2: 暂不新增根级 release 配置**

根 `package.json` 先不增加 release 或 publish 配置，只在后续需要统一验证时新增脚本。避免一开始扩大发布链路。

- [ ] **Step 3: 安装依赖并刷新 lock**

Run:

```powershell
pnpm install
```

Expected:

```log
Lockfile is up to date
```

或 pnpm 正常完成安装并更新 `pnpm-lock.yaml`，无 peer dependency hard error。

---

## 4. Task 2：实现 `@ruan-cat-drill-doc/ai-vue`

**Files:**

- Create: `packages/ai-vue/package.json`
- Create: `packages/ai-vue/vite.config.ts`
- Create: `packages/ai-vue/vitest.config.ts`
- Create: `packages/ai-vue/tsconfig.json`
- Create: `packages/ai-vue/src/index.ts`
- Create: `packages/ai-vue/src/components/index.ts`
- Create: `packages/ai-vue/src/components/ai-chat/AiChat.vue`
- Create: `packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue`
- Create: `packages/ai-vue/src/components/ai-chat/index.ts`
- Create: `packages/ai-vue/src/components/ai-chat/types.ts`
- Create: `packages/ai-vue/src/composables/useMockAiChat.ts`
- Create: `packages/ai-vue/src/styles/index.scss`
- Create: `packages/ai-vue/src/tests/use-mock-ai-chat.test.ts`
- Create: `packages/ai-vue/src/tests/plugin.test.ts`

**Interfaces:**

- Produces: `AiChat`、`AiChatFloatingButton`、`useMockAiChat`、`install(app)`、默认 Vue plugin、`./styles` 子路径。
- Consumes: `vue`、`element-plus`、`vue-element-plus-x`。

- [ ] **Step 1: 创建 package manifest**

`packages/ai-vue/package.json` 必须包含：

```json
{
	"name": "@ruan-cat-drill-doc/ai-vue",
	"description": "SmallAlice AI Vue mock chat components",
	"version": "0.1.0",
	"type": "module",
	"main": "./dist/index.cjs",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"require": "./dist/index.cjs"
		},
		"./styles": "./dist/styles/index.css",
		"./styles/*": "./dist/styles/*"
	},
	"files": ["dist"],
	"scripts": {
		"dev": "vite build --watch",
		"build": "vite build && pnpm run build:styles",
		"build:js": "vite build",
		"build:styles": "sass src/styles/index.scss dist/styles/index.css --no-source-map",
		"test": "vitest run",
		"typecheck": "vue-tsc --noEmit"
	},
	"peerDependencies": {
		"element-plus": "^2.9.7",
		"vue": "^3.5.17"
	},
	"dependencies": {
		"vue-element-plus-x": "^2.0.3"
	},
	"devDependencies": {
		"@vitejs/plugin-vue": "^6.0.5",
		"@vue/test-utils": "^2.4.6",
		"element-plus": "^2.14.3",
		"jsdom": "^25.0.1",
		"sass": "^1.98.0",
		"typescript": "^5.9.3",
		"vite": "^6.3.5",
		"vite-plugin-dts": "^4.5.4",
		"vitest": "^4.1.0",
		"vue": "^3.5.28",
		"vue-tsc": "^3.2.6"
	}
}
```

- [ ] **Step 2: 创建 Vite library build**

`vite.config.ts` 使用 library mode，external 掉 Vue 和 UI 依赖：

```ts
import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		vue(),
		dts({
			insertTypesEntry: true,
			copyDtsFiles: true,
			include: ["src/**/*.ts", "src/**/*.vue"],
		}),
	],
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
			},
			name: "RuanCatDrillDocAiVue",
			formats: ["es", "cjs"],
			fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
		},
		rollupOptions: {
			external: ["vue", "element-plus", "vue-element-plus-x"],
			output: {
				globals: {
					vue: "Vue",
					"element-plus": "ElementPlus",
					"vue-element-plus-x": "ElementPlusX",
				},
			},
		},
		sourcemap: false,
	},
});
```

- [ ] **Step 3: 定义消息类型**

`src/components/ai-chat/types.ts` 定义：

```ts
export type AiChatRole = "user" | "assistant" | "system";

export interface AiChatMessage {
	id: string;
	role: AiChatRole;
	content: string;
	createdAt: number;
}

export interface AiChatProps {
	title?: string;
	placeholder?: string;
	initialMessages?: AiChatMessage[];
}

export interface AiChatEmits {
	send: [message: AiChatMessage];
}
```

- [ ] **Step 4: 实现 mock composable**

`src/composables/useMockAiChat.ts` 提供本地状态，不访问真实网络：

```ts
import { computed, ref } from "vue";

import type { AiChatMessage } from "../components/ai-chat/types";

function createMessageId(role: AiChatMessage["role"]): string {
	return `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useMockAiChat(initialMessages: AiChatMessage[] = []) {
	const messages = ref<AiChatMessage[]>([...initialMessages]);
	const input = ref("");
	const isResponding = ref(false);

	const canSend = computed(() => input.value.trim().length > 0 && !isResponding.value);

	async function sendMessage() {
		const content = input.value.trim();
		if (!content || isResponding.value) return;

		const userMessage: AiChatMessage = {
			id: createMessageId("user"),
			role: "user",
			content,
			createdAt: Date.now(),
		};

		messages.value.push(userMessage);
		input.value = "";
		isResponding.value = true;

		await new Promise((resolve) => setTimeout(resolve, 450));

		messages.value.push({
			id: createMessageId("assistant"),
			role: "assistant",
			content: `已收到：${content}`,
			createdAt: Date.now(),
		});
		isResponding.value = false;
	}

	return {
		canSend,
		input,
		isResponding,
		messages,
		sendMessage,
	};
}
```

- [ ] **Step 5: 实现 `AiChat.vue`**

组件必须有固定尺寸约束，避免消息变化导致布局跳动：

```vue
<template>
	<section class="rc-ai-chat" aria-label="AI 对话">
		<header class="rc-ai-chat__header">
			<h2 class="rc-ai-chat__title">{{ title }}</h2>
		</header>

		<div class="rc-ai-chat__messages">
			<article v-for="message in messages" :key="message.id" class="rc-ai-chat__message" :data-role="message.role">
				{{ message.content }}
			</article>
			<article v-if="isResponding" class="rc-ai-chat__message" data-role="assistant">正在思考...</article>
		</div>

		<form class="rc-ai-chat__composer" @submit.prevent="sendMessage">
			<input v-model="input" class="rc-ai-chat__input" :placeholder="placeholder" />
			<button class="rc-ai-chat__send" type="submit" :disabled="!canSend">发送</button>
		</form>
	</section>
</template>

<script setup lang="ts">
import { useMockAiChat } from "../../composables/useMockAiChat";
import type { AiChatProps } from "./types";

const props = withDefaults(defineProps<AiChatProps>(), {
	title: "小爱丽丝 AI",
	placeholder: "输入你的问题",
	initialMessages: () => [],
});

const { canSend, input, isResponding, messages, sendMessage } = useMockAiChat(props.initialMessages);
</script>
```

- [ ] **Step 6: 实现 `AiChatFloatingButton.vue`**

对话主体只在客户端 mounted 后显示：

```vue
<template>
	<div v-if="isMounted" class="rc-ai-floating">
		<button class="rc-ai-floating__button" type="button" aria-label="打开 AI 对话" @click="isOpen = true">AI</button>
		<div v-if="isOpen" class="rc-ai-floating__dock">
			<button class="rc-ai-floating__close" type="button" aria-label="关闭 AI 对话" @click="isOpen = false">×</button>
			<AiChat />
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import AiChat from "./AiChat.vue";

const isMounted = ref(false);
const isOpen = ref(false);

onMounted(() => {
	isMounted.value = true;
});
</script>
```

- [ ] **Step 7: 导出 Vue plugin**

`src/index.ts` 必须导出组件、composable、类型和默认 plugin：

```ts
import type { App, Plugin } from "vue";

import { AiChat, AiChatFloatingButton } from "./components";

export const version = "0.1.0";

export function install(app: App): void {
	app.component("AiChat", AiChat);
	app.component("AiChatFloatingButton", AiChatFloatingButton);
}

const plugin: Plugin & { version: string } = {
	version,
	install,
};

export default plugin;
export * from "./components";
export * from "./composables/useMockAiChat";
```

- [ ] **Step 8: 添加 focused tests**

测试文件必须使用：

```ts
import { describe, test } from "vitest";
```

至少覆盖：

- `useMockAiChat` 初始消息和发送行为。
- plugin install 会注册 `AiChat` 与 `AiChatFloatingButton`。

- [ ] **Step 9: 运行验证**

Run:

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue test
pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck
pnpm --filter @ruan-cat-drill-doc/ai-vue build
```

Expected:

```log
Tests pass
Typecheck pass
Build pass
```

---

## 5. Task 3：实现 Nuxt 文档站 `@ruan-cat-drill-doc/ai-vue-doc`

**Files:**

- Create: `packages/ai-vue-doc/package.json`
- Create: `packages/ai-vue-doc/nuxt.config.ts`
- Create: `packages/ai-vue-doc/app.config.ts`
- Create: `packages/ai-vue-doc/tailwind.config.js`
- Create: `packages/ai-vue-doc/workspace-aliases.ts`
- Create: `packages/ai-vue-doc/plugins/ai-vue.ts`
- Create: `packages/ai-vue-doc/assets/css/tailwind.css`
- Create: `packages/ai-vue-doc/assets/css/main.css`
- Create: `packages/ai-vue-doc/content/index.md`
- Create: `packages/ai-vue-doc/content/1.getting-started/0.index.md`
- Create: `packages/ai-vue-doc/content/2.components/1.ai-chat.md`
- Create: `packages/ai-vue-doc/components/content/AiChatBasicDemo.vue`
- Create: `packages/ai-vue-doc/pages/[...slug].vue`
- Create: `packages/ai-vue-doc/shims/debug.ts`

**Interfaces:**

- Consumes: `@ruan-cat-drill-doc/ai-vue` source through workspace alias.
- Produces: 可运行、可 build、可 preview 的 Nuxt 文档站。

- [ ] **Step 1: package manifest 参考 eams**

`package.json` 脚本必须包含：

```json
{
	"scripts": {
		"dev": "nuxt dev",
		"predev": "nuxt prepare",
		"prebuild": "nuxt prepare",
		"build": "cross-env NODE_OPTIONS=--max-old-space-size=8192 nuxi build --preset vercel",
		"preview": "nuxt preview",
		"postinstall": "nuxt prepare"
	}
}
```

依赖包含 `@ruan-cat-drill-doc/ai-vue: "workspace:*"`、`element-plus`、`vue-element-plus-x`、`nuxt`、`shadcn-docs-nuxt`、`tailwindcss`、`tailwindcss-animate`、`std-env`、`entities`、`vue`、`vue-router`。

- [ ] **Step 2: workspace alias 指向源码**

`workspace-aliases.ts` 必须保证 styles 别名在主入口之前：

```ts
import { resolve } from "node:path";

export function getAiVueAliases() {
	return {
		"@ruan-cat-drill-doc/ai-vue/styles": resolve(__dirname, "../ai-vue/src/styles/index.scss"),
		"@ruan-cat-drill-doc/ai-vue": resolve(__dirname, "../ai-vue/src/index.ts"),
	};
}
```

- [ ] **Step 3: Nuxt 配置沿用 eams 兼容策略**

`nuxt.config.ts` 必须包含：

```ts
import { createRequire } from "node:module";

import { isWindows } from "std-env";

import { getAiVueAliases } from "./workspace-aliases";

const require = createRequire(import.meta.url);
const dayjsEsmEntry = require.resolve("dayjs/esm/index.js");
const mermaidEsmEntry = require.resolve("mermaid/dist/mermaid.esm.mjs");
const debugShimEntry = require.resolve("./shims/debug.ts");

export default defineNuxtConfig({
	extends: ["shadcn-docs-nuxt"],
	devtools: { enabled: true },
	alias: getAiVueAliases(),
	experimental: {
		appManifest: false,
	},
	build: {
		transpile: ["ohash"],
	},
	vite: {
		optimizeDeps: {
			include: ["debug", "dayjs", "@braintree/sanitize-url", "mermaid"],
			esbuildOptions: {
				target: "esnext",
			},
		},
		resolve: {
			alias: [
				{ find: /^dayjs$/, replacement: dayjsEsmEntry },
				{ find: /^mermaid$/, replacement: mermaidEsmEntry },
				{ find: /^debug$/, replacement: debugShimEntry },
			],
			dedupe: ["dayjs"],
		},
		ssr: {
			noExternal: [
				"debug",
				"@ruan-cat-drill-doc/ai-vue",
				/element-plus/,
				/@element-plus/,
				/vue-element-plus-x/,
				/@vueuse/,
				/vue-demi/,
				/entities/,
			],
		},
	},
	i18n: {
		defaultLocale: "zh-CN",
		locales: [{ code: "zh-CN", name: "简体中文" }],
	},
	ogImage: {
		enabled: false,
	},
	icon: {
		serverBundle: {
			collections: ["lucide"],
		},
		clientBundle: {
			scan: true,
			sizeLimitKb: 512,
		},
	},
	nitro: {
		externals: {
			inline: [/element-plus/, /@element-plus/, /vue-element-plus-x/, /@vueuse/, /vue-demi/, /entities/],
			...(isWindows ? { trace: false } : {}),
		},
		prerender: {
			crawlLinks: true,
		},
	},
});
```

- [ ] **Step 4: Tailwind 扫描 shadcn-docs-nuxt**

`tailwind.config.js` 的 `content` 必须包含：

```js
import animate from "tailwindcss-animate";

export default {
	darkMode: "class",
	safelist: ["dark"],
	prefix: "",
	content: [
		"./content/**/*",
		"./app/**/*.vue",
		"./components/**/*.vue",
		"../../node_modules/shadcn-docs-nuxt/**/*.{vue,js,ts,mjs}",
	],
	plugins: [animate],
};
```

- [ ] **Step 5: Nuxt plugin 注册组件库**

```ts
import AiVue from "@ruan-cat-drill-doc/ai-vue";
import "@ruan-cat-drill-doc/ai-vue/styles";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";

export default defineNuxtPlugin((nuxtApp) => {
	nuxtApp.vueApp.use(ElementPlus);
	nuxtApp.vueApp.use(AiVue);
});
```

- [ ] **Step 6: demo 使用 ClientOnly**

`components/content/AiChatBasicDemo.vue`：

```vue
<template>
	<ClientOnly>
		<AiChat title="小爱丽丝 AI 助手" placeholder="问一个关于文档的问题" />
	</ClientOnly>
</template>
```

- [ ] **Step 7: 运行验证**

Run:

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue-doc build
pnpm --filter @ruan-cat-drill-doc/ai-vue-doc preview
```

Expected:

```log
Nuxt build pass
Preview server starts
```

浏览器验收：打开 preview 地址，确认首页和 `AiChatBasicDemo` 可见，输入后能得到 mock 回复，console 无 SSR/hydration 阻断错误。

---

## 6. Task 4：实现 VitePress 插件包

**Files:**

- Create: `packages/ai-vitepress-plugins/package.json`
- Create: `packages/ai-vitepress-plugins/vite.config.ts`
- Create: `packages/ai-vitepress-plugins/tsconfig.json`
- Create: `packages/ai-vitepress-plugins/src/index.ts`
- Create: `packages/ai-vitepress-plugins/src/client/index.ts`
- Create: `packages/ai-vitepress-plugins/src/client/style.css`
- Create: `packages/ai-vitepress-plugins/src/client/components/AiChatVitePressShell.vue`
- Create: `packages/ai-vitepress-plugins/src/client/types.ts`
- Create: `packages/ai-vitepress-plugins/src/tests/plugin.test.ts`

**Interfaces:**

- Consumes: `@ruan-cat-drill-doc/ai-vue`。
- Produces: VitePress theme 可安装的 Vue plugin 和 `./client/style.css`。

- [ ] **Step 1: package exports**

`package.json` 必须暴露：

```json
{
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"require": "./dist/index.cjs"
		},
		"./client": {
			"types": "./dist/client/index.d.ts",
			"import": "./dist/client/index.js"
		},
		"./client/style.css": "./dist/client/style.css"
	},
	"sideEffects": ["**/*.css"]
}
```

- [ ] **Step 2: client plugin 注册 shell**

`src/client/index.ts`：

```ts
import type { App, Plugin } from "vue";

import AiChatVitePressShell from "./components/AiChatVitePressShell.vue";

export function install(app: App): void {
	app.component("AiChatVitePressShell", AiChatVitePressShell);
}

const plugin: Plugin = {
	install,
};

export { AiChatVitePressShell };
export default plugin;
```

- [ ] **Step 3: shell 组件只在客户端挂载**

```vue
<template>
	<div v-if="isMounted" class="rc-ai-vitepress-shell">
		<AiChatFloatingButton />
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { AiChatFloatingButton } from "@ruan-cat-drill-doc/ai-vue";

const isMounted = ref(false);

onMounted(() => {
	isMounted.value = true;
});
</script>
```

- [ ] **Step 4: 样式从组件库和插件包双入口导入**

`src/client/style.css` 只放 VitePress 浮层容器样式，不复制 `ai-vue` 组件内部样式。

- [ ] **Step 5: 运行验证**

Run:

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins build
```

Expected:

```log
Tests pass
Build pass
```

---

## 7. Task 5：接入根 VitePress

**Files:**

- Modify: `docs/.vitepress/theme/index.ts`
- Modify: `docs/.vitepress/theme/style.css`
- Modify if SSR requires: `docs/.vitepress/config.mts`
- Modify if package dependency is needed: `package.json`

**Interfaces:**

- Consumes: `@ruan-cat-drill-doc/ai-vitepress-plugins/client` 和 `@ruan-cat-drill-doc/ai-vue/styles`。
- Produces: 根文档右下角 AI 对话入口。

- [ ] **Step 1: 安装 theme plugin**

用包装对象保留现有 preset theme 行为：

```ts
import type { Theme } from "vitepress";
import { defineRuancatPresetTheme } from "@ruan-cat/vitepress-preset-config/theme";
import AiVitePressPlugin from "@ruan-cat-drill-doc/ai-vitepress-plugins/client";
import "@ruan-cat-drill-doc/ai-vitepress-plugins/client/style.css";
import "@ruan-cat-drill-doc/ai-vue/styles";
import "./style.css";

const baseTheme = defineRuancatPresetTheme();

export default {
	...baseTheme,
	enhanceApp(ctx) {
		baseTheme.enhanceApp?.(ctx);
		ctx.app.use(AiVitePressPlugin);
	},
	Layout: baseTheme.Layout,
} satisfies Theme;
```

如果 `defineRuancatPresetTheme()` 返回的 theme 不支持直接扩展，执行代理必须先读实际类型和运行错误，再按 VitePress 官方 `enhanceApp` 模式修正。

- [ ] **Step 2: 注入全局 shell**

如果仅注册组件不能显示右下角按钮，则通过 VitePress Layout slot 或自定义 layout wrapper 注入：

```vue
<template>
	<DefaultLayout>
		<template #layout-bottom>
			<AiChatVitePressShell />
		</template>
	</DefaultLayout>
</template>
```

执行代理需要根据当前 preset theme 的 Layout 暴露方式选择最小可行实现，不要重写整个主题。

- [ ] **Step 3: VitePress SSR noExternal**

如 `docs:build` 报 SSR 外部化错误，在 `docs/.vitepress/config.mts` 的 `vite` 中补：

```ts
vite: {
	assetsInclude: ["**/*.emf"],
	ssr: {
		noExternal: [
			"@ruan-cat-drill-doc/ai-vitepress-plugins",
			"@ruan-cat-drill-doc/ai-vue",
			"vue-element-plus-x",
			/element-plus/,
			/@element-plus/,
			/@vueuse/,
			/vue-demi/,
		],
	},
}
```

- [ ] **Step 4: 根站验证**

Run:

```powershell
pnpm run docs:build
pnpm run docs:dev
```

Expected:

```log
VitePress build pass
Dev server starts
```

浏览器验收：打开 VitePress dev 地址，确认右下角按钮出现，点击后对话框打开，输入消息后出现 mock 回复。

---

## 8. Task 6：最终验证与复核

**Files:**

- Read only: all changed files
- Modify only if validation finds defects: task-owned files from previous sections

**Interfaces:**

- Consumes: 所有任务产物。
- Produces: 可复核验证证据。

- [ ] **Step 1: 运行工程验证**

Run:

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue test
pnpm --filter @ruan-cat-drill-doc/ai-vue build
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test
pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins build
pnpm --filter @ruan-cat-drill-doc/ai-vue-doc build
pnpm run docs:build
git diff --check
git status --short --untracked-files=all
```

- [ ] **Step 2: 浏览器验收**

优先使用 agent-browser 验收：

- Nuxt preview 页面能显示 `AiChat` 演示。
- VitePress dev 页面右下角有 AI 按钮。
- 点击按钮后对话窗口打开。
- 输入消息后出现 mock 回复。
- console 无阻断性错误。

- [ ] **Step 3: 复核禁止越界项**

确认没有新增：

- 真实 API 请求。
- `baseUrl`、API key、模型名配置。
- Nitro route。
- LangGraph、向量库、RAG 检索抽象。
- 直接在 SSR 顶层访问 `window`、`document`、`localStorage`。

---

## 9. 执行顺序建议

|  阶段  |              可并行性              |
| :----: | :--------------------------------: |
| Task 1 |             主代理串行             |
| Task 2 |           单编辑代理优先           |
| Task 3 |  依赖 Task 2 接口，Task 2 后执行   |
| Task 4 | 依赖 Task 2 接口，可与 Task 3 并行 |
| Task 5 |       依赖 Task 4，必须串行        |
| Task 6 |            独立复核代理            |

并行编辑时禁止同时修改 `pnpm-workspace.yaml`、`package.json`、`pnpm-lock.yaml`、`docs/.vitepress/theme/index.ts`、`docs/.vitepress/config.mts`。
