ALTER TABLE knowledge_sync_runs
  ADD COLUMN IF NOT EXISTS written_chunk_count integer NOT NULL DEFAULT 0;
