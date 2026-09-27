import { describe, test, vi } from "vitest";
import { expect } from "vitest";
import type { App } from "vue";

vi.mock("vue-element-plus-x", () => ({ Bubble: {}, BubbleList: {}, ConfigProvider: {}, XSender: {} }));
vi.mock("markstream-vue", () => ({ default: {} }));

import plugin, { AiChat, AiChatFloatingButton, AiModalChat, AiSidebarChat, install } from "../index";

function createAppMock() {
	const componentCalls: [string, unknown][] = [];
	const app = {
		component(name: string, component: unknown) {
			componentCalls.push([name, component]);
			return app;
		},
	};

	return { app: app as App, componentCalls };
}

describe("ai-vue plugin", () => {
	test("the named install function registers all components", () => {
		const { app, componentCalls } = createAppMock();

		install(app);

		expect(componentCalls).toEqual([
			["AiChat", AiChat],
			["AiChatFloatingButton", AiChatFloatingButton],
			["AiSidebarChat", AiSidebarChat],
			["AiModalChat", AiModalChat],
		]);
	});

	test("the default plugin installs all components", () => {
		const { app, componentCalls } = createAppMock();

		plugin.install(app);

		expect(componentCalls).toEqual([
			["AiChat", AiChat],
			["AiChatFloatingButton", AiChatFloatingButton],
			["AiSidebarChat", AiSidebarChat],
			["AiModalChat", AiModalChat],
		]);
	});
});
