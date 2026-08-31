-- Neon PostgreSQL supports pg_trgm for CJK substring/similarity candidates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS chunks_search_text_trgm_idx
  ON chunks USING gin (search_text gin_trgm_ops);

-- Rollback (仅在确认没有 pg_trgm 查询后执行)：
-- DROP INDEX IF EXISTS chunks_search_text_trgm_idx;
-- DROP EXTENSION IF EXISTS pg_trgm;
