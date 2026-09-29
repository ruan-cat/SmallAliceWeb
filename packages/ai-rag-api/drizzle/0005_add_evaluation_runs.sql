-- EV-1：评估运行持久化表（learn-agents-ui plan 17.2，spec 11.8）
-- 沿用 0000-0004 手写迁移惯例：幂等建表，结构与 server/db/schema.ts evaluationRuns 对齐。

CREATE TABLE IF NOT EXISTS "evaluation_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "dataset_version" text NOT NULL,
  "kind" text NOT NULL,
  "params" jsonb,
  "metrics" jsonb NOT NULL,
  "corpus_isolation" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
