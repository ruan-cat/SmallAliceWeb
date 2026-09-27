<script setup lang="ts">
/**
 * AiModalChat：模态弹窗容器，内嵌 AiChat。
 * 用 trigger 按钮控制模态开关；遮罩点击关闭；ESC 按键关闭。
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import AiChat from "../ai-chat/AiChat.vue";
import type { AiChatEmits, AiChatProps } from "../ai-chat/types";
import type { BrandThemeConfig } from "../../theme/types";

const props = withDefaults(
	defineProps<
		AiChatProps & {
			brandTheme?: BrandThemeConfig;
			/** 触发按钮文案 */
			triggerLabel?: string;
		}
	>(),
	{
		triggerLabel: "AI 对话",
	},
);

const emit = defineEmits<AiChatEmits>();

const isOpen = ref(false);

function open() {
	isOpen.value = true;
}

function close() {
	isOpen.value = false;
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape" && isOpen.value) {
		close();
	}
}

onMounted(() => {
	if (typeof window !== "undefined") {
		window.addEventListener("keydown", handleKeydown);
	}
});

onBeforeUnmount(() => {
	if (typeof window !== "undefined") {
		window.removeEventListener("keydown", handleKeydown);
	}
});

defineExpose({ open, close, toggle: () => (isOpen.value = !isOpen.value) });
</script>

<template>
	<div class="ai-modal-chat">
		<button
			type="button"
			class="ai-modal-chat__trigger"
			:aria-expanded="isOpen"
			aria-controls="ai-modal-chat-dialog"
			@click="open"
		>
			{{ triggerLabel }}
		</button>
		<transition name="ai-modal-fade">
			<div
				v-if="isOpen"
				class="ai-modal-chat__overlay"
				role="presentation"
				@click.self="close"
			>
				<div
					id="ai-modal-chat-dialog"
					class="ai-modal-chat__dialog"
					role="dialog"
					aria-modal="true"
					aria-label="AI 对话"
				>
					<button type="button" class="ai-modal-chat__close" aria-label="关闭" @click="close">✕</button>
					<AiChat
						v-bind="props"
						@send="(message) => emit('send', message)"
						@stop="emit('stop')"
						@clear-error="emit('clear-error')"
						@feedback="(payload) => emit('feedback', payload)"
					/>
				</div>
			</div>
		</transition>
	</div>
</template>

<style scoped>
.ai-modal-chat {
	display: contents;
}

.ai-modal-chat__trigger {
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

.ai-modal-chat__trigger:hover,
.ai-modal-chat__trigger:focus-visible {
	background: var(--ai-chat-primary-hover, #60a5fa);
	outline: none;
	transform: translateY(-1px);
}

.ai-modal-chat__overlay {
	position: fixed;
	inset: 0;
	z-index: var(--ai-chat-floating-z-index, 1000);
	display: grid;
	place-items: center;
	padding: 1.5rem;
	background: rgb(0 0 0 / 55%);
	backdrop-filter: blur(0.25rem);
}

.ai-modal-chat__dialog {
	position: relative;
	display: flex;
	flex-direction: column;
	width: min(36rem, 100%);
	height: min(34rem, 100dvh);
	max-height: 100dvh;
	overflow: hidden;
	background: var(--ai-chat-surface, #111318);
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 0.75rem;
	box-shadow: 0 1.5rem 3.5rem rgb(0 0 0 / 50%);
}

.ai-modal-chat__close {
	position: absolute;
	top: 0.5rem;
	right: 0.5rem;
	z-index: 2;
	display: inline-grid;
	width: 2rem;
	height: 2rem;
	padding: 0;
	color: var(--ai-chat-text-muted, #9aa4b2);
	font: inherit;
	font-size: 1rem;
	line-height: 1;
	cursor: pointer;
	background: rgb(255 255 255 / 6%);
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 0.5rem;
	place-items: center;
	transition: background-color 160ms ease;
}

.ai-modal-chat__close:hover,
.ai-modal-chat__close:focus-visible {
	background: rgb(255 255 255 / 10%);
	color: var(--ai-chat-text, #f4f7fb);
	outline: none;
}

.ai-modal-fade-enter-active,
.ai-modal-fade-leave-active {
	transition: opacity 180ms ease;
}

.ai-modal-fade-enter-from,
.ai-modal-fade-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.ai-modal-fade-enter-active,
	.ai-modal-fade-leave-active {
		transition-duration: 1ms;
	}
}
</style>