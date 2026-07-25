type DebugLogger = (() => void) & {
	namespace: string;
	enabled: boolean;
	extend: (suffix: string) => DebugLogger;
	destroy: () => void;
};

type DebugFactory = {
	(namespace: string): DebugLogger;
	debug: DebugFactory;
	default: DebugFactory;
	coerce: (value: unknown) => unknown;
	disable: () => string;
	enable: () => void;
	enabled: () => boolean;
	humanize: (value: unknown) => string;
	destroy: () => void;
	formatters: Record<string, unknown>;
	names: string[];
	skips: string[];
	selectColor: () => number;
};

function createDebug(namespace: string): DebugLogger {
	const logger = (() => {}) as DebugLogger;

	logger.namespace = namespace;
	logger.enabled = false;
	logger.extend = (suffix: string) => createDebug(`${namespace}:${suffix}`);
	logger.destroy = () => {};

	return logger;
}

const debugFactory = createDebug as DebugFactory;

debugFactory.debug = debugFactory;
debugFactory.default = debugFactory;
debugFactory.coerce = (value: unknown) => value;
debugFactory.disable = () => "";
debugFactory.enable = () => {};
debugFactory.enabled = () => false;
debugFactory.humanize = (value: unknown) => String(value);
debugFactory.destroy = () => {};
debugFactory.formatters = {};
debugFactory.names = [];
debugFactory.skips = [];
debugFactory.selectColor = () => 0;

export const debug = debugFactory;
export const coerce = debugFactory.coerce;
export const disable = debugFactory.disable;
export const enable = debugFactory.enable;
export const enabled = debugFactory.enabled;
export const humanize = debugFactory.humanize;
export const destroy = debugFactory.destroy;
export const formatters = debugFactory.formatters;
export const names = debugFactory.names;
export const skips = debugFactory.skips;
export const selectColor = debugFactory.selectColor;

export default debugFactory;
