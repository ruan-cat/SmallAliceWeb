<script setup lang="ts">
import { h, onBeforeUnmount, onMounted, ref, render, useSlots, watchEffect, type Slots } from "vue";

/**
 * Shadow DOM 包装组件：将 slot 内容渲染到 attachShadow 创建的 Shadow Root，
 * 使组件样式与宿主页面 CSS 隔离。
 *
 * 设计要点：
 * 1. SSR 安全：typeof window === "undefined" 时直接渲染 slot 到 light DOM。
 * 2. Vue 模板不直接支持 Shadow Root，因此用 render() 把 vnodes 挂载到
 *    Shadow Root；Vue 响应式系统接管后，slot 内组件的 prop 变化会继续
 *    在 Shadow Root 内触发 patch。
 * 3. enabled=false 降级为 light DOM 渲染，便于调试与对比。
 * 4. 父组件传入 styles 文本，会作为 <style> 注入到 Shadow Root 顶部。
 * 5. 使用 watchEffect 而非 onMounted 调用 slot，确保响应式依赖被收集。
 */

const props = withDefaults(
	defineProps<{
		/** 是否启用 Shadow DOM；false 时降级为普通 light DOM 渲染 */
		enabled?: boolean;
		/** Shadow Root 模式；仅在 enabled=true 时生效 */
		mode?: "open" | "closed";
		/** 注入到 Shadow Root 内的 CSS 文本 */
		styles?: string;
	}>(),
	{
		enabled: true,
		mode: "open",
	},
);

const slots: Slots = useSlots();
const hostRef = ref<HTMLElement | null>(null);

/** 当前挂载到的容器（Shadow Root 或 hostRef），用于 unmount 与重挂载。 */
let container: Element | ShadowRoot | null = null;

/** Shadow Root 内的 <style> 元素引用，便于 styles 变化时替换文本。 */
let styleEl: HTMLStyleElement | null = null;

/** SSR / DOM API 缺失判定：在服务端或 jsdom 子集环境下禁用 attachShadow。 */
const domAvailable =
	typeof window !== "undefined" && typeof document !== "undefined" && typeof HTMLElement !== "undefined";

onMounted(() => {
	if (!hostRef.value) return;

	watchEffect(() => {
		const host = hostRef.value;
		if (!host) return;

		// SSR / 无 DOM：渲染到 host 的 light DOM 子节点。
		if (!domAvailable) {
			const vnodes = slots["default"]?.() ?? [];
			const nextContainer: Element = host;
			if (container && container !== nextContainer) render(null, container);
			render(h("div", { class: "ai-shadow-root__content" }, vnodes), nextContainer);
			container = nextContainer;
			styleEl = null;
			return;
		}

		if (!props.enabled) {
			const vnodes = slots["default"]?.() ?? [];
			const nextContainer: Element = host;
			if (container && container !== nextContainer) render(null, container);
			render(h("div", { class: "ai-shadow-root__content" }, vnodes), nextContainer);
			container = nextContainer;
			styleEl = null;
			return;
		}

		// 启用 Shadow DOM：首次挂载时创建 Shadow Root；后续 styles 变化时只更新 style 文本。
		const shadow: ShadowRoot = host.shadowRoot ?? host.attachShadow({ mode: props.mode });
		if (props.styles) {
			if (!styleEl || styleEl.parentNode !== shadow) {
				const next = document.createElement("style");
				next.textContent = props.styles;
				shadow.appendChild(next);
				styleEl = next;
			} else {
				styleEl.textContent = props.styles;
			}
		}
		const vnodes = slots["default"]?.() ?? [];
		if (container !== shadow) {
			if (container) render(null, container);
			render(h("div", { class: "ai-shadow-root__content" }, vnodes), shadow);
			container = shadow;
		} else {
			render(h("div", { class: "ai-shadow-root__content" }, vnodes), shadow);
		}
	});
});

onBeforeUnmount(() => {
	if (container) {
		render(null, container);
		container = null;
	}
	styleEl = null;
});
</script>

<template>
	<div ref="hostRef" class="ai-shadow-root" />
</template>
