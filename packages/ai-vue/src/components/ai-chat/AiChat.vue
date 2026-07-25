<script setup lang="ts">
import { useMockAiChat } from "../../composables/useMockAiChat";
import type { AiChatEmits, AiChatMessage, AiChatProps } from "./types";

const props = withDefaults(defineProps<AiChatProps>(), {
	placeholder: "请输入消息",
});
const emit = defineEmits<AiChatEmits>();
const textareaAutosize = { minRows: 1, maxRows: 4 };

const { messages, input, isResponding, canSend, sendMessage } = useMockAiChat({
	initialMessages: props.initialMessages,
	mockDelay: props.mockDelay,
});

/** 发送用户输入，并通知组件使用方。 */
function handleSend() {
	if (!canSend.value) return;

	const message: AiChatMessage = {
		id: `user-${messages.value.length + 1}`,
		role: "user",
		content: input.value.trim(),
	};

	sendMessage();
	emit("send", message);
}
</script>

<template>
	<section class="ai-chat" aria-label="AI 对话">
		<div class="ai-chat__messages" aria-live="polite">
			<div v-if="messages.length === 0 && !isResponding" class="ai-chat__empty">
				<div class="ai-chat__empty-mark" aria-hidden="true">AI</div>
				<p class="ai-chat__empty-title">暂无消息</p>
				<p class="ai-chat__empty-description">问一个和当前文档有关的问题。</p>
			</div>

			<p
				v-for="message in messages"
				:key="message.id"
				class="ai-chat__message"
				:class="`ai-chat__message--${message.role}`"
			>
				{{ message.content }}
			</p>
			<p v-if="isResponding" class="ai-chat__responding" role="status">
				<span class="ai-chat__responding-dots" aria-hidden="true">
					<span></span>
					<span></span>
					<span></span>
				</span>
				正在回复
			</p>
		</div>

		<footer class="ai-chat__composer">
			<el-input
				v-model="input"
				class="ai-chat__input"
				type="textarea"
				aria-label="消息内容"
				:placeholder="placeholder"
				:autosize="textareaAutosize"
				:disabled="isResponding"
				resize="none"
				@keydown.enter.exact.prevent="handleSend"
			/>
			<el-button
				class="ai-chat__send"
				type="primary"
				native-type="button"
				:disabled="isResponding || !canSend"
				@click="handleSend"
			>
				发送
			</el-button>
		</footer>
	</section>
</template>
