# Terminal of Knowledge

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
  lib/
    supabase.ts           # Supabase client
    embeddings.ts         # OpenAI embeddings
    chunker.ts            # Text chunking with overlap
    extract.ts            # Text extraction (PDF, DOCX, TXT, MD)
supabase/
  migrations/
    001_init.sql          # Database schema + functions
```
