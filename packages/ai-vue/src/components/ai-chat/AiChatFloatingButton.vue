<script setup lang="ts">
import type { AiChatEmits, AiChatProps } from "./types";
import { onMounted, ref } from "vue";
import AiChat from "./AiChat.vue";

const props = defineProps<Pick<AiChatProps, "messages" | "isResponding" | "errorMessage">>();
const emit = defineEmits<AiChatEmits>();
const isMounted = ref(false);
const isOpen = ref(false);

/** 在客户端挂载后启用悬浮入口，避免服务端渲染不一致。 */
onMounted(() => {
	isMounted.value = true;
});

/** 切换对话 dock 的显示状态。 */
function toggleDock() {
	isOpen.value = !isOpen.value;
}

/** 关闭对话 dock。 */
function closeDock() {
	isOpen.value = false;
}
</script>

<template>
	<div v-if="isMounted" class="ai-chat-floating-button" :class="{ 'ai-chat-floating-button--open': isOpen }">
		<aside
			v-if="isOpen"
			id="ai-chat-floating-button-dock"
			class="ai-chat-floating-button__dock"
			aria-label="AI 对话面板"
		>
			<div class="ai-chat-floating-button__dock-shell">
				<header class="ai-chat-floating-button__header">
					<div class="ai-chat-floating-button__brand" aria-hidden="true">AI</div>
					<div class="ai-chat-floating-button__title-group">
						<h2 class="ai-chat-floating-button__title">AI 对话</h2>
						<p class="ai-chat-floating-button__status">
							<span class="ai-chat-floating-button__status-dot" aria-hidden="true"></span>
							本地助手
						</p>
					</div>
					<button type="button" class="ai-chat-floating-button__close" aria-label="关闭 AI 对话" @click="closeDock">
						<span aria-hidden="true">×</span>
					</button>
				</header>
				<AiChat
					mode="external"
					:messages="props.messages"
					:is-responding="props.isResponding"
					:error-message="props.errorMessage"
					@send="emit('send', $event)"
					@stop="emit('stop')"
					@clear-error="emit('clear-error')"
				/>
			</div>
		</aside>

		<button
			type="button"
			class="ai-chat-floating-button__trigger"
			:aria-expanded="isOpen"
			aria-controls="ai-chat-floating-button-dock"
			:aria-label="isOpen ? '关闭 AI 对话' : '打开 AI 对话'"
			@click="toggleDock"
		>
			<span class="ai-chat-floating-button__trigger-mark" aria-hidden="true">AI</span>
			<span class="ai-chat-floating-button__trigger-text">AI 对话</span>
		</button>
	</div>
</template>
