import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";

/** 与 ai-chat.test.ts 保持一致的 vepx / markstream-vue mock，避免依赖真实组件 */
vi.mock("vue-element-plus-x", async () => {
	const { defineComponent, h } = await import("vue");

	const Bubble = defineComponent({
		name: "Bubble",
		props: {
			content: { type: String, default: "" },
			placement: { type: String, default: "start" },
			noStyle: { type: Boolean, default: false },
		},
		setup(props, { slots }) {
			return () =>
				h(
					"article",
					{
						"data-library-component": "Bubble",
						"data-no-style": String(props.noStyle),
						"data-placement": props.placement,
					},
					[
						h("div", { class: "bubble-content" }, slots.content?.()),
						h("footer", { class: "bubble-footer" }, slots.footer?.()),
					],
				);
		},
	});

	return {
		Bubble,
		BubbleList: defineComponent({
			name: "BubbleList",
			props: {
				list: { type: Array, default: () => [] },
				autoScroll: { type: Boolean, default: false },
			},
			setup(props, { slots }) {
				return () =>
					h(
						"div",
						{
							"data-auto-scroll": String(props.autoScroll),
							"data-library-component": "BubbleList",
						},
						props.list.map((item) =>
							h(Bubble, item as { content: string; noStyle?: boolean; placement?: string }, {
								content: () => slots.content?.({ item }),
								footer: () => slots.footer?.({ item }),
							}),
						),
					);
			},
		}),
		XSender: defineComponent({
			name: "XSender",
			props: {
				placeholder: { type: String, default: "" },
				loading: Boolean,
			},
			emits: ["submit", "cancel"],
			setup() {
				return () => h("div", { "data-library-component": "XSender" }, "XSender");
			},
		}),
		ConfigProvider: defineComponent({
			name: "ConfigProvider",
			props: {
				theme: { type: String, default: "light" },
				themeOverrides: { type: Object, default: undefined },
				applyTo: { type: String, default: "self" },
			},
			setup(props, { slots }) {
				return () => h("div", { "data-library-component": "ConfigProvider" }, slots.default?.());
			},
		}),
	};
});

vi.mock("markstream-vue", async () => {
	const { defineComponent, h } = await import("vue");
	return {
		default: defineComponent({
			name: "MarkdownRender",
			props: { content: { type: String, default: "" } },
			setup(props) {
				return () => h("div", { class: "markdown-render" }, props.content);
			},
		}),
	};
});

import AiChat from "../components/ai-chat/AiChat.vue";
import SearchResultCard from "../components/ai-chat/cards/SearchResultCard.vue";
import SourceListCard from "../components/ai-chat/cards/SourceListCard.vue";
import type { AiChatMessage, AiChatSource } from "../components/ai-chat/types";

const mountedApps: App[] = [];

function mount(component: unknown, props?: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({ render: () => h(component as never, props) });
	app.mount(host);
	mountedApps.push(app);
	return host;
}

afterEach(() => {
	while (mountedApps.length) {
		const app = mountedApps.pop();
		app?.unmount();
	}
});

describe("DataComponent 结构化卡片渲染", () => {
	describe("SearchResultCard 单元测试", () => {
		test("渲染完整字段：标题、摘要、headingPath、score、链接", async () => {
			const host = mount(SearchResultCard, {
				data: {
					title: "如何配置 VitePress",
					snippet: "VitePress 是基于 Vite 的静态站点生成器...",
					sourceUrl: "https://vitepress.dev/guide/",
					sourceLabel: "VitePress 官方文档",
					score: 0.95,
					headingPath: ["指南", "快速开始"],
				},
			});

			await nextTick();

			const card = host.querySelector(".ai-search-result-card");
			expect(card).not.toBeNull();
			expect(card?.querySelector(".ai-search-result-card__title")?.textContent).toBe("如何配置 VitePress");
			expect(card?.querySelector(".ai-search-result-card__snippet")?.textContent).toBe(
				"VitePress 是基于 Vite 的静态站点生成器...",
			);
			expect(card?.querySelector(".ai-search-result-card__score")?.textContent?.trim()).toBe("相关度 95%");
			const link = card?.querySelector(".ai-search-result-card__link") as HTMLAnchorElement | null;
			expect(link?.getAttribute("href")).toBe("https://vitepress.dev/guide/");
			expect(link?.textContent?.trim()).toBe("VitePress 官方文档");

			/** heading path 应按顺序拼接并用 / 分隔 */
			const path = card?.querySelector(".ai-search-result-card__path")?.textContent ?? "";
			expect(path).toContain("指南");
			expect(path).toContain("快速开始");
			expect(path).toContain("/");
		});

		test("未传 score 时不展示相关度 tag", async () => {
			const host = mount(SearchResultCard, {
				data: {
					title: "无相关度条目",
					snippet: "内容",
					sourceUrl: "https://example.com",
					sourceLabel: "示例",
				},
			});
			await nextTick();
			expect(host.querySelector(".ai-search-result-card__score")).toBeNull();
		});

		test("score=0 时仍渲染为 0%", async () => {
			const host = mount(SearchResultCard, {
				data: {
					title: "零相关度",
					snippet: "无摘要",
					sourceUrl: "https://example.com",
					sourceLabel: "示例",
					score: 0,
				},
			});
			await nextTick();
			expect(host.querySelector(".ai-search-result-card__score")?.textContent?.trim()).toBe("相关度 0%");
		});
	});

	describe("SourceListCard 单元测试", () => {
		const sources: AiChatSource[] = [
			{ id: "s1", label: "来源1", sourceHref: "https://a.example" },
			{ id: "s2", label: "来源2", sourceHref: "https://b.example", snippet: "可选摘要" },
		];

		test("按编号渲染来源链接", async () => {
			const host = mount(SourceListCard, { sources });
			await nextTick();
			const nav = host.querySelector(".ai-source-list-card");
			expect(nav).not.toBeNull();
			const links = nav?.querySelectorAll(".ai-source-list-card__link") ?? [];
			expect(links.length).toBe(2);
			expect(links[0].querySelector(".ai-source-list-card__index")?.textContent).toBe("[1]");
			expect(links[0].querySelector(".ai-source-list-card__name")?.textContent).toBe("来源1");
			expect(links[1].querySelector(".ai-source-list-card__index")?.textContent).toBe("[2]");
			expect((links[0] as HTMLAnchorElement).getAttribute("href")).toBe("https://a.example");
		});

		test("空 sources 时整个 nav 不渲染", async () => {
			const host = mount(SourceListCard, { sources: [] });
			await nextTick();
			expect(host.querySelector(".ai-source-list-card")).toBeNull();
		});
	});

	describe("AiChat itemType 分发集成测试", () => {
		test('itemType="search-result" 渲染 SearchResultCard', async () => {
			const messages: AiChatMessage[] = [
				{
					id: "1",
					role: "assistant",
					content: "fallback 不该出现",
					itemType: "search-result",
					data: {
						title: "分发测试",
						snippet: "通过 itemType 路由到 SearchResultCard",
						sourceUrl: "https://example.com/x",
						sourceLabel: "Example",
						score: 0.8,
					},
				},
			];

			const host = mount(AiChat, { messages });
			await nextTick();

			expect(host.querySelector(".ai-search-result-card")).not.toBeNull();
			/** Markdown fallback 不应出现 */
			expect(host.querySelector(".markdown-render")).toBeNull();
		});

		test('itemType="source-list" 渲染 SourceListCard', async () => {
			const messages: AiChatMessage[] = [
				{
					id: "1",
					role: "assistant",
					content: "fallback 不该出现",
					itemType: "source-list",
					sources: [{ id: "s1", label: "内联来源", sourceHref: "https://a.example" }],
				},
			];

			const host = mount(AiChat, { messages });
			await nextTick();

			expect(host.querySelector(".ai-source-list-card")).not.toBeNull();
			expect(host.querySelector(".markdown-render")).toBeNull();
		});

		test("customRenderers 同名 itemType 覆盖内置卡片", async () => {
			const messages: AiChatMessage[] = [
				{
					id: "1",
					role: "assistant",
					content: "fallback 不该出现",
					itemType: "search-result",
					data: {
						title: "覆盖测试",
						snippet: "覆盖测试",
						sourceUrl: "https://example.com",
						sourceLabel: "Example",
					},
				},
			];

			const CustomSearchCard = {
				name: "CustomSearchCard",
				render() {
					return h("article", { class: "custom-search-card" }, "自定义覆盖");
				},
			};

			const host = mount(AiChat, { messages, customRenderers: { "search-result": CustomSearchCard } });
			await nextTick();

			expect(host.querySelector(".custom-search-card")).not.toBeNull();
			/** 内置 SearchResultCard 不应出现 */
			expect(host.querySelector(".ai-search-result-card")).toBeNull();
		});

		test("未注册的 itemType 回退 Markdown 渲染", async () => {
			const messages: AiChatMessage[] = [
				{
					id: "1",
					role: "assistant",
					content: "回退文本",
					itemType: "non-existent-type",
				},
			];

			const host = mount(AiChat, { messages });
			await nextTick();

			const md = host.querySelector(".markdown-render");
			expect(md).not.toBeNull();
			expect(md?.textContent).toBe("回退文本");
		});

		test("item.component 优先级高于 itemType", async () => {
			const messages: AiChatMessage[] = [
				{
					id: "1",
					role: "assistant",
					content: "fallback",
					itemType: "search-result",
					data: {
						title: "不该被渲染",
						snippet: "不该被渲染",
						sourceUrl: "https://example.com",
						sourceLabel: "Example",
					},
					component: { name: "ticket-card" },
				},
			];

			const TicketCard = {
				name: "TicketCard",
				render() {
					return h("article", { class: "ticket-card" }, "工单元件");
				},
			};

			const host = mount(AiChat, {
				messages,
				customComponents: { "ticket-card": TicketCard },
			});
			await nextTick();

			expect(host.querySelector(".ticket-card")).not.toBeNull();
			expect(host.querySelector(".ai-search-result-card")).toBeNull();
		});
	});
});