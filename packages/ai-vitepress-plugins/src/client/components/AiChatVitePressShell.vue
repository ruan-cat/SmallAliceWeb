<script setup lang="ts">
import { AiChatFloatingButton } from "@ruan-cat-drill-doc/ai-vue";
import { withBase } from "vitepress";
import { onMounted, ref } from "vue";
import { useChatCompletionAttention } from "../composables/useChatCompletionAttention";
import { useKnowledgeChat } from "../composables/useKnowledgeChat";

const isMounted = ref(false);
const attention = useChatCompletionAttention({
	title: "AI 回复已完成｜小爱丽丝官网",
	notificationTitle: "小爱丽丝官网",
	notificationBody: "AI 已完成回复，点击返回继续查看。",
	icon: withBase("/favicon.svg"),
});
const { permission, canRequestPermission, requestPermission } = attention;
const { messages, isResponding, errorMessage, send, stop, clearError } = useKnowledgeChat("knowledge-chat", {
	onResponseComplete: attention.markCompleted,
});

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
		>
			<template #notification-control>
				<button
					v-if="canRequestPermission"
					type="button"
					class="ai-chat-vitepress-shell__notification-control"
					@click="requestPermission"
				>
					开启回复通知
				</button>
				<p v-else-if="permission === 'granted'" class="ai-chat-vitepress-shell__notification-status">已开启回复通知</p>
				<p v-else-if="permission === 'denied'" class="ai-chat-vitepress-shell__notification-status">
					已拒绝通知权限，请在浏览器站点设置中手动开启。
				</p>
			</template>
		</AiChatFloatingButton>
	</div>
</template>
