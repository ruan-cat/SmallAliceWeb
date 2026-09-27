import { defineEventHandler } from "nitro/h3";
import { ragLlmConfig } from "../../../src/llm-config";

/**
 * 模型选择元数据下发接口。
 *
 * 数据全部来自编译期注册表（无外部调用、无装配守卫）：
 * - 不读取 event.context.rag，因此不需要 503 守卫（区别于 chat/search/sync）
 * - 响应 MUST NOT 包含 baseUrl 与任何 API key 凭据（spec Requirement 10 / spec 12.3）
 * - 该端点是模型列表唯一事实源，前端 MUST NOT 硬编码第二份清单（spec 12.3/12.6）
 */
export default defineEventHandler(() => ({
	success: true,
	code: 200,
	message: "操作成功",
	data: {
		models: Object.entries(ragLlmConfig.providers).map(([id, config]) => ({
			id,
			label: config.label,
			model: config.model,
		})),
	},
}));