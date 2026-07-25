<script setup lang="ts">
import { onMounted, ref } from "vue";

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
