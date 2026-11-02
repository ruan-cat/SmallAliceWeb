<script setup lang="ts">
import { AiChatFloatingButton } from "@ruan-cat-drill-doc/ai-vue";
import { withBase } from "vitepress";
import { onMounted, ref } from "vue";
import { useChatCompletionAttention } from "../composables/useChatCompletionAttention";
import { usePageContextCollector } from "../composables/collectPageContext";
import { useKnowledgeChat } from "../composables/useKnowledgeChat";

const isMounted = ref(false);
const attention = useChatCompletionAttention({
	title: "AI 回复已完成｜小爱丽丝官网",
	notificationTitle: "小爱丽丝官网",
	notificationBody: "AI 已完成回复，点击返回继续查看。",
	icon: withBase("/favicon.svg"),
});
const { permission, canRequestPermission, requestPermission } = attention;
/** FC-1 接入：采集器必须在 setup 期建立（useRoute / useData 依赖 Vue inject），推迟到 send 回调内调用会抛 useRouter provider 错误 */
const collectPageContext = usePageContextCollector();
const { messages, isResponding, errorMessage, send, stop, clearError, models, selectedProvider, selectModel } =
	useKnowledgeChat("knowledge-chat", {
		onResponseComplete: attention.markCompleted,
		/** 每次 send 由闭包重新求值，采集最新 pagePath / title / keywords；SSR 阶段返回 undefined 不发该字段 */
		getPageContext: collectPageContext,
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
			variant="no-shadow"
			:models="models"
			:selected-model-id="selectedProvider"
			@send="send"
			@stop="stop"
			@clear-error="clearError"
			@select-model="selectModel"
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
