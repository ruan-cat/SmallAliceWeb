<script setup lang="ts">
import type { AiChatMessage, MessageAction } from "../types";

/**
 * 消息操作菜单：在助手消息下方展示一组操作按钮（复制/分享/反馈等）。
 * 操作处理函数由使用者通过 messageActions prop 注入；本组件只负责 UI 与转发。
 */
defineProps<{
	message: AiChatMessage;
	actions: MessageAction[];
}>();

const emit = defineEmits<{
	(event: "action", action: MessageAction, message: AiChatMessage): void;
}>();
</script>

<template>
	<div v-if="actions.length" class="ai-chat__message-actions">
		<button
			v-for="(action, index) in actions"
			:key="`${index}-${action.label}`"
			type="button"
			class="ai-chat__message-action"
			:aria-label="action.label"
			@click="emit('action', action, message)"
		>
			{{ action.label }}
		</button>
	</div>
</template>
