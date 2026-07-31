import { ApiHttpError } from "./errors";

export type KnowledgeSyncCredentials = {
	syncToken?: string;
	cronSecret?: string;
};

export type KnowledgeSyncAuth = { kind: "sync-token" | "cron" };

/** 按方法区分上游同步 token 与 Vercel Cron secret，拒绝缺失或错误凭据。 */
export function assertKnowledgeSyncAuth(
	method: string,
	headers: Record<string, string | undefined>,
	credentials: KnowledgeSyncCredentials,
): KnowledgeSyncAuth {
	const authorization = headers.authorization ?? headers.Authorization;
	if (!authorization) throw new ApiHttpError(401, "UNAUTHORIZED", "缺少同步凭据");
	const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!token) throw new ApiHttpError(403, "FORBIDDEN", "同步凭据无效");

	if (method.toUpperCase() === "GET" && credentials.cronSecret && token === credentials.cronSecret) {
		return { kind: "cron" };
	}
	if (method.toUpperCase() === "POST" && credentials.syncToken && token === credentials.syncToken) {
		return { kind: "sync-token" };
	}
	throw new ApiHttpError(403, "FORBIDDEN", "同步凭据无效");
}
