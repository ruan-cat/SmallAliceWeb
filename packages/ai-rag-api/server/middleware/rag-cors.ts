import { defineEventHandler, getRequestURL } from "nitro/h3";
import { createRagCorsPreflightResponse } from "../cors";

/** 在 API 路由匹配前终止 CORS 预检，避免 OPTIONS 因没有文件路由而变成 404。 */
export default defineEventHandler((event) =>
	createRagCorsPreflightResponse({
		method: event.method,
		pathname: getRequestURL(event).pathname,
	}),
);
