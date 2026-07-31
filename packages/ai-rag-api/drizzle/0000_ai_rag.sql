CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY NOT NULL,
  title text NOT NULL,
  source_path text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  profile_version text NOT NULL,
  embedding_model text NOT NULL,
  image_urls jsonb NOT NULL,
  last_synced_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id text PRIMARY KEY NOT NULL,
  document_id text NOT NULL REFERENCES documents(id),
  content text NOT NULL,
  source_path text NOT NULL,
  heading_path jsonb NOT NULL,
  heading_index integer NOT NULL,
  heading_anchor text NOT NULL,
  chunk_index integer NOT NULL,
  chunk_kind text NOT NULL,
  table_row_start integer,
  table_row_end integer,
  image_urls jsonb NOT NULL,
  content_hash text NOT NULL,
  profile_version text NOT NULL,
  embedding vector(1536) NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_sync_runs (
  id text PRIMARY KEY NOT NULL,
  status text NOT NULL,
  scanned_file_count integer NOT NULL,
  unchanged_file_count integer NOT NULL,
  created_file_count integer NOT NULL,
  updated_file_count integer NOT NULL,
  deleted_file_count integer NOT NULL,
  failed_files jsonb NOT NULL,
  started_at timestamp NOT NULL,
  finished_at timestamp
);

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_cosine_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
