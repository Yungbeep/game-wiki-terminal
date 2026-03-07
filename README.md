# Game Wiki Terminal  

A terminal-style web app for uploading course materials (PDF, TXT, MD, DOCX) and asking questions grounded strictly in the uploaded content. Answers include citations with filename and page number, expandable source snippets, and related concept suggestions.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Supabase** with pgvector for vector storage
- **OpenAI** for embeddings (`text-embedding-3-small`) and answer generation (`gpt-4o-mini`)
- **Tailwind CSS** for terminal-style dark UI

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Enable the `vector` extension: go to **Database > Extensions** and enable `vector`
3. Run the migration SQL in the Supabase SQL Editor:

```sql
-- Copy and paste the contents of supabase/migrations/001_init.sql
```

Or run via Supabase CLI:

```bash
supabase db push
```

The migration creates:
- `documents` — tracks uploaded files
- `chunks` — stores text chunks with 1536-dimensional embeddings
- `concept_edges` — stores co-occurrence relationships between concepts
- `match_chunks()` — RPC function for cosine similarity search
- `upsert_concept_edge()` — RPC function for incrementing concept edge weights

## Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
```

- `NEXT_PUBLIC_SUPABASE_URL` — found in Supabase project settings > API
- `SUPABASE_SERVICE_ROLE_KEY` — found in Supabase project settings > API > service_role key (keep secret)
- `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

### Ingestion Pipeline
1. Upload files (PDF, TXT, MD, DOCX) or paste text
2. Text is extracted (pdf-parse for PDFs, mammoth for DOCX)
3. Text is split into ~800 character chunks with 200 character overlap
4. Each chunk is embedded using `text-embedding-3-small` (1536 dimensions)
5. Chunks + embeddings are stored in Supabase/pgvector

### Q&A Pipeline
1. User question is embedded using the same model
2. Top 8 most similar chunks are retrieved via cosine similarity (pgvector)
3. Retrieved chunks are sent as context to `gpt-4o-mini` with strict grounding instructions
4. The model answers using only the provided sources, citing `[Source N]`
5. If evidence is insufficient, it says so clearly
6. 5-8 related concepts are extracted and rendered as clickable terminal commands
7. Concept co-occurrence edges are stored for future use

### File Limits
- Max file size: 20MB per file
- Supported formats: `.pdf`, `.txt`, `.md`, `.docx`

## Project Structure

```
src/
  app/
    page.tsx              # Terminal UI (single page)
    layout.tsx            # Root layout
    globals.css           # Terminal theme styles
    api/
      ingest/route.ts     # File upload + ingestion endpoint
      ask/route.ts        # Q&A endpoint
      wiki/
        ingest/route.ts   # Wiki page ingestion endpoint
        search/route.ts   # Wiki search endpoint
  lib/
    supabase.ts           # Supabase client
    embeddings.ts         # OpenAI embeddings
    chunker.ts            # Text chunking with overlap
    extract.ts            # Text extraction (PDF, DOCX, TXT, MD)
    wiki/
      types.ts            # Wiki type definitions
      normalize.ts        # HTML cleaning + section extraction
      classify.ts         # Page type classification
      extract.ts          # Entity extraction
      ingestWikiPage.ts   # Wiki ingestion pipeline
      searchWiki.ts       # Wiki search (exact + semantic)
    supabase/
      wiki.ts             # Supabase helpers for wiki tables
supabase/
  migrations/
    001_init.sql          # Database schema + functions
    002_wiki_schema.sql   # Structured wiki tables + RPC
```

---

## Structured Wiki Phase

### What was added

A structured wiki ingestion and retrieval layer on top of the existing RAG system:

- **6 new database tables**: `games`, `wiki_pages`, `wiki_sections`, `entities`, `entity_aliases`, `page_entity_links`
- **Section-level embeddings**: embeddings are stored per wiki section (not per chunk), enabling more precise retrieval
- **Page type classification**: pages are automatically classified as quest, weapon, character, location, etc.
- **Entity extraction**: canonical entities are extracted from page titles and content
- **Structured search**: exact match by title/slug/entity/alias, then falls back to vector similarity
- **New API routes**: `/api/wiki/ingest` and `/api/wiki/search`
- **Terminal commands**: `wiki ingest`, `wiki search`, `/game`

### Database Setup

Run the new migration in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of supabase/migrations/002_wiki_schema.sql
```

Or via CLI:

```bash
supabase db push
```

### How ingestion works

1. Set a game context (e.g., `marathon`)
2. Provide a URL to a wiki page
3. The page HTML is fetched and cleaned (nav, footer, scripts stripped)
4. Content is split into sections by headings
5. Each section is embedded with `text-embedding-3-small`
6. Page type is classified from URL/title/heading keywords
7. Entities are extracted from the page title and content
8. Everything is upserted into Supabase

If the page content hasn't changed (checksum match), ingestion is skipped.

### How to test it

#### Via terminal UI

```
/game marathon
wiki ingest https://marathon.bungie.org/story/
wiki search first mission
```

#### Via API

**Ingest a page:**

```bash
curl -X POST http://localhost:3000/api/wiki/ingest \
  -H "Content-Type: application/json" \
  -d '{"gameSlug": "marathon", "url": "https://marathon.bungie.org/story/"}'
```

**Search the wiki:**

```bash
curl -X POST http://localhost:3000/api/wiki/search \
  -H "Content-Type: application/json" \
  -d '{"query": "first mission", "gameSlug": "marathon"}'
```

### Example API responses

**Ingest response:**

```json
{
  "ok": true,
  "gameSlug": "marathon",
  "page": {
    "id": "abc-123",
    "title": "Arrival",
    "pageType": "quest",
    "canonicalUrl": "https://marathon.bungie.org/story/"
  },
  "sectionsInserted": 8,
  "entitiesUpserted": 2,
  "skipped": false
}
```

**Search response:**

```json
{
  "results": [
    {
      "pageTitle": "Arrival",
      "pageType": "quest",
      "heading": "Objectives",
      "content": "Your first objective is to...",
      "similarity": 0.89,
      "canonicalUrl": "https://marathon.bungie.org/story/",
      "pageId": "abc-123"
    }
  ],
  "matchType": "semantic"
}
```
