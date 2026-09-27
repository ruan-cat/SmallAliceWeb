import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * MS-4 单元测试：AiChat 模型选择器 UI。
 *
 * 关键决策：vi.mock stub ElSegmented，避免 vue-element-plus-x 的 CSS import 在 jsdom 环境
 * 下抛 "Unknown file extension .css" 错误。stub 保留 props 与 emits 契约，足够验证：
 * - props 透传（modelValue / options）
 * - 事件负载（update:modelValue → select-model）
 * - 条件渲染（v-if 包裹 .ai-chat__model-picker 容器）
 */
vi.mock("element-plus", async (importOriginal) => {
	const actual = await importOriginal<typeof import("element-plus")>();
	return {
		...actual,
		ElSegmented: defineComponent({
			name: "ElSegmented",
			props: {
				modelValue: { type: [String, Number, Boolean], default: undefined },
				options: { type: Array, default: () => [] },
				size: { type: String, default: undefined },
				disabled: { type: Boolean, default: false },
			},
			emits: ["update:modelValue", "change"],
			setup(props, { emit }) {
				return () =>
					h(
						"div",
						{
							class: "el-segmented",
							"data-size": props.size,
							"data-disabled": props.disabled ? "true" : "false",
						},
						(props.options ?? []).map((opt: { label?: string; value?: string | number }) =>
							h(
								"label",
								{
									key: String(opt.value),
									class: "el-segmented__item",
									"data-value": String(opt.value),
									onClick: () => emit("update:modelValue", opt.value),
								},
								opt.label ?? String(opt.value),
							),
						),
					);
			},
		}),
	};
});

const { default: AiChat } = await import("../components/ai-chat/AiChat.vue");
const { default: AiChatFloatingButton } = await import("../components/ai-chat/AiChatFloatingButton.vue");

const mountedApps: App[] = [];

function mountAiChat(props: Record<string, unknown>, listeners: Record<string, (...args: unknown[]) => void> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		render: () => h(AiChat, { ...props, ...listeners }),
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

function mountFloatingButton(props: Record<string, unknown>, listeners: Record<string, (...args: unknown[]) => void> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		render: () => h(AiChatFloatingButton, { ...props, ...listeners }),
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

const sampleModels = [
	{ id: "anthropic", label: "Claude Sonnet 5", model: "claude-sonnet-5[1m]" },
	{ id: "openai", label: "GPT-5.6 Luna", model: "gpt-5.6-luna" },
];

describe("MS-4 AiChat 模型选择器条件渲染", () => {
	test("models 缺省时整块选择器不渲染（向后兼容）", () => {
		const host = mountAiChat({ mode: "external" });
		expect(host.querySelector(".ai-chat__model-picker")).toBeNull();
	});

	test("models 为空数组时整块选择器不渲染（mock 模式无网络也能保持原 UI）", () => {
		const host = mountAiChat({ mode: "external", models: [] });
		expect(host.querySelector(".ai-chat__model-picker")).toBeNull();
	});

	test("传 models 后选择器渲染：容器类名 + 选项 label/value 映射正确", () => {
		const host = mountAiChat({
			mode: "external",
			models: sampleModels,
			selectedModelId: "anthropic",
		});

		const picker = host.querySelector(".ai-chat__model-picker");
		expect(picker).not.toBeNull();

		const items = picker?.querySelectorAll(".el-segmented__item");
		expect(items?.length).toBe(2);
		expect(items?.[0]?.textContent?.trim()).toContain("Claude Sonnet 5");
		expect(items?.[1]?.textContent?.trim()).toContain("GPT-5.6 Luna");
		expect(items?.[0]?.getAttribute("data-value")).toBe("anthropic");
		expect(items?.[1]?.getAttribute("data-value")).toBe("openai");
	});

	test("选择器始终不处于 disabled 状态（plan 16.8 Q1 拍板：responding 中允许切换）", () => {
		const host = mountAiChat({
			mode: "external",
			models: sampleModels,
			selectedModelId: "anthropic",
			isResponding: true,
		});

		const segmented = host.querySelector(".el-segmented");
		expect(segmented?.getAttribute("data-disabled")).toBe("false");
	});
});

describe("MS-4 AiChat 模型选择器事件", () => {
	test("切换选择触发 select-model 事件，负载为字符串 id", async () => {
		const onSelectModel = vi.fn();
		const host = mountAiChat(
			{ mode: "external", models: sampleModels, selectedModelId: "anthropic" },
			{ "onSelect-model": onSelectModel },
		);

		const items = host.querySelectorAll(".el-segmented__item");
		expect(items.length).toBe(2);
		(items[1] as HTMLElement).click();

		await Promise.resolve();
		await Promise.resolve();

		expect(onSelectModel).toHaveBeenCalledTimes(1);
		expect(onSelectModel).toHaveBeenCalledWith("openai");
	});

	test("selectedModelId 缺省时切换仍触发 select-model", async () => {
		const onSelectModel = vi.fn();
		const host = mountAiChat(
			{ mode: "external", models: sampleModels },
			{ "onSelect-model": onSelectModel },
		);

		const items = host.querySelectorAll(".el-segmented__item");
		(items[0] as HTMLElement).click();
		await Promise.resolve();
		await Promise.resolve();

		expect(onSelectModel).toHaveBeenCalledWith("anthropic");
	});
});

describe("MS-4 AiChatFloatingButton 透传", () => {
	test("传 models + selectedModelId 到 FloatingButton 后 dock 打开可见选择器", async () => {
		const onSelectModel = vi.fn();
		const host = mountFloatingButton(
			{
				messages: [],
				models: sampleModels,
				selectedModelId: "openai",
			},
			{ "onSelect-model": onSelectModel },
		);

		// 默认 dock 关闭 → 选择器不在文档树
		expect(host.querySelector(".ai-chat__model-picker")).toBeNull();

		// 等待 onMounted 触发 isMounted → trigger 出现
		await nextTick();
		await nextTick();
		await new Promise((resolve) => setTimeout(resolve, 30));

		const trigger = host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger");
		if (!trigger) {
			throw new Error(`trigger 未找到。当前 HTML: ${host.innerHTML.slice(0, 800)}`);
		}
		trigger.click();
		await nextTick();
		await new Promise((resolve) => setTimeout(resolve, 30));

		const dock = host.querySelector(".ai-chat-floating-button__dock");
		if (!dock) {
			throw new Error(`dock 未渲染。当前 HTML: ${host.innerHTML.slice(0, 800)}`);
		}

		const picker = host.querySelector(".ai-chat__model-picker");
		expect(picker).not.toBeNull();

		const items = host.querySelectorAll(".el-segmented__item");
		expect(items.length).toBe(2);
		(items[0] as HTMLElement).click();
		await Promise.resolve();
		await Promise.resolve();

		expect(onSelectModel).toHaveBeenCalledTimes(1);
		expect(onSelectModel).toHaveBeenCalledWith("anthropic");
	});

	test("FloatingButton 未传 models 时 dock 打开也不渲染选择器（向后兼容）", async () => {
		const host = mountFloatingButton({ messages: [] });

		const trigger = host.querySelector(".ai-chat-floating-button__trigger") as HTMLElement;
		trigger?.click();
		await Promise.resolve();
		await Promise.resolve();

		expect(host.querySelector(".ai-chat__model-picker")).toBeNull();
	});
});