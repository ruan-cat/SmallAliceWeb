<script setup lang="ts">
import MarkdownRender from "markstream-vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bubble, BubbleList, ConfigProvider, XSender } from "vue-element-plus-x";
import type { ModelValue } from "vue-element-plus-x/types/XSender";
import { useBrandTheme } from "../../composables/useBrandTheme";
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
const senderRef = ref<InstanceType<typeof XSender> | null>(null);
const isDark = ref(false);
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

/** 品牌主题上下文：cssVars 绑定根节点使 --ai-chat-* 变量随 brandTheme prop 生效；未传 prop 时 useBrandTheme 内部缺省回落默认品牌色 #3b82f6。 */
const { colorScheme, cssVars } = useBrandTheme(props.brandTheme);

/** vepx ConfigProvider 主题覆盖：键名遵循 vepx dist buildThemeVars 原样拼接 --elx- 前缀的 kebab-case 约定；主色取派生色板的 strong（hex 归一化值），不从 cssVars 复用。 */
const vepxThemeOverrides = computed(() => ({
	common: {
		"color-primary": colorScheme.value.strong,
	},
}));

/** 将系统减少动态效果偏好映射为 Markdown 渲染节奏。 */
function updateReducedMotionPreference(event?: MediaQueryListEvent) {
	prefersReducedMotion.value = event?.matches ?? reducedMotionMediaQuery?.matches ?? false;
}

/** 将系统暗色偏好映射为 ConfigProvider 主题判定；P1.5 将替换为 useThemeColor 的正式通道。 */
function updateDarkSchemePreference(event?: MediaQueryListEvent) {
	isDark.value = event?.matches ?? darkSchemeMediaQuery?.matches ?? false;
}

let darkSchemeMediaQuery: MediaQueryList | undefined;

onMounted(() => {
	if (typeof window.matchMedia !== "function") return;
	reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	updateReducedMotionPreference();
	reducedMotionMediaQuery.addEventListener("change", updateReducedMotionPreference);
	darkSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	updateDarkSchemePreference();
	darkSchemeMediaQuery.addEventListener("change", updateDarkSchemePreference);
});

onBeforeUnmount(() => {
	reducedMotionMediaQuery?.removeEventListener("change", updateReducedMotionPreference);
	darkSchemeMediaQuery?.removeEventListener("change", updateDarkSchemePreference);
});

/** 标记当前仍在生成的最后一条助手消息。 */
function isAssistantMessageFinal(message: AiChatMessage) {
	return !displayedResponding.value || message.id !== lastAssistantMessageId.value;
}

/** 读取 XSender 当前输入并清空：XSender 不提供 v-model，值经 expose 的 getModelValue 获取，清空走 expose 的 clear。 */
function readAndClearSender(): string {
	const value: ModelValue | undefined = senderRef.value?.getModelValue();
	senderRef.value?.clear();
	return value?.text?.trim() ?? "";
}

/** 处理 XSender 提交：submit 事件不携带负载，取值与清空均经模板 ref 完成。 */
function handleXSenderSubmit() {
	handleSend(readAndClearSender());
}

/** 发送用户输入，并通知组件使用方。 */
function handleSend(content: string) {
	const normalizedContent = content.trim();
	if (displayedResponding.value || !normalizedContent) return;

	/** emit 负载必须在 sendMessage() 之前构造：mock 模式下 sendMessage() 会同步 push 消息，若在其后求值 id 会整体后移一位。 */
	const message: AiChatMessage = {
		id: `user-${displayedMessages.value.length + 1}`,
		role: "user",
		content: normalizedContent,
	};

	if (props.mode === "mock") {
		input.value = normalizedContent;
		sendMessage();
	}

	emit("send", message);
}

/** 请求外部聊天状态管理器中止当前生成。 */
function handleStop() {
	if (!displayedResponding.value) return;
	emit("stop");
}
</script>

<template>
	<ConfigProvider :theme="isDark ? 'dark' : 'light'" :theme-overrides="vepxThemeOverrides" apply-to="self">
		<section class="ai-chat" aria-label="AI 对话" :style="cssVars">
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

			<XSender
				ref="senderRef"
				:loading="displayedResponding"
				:placeholder="placeholder"
				submit-type="enter"
				@submit="handleXSenderSubmit"
				@cancel="handleStop"
			/>
		</section>
	</ConfigProvider>
</template>
