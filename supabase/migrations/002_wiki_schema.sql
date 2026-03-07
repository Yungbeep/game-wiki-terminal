-- ============================================================
-- Wiki Schema Migration
-- Structured game wiki tables, indexes, triggers, and RPC
-- ============================================================

-- 1) games
create table games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  release_year int,
  developer text,
  created_at timestamptz default now()
);

-- 2) wiki_pages
create table wiki_pages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  url text not null,
  canonical_url text not null unique,
  title text not null,
  slug text not null,
  page_type text not null default 'general',
  summary text,
  clean_text text,
  checksum text,
  source_domain text,
  last_ingested_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_wiki_pages_game_id on wiki_pages(game_id);
create index idx_wiki_pages_page_type on wiki_pages(page_type);
create index idx_wiki_pages_slug on wiki_pages(slug);

-- 3) wiki_sections
create table wiki_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references wiki_pages(id) on delete cascade,
  heading text,
  section_order int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index idx_wiki_sections_page_id on wiki_sections(page_id);
create index idx_wiki_sections_section_order on wiki_sections(section_order);

-- 4) entities
create table entities (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  entity_type text not null,
  name text not null,
  slug text not null,
  description text,
  canonical_page_id uuid references wiki_pages(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_entities_game_id on entities(game_id);
create index idx_entities_entity_type on entities(entity_type);
create unique index idx_entities_unique on entities(game_id, entity_type, slug);

-- 5) entity_aliases
create table entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  alias text not null
);

create index idx_entity_aliases_entity_id on entity_aliases(entity_id);
create unique index idx_entity_aliases_unique on entity_aliases(entity_id, alias);

-- 6) page_entity_links
create table page_entity_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references wiki_pages(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  relationship_type text not null default 'mentions'
);

create index idx_page_entity_links_page_id on page_entity_links(page_id);
create index idx_page_entity_links_entity_id on page_entity_links(entity_id);
create unique index idx_page_entity_links_unique on page_entity_links(page_id, entity_id, relationship_type);

-- ============================================================
-- updated_at trigger for wiki_pages
-- ============================================================
create or replace function update_wiki_pages_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_wiki_pages_updated_at
  before update on wiki_pages
  for each row
  execute function update_wiki_pages_updated_at();

-- ============================================================
-- RPC: match_wiki_sections
-- Section-level semantic search with optional game/page_type filters
-- ============================================================
create or replace function match_wiki_sections(
  query_embedding vector(1536),
  match_count int default 10,
  filter_game_id uuid default null,
  filter_page_type text default null
)
returns table (
  id uuid,
  page_id uuid,
  title text,
  page_type text,
  heading text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    ws.id,
    ws.page_id,
    wp.title,
    wp.page_type,
    ws.heading,
    ws.content,
    1 - (ws.embedding <=> query_embedding) as similarity
  from wiki_sections ws
  join wiki_pages wp on wp.id = ws.page_id
  where
    ws.embedding is not null
    and (filter_game_id is null or wp.game_id = filter_game_id)
    and (filter_page_type is null or wp.page_type = filter_page_type)
  order by ws.embedding <=> query_embedding
  limit match_count;
$$;