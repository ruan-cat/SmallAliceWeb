<script setup lang="ts">
/**
 * 搜索结果卡片：用于 itemType="search-result" 的结构化消息。
 * 接收 data 字段，按 RAG 检索结果样式展示：标题、摘要、heading 路径、相关度、来源链接。
 */
import type { SearchResultData } from "../types";

const props = defineProps<{
	data: SearchResultData;
}>();

/** 把 0~1 的相关度渲染为整数百分比，未传则不显示 */
const scorePercent = (): number | null => (typeof props.data.score === "number" ? Math.round(props.data.score * 100) : null);
</script>

<template>
	<article class="ai-search-result-card">
		<header class="ai-search-result-card__header">
			<h4 class="ai-search-result-card__title">{{ data.title }}</h4>
			<span v-if="scorePercent() !== null" class="ai-search-result-card__score" aria-label="相关度">
				相关度 {{ scorePercent() }}%
			</span>
		</header>

		<p class="ai-search-result-card__snippet">{{ data.snippet }}</p>

		<div v-if="data.headingPath?.length" class="ai-search-result-card__path" aria-label="文档路径">
			<span v-for="(heading, index) in data.headingPath" :key="index">
				{{ heading }}<span v-if="index < data.headingPath!.length - 1" class="ai-search-result-card__path-sep">/</span>
			</span>
		</div>

		<a
			class="ai-search-result-card__link"
			:href="data.sourceUrl"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="查看来源"
		>
			{{ data.sourceLabel }}
		</a>
	</article>
</template>

<style scoped>
.ai-search-result-card {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	min-width: 0;
	max-width: 100%;
	padding: 0.75rem 0.875rem;
	color: var(--ai-chat-text, #f4f7fb);
	background: var(--ai-chat-surface-elevated, #1d222b);
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 0.625rem;
}

.ai-search-result-card__header {
	display: flex;
	gap: 0.5rem;
	align-items: center;
	justify-content: space-between;
}

.ai-search-result-card__title {
	margin: 0;
	min-width: 0;
	color: var(--ai-chat-text, #f4f7fb);
	font-size: 0.9375rem;
	font-weight: 700;
	line-height: 1.35;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ai-search-result-card__score {
	flex: 0 0 auto;
	padding: 0.125rem 0.5rem;
	color: var(--ai-chat-primary, #3b82f6);
	font-size: 0.6875rem;
	font-weight: 700;
	background: var(--ai-chat-primary-soft, rgb(59 130 246 / 12%));
	border: 1px solid var(--ai-chat-border, rgb(255 255 255 / 10%));
	border-radius: 999px;
}

.ai-search-result-card__snippet {
	margin: 0;
	color: var(--ai-chat-text-muted, #9aa4b2);
	font-size: 0.8125rem;
	line-height: 1.5;
	word-break: break-word;
}

.ai-search-result-card__path {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
	color: var(--ai-chat-text-muted, #9aa4b2);
	font-size: 0.6875rem;
	line-height: 1.4;
}

.ai-search-result-card__path-sep {
	margin: 0 0.25rem;
	color: var(--ai-chat-text-muted, #9aa4b2);
	opacity: 0.6;
}

.ai-search-result-card__link {
	display: inline-flex;
	gap: 0.25rem;
	align-items: center;
	align-self: flex-start;
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

.ai-search-result-card__link:hover,
.ai-search-result-card__link:focus-visible {
	background: var(--ai-chat-surface, #111318);
	border-color: var(--ai-chat-primary, #3b82f6);
	outline: none;
	text-decoration: underline;
}
</style>