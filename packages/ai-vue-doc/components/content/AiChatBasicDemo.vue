<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from "vue";

// 客户端懒加载 AiChat，而非静态 import：
// 1. ai-vue 依赖 vue-element-plus-x 的 CSS 产物，SSR 端无法加载（非 SSR-safe），
//    静态 import 会把它拉进 SSR 模块图导致 500；
// 2. 异步组件是直接绑定，不触发 resolveComponent 按名解析，
//    消除 client-only 全局注册在 SSR 端缺失导致的 "Failed to resolve component" 警告；
// 3. loader 仅在实际渲染时执行：SSR 时 isMounted 为 false，ai-vue 不被 evaluate。
const AiChat = defineAsyncComponent(() => import("@ruan-cat-drill-doc/ai-vue").then((m) => m.AiChat));

const isMounted = ref(false);

/** 在客户端挂载后再渲染交互 demo，保持 SSR 初始 shell 稳定。 */
onMounted(() => {
	isMounted.value = true;
});
</script>

<template>
	<div class="ai-vue-doc-demo">
		<AiChat v-if="isMounted" />
	</div>
</template>
