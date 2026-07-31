import { describe, test, vi } from "vitest";
import { expect } from "vitest";
import type { App } from "vue";

vi.mock("vue-element-plus-x", () => ({ BubbleList: {}, Sender: {} }));
vi.mock("markstream-vue", () => ({ default: {} }));

import plugin, { AiChat, AiChatFloatingButton, install } from "../index";

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
	test("the named install function registers both components", () => {
		const { app, componentCalls } = createAppMock();

		install(app);

		expect(componentCalls).toEqual([
			["AiChat", AiChat],
			["AiChatFloatingButton", AiChatFloatingButton],
		]);
	});

	test("the default plugin installs both components", () => {
		const { app, componentCalls } = createAppMock();

		plugin.install(app);

		expect(componentCalls).toEqual([
			["AiChat", AiChat],
			["AiChatFloatingButton", AiChatFloatingButton],
		]);
	});
});
