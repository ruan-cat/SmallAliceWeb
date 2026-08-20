DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM chunks LIMIT 1) THEN
    RAISE EXCEPTION 'chunks contains existing vectors; run the shadow-column 1536-to-1024 re-embedding migration before applying 0002';
  END IF;
END $$;

DROP INDEX IF EXISTS chunks_embedding_hnsw_cosine_idx;

ALTER TABLE chunks
  ALTER COLUMN embedding TYPE vector(1024);

CREATE INDEX chunks_embedding_hnsw_cosine_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
