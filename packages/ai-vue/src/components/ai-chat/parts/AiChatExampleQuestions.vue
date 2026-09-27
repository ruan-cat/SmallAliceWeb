<script setup lang="ts">
/**
 * 示例问题列表：在消息为空时展示，引导用户发起对话。
 * 点击问题即 emit('select')，由 AiChat 转发为 send 事件。
 */
defineProps<{
	questions: string[];
}>();

const emit = defineEmits<{
	(event: "select", question: string): void;
}>();
</script>

<template>
	<div v-if="questions.length" class="ai-chat__examples">
		<p class="ai-chat__examples-title">试试这些问题：</p>
		<div class="ai-chat__examples-list">
			<button
				v-for="(question, index) in questions"
				:key="`${index}-${question}`"
				type="button"
				class="ai-chat__example-item"
				@click="emit('select', question)"
			>
				{{ question }}
			</button>
		</div>
	</div>
</template>
