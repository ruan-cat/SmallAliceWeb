import { ragNitroConfig } from "./src/runtime-config";

export default {
	...ragNitroConfig,
	rolldownConfig: {
		output: {
			inlineDynamicImports: true,
		},
	},
};
