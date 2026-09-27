<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";

/**
 * 自定义消息渲染器：根据 message.component.name 查表，
 * 用 <component :is> 渲染注册组件；未注册时降级为占位提示。
 */
const props = defineProps<{
	/** component 指令：name + 渲染 props */
	componentName: string;
	componentProps?: Record<string, unknown>;
	/** 当前消息 ID：自动注入到组件 props（按组件约定） */
	messageId: string;
	/** 自定义组件注册表 */
	customComponents?: Record<string, Component>;
}>();

/** 查找渲染器；找不到则返回 undefined 触发降级。 */
const ResolvedRenderer = computed<Component | undefined>(() => props.customComponents?.[props.componentName]);

/** 合并渲染器 props：componentProps + 自动注入的 messageId。 */
const mergedProps = computed<Record<string, unknown>>(() => ({
	...(props.componentProps ?? {}),
	messageId: props.messageId,
}));
</script>

<template>
	<component v-if="ResolvedRenderer" :is="ResolvedRenderer" v-bind="mergedProps" class="ai-chat__custom-component" />
	<div v-else class="ai-chat__custom-component ai-chat__custom-component--missing">未知组件：{{ componentName }}</div>
</template>
