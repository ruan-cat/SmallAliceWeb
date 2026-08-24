import { definePlugin } from "nitro";
import { useRuntimeConfig } from "nitro/runtime-config";
import type { RagRuntimeContext } from "../runtime/rag-assembly";
import { createRagRuntime, resolveRagRuntimeConfig } from "../runtime/rag-runtime";

export { createReservedSyncExecutor, createSyncExecutor, resolveRagRuntimeConfig } from "../runtime/rag-runtime";

let ragContext: RagRuntimeContext | null = null;
let initializationAttempted = false;
type EventWithContext = { context: Record<string, unknown> };

/** 在请求时惰性装配 runtime；本地 CLI 直接导入 runtime 模块，不触发 Nitro hook。 */
async function tryInitialize() {
	try {
		ragContext = await createRagRuntime(resolveRagRuntimeConfig(useRuntimeConfig() as Record<string, unknown>));
	} catch (error) {
		console.warn("[rag-plugin] RAG 运行时未装配:", error instanceof Error ? error.message : error);
	}
}

export default definePlugin((nitro) => {
	nitro.hooks.hook("request", async (event) => {
		if (!initializationAttempted) {
			initializationAttempted = true;
			await tryInitialize();
		}
		if (ragContext) (event as unknown as EventWithContext).context.rag = ragContext;
	});
});
