<script setup lang="ts">
import { AiChatFloatingButton } from "@ruan-cat-drill-doc/ai-vue";
import { onMounted, ref } from "vue";
import { useKnowledgeChat } from "../composables/useKnowledgeChat";

const isMounted = ref(false);
const { messages, isResponding, errorMessage, send, stop, clearError } = useKnowledgeChat();

/** 在客户端挂载后渲染对话入口，保持 VitePress SSR 输出稳定。 */
onMounted(() => {
	isMounted.value = true;
});
</script>

<template>
	<div class="ai-chat-vitepress-shell">
		<AiChatFloatingButton
			v-if="isMounted"
			:messages="messages"
			:is-responding="isResponding"
			:error-message="errorMessage"
			@send="send"
			@stop="stop"
			@clear-error="clearError"
		/>
	</div>
</template>
