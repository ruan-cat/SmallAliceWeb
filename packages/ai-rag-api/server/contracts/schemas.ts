import { z } from "zod";

export const searchRequestSchema = z
	.object({
		query: z.string().trim().min(1).max(2000),
		limit: z.coerce.number().int().min(1).max(50).default(10),
		candidateLimit: z.coerce.number().int().min(1).max(100).optional(),
		finalLimit: z.coerce.number().int().min(1).max(50).optional(),
		k: z.coerce.number().int().min(1).max(1000).default(60),
	})
	.transform((input) => ({
		...input,
		candidateLimit: input.candidateLimit ?? input.limit,
		finalLimit: input.finalLimit ?? input.limit,
	}))
	.refine((input) => input.candidateLimit >= input.finalLimit, {
		message: "candidateLimit 必须不小于 finalLimit",
		path: ["candidateLimit"],
	});

export const syncRequestSchema = z.object({
	dryRun: z.boolean().default(false),
});

export const syncRunsQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	cursor: z.string().trim().min(1).optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncRunsQuery = z.infer<typeof syncRunsQuerySchema>;
