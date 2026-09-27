<script setup lang="ts">
import { ref } from "vue";
import type { FeedbackType } from "../types";

/**
 * 反馈组件：为助手消息提供 👍 / 👎 按钮。
 * 负面反馈时弹出详情输入框，submit 时一次性 emit 携带 details。
 */
const props = defineProps<{
	messageId: string;
	/** 是否禁用（已反馈过） */
	disabled?: boolean;
}>();

const emit = defineEmits<{
	(
		event: "submit",
		payload: {
			type: FeedbackType;
			messageId: string;
			details?: string;
		},
	): void;
}>();

const selected = ref<FeedbackType | null>(null);
const showDetail = ref(false);
const detail = ref("");

function selectFeedback(type: FeedbackType) {
	if (props.disabled || selected.value) return;
	selected.value = type;
	if (type === "negative") {
		// 负面反馈：先弹详情输入框，让用户描述
		showDetail.value = true;
		return;
	}
	emit("submit", { type, messageId: props.messageId });
}

function submitDetail() {
	emit("submit", {
		type: "negative",
		messageId: props.messageId,
		details: detail.value.trim() || undefined,
	});
	showDetail.value = false;
}

function cancelDetail() {
	// 取消负面反馈详情：回到未选状态
	selected.value = null;
	showDetail.value = false;
	detail.value = "";
}
</script>

<template>
	<div class="ai-chat__feedback">
		<template v-if="!selected">
			<button
				type="button"
				class="ai-chat__feedback-btn"
				aria-label="反馈：这条回答有帮助"
				:disabled="props.disabled"
				@click="selectFeedback('positive')"
			>
				👍
			</button>
			<button
				type="button"
				class="ai-chat__feedback-btn"
				aria-label="反馈：这条回答无帮助"
				:disabled="props.disabled"
				@click="selectFeedback('negative')"
			>
				👎
			</button>
		</template>
		<span v-else class="ai-chat__feedback-done" aria-live="polite">
			已反馈（{{ selected === "positive" ? "有帮助" : "已记录" }}）
		</span>
		<div v-if="showDetail" class="ai-chat__feedback-detail">
			<textarea v-model="detail" class="ai-chat__feedback-detail-input" placeholder="请告诉我们哪里可以改进" rows="3" />
			<div class="ai-chat__feedback-detail-actions">
				<button type="button" class="ai-chat__feedback-detail-submit" @click="submitDetail">提交</button>
				<button type="button" class="ai-chat__feedback-detail-cancel" @click="cancelDetail">取消</button>
			</div>
		</div>
	</div>
</template>
