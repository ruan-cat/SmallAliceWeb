import { test, describe } from "vitest";
import { afterEach, expect, vi } from "vitest";
import { useMockAiChat } from "../composables/useMockAiChat";

describe("useMockAiChat", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("uses the supplied initial messages", () => {
		const initialMessages = [
			{
				id: "assistant-1",
				role: "assistant" as const,
				content: "欢迎使用本地 mock 对话。",
			},
		];

		const chat = useMockAiChat({ initialMessages });

		expect(chat.messages.value).toEqual(initialMessages);
		expect(chat.isResponding.value).toBe(false);
		expect(chat.canSend.value).toBe(false);
	});

	test("rejects empty input and appends a local reply after the configured delay", () => {
		vi.useFakeTimers();
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const chat = useMockAiChat({ mockDelay: 100 });

		chat.input.value = "   ";
		chat.sendMessage();

		expect(chat.messages.value).toEqual([]);
		expect(chat.isResponding.value).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();

		chat.input.value = "你好";
		expect(chat.canSend.value).toBe(true);
		chat.sendMessage();

		expect(chat.messages.value).toEqual([{ id: "user-1", role: "user", content: "你好" }]);
		expect(chat.input.value).toBe("");
		expect(chat.isResponding.value).toBe(true);
		expect(chat.canSend.value).toBe(false);

		chat.input.value = "响应期间不能发送";
		expect(chat.canSend.value).toBe(false);
		chat.sendMessage();
		expect(chat.messages.value).toHaveLength(1);

		vi.advanceTimersByTime(99);
		expect(chat.messages.value).toHaveLength(1);
		expect(chat.isResponding.value).toBe(true);

		vi.advanceTimersByTime(1);
		expect(chat.messages.value).toEqual([
			{ id: "user-1", role: "user", content: "你好" },
			{
				id: "assistant-2",
				role: "assistant",
				content: "这是本地 mock 回复：你好",
			},
		]);
		expect(chat.isResponding.value).toBe(false);
		expect(chat.canSend.value).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
