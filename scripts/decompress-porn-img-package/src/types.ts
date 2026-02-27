/**
 * 文件夹/文件的编号范围配置
 * 用于限定仅处理指定编号范围内的子文件夹或压缩包
 */
export type FolderRange = {
	/** 起始编号（含） */
	start: number;
	/** 结束编号（含） */
	end: number;
};

/**
 * 工具配置类型
 */
export type ToolConfig = {
	/** 解压密码 */
	password?: string;
	/** 要被删除的脏文件文件名数组 */
	dirtyFiles?: string[];
	/** 是否是纯解压压缩包模式 */
	isPureDecompress?: boolean;
	/** 是否解压混合命名风格的压缩包 */
	isDecompressMixedNamedPackages?: boolean;
	/** 是否删除已经被解压的压缩包 */
	isDeletePackages?: boolean;
	/** 是否移动文件到初次解压文件的根目录 */
	isMoveFilesToRoot?: boolean;
	/** 是否用最后一次解压的压缩包名称来重命名根解压文件目录名称 */
	isRenameRootFolder?: boolean;
	/** 要处理的文件夹/文件编号范围，不配置则处理全部 */
	folderRange?: FolderRange;
};

/**
 * 分卷压缩文件集合
 */
export type VolumeSet = {
	/** 分卷压缩文件所在目录 */
	dir: string;
	/** 分卷压缩的基础名称（不含 .7z.001 后缀） */
	baseName: string;
	/** 分卷压缩文件的完整路径列表 */
	files: string[];
};

/**
 * 处理阶段枚举
 * 智能识别目标是压缩包还是已解压的文件夹
 */
export enum ProcessPhase {
	/** 需要解压的压缩包 */
	DECOMPRESS = "decompress",
	/** 已解压但需要整理目录层级的文件夹 */
	ORGANIZE = "organize",
	/** 未知类型，跳过处理 */
	UNKNOWN = "unknown",
}

/**
 * 处理目标项
 * 代表一个需要被处理的编号对应的文件或文件夹
 */
export type ProcessTarget = {
	/** 编号 */
	number: number;
	/** 处理阶段 */
	phase: ProcessPhase;
	/** 完整路径（压缩包文件路径或文件夹路径） */
	fullPath: string;
	/** 文件/文件夹名称 */
	name: string;
};
