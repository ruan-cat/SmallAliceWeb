<script setup lang="ts">
/**
 * AiSidebarChat：折叠式侧边栏容器，内嵌 AiChat。
 * 用 trigger 按钮控制抽屉开关；面板挂载 AiChat 自身的事件与 props 透传。
 */
import { ref } from "vue";
import AiChat from "../ai-chat/AiChat.vue";
import type { AiChatEmits, AiChatProps } from "../ai-chat/types";
import type { BrandThemeConfig } from "../../theme/types";

const props = withDefaults(
	defineProps<
		AiChatProps & {
			brandTheme?: BrandThemeConfig;
			/** 抽屉宽度（CSS 长度） */
			width?: string;
			/** 触发按钮文案 */
			triggerLabel?: string;
			/** 是否默认展开 */
			defaultOpen?: boolean;
		}
	>(),
	{
		width: "24rem",
		triggerLabel: "AI 对话",
		defaultOpen: false,
	},
);

const emit = defineEmits<AiChatEmits>();

const isOpen = ref(props.defaultOpen);

function toggle() {
	isOpen.value = !isOpen.value;
}

defineExpose({ toggle, open: () => (isOpen.value = true), close: () => (isOpen.value = false) });
</script>

<template>
	<div class="ai-sidebar-chat" :class="{ 'ai-sidebar-chat--open': isOpen }">
		<button
			type="button"
			class="ai-sidebar-chat__trigger"
			:aria-expanded="isOpen"
			aria-controls="ai-sidebar-chat-panel"
			@click="toggle"
		>
			{{ isOpen ? "关闭" : triggerLabel }}
		</button>
		<transition name="ai-sidebar-slide">
			<aside
				v-show="isOpen"
				id="ai-sidebar-chat-panel"
				class="ai-sidebar-chat__panel"
				:style="{ width }"
			>
				<AiChat
					v-bind="props"
					@send="(message) => emit('send', message)"
					@stop="emit('stop')"
					@clear-error="emit('clear-error')"
					@feedback="(payload) => emit('feedback', payload)"
				/>
			</aside>
		</transition>
	</div>
</template>

<style scoped>
.ai-sidebar-chat {
	display: contents;
}

.ai-sidebar-chat__trigger {
	pointer-events: auto;
	display: inline-flex;
	gap: 0.5rem;
	align-items: center;
	min-height: 2.5rem;
	padding: 0.375rem 0.875rem;
	color: var(--ai-chat-primary-contrast, #ffffff);
	font: inherit;
	font-size: 0.875rem;
	font-weight: 700;
	cursor: pointer;
	background: var(--ai-chat-primary, #3b82f6);
	border: 1px solid rgb(255 255 255 / 18%);
	border-radius: 999px;
	box-shadow: 0 0.5rem 1.25rem var(--ai-chat-shadow, rgb(0 0 0 / 34%));
	transition:
		background-color 160ms ease,
		box-shadow 160ms ease,
		transform 160ms ease;
}

.ai-sidebar-chat__trigger:hover,
.ai-sidebar-chat__trigger:focus-visible {
	background: var(--ai-chat-primary-hover, #60a5fa);
	outline: none;
	transform: translateY(-1px);
}

.ai-sidebar-chat--open .ai-sidebar-chat__trigger {
	background: var(--ai-chat-primary-hover, #60a5fa);
}

.ai-sidebar-chat__panel {
	position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: var(--ai-chat-floating-z-index, 1000);
	display: flex;
	flex-direction: column;
	padding: 1rem;
	background: var(--ai-chat-surface, #111318);
	border-left: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	box-shadow: -1rem 0 2rem var(--ai-chat-shadow, rgb(0 0 0 / 34%));
	overflow: hidden;
}

.ai-sidebar-slide-enter-active,
.ai-sidebar-slide-leave-active {
	transition: transform 220ms ease;
}

.ai-sidebar-slide-enter-from,
.ai-sidebar-slide-leave-to {
	transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
	.ai-sidebar-slide-enter-active,
	.ai-sidebar-slide-leave-active {
		transition-duration: 1ms;
	}
}
</style>