import { ragNitroConfig } from "./src/runtime-config";

export default {
	...ragNitroConfig,
	rolldownConfig: {
		output: {
			inlineDynamicImports: true,
		},
	},
	routeRules: {
		"/v1/**": {
			cors: true,
		},
	},
};
