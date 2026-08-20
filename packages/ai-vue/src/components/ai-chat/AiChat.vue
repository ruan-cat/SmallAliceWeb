<script setup lang="ts">
import MarkdownRender from "markstream-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bubble, BubbleList, Sender } from "vue-element-plus-x";
import { useMockAiChat } from "../../composables/useMockAiChat";
import type { AiChatEmits, AiChatMessage, AiChatProps } from "./types";

type AiChatBubbleItem = AiChatMessage & {
	placement: "start" | "end";
};

const props = withDefaults(defineProps<AiChatProps>(), {
	placeholder: "请输入消息",
	mode: "mock",
});
const emit = defineEmits<AiChatEmits>();

const { messages, input, isResponding, sendMessage } = useMockAiChat({
	initialMessages: props.initialMessages,
	mockDelay: props.mockDelay,
});
const displayedMessages = computed(() => props.messages ?? messages.value);
const displayedResponding = computed(() => props.isResponding ?? isResponding.value);
const canSendMessage = computed(() => input.value.trim().length > 0 && !displayedResponding.value);
const prefersReducedMotion = ref(false);
const smoothStreaming = computed<false | "auto">(() => (prefersReducedMotion.value ? false : "auto"));
const bubbleItems = computed<AiChatBubbleItem[]>(() =>
	displayedMessages.value.map((message) => ({
		...message,
		placement: message.role === "user" ? "end" : "start",
	})),
);
const lastAssistantMessageId = computed(
	() => [...displayedMessages.value].reverse().find((message) => message.role === "assistant")?.id,
);
let reducedMotionMediaQuery: MediaQueryList | undefined;

/** 将系统减少动态效果偏好映射为 Markdown 渲染节奏。 */
function updateReducedMotionPreference(event?: MediaQueryListEvent) {
	prefersReducedMotion.value = event?.matches ?? reducedMotionMediaQuery?.matches ?? false;
}

onMounted(() => {
	if (typeof window.matchMedia !== "function") return;
	reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	updateReducedMotionPreference();
	reducedMotionMediaQuery.addEventListener("change", updateReducedMotionPreference);
});

onBeforeUnmount(() => {
	reducedMotionMediaQuery?.removeEventListener("change", updateReducedMotionPreference);
});

/** 标记当前仍在生成的最后一条助手消息。 */
function isAssistantMessageFinal(message: AiChatMessage) {
	return !displayedResponding.value || message.id !== lastAssistantMessageId.value;
}

/** 发送用户输入，并通知组件使用方。 */
function handleSend(content: string) {
	const normalizedContent = content.trim();
	if (!canSendMessage.value || !normalizedContent) return;

	const message: AiChatMessage = {
		id: `user-${displayedMessages.value.length + 1}`,
		role: "user",
		content: normalizedContent,
	};

	if (props.mode === "mock") sendMessage();
	else input.value = "";
	emit("send", message);
}

/** 请求外部聊天状态管理器中止当前生成。 */
function handleStop() {
	if (!displayedResponding.value) return;
	emit("stop");
}
</script>

<template>
	<section class="ai-chat" aria-label="AI 对话">
		<div class="ai-chat__messages" aria-live="polite">
			<div v-if="errorMessage" class="ai-chat__error" role="alert">
				<span>{{ errorMessage }}</span>
				<button type="button" class="ai-chat__error-dismiss" aria-label="关闭错误提示" @click="emit('clear-error')">
					关闭
				</button>
			</div>
			<Bubble v-if="displayedMessages.length === 0 && !displayedResponding" class="ai-chat__empty" content="">
				<template #content>
					<div class="ai-chat__empty-mark" aria-hidden="true">AI</div>
					<p class="ai-chat__empty-title">暂无消息</p>
					<p class="ai-chat__empty-description">问一个和当前文档有关的问题。</p>
				</template>
			</Bubble>

			<BubbleList v-if="bubbleItems.length" class="ai-chat__bubble-list" :list="bubbleItems" :auto-scroll="false">
				<template #content="{ item }">
					<span v-if="item.role === 'user'">{{ item.content }}</span>
					<MarkdownRender
						v-else
						mode="chat"
						:content="item.content"
						:final="isAssistantMessageFinal(item)"
						html-policy="escape"
						:smooth-streaming="smoothStreaming"
						:typewriter="!prefersReducedMotion"
						:fade="false"
					/>
				</template>

				<template #footer="{ item }">
					<nav v-if="item.sources?.length" class="ai-chat__sources" aria-label="参考资料">
						<a
							v-for="source in item.sources"
							:key="source.id"
							class="ai-chat__source"
							:href="source.sourceHref"
							rel="noopener noreferrer"
						>
							{{ source.label }}
						</a>
					</nav>
				</template>
			</BubbleList>
		</div>

		<button
			v-if="props.mode === 'external' && displayedResponding"
			type="button"
			class="ai-chat__stop"
			aria-label="停止生成"
			@click="handleStop"
		>
			停止生成
		</button>

		<slot name="notification-control" />

		<Sender
			v-model="input"
			:auto-size="{ minRows: 1, maxRows: 4 }"
			:loading="displayedResponding"
			:placeholder="placeholder"
			:submit-btn-disabled="!canSendMessage"
			@submit="handleSend"
			@cancel="handleStop"
		/>
	</section>
</template>
