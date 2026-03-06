-- Enable pgvector extension
create extension if not exists vector;

-- Documents table: tracks uploaded files
create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  content_type text,
  created_at timestamptz default now()
);

-- Chunks table: stores text chunks with embeddings
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  page_number int,
  chunk_index int not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Index for cosine similarity search
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Concept edges table: stores co-occurrence relationships between concepts
create table concept_edges (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  target text not null,
  weight int default 1,
  created_at timestamptz default now(),
  unique(source, target)
);

-- RPC function for similarity search
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  page_number int,
  chunk_index int,
  filename text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.page_number,
    c.chunk_index,
    d.filename,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- RPC function for upserting concept edges
create or replace function upsert_concept_edge(p_source text, p_target text)
returns void
language plpgsql
as $$
begin
  insert into concept_edges (source, target, weight)
  values (p_source, p_target, 1)
  on conflict (source, target)
  do update set weight = concept_edges.weight + 1;
end;
$$;
