<script setup lang="ts">
import { onMounted, ref } from "vue";
import AiChat from "./AiChat.vue";

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
</script>

<template>
	<div v-if="isMounted" class="ai-chat-floating-button">
		<button
			type="button"
			class="ai-chat-floating-button__trigger"
			:aria-expanded="isOpen"
			aria-controls="ai-chat-floating-button-dock"
			@click="toggleDock"
		>
			{{ isOpen ? "关闭 AI 对话" : "打开 AI 对话" }}
		</button>

		<aside
			v-if="isOpen"
			id="ai-chat-floating-button-dock"
			class="ai-chat-floating-button__dock"
			aria-label="AI 对话面板"
		>
			<AiChat />
		</aside>
	</div>
</template>
