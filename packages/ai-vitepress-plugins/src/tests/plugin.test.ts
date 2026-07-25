import ElementPlus from "element-plus";
import { describe, test } from "vitest";
import { expect } from "vitest";
import type { App } from "vue";
import plugin, { AiChatVitePressShell, install } from "../client";

function createAppMock() {
	const componentCalls: [string, unknown][] = [];
	const useCalls: unknown[] = [];
	const app = {
		component(name: string, component: unknown) {
			componentCalls.push([name, component]);
			return app;
		},
		use(plugin: unknown) {
			useCalls.push(plugin);
			return app;
		},
	};

	return { app: app as App, componentCalls, useCalls };
}

describe("ai-vitepress client plugin", () => {
	test("the named install function installs Element Plus and registers the VitePress shell component", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		install(app);

		expect(useCalls).toEqual([ElementPlus]);
		expect(componentCalls).toEqual([["AiChatVitePressShell", AiChatVitePressShell]]);
	});

	test("the default plugin installs Element Plus and registers the VitePress shell component", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		(plugin as { install: typeof install }).install(app);

		expect(useCalls).toEqual([ElementPlus]);
		expect(componentCalls).toEqual([["AiChatVitePressShell", AiChatVitePressShell]]);
	});

	test("the install function skips registration when disabled", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		install(app, { enabled: false });

		expect(useCalls).toEqual([]);
		expect(componentCalls).toEqual([]);
	});
});
