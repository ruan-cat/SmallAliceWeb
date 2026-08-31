-- phase3 chunk identity and deterministic lexical text metadata.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS preprocessing_version text NOT NULL DEFAULT 'markdown-structure-v2';

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS preprocessing_version text NOT NULL DEFAULT 'markdown-structure-v2',
  ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS chunks_parent_id_idx ON chunks (parent_id);

-- Rollback (仅在确认调用方已停止使用 phase3 字段后执行)：
-- DROP INDEX IF EXISTS chunks_parent_id_idx;
-- ALTER TABLE chunks DROP COLUMN IF EXISTS search_text;
-- ALTER TABLE chunks DROP COLUMN IF EXISTS preprocessing_version;
-- ALTER TABLE chunks DROP COLUMN IF EXISTS parent_id;
-- ALTER TABLE documents DROP COLUMN IF EXISTS preprocessing_version;
