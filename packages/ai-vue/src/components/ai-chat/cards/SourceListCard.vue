<script setup lang="ts">
import type { AiChatSource } from "../types";

/**
 * 来源列表卡片：用于 itemType="source-list" 的结构化消息。
 * 渲染一组带编号的 RAG 来源链接，独立于单条消息的 footer 来源列表。
 */

defineProps<{
	sources: AiChatSource[];
}>();
</script>

<template>
	<nav v-if="sources.length" class="ai-source-list-card" aria-label="参考来源列表">
		<span class="ai-source-list-card__label">参考来源：</span>
		<a
			v-for="(source, index) in sources"
			:key="source.id"
			class="ai-source-list-card__link"
			:href="source.sourceHref"
			target="_blank"
			rel="noopener noreferrer"
		>
			<span class="ai-source-list-card__index">[{{ index + 1 }}]</span>
			<span class="ai-source-list-card__name">{{ source.label }}</span>
		</a>
	</nav>
</template>

<style scoped>
.ai-source-list-card {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
	min-width: 0;
	max-width: 100%;
	padding: 0.625rem 0.75rem;
	color: var(--ai-chat-text-muted, #9aa4b2);
	font-size: 0.8125rem;
	background: var(--ai-chat-surface-elevated, #1d222b);
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 0.5rem;
}

.ai-source-list-card__label {
	flex: 0 0 auto;
	color: var(--ai-chat-text-muted, #9aa4b2);
	font-size: 0.75rem;
	font-weight: 700;
	letter-spacing: 0;
}

.ai-source-list-card__link {
	display: inline-flex;
	gap: 0.25rem;
	align-items: center;
	min-width: 0;
	padding: 0.25rem 0.5rem;
	color: var(--ai-chat-primary, #3b82f6);
	font-size: 0.75rem;
	line-height: 1.35;
	text-decoration: none;
	background: var(--ai-chat-primary-soft, rgb(59 130 246 / 12%));
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 0.375rem;
	transition: background-color 160ms ease;
}

.ai-source-list-card__link:hover,
.ai-source-list-card__link:focus-visible {
	background: var(--ai-chat-surface, #111318);
	border-color: var(--ai-chat-primary, #3b82f6);
	outline: none;
	text-decoration: underline;
}

.ai-source-list-card__index {
	color: var(--ai-chat-text-muted, #9aa4b2);
	font-variant-numeric: tabular-nums;
}

.ai-source-list-card__name {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>