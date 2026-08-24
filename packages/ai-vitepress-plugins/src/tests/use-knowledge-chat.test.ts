import { describe, expect, test, vi } from "vitest";
import { nextTick, ref } from "vue";

const chat = vi.hoisted(() => ({ useChat: vi.fn() }));

vi.mock("@ai-sdk/vue", () => chat);

import { resolveKnowledgeChatApi, useKnowledgeChat } from "../client/composables/useKnowledgeChat";

describe("useKnowledgeChat", () => {
	test("使用 VITE_RAG_API_BASE 将文档站请求指向绝对 Nitro API 域名", () => {
		vi.stubEnv("VITE_RAG_API_BASE", "https://api.example.com/");
		try {
			expect(resolveKnowledgeChatApi()).toBe("https://api.example.com/v1/chat");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	test("使用已锁定 SDK 向本地聊天端点发送文本与会话 ID", async () => {
		const append = vi.fn();
		chat.useChat.mockReturnValue({
			messages: ref([]),
			error: ref(undefined),
			input: ref(""),
			append,
			stop: vi.fn(),
			status: ref("ready"),
			data: ref(undefined),
			setData: vi.fn(),
		});
		const knowledgeChat = useKnowledgeChat("conversation-1");

		await knowledgeChat.send({ id: "user-1", role: "user", content: "什么是 RAG？" });
		const options = chat.useChat.mock.calls[0][0];

		expect(options.api).toBe("/v1/chat");
		expect(options.id).toBe("conversation-1");
		expect(
			options.experimental_prepareRequestBody({
				id: "conversation-1",
				messages: [{ role: "user", content: "什么是 RAG？" }],
			}),
		).toEqual({ message: "什么是 RAG？", conversationId: "conversation-1" });
		expect(append).toHaveBeenCalledWith({ id: "user-1", role: "user", content: "什么是 RAG？" });
	});

	test("自然流结束后只触发一次完成回调", async () => {
		const completed = vi.fn();
		const messages = ref<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
		const append = vi.fn().mockImplementation(async () => {
			messages.value = [
				{ id: "user-1", role: "user", content: "问题" },
				{ id: "assistant-1", role: "assistant", content: "回答" },
			];
		});
		chat.useChat.mockReturnValue({
			messages,
			error: ref(undefined),
			input: ref(""),
			append,
			stop: vi.fn(),
			status: ref("ready"),
			data: ref(undefined),
			setData: vi.fn(),
		});

		const knowledgeChat = useKnowledgeChat("completion-once", { onResponseComplete: completed });
		await knowledgeChat.send({ id: "user-1", role: "user", content: "问题" });

		expect(completed).toHaveBeenCalledTimes(1);
	});

	test("上一轮助手消息或请求错误不会触发完成回调", async () => {
		const completed = vi.fn();
		const messages = ref<Array<{ id: string; role: "user" | "assistant"; content: string }>>([
			{ id: "assistant-old", role: "assistant", content: "上一轮回答" },
		]);
		const error = ref<Error | undefined>(undefined);
		const append = vi
			.fn()
			.mockImplementationOnce(async () => {
				messages.value = [...messages.value, { id: "user-1", role: "user", content: "没有新回答" }];
			})
			.mockImplementationOnce(async () => {
				messages.value = [
					...messages.value,
					{ id: "user-2", role: "user", content: "失败问题" },
					{ id: "assistant-2", role: "assistant", content: "部分回答" },
				];
				error.value = new Error("请求失败");
			});
		chat.useChat.mockReturnValue({
			messages,
			error,
			input: ref(""),
			append,
			stop: vi.fn(),
			status: ref("ready"),
			data: ref(undefined),
			setData: vi.fn(),
		});

		const knowledgeChat = useKnowledgeChat("completion-guards", { onResponseComplete: completed });
		await knowledgeChat.send({ id: "user-1", role: "user", content: "没有新回答" });
		await knowledgeChat.send({ id: "user-2", role: "user", content: "失败问题" });

		expect(completed).not.toHaveBeenCalled();
	});

	test("同一请求即使助手消息重复更新也只触发一次完成回调", async () => {
		const completed = vi.fn();
		const messages = ref<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
		const append = vi.fn().mockImplementation(async () => {
			messages.value = [
				{ id: "user-1", role: "user", content: "问题" },
				{ id: "assistant-1", role: "assistant", content: "第一段" },
			];
			messages.value = [...messages.value.slice(0, -1), { id: "assistant-1", role: "assistant", content: "完整回答" }];
		});
		chat.useChat.mockReturnValue({
			messages,
			error: ref(undefined),
			input: ref(""),
			append,
			stop: vi.fn(),
			status: ref("ready"),
			data: ref(undefined),
			setData: vi.fn(),
		});

		const knowledgeChat = useKnowledgeChat("completion-single", { onResponseComplete: completed });
		await knowledgeChat.send({ id: "user-1", role: "user", content: "问题" });

		expect(completed).toHaveBeenCalledTimes(1);
	});

	test("将多来源绑定到本轮稳定助手消息，并在下一轮请求隔离累计 data", async () => {
		const stop = vi.fn();
		const status = ref("streaming");
		const messages = ref([] as Array<{ id: string; role: "user" | "assistant"; content: string }>);
		const data = ref<unknown[] | undefined>();
		const setData = vi.fn((next: unknown[] | undefined) => {
			data.value = next;
		});
		const append = vi
			.fn()
			.mockImplementationOnce(async () => {
				messages.value = [
					{ id: "user-1", role: "user", content: "第一个问题" },
					{ id: "assistant-1", role: "assistant", content: "第一个回答" },
				];
				data.value = [
					{ type: "source", data: { id: "source-1", label: "来源一", sourceHref: "/one" } },
					{ type: "source", data: { id: "source-2", label: "来源二", sourceHref: "/two" } },
				];
			})
			.mockImplementationOnce(async () => {
				messages.value = [
					...messages.value,
					{ id: "user-2", role: "user", content: "第二个问题" },
					{ id: "assistant-2", role: "assistant", content: "第二个回答" },
				];
				data.value = [
					...(data.value ?? []),
					{ type: "source", data: { id: "source-3", label: "来源三", sourceHref: "/three" } },
				];
			});
		chat.useChat.mockReturnValue({
			messages,
			error: ref(undefined),
			input: ref(""),
			append,
			stop,
			status,
			data,
			setData,
		});
		const knowledgeChat = useKnowledgeChat();

		await knowledgeChat.send({ id: "user-1", role: "user", content: "第一个问题" });
		await nextTick();
		expect(setData).toHaveBeenCalledWith(undefined);
		expect(knowledgeChat.isResponding.value).toBe(true);
		expect(knowledgeChat.messages.value[1].sources).toEqual([
			{ id: "source-1", label: "来源一", sourceHref: "/one" },
			{ id: "source-2", label: "来源二", sourceHref: "/two" },
		]);

		await knowledgeChat.send({ id: "user-2", role: "user", content: "第二个问题" });
		await nextTick();
		expect(knowledgeChat.messages.value[1].sources).toEqual([
			{ id: "source-1", label: "来源一", sourceHref: "/one" },
			{ id: "source-2", label: "来源二", sourceHref: "/two" },
		]);
		expect(knowledgeChat.messages.value[3].sources).toEqual([
			{ id: "source-3", label: "来源三", sourceHref: "/three" },
		]);
		knowledgeChat.stop();
		expect(stop).toHaveBeenCalledOnce();

		status.value = "ready";
		expect(knowledgeChat.isResponding.value).toBe(false);
	});

	test("将 RAG 未配置错误显示为可读且可清除状态", () => {
		const error = ref(new Error("503 RAG_NOT_CONFIGURED"));
		chat.useChat.mockReturnValue({
			messages: ref([]),
			error,
			input: ref(""),
			append: vi.fn(),
			stop: vi.fn(),
			status: ref("error"),
			data: ref(undefined),
			setData: vi.fn(),
		});
		const knowledgeChat = useKnowledgeChat();

		expect(knowledgeChat.errorMessage.value).toContain("知识库服务尚未配置");
		knowledgeChat.clearError();
		expect(knowledgeChat.errorMessage.value).toBeUndefined();
	});
});
