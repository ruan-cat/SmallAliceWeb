export type AssetResolution = {
	pathname: string;
	redirect: false;
};

/** 只补目录 index，不重写、不重定向 .html。 */
export function resolveAssetRequest(pathname: string): AssetResolution {
	if (pathname.endsWith("/")) {
		return { pathname: `${pathname}index.html`, redirect: false };
	}
	return { pathname, redirect: false };
}

interface AssetEnv {
	ASSETS: { fetch: (input: Request | string) => Promise<Response> };
}

export default {
	async fetch(request: Request, env: AssetEnv): Promise<Response> {
		const url = new URL(request.url);
		const resolved = resolveAssetRequest(url.pathname);
		const assetUrl = new URL(request.url);
		assetUrl.pathname = resolved.pathname;
		return env.ASSETS.fetch(new Request(assetUrl, request));
	},
};
