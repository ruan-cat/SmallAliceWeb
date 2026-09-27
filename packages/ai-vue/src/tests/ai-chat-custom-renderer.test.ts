import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import AiChatCustomRenderer from "../components/ai-chat/parts/AiChatCustomRenderer.vue";

const mountedApps: App[] = [];

function mountRenderer(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({ render: () => h(AiChatCustomRenderer, props) });
	app.mount(host);
	mountedApps.push(app);
	return host;
}

beforeEach(() => {});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("AiChatCustomRenderer", () => {
	test("未注册组件时显示降级占位", async () => {
		const host = mountRenderer({ componentName: "ticket-card", messageId: "m1" });
		await nextTick();
		expect(host.textContent).toContain("未知组件：ticket-card");
		expect(host.querySelector(".ai-chat__custom-component--missing")).not.toBeNull();
	});

	test("customComponents 注册后用 :is 挂载对应组件", async () => {
		const TicketCard = defineComponent({
			name: "TicketCard",
			props: { messageId: { type: String, required: true }, id: { type: String, default: "" } },
			setup(props) {
				return () => h("div", { class: "ticket-card-mock" }, `工单 #${props.id} (msg=${props.messageId})`);
			},
		});
		const host = mountRenderer({
			componentName: "ticket-card",
			componentProps: { id: "42" },
			messageId: "m99",
			customComponents: { "ticket-card": TicketCard },
		});
		await nextTick();
		expect(host.querySelector(".ticket-card-mock")).not.toBeNull();
		expect(host.textContent).toContain("工单 #42 (msg=m99)");
	});

	test("componentProps 缺省时不报错", async () => {
		const Hello = defineComponent({
			name: "Hello",
			props: { messageId: { type: String, required: true } },
			setup(props) {
				return () => h("div", null, `hello-${props.messageId}`);
			},
		});
		const host = mountRenderer({
			componentName: "hello",
			messageId: "abc",
			customComponents: { hello: Hello },
		});
		await nextTick();
		expect(host.textContent).toBe("hello-abc");
	});
});
