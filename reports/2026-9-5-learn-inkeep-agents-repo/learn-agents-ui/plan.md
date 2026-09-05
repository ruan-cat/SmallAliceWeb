# Plan：ai-vue 子包学习 @inkeep/agents-ui 的落地方案

> 文档类型：plan（实施计划）
> 创建日期：2026-09-05
> 所属报告：`reports/2026-9-5-learn-inkeep-agents-repo/`
> 目标子包：`@ruan-cat-drill-doc/ai-vue`
> 参考对象：`@inkeep/agents-ui` v0.17.8
> 配套 spec：`./spec.md`

---

## 一、实施总览

### 1.1 分阶段路线图

本方案分为 4 个阶段，每个阶段产出可独立验证的增量能力：

| 阶段 | 主题 | 预计工期 | 核心产出 |
|------|------|----------|----------|
| P1 | 品牌化主题系统 | 3 天 | `useBrandTheme` composable + 色板自动派生 |
| P2 | Shadow DOM 样式隔离 | 2 天 | `AiShadowRoot` 组件 + variant 配置 |
| P3 | 富聊天体验增强 | 4 天 | 自定义渲染器 + 消息操作 + 反馈 + 示例问题 |
| P4 | 组件形态扩展 + 函数式嵌入 | 3 天 | SidebarChat + ModalChat + embed 包 |

### 1.2 文件变更预览

```
packages/ai-vue/src/
├── index.ts                          # 修改：导出新组件和 composable
├── composables/
│   ├── useMockAiChat.ts              # 保留
│   ├── useBrandTheme.ts              # 新增：品牌色派生主题
│   └── useChatEvents.ts              # 新增：事件链聚合
├── components/
│   ├── ai-chat/
│   │   ├── AiChat.vue                # 修改：接入主题系统 + 富聊天
│   │   ├── AiChatFloatingButton.vue  # 修改：接入主题系统
│   │   ├── types.ts                  # 修改：扩展 props/emits
│   │   └── parts/                    # 新增：子部件
│   │       ├── AiChatMessageActions.vue
│   │       ├── AiChatFeedback.vue
│   │       ├── AiChatExampleQuestions.vue
│   │       └── AiChatCustomRenderer.vue
│   ├── ai-sidebar-chat/              # 新增
│   │   ├── AiSidebarChat.vue
│   │   ├── index.ts
│   │   └── types.ts
│   ├── ai-modal-chat/                # 新增
│   │   ├── AiModalChat.vue
│   │   ├── index.ts
│   │   └── types.ts
│   └── ai-shadow-root/               # 新增
│       ├── AiShadowRoot.vue
│       └── index.ts
├── theme/
│   ├── color-utils.ts                # 新增：HSL 色板派生
│   ├── default-theme.ts              # 新增：默认主题令牌
│   └── types.ts                      # 新增：主题类型定义
└── styles/
    └── index.scss                    # 修改：改用 CSS 变量驱动

packages/ai-vue-embed/                # 新增包：函数式嵌入
├── package.json
├── src/
│   ├── index.ts
│   └── mount.ts
└── tsconfig.json
```

---

## 二、P1：品牌化主题系统

### 2.1 设计思路

agents-ui 的品牌化核心是：使用者只需提供一个 `primaryBrandColor`，系统自动派生出完整的色板（11 个色阶）和主题令牌。ai-vue 将借鉴这一设计，但用纯 TypeScript 函数实现颜色派生，不引入 `colorjs.io`（体积 30KB+）。

颜色派生算法采用 HSL 空间：将品牌色转换为 HSL，然后通过调整明度（Lightness）生成不同色阶。这种方法简单、可预测、零依赖。

### 2.2 类型定义

```typescript
// packages/ai-vue/src/theme/types.ts

/** 使用者提供的品牌色配置 */
export interface BrandThemeConfig {
  /** 主品牌色，任意 CSS 颜色值（hex/rgb/hsl） */
  primaryBrandColor: string;
  /** 组织展示名称，显示在头部等位置 */
  organizationDisplayName?: string;
  /** 精细覆盖特定色阶 */
  customColorScheme?: Partial<ColorScheme>;
  /** 主题令牌覆盖 */
  theme?: Partial<IkpTheme>;
  /** CSS 变量前缀，默认 'ai-chat' */
  prefix?: string;
  /** 颜色模式 */
  colorMode?: 'light' | 'dark' | 'system';
}

/** 从品牌色派生的色板 */
export interface ColorScheme {
  /** 最浅背景色 */
  lighter: string;
  /** 浅色背景 */
  light: string;
  /** 浅色微妙 */
  lightSubtle: string;
  /** 中等背景 */
  medium: string;
  /** 中等微妙 */
  mediumSubtle: string;
  /** 较强浅色 */
  strongerLight: string;
  /** 强调色（按钮、链接） */
  strong: string;
  /** 最强强调色（悬停态） */
  stronger: string;
  /** 主文字色 */
  textBold: string;
  /** 次要文字色 */
  textSubtle: string;
  /** 主色上的文字色 */
  textColorOnPrimary: string;
}

/** 主题令牌系统 */
export interface IkpTheme {
  colors: Record<string, string>;
  fontFamily: Record<string, string>;
  fontSize: Record<string, string>;
  zIndex: Record<string, string | number>;
}
```

### 2.3 颜色派生实现

```typescript
// packages/ai-vue/src/theme/color-utils.ts

import type { ColorScheme } from './types';

/** 将 hex/rgb 颜色解析为 RGB 分量 */
function parseToRgb(color: string): { r: number; g: number; b: number } {
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }
  // 兜底：返回默认蓝色
  return { r: 59, g: 130, b: 246 };
}

/** RGB 转 HSL */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
    else h = (rNorm - gNorm) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL 转 CSS 字符串 */
function hslToString(h: number, s: number, l: number, alpha = 1): string {
  return alpha < 1
    ? `hsl(${h} ${s}% ${l}% / ${alpha})`
    : `hsl(${h} ${s}% ${l}%)`;
}

/**
 * 从单一品牌色派生完整色板。
 * 算法：将品牌色转为 HSL，通过调整明度生成 11 个色阶。
 * @param primaryBrandColor 品牌色（hex 或 rgb）
 * @returns 完整色板
 */
export function deriveColorScheme(primaryBrandColor: string): ColorScheme {
  const { r, g, b } = parseToRgb(primaryBrandColor);
  const { h, s, l } = rgbToHsl(r, g, b);

  // 根据品牌色的明度决定派生方向
  const isLight = l > 60;

  return {
    lighter: hslToString(h, Math.max(s - 5, 10), isLight ? 97 : 95),
    light: hslToString(h, s, isLight ? 92 : 88),
    lightSubtle: hslToString(h, s, isLight ? 88 : 82),
    medium: hslToString(h, s, isLight ? 80 : 72),
    mediumSubtle: hslToString(h, s, isLight ? 72 : 65),
    strongerLight: hslToString(h, s, isLight ? 65 : 58),
    strong: hslToString(h, s, l),
    stronger: hslToString(h, s, Math.max(l - 8, 20)),
    textBold: hslToString(h, Math.min(s + 10, 100), Math.min(l - 35, 15)),
    textSubtle: hslToString(h, s, isLight ? 45 : 60),
    textColorOnPrimary: isLight ? '#1a1a1a' : '#ffffff',
  };
}

/** 将色板转换为 CSS 变量对象 */
export function colorSchemeToCssVars(
  scheme: ColorScheme,
  prefix = 'ai-chat',
): Record<string, string> {
  const vars: Record<string, string> = {};
  const keyMap: Record<keyof ColorScheme, string> = {
    lighter: 'surface-lighter',
    light: 'surface-light',
    lightSubtle: 'surface-light-subtle',
    medium: 'surface-medium',
    mediumSubtle: 'surface-medium-subtle',
    strongerLight: 'surface-stronger-light',
    strong: 'primary',
    stronger: 'primary-hover',
    textBold: 'text',
    textSubtle: 'text-muted',
    textColorOnPrimary: 'primary-contrast',
  };
  for (const [key, cssKey] of Object.entries(keyMap)) {
    vars[`--${prefix}-${cssKey}`] = scheme[key as keyof ColorScheme];
  }
  return vars;
}
```

### 2.4 useBrandTheme composable

```typescript
// packages/ai-vue/src/composables/useBrandTheme.ts

import { computed, type ComputedRef } from 'vue';
import {
  colorSchemeToCssVars,
  deriveColorScheme,
} from '../theme/color-utils';
import { defaultTheme } from '../theme/default-theme';
import type { BrandThemeConfig, ColorScheme, IkpTheme } from '../theme/types';

export interface UseBrandThemeReturn {
  /** 完整色板 */
  colorScheme: ComputedRef<ColorScheme>;
  /** 主题令牌（合并默认值与用户覆盖） */
  theme: ComputedRef<IkpTheme>;
  /** CSS 变量对象，可直接绑定到 style 属性 */
  cssVars: ComputedRef<Record<string, string>>;
  /** CSS 变量前缀 */
  prefix: ComputedRef<string>;
}

/**
 * 从品牌色配置派生主题系统。
 *
 * @example
 * ```ts
 * const { cssVars } = useBrandTheme({
 *   primaryBrandColor: '#3784ff',
 *   organizationDisplayName: '钻头文档',
 * });
 * // 在 template 中：<div :style="cssVars">
 * ```
 */
export function useBrandTheme(config: BrandThemeConfig): UseBrandThemeReturn {
  const prefix = computed(() => config.prefix ?? 'ai-chat');

  const colorScheme = computed<ColorScheme>(() => {
    const derived = deriveColorScheme(config.primaryBrandColor);
    // 用户精细覆盖优先
    return { ...derived, ...config.customColorScheme };
  });

  const theme = computed<IkpTheme>(() => ({
    ...defaultTheme,
    ...config.theme,
  }));

  const cssVars = computed<Record<string, string>>(() => {
    const schemeVars = colorSchemeToCssVars(colorScheme.value, prefix.value);
    const themeVars = flattenThemeToCssVars(theme.value, prefix.value);
    return { ...schemeVars, ...themeVars };
  });

  return { colorScheme, theme, cssVars, prefix };
}

/** 将主题令牌展平为 CSS 变量 */
function flattenThemeToCssVars(theme: IkpTheme, prefix: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [category, tokens] of Object.entries(theme)) {
    for (const [tokenName, value] of Object.entries(tokens)) {
      vars[`--${prefix}-${category}-${tokenName}`] = String(value);
    }
  }
  return vars;
}
```

### 2.5 在 AiChat.vue 中接入

```vue
<!-- packages/ai-vue/src/components/ai-chat/AiChat.vue（修改片段） -->
<script setup lang="ts">
import { useBrandTheme } from '../../composables/useBrandTheme';
import type { BrandThemeConfig } from '../../theme/types';

const props = withDefaults(defineProps<AiChatProps & {
  /** 品牌主题配置 */
  brandTheme?: BrandThemeConfig;
}>(), {
  placeholder: '请输入消息',
  mode: 'mock',
});

// 默认品牌色
const brandConfig = computed(() => props.brandTheme ?? {
  primaryBrandColor: '#3b82f6',
  prefix: 'ai-chat',
});
const { cssVars } = useBrandTheme(brandConfig.value);
</script>

<template>
  <section class="ai-chat" :style="cssVars">
    <!-- 原有内容 -->
  </section>
</template>
```

### 2.6 验收要点

- 输入 `primaryBrandColor: '#3784ff'` 后，按钮、链接、强调色均变为蓝色系
- 输入 `primaryBrandColor: '#22c55e'` 后，整体变为绿色系
- `customColorScheme: { strong: '#ff0000' }` 可单独覆盖强调色
- `prefix: 'my-brand'` 后，CSS 变量变为 `--my-brand-primary` 等

---

## 三、P2：Shadow DOM 样式隔离

### 3.1 设计思路

Shadow DOM 是 Web Components 标准，可将组件的 DOM 和 CSS 封装在独立的 Shadow Root 内，宿主页面的全局样式无法穿透 Shadow 边界。agents-ui 通过 `variant` 配置项控制是否启用 Shadow DOM（`no-shadow` / `container-with-shadow`）。

ai-vue 将实现一个 `AiShadowRoot` 包装组件，内部使用 Vue 3 的 `attachShadow` API。由于 Vue 的模板编译不直接支持 Shadow DOM，需要使用渲染函数或 `Teleport` 到 Shadow Root。

### 3.2 AiShadowRoot 组件

```vue
<!-- packages/ai-vue/src/components/ai-shadow-root/AiShadowRoot.vue -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue';

const props = withDefaults(defineProps<{
  /** Shadow DOM 模式 */
  mode?: 'open' | 'closed';
  /** 是否启用 Shadow DOM，false 时降级为普通 div */
  enabled?: boolean;
  /** 注入到 Shadow Root 的 CSS 文本 */
  styles?: string;
}>(), {
  mode: 'open',
  enabled: true,
});

const slots = useSlots();
const hostRef = ref<HTMLElement | null>(null);
let shadowRoot: ShadowRoot | null = null;

onMounted(() => {
  if (!props.enabled || !hostRef.value) return;
  shadowRoot = hostRef.value.attachShadow({ mode: props.mode });
  // 注入样式
  if (props.styles) {
    const styleEl = document.createElement('style');
    styleEl.textContent = props.styles;
    shadowRoot.appendChild(styleEl);
  }
  // 渲染 slot 内容到 Shadow Root
  // Vue 3.5+ 支持 teleport to shadow root
  forceUpdate();
});

onBeforeUnmount(() => {
  shadowRoot = null;
});

// 强制更新以重新渲染 slot 内容
const updateKey = ref(0);
function forceUpdate() {
  updateKey.value++;
}
</script>

<template>
  <div ref="hostRef" class="ai-shadow-root">
    <template v-if="!enabled">
      <slot />
    </template>
  </div>
</template>
```

> **注意**：Vue 3 的模板语法不直接支持将 slot 内容渲染到 Shadow Root。实际实现需要使用渲染函数（`h()`）配合 `Teleport`，或使用 `vue-custom-element` 等库。上面的代码展示的是设计思路，完整实现见 P2 任务清单。

### 3.3 在 AiChat 中接入 Shadow DOM

```typescript
// AiChat.vue 新增 variant 配置
interface AiChatProps {
  // ... 原有 props
  /** 样式隔离模式 */
  variant?: 'no-shadow' | 'container-with-shadow';
}

// 当 variant === 'container-with-shadow' 时，使用 AiShadowRoot 包装
```

### 3.4 SSR 降级策略

VitePress 在构建时会执行 SSR，Shadow DOM 在 SSR 环境中不可用。降级策略：

```typescript
const isSSR = typeof window === 'undefined';
const shouldUseShadow = computed(() => 
  props.variant === 'container-with-shadow' && !isSSR
);
```

---

## 四、P3：富聊天体验增强

### 4.1 自定义消息渲染器

借鉴 agents-ui 的 `ComponentsConfig`，允许使用者按名称注册自定义渲染器。

```typescript
// packages/ai-vue/src/components/ai-chat/types.ts（扩展）

/** 自定义渲染器函数签名 */
export type CustomComponentRenderer = (
  props: Record<string, unknown> & { messageId: string },
  context: { renderMarkdown: (text: string) => string },
) => string | void;

/** 自定义组件注册表 */
export type CustomComponents = Record<string, CustomComponentRenderer>;

export interface AiChatProps {
  // ... 原有 props
  /** 自定义消息渲染器注册表 */
  customComponents?: CustomComponents;
  /** 示例问题列表 */
  exampleQuestions?: string[];
  /** 引导消息 */
  introMessage?: string;
  /** 消息操作菜单配置 */
  messageActions?: MessageAction[];
  /** 反馈配置 */
  feedbackOptions?: FeedbackOptions;
}

export interface MessageAction {
  label: string;
  icon?: string;
  handler: (message: AiChatMessage) => void;
}

export interface FeedbackOptions {
  enabled: boolean;
  onSubmit?: (feedback: { type: 'positive' | 'negative'; messageId: string; details?: string }) => void;
}
```

### 4.2 消息内容扩展

当前 `AiChatMessage.content` 是纯字符串。为支持富组件，需要扩展消息结构：

```typescript
export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  content: string;
  sources?: AiChatSource[];
  /** 新增：富组件渲染指令 */
  component?: {
    /** 渲染器名称，对应 customComponents 的 key */
    name: string;
    /** 传递给渲染器的 props */
    props: Record<string, unknown>;
  };
}
```

### 4.3 自定义渲染器组件

```vue
<!-- packages/ai-vue/src/components/ai-chat/parts/AiChatCustomRenderer.vue -->
<script setup lang="ts">
import { computed, h } from 'vue';
import type { CustomComponents } from '../types';

const props = defineProps<{
  componentName: string;
  componentProps: Record<string, unknown> & { messageId: string };
  customComponents?: CustomComponents;
  markdownText?: string;
}>();

const renderer = computed(() => props.customComponents?.[props.componentName]);

const renderedContent = computed(() => {
  if (!renderer.value) return null;
  return renderer.value(props.componentProps, {
    renderMarkdown: (text: string) => text, // 简化，实际接入 markstream-vue
  });
});
</script>

<template>
  <div v-if="renderedContent" class="ai-chat__custom-component" v-html="renderedContent" />
  <div v-else class="ai-chat__custom-component ai-chat__custom-component--missing">
    未知组件：{{ componentName }}
  </div>
</template>
```

### 4.4 反馈组件

```vue
<!-- packages/ai-vue/src/components/ai-chat/parts/AiChatFeedback.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import type { FeedbackOptions } from '../types';

const props = defineProps<{
  messageId: string;
  options?: FeedbackOptions;
}>();

const emit = defineEmits<{
  (e: 'submit', feedback: { type: 'positive' | 'negative'; messageId: string; details?: string }): void;
}>();

const selected = ref<'positive' | 'negative' | null>(null);
const showDetail = ref(false);
const detail = ref('');

function submit(type: 'positive' | 'negative') {
  selected.value = type;
  if (type === 'negative') {
    showDetail.value = true;
  } else {
    emit('submit', { type, messageId: props.messageId });
  }
}

function submitDetail() {
  emit('submit', {
    type: 'negative',
    messageId: props.messageId,
    details: detail.value,
  });
  showDetail.value = false;
}
</script>

<template>
  <div v-if="options?.enabled" class="ai-chat__feedback">
    <button
      v-if="!selected"
      type="button"
      class="ai-chat__feedback-btn"
      :aria-label="'有帮助'"
      @click="submit('positive')"
    >👍</button>
    <button
      v-if="!selected"
      type="button"
      class="ai-chat__feedback-btn"
      :aria-label="'无帮助'"
      @click="submit('negative')"
    >👎</button>
    <span v-else class="ai-chat__feedback-done">已反馈</span>
    <div v-if="showDetail" class="ai-chat__feedback-detail">
      <textarea v-model="detail" placeholder="请告诉我们哪里可以改进" />
      <button type="button" @click="submitDetail">提交</button>
    </div>
  </div>
</template>
```

### 4.5 示例问题组件

```vue
<!-- packages/ai-vue/src/components/ai-chat/parts/AiChatExampleQuestions.vue -->
<script setup lang="ts">
defineProps<{
  questions: string[];
}>();

const emit = defineEmits<{
  (e: 'select', question: string): void;
}>();
</script>

<template>
  <div v-if="questions.length" class="ai-chat__examples">
    <p class="ai-chat__examples-title">试试这些问题：</p>
    <div class="ai-chat__examples-list">
      <button
        v-for="q in questions"
        :key="q"
        type="button"
        class="ai-chat__example-item"
        @click="emit('select', q)"
      >{{ q }}</button>
    </div>
  </div>
</template>
```

### 4.6 事件系统

```typescript
// packages/ai-vue/src/composables/useChatEvents.ts

import type { AiChatMessage } from '../components/ai-chat/types';

/** 聊天事件类型 */
export type ChatEventType =
  | 'user_message_submitted'
  | 'assistant_answer_displayed'
  | 'chat_clear_clicked'
  | 'chat_share_clicked'
  | 'feedback_submitted'
  | 'message_action_clicked';

export interface ChatEvent {
  type: ChatEventType;
  conversationId?: string;
  messageId?: string;
  tags: string[];
  properties?: Record<string, unknown>;
}

export type ChatEventHandler = (event: ChatEvent) => void;

/**
 * 聚合聊天事件，统一通过 onChatEvent 回调输出。
 */
export function useChatEvents(onChatEvent?: ChatEventHandler) {
  function emit(event: ChatEvent) {
    onChatEvent?.(event);
  }

  function emitUserMessage(message: AiChatMessage) {
    emit({
      type: 'user_message_submitted',
      messageId: message.id,
      tags: ['chat', 'user'],
      properties: { contentLength: message.content.length },
    });
  }

  function emitAssistantDisplayed(message: AiChatMessage) {
    emit({
      type: 'assistant_answer_displayed',
      messageId: message.id,
      tags: ['chat', 'assistant'],
      properties: { sourceCount: message.sources?.length ?? 0 },
    });
  }

  function emitFeedback(type: 'positive' | 'negative', messageId: string, details?: string) {
    emit({
      type: 'feedback_submitted',
      messageId,
      tags: ['chat', 'feedback'],
      properties: { feedbackType: type, hasDetails: !!details },
    });
  }

  return { emit, emitUserMessage, emitAssistantDisplayed, emitFeedback };
}
```

---

## 五、P4：组件形态扩展 + 函数式嵌入

### 5.1 AiSidebarChat

```vue
<!-- packages/ai-vue/src/components/ai-sidebar-chat/AiSidebarChat.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import AiChat from '../ai-chat/AiChat.vue';
import type { AiChatProps, AiChatEmits } from '../ai-chat/types';
import type { BrandThemeConfig } from '../../theme/types';

const props = defineProps<AiChatProps & {
  brandTheme?: BrandThemeConfig;
  /** 侧边栏宽度 */
  width?: string;
  /** 是否默认展开 */
  defaultOpen?: boolean;
}>();

const emit = defineEmits<AiChatEmits>();
const isOpen = ref(props.defaultOpen ?? false);

function toggle() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <div class="ai-sidebar-chat" :class="{ 'ai-sidebar-chat--open': isOpen }">
    <button class="ai-sidebar-chat__trigger" @click="toggle">
      {{ isOpen ? '关闭' : 'AI 对话' }}
    </button>
    <transition name="ai-sidebar-slide">
      <aside v-show="isOpen" class="ai-sidebar-chat__panel" :style="{ width: width ?? '24rem' }">
        <AiChat v-bind="props" @send="emit('send', $event)" @stop="emit('stop')" />
      </aside>
    </transition>
  </div>
</template>
```

### 5.2 AiModalChat

```vue
<!-- packages/ai-vue/src/components/ai-modal-chat/AiModalChat.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import AiChat from '../ai-chat/AiChat.vue';
import type { AiChatProps, AiChatEmits } from '../ai-chat/types';
import type { BrandThemeConfig } from '../../theme/types';

const props = defineProps<AiChatProps & {
  brandTheme?: BrandThemeConfig;
}>();

const emit = defineEmits<AiChatEmits>();
const isOpen = ref(false);

function open() { isOpen.value = true; }
function close() { isOpen.value = false; }
</script>

<template>
  <div>
    <button class="ai-modal-chat__trigger" @click="open">AI 对话</button>
    <transition name="ai-modal-fade">
      <div v-if="isOpen" class="ai-modal-chat__overlay" @click.self="close">
        <div class="ai-modal-chat__dialog">
          <button class="ai-modal-chat__close" @click="close">✕</button>
          <AiChat v-bind="props" @send="emit('send', $event)" @stop="emit('stop')" />
        </div>
      </div>
    </transition>
  </div>
</template>
```

### 5.3 函数式嵌入包

```typescript
// packages/ai-vue-embed/src/mount.ts

import { createApp, h } from 'vue';
import AiChat from '@ruan-cat-drill-doc/ai-vue';
import type { AiChatProps } from '@ruan-cat-drill-doc/ai-vue';
import type { BrandThemeConfig } from '@ruan-cat-drill-doc/ai-vue';

export interface MountAiChatOptions extends AiChatProps {
  brandTheme?: BrandThemeConfig;
  variant?: 'no-shadow' | 'container-with-shadow';
}

/**
 * 将 AI 聊天组件挂载到指定 DOM 节点。
 * 用于非 Vue 环境（纯 HTML、WordPress、Shopify 等）。
 *
 * @example
 * ```html
 * <div id="ai-chat-target"></div>
 * <script type="module">
 *   import { mountAiChat } from '@ruan-cat-drill-doc/ai-vue-embed';
 *   const { unmount } = mountAiChat('#ai-chat-target', {
 *     brandTheme: { primaryBrandColor: '#3784ff' },
 *     mode: 'external',
 *   });
 * </script>
 * ```
 */
export function mountAiChat(
  target: string | HTMLElement,
  options: MountAiChatOptions,
): { unmount: () => void } {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`Target not found: ${target}`);

  const app = createApp({
    render() {
      return h(AiChat, {
        ...options,
        onSend: (msg: any) => options.onSend?.(msg),
        onStop: () => options.onStop?.(),
      });
    },
  });

  app.mount(el);

  return {
    unmount: () => app.unmount(),
  };
}
```

### 5.4 独立包 package.json

```json
{
  "name": "@ruan-cat-drill-doc/ai-vue-embed",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "vite build",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@ruan-cat-drill-doc/ai-vue": "workspace:*",
    "vue": "^3.5.28"
  }
}
```

---

## 六、任务清单

### P1：品牌化主题系统（3 天）

| 编号 | 任务 | 产出 | 验收 |
|------|------|------|------|
| P1-1 | 定义主题类型 | `theme/types.ts` | 类型完整，无 any |
| P1-2 | 实现颜色派生函数 | `theme/color-utils.ts` | hex/rgb 输入均能派生 11 色阶 |
| P1-3 | 定义默认主题令牌 | `theme/default-theme.ts` | 覆盖 colors/fontFamily/fontSize/zIndex |
| P1-4 | 实现 useBrandTheme | `composables/useBrandTheme.ts` | 返回 cssVars 可直接绑定 |
| P1-5 | AiChat 接入主题系统 | 修改 `AiChat.vue` | brandTheme prop 生效 |
| P1-6 | AiChatFloatingButton 接入 | 修改 `AiChatFloatingButton.vue` | 品牌色一致 |
| P1-7 | 编写主题单元测试 | `tests/use-brand-theme.test.ts` | 覆盖率 > 90% |

### P2：Shadow DOM 样式隔离（2 天）

| 编号 | 任务 | 产出 | 验收 |
|------|------|------|------|
| P2-1 | 实现 AiShadowRoot 组件 | `components/ai-shadow-root/` | Shadow DOM 正确挂载 |
| P2-2 | 样式注入机制 | AiShadowRoot 内 style 注入 | 组件样式在 Shadow 内生效 |
| P2-3 | variant 配置接入 | AiChat 新增 variant prop | no-shadow / container-with-shadow 切换 |
| P2-4 | SSR 降级处理 | isSSR 检测 | VitePress 构建不报错 |
| P2-5 | 隔离效果测试 | 手动验证 | 宿主页面 CSS 不污染组件 |

### P3：富聊天体验增强（4 天）

| 编号 | 任务 | 产出 | 验收 |
|------|------|------|------|
| P3-1 | 扩展消息类型 | `types.ts` 新增 component 字段 | 支持富组件指令 |
| P3-2 | 实现自定义渲染器 | `parts/AiChatCustomRenderer.vue` | 按名称渲染注册的组件 |
| P3-3 | 实现反馈组件 | `parts/AiChatFeedback.vue` | 正/负面反馈 + 详情 |
| P3-4 | 实现示例问题 | `parts/AiChatExampleQuestions.vue` | 空状态展示可点击问题 |
| P3-5 | 实现消息操作菜单 | `parts/AiChatMessageActions.vue` | 复制/分享/反馈按钮 |
| P3-6 | 实现事件系统 | `composables/useChatEvents.ts` | 6 种事件类型正确触发 |
| P3-7 | AiChat 集成全部子部件 | 修改 `AiChat.vue` | 各部件按配置显示 |
| P3-8 | 编写富聊天单元测试 | `tests/` | 覆盖率 > 85% |

### P4：组件形态扩展 + 函数式嵌入（3 天）

| 编号 | 任务 | 产出 | 验收 |
|------|------|------|------|
| P4-1 | 实现 AiSidebarChat | `components/ai-sidebar-chat/` | 侧边栏滑入动画正常 |
| P4-2 | 实现 AiModalChat | `components/ai-modal-chat/` | 弹窗 + 遮罩正常 |
| P4-3 | 创建 ai-vue-embed 包 | `packages/ai-vue-embed/` | 独立包可构建 |
| P4-4 | 实现 mountAiChat 函数 | `ai-vue-embed/src/mount.ts` | 非 Vue 环境可挂载 |
| P4-5 | 更新 index.ts 导出 | 修改 `ai-vue/src/index.ts` | 新组件可导入 |
| P4-6 | 编写 embed 集成测试 | `ai-vue-embed/tests/` | 挂载/卸载正常 |

---

## 七、风险与缓解

### 7.1 Shadow DOM 的 Vue 渲染难题

**风险**：Vue 3 的模板编译器不原生支持将 slot 内容渲染到 Shadow Root。直接使用 `<slot>` 只会将内容渲染到 light DOM。

**缓解**：使用渲染函数（`h()`）+ 手动 `attachShadow` + `Teleport` 到 Shadow Root 的方案。或使用 `@vue/web-component-wrapper` 库。如果实现成本过高，P2 可降级为 CSS Scoping（使用 `:where()` 和高优先级选择器模拟隔离），后续再实现完整 Shadow DOM。

### 7.2 品牌色派生的色相偏差

**风险**：HSL 空间的明度调整在不同色相下视觉效果不一致。例如黄色的高明度区域变化不明显，蓝色则变化显著。

**缓解**：P1 阶段先使用 HSL 方案快速验证，如果效果不佳，在 P1-7 测试中引入 OKLCH 色彩空间（通过 `culori` 库，体积约 8KB）作为可选增强。

### 7.3 向后兼容性

**风险**：现有 `AiChat` 和 `AiChatFloatingButton` 的 API 变更可能破坏 `ai-vitepress-plugins` 的 `useKnowledgeChat` 集成。

**缓解**：所有新增 props 设置默认值，确保不传时行为与当前一致。`useKnowledgeChat` 无需修改即可继续工作。新增能力通过可选 props 暴露。

### 7.4 函数式嵌入包体积

**风险**：`ai-vue-embed` 需要包含 Vue 运行时，gzip 后体积可能超过 60KB。

**缓解**：使用 Vite 的 `build.lib` 模式 + `external` 配置，将 Vue 设为外部依赖（要求宿主页面自行引入 Vue）。同时提供"全量版"（含 Vue）和"外部 Vue 版"两个产物。

---

## 八、验收检查清单

### 8.1 功能验收

- [ ] 输入 `primaryBrandColor: '#3784ff'`，聊天界面整体呈蓝色系
- [ ] 输入 `customColorScheme: { strong: '#ff0000' }`，仅强调色变红
- [ ] `variant: 'container-with-shadow'` 时，宿主页面 CSS 不影响组件
- [ ] `customComponents: { 'ticket-card': (props) => '<div>工单</div>' }` 时，消息流中渲染工单卡片
- [ ] `feedbackOptions: { enabled: true }` 时，每条助手消息下方出现反馈按钮
- [ ] `exampleQuestions: ['怎么使用？']` 时，空状态展示可点击问题
- [ ] `onChatEvent` 回调能接收到 6 种事件类型
- [ ] `AiSidebarChat` 从右侧滑入，`AiModalChat` 居中弹窗
- [ ] `mountAiChat('#target', config)` 在纯 HTML 页面正常工作

### 8.2 非功能验收

- [ ] ai-vue 包体积增量 < 15KB（gzip）
- [ ] ai-vue-embed 包体积 < 80KB（gzip，含 Vue）
- [ ] TypeScript 严格模式无报错
- [ ] VitePress SSR 构建无报错
- [ ] 单元测试覆盖率 > 85%
- [ ] 现有 `useKnowledgeChat` 集成无需修改

---

## 九、参考资源

### 9.1 @inkeep/agents-ui 关键源码位置

| 文件 | 作用 |
|------|------|
| `dist/types/config/base.d.ts` | `InkeepBaseSettings`（品牌色、组织名、颜色模式） |
| `dist/types/config/ai.d.ts` | `InkeepAIChatSettings`（聊天配置、上下文、文件、表单） |
| `dist/types/config/components.d.ts` | `ComponentsConfig`（自定义渲染器注册） |
| `dist/types/theme.d.ts` | `IkpTheme` / `UserProvidedColorScheme`（主题令牌） |
| `dist/types/shadow.d.ts` | Shadow DOM 配置类型 |
| `dist/types/events.d.ts` | `InkeepCallbackEvent`（事件链） |
| `dist/types/color-mode.d.ts` | `ColorModeProviderProps`（暗色模式） |
| `dist/react/embedded-chat.d.ts` | `InkeepEmbeddedChatProps`（组件 props） |

### 9.2 实际使用示例

| 文件 | 作用 |
|------|------|
| `agents-manage-ui/.../chat-widget.tsx` | 完整的生产环境使用示例（品牌色、主题覆盖、事件、自定义组件） |
| `agents-manage-ui/.../chat-ui-code.tsx` | 代码生成器（React / JS 两种嵌入方式） |
| `agents-manage-ui/.../snippets/js-embedded-chat.ts` | JS 函数式嵌入示例 |
| `agents-manage-ui/.../snippets/react-component.ts` | React 组件嵌入示例 |
| `agents-ui-demo/src/App.tsx` | 最简使用示例 |

### 9.3 SmallAliceWeb 现有代码

| 文件 | 作用 |
|------|------|
| `packages/ai-vue/src/components/ai-chat/AiChat.vue` | 当前聊天组件（待增强） |
| `packages/ai-vue/src/components/ai-chat/types.ts` | 当前类型定义（待扩展） |
| `packages/ai-vue/src/styles/index.scss` | 当前样式（CSS 变量驱动） |
| `packages/ai-vue/src/composables/useMockAiChat.ts` | Mock 对话 composable |
| `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts` | RAG 聊天 composable（需保持兼容） |
