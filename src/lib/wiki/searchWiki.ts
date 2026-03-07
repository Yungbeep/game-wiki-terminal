import { generateEmbedding } from "../embeddings";
import { getSupabase } from "../supabase";
import {
  findPageByTitle,
  findPageBySlug,
  findEntityByName,
  findEntityByAlias,
  getPageSections,
  matchWikiSections,
} from "../supabase/wiki";
import type { WikiSearchResult, WikiPageType } from "./types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface SearchParams {
  query: string;
  gameSlug?: string;
  pageTypeHint?: WikiPageType;
  maxResults?: number;
}

interface SearchResponse {
  results: WikiSearchResult[];
  matchType: "title" | "slug" | "entity" | "alias" | "semantic";
}

async function resolveGameId(gameSlug: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("games")
    .select("id")
    .eq("slug", gameSlug)
    .maybeSingle();
  return data?.id || null;
}

async function pageToResults(pageId: string, canonicalUrl: string, pageType: WikiPageType, pageTitle: string): Promise<WikiSearchResult[]> {
  const sections = await getPageSections(pageId);
  return sections.map((s) => ({
    pageTitle,
    pageType,
    heading: s.heading,
    content: s.content,
    similarity: 1.0,
    canonicalUrl: canonicalUrl,
    pageId,
  }));
}

export async function searchWiki(params: SearchParams): Promise<SearchResponse> {
  const { query, gameSlug, pageTypeHint, maxResults = 10 } = params;
  const querySlug = slugify(query);

  let gameId: string | null = null;
  if (gameSlug) {
    gameId = await resolveGameId(gameSlug);
  }

  // 1. Try exact title match
  if (gameId) {
    const page = await findPageByTitle(gameId, query);
    if (page) {
      const results = await pageToResults(page.id, page.canonical_url, page.page_type as WikiPageType, page.title);
      return { results: results.slice(0, maxResults), matchType: "title" };
    }
  }

  // 2. Try slug match
  if (gameId && querySlug) {
    const page = await findPageBySlug(gameId, querySlug);
    if (page) {
      const results = await pageToResults(page.id, page.canonical_url, page.page_type as WikiPageType, page.title);
      return { results: results.slice(0, maxResults), matchType: "slug" };
    }
  }

  // 3. Try entity name match
  if (gameId) {
    const entity = await findEntityByName(gameId, query);
    if (entity?.canonical_page_id) {
      const sb = getSupabase();
      const { data: page } = await sb
        .from("wiki_pages")
        .select("id, canonical_url, page_type, title")
        .eq("id", entity.canonical_page_id)
        .maybeSingle();

      if (page) {
        const results = await pageToResults(page.id, page.canonical_url, page.page_type as WikiPageType, page.title);
        return { results: results.slice(0, maxResults), matchType: "entity" };
      }
    }
  }

  // 4. Try entity alias match
  if (gameId) {
    const aliasMatch = await findEntityByAlias(gameId, query);
    if (aliasMatch) {
      const sb = getSupabase();
      const { data: entity } = await sb
        .from("entities")
        .select("canonical_page_id")
        .eq("id", aliasMatch.entity_id)
        .maybeSingle();

      if (entity?.canonical_page_id) {
        const { data: page } = await sb
          .from("wiki_pages")
          .select("id, canonical_url, page_type, title")
          .eq("id", entity.canonical_page_id)
          .maybeSingle();

        if (page) {
          const results = await pageToResults(page.id, page.canonical_url, page.page_type as WikiPageType, page.title);
          return { results: results.slice(0, maxResults), matchType: "alias" };
        }
      }
    }
  }

  // 5. Vector similarity search
  const embedding = await generateEmbedding(query);
  const matches = await matchWikiSections(
    embedding,
    maxResults,
    gameId || undefined,
    pageTypeHint || undefined
  );

  if (matches.length === 0) {
    return { results: [], matchType: "semantic" };
  }

  // Batch-fetch canonical URLs for all matched pages
  const uniquePageIds = [...new Set(matches.map((m) => m.page_id))];
  const sb = getSupabase();
  const { data: pages } = await sb
    .from("wiki_pages")
    .select("id, canonical_url")
    .in("id", uniquePageIds);

  const urlMap = new Map<string, string>();
  for (const p of pages || []) {
    urlMap.set(p.id, p.canonical_url);
  }

  const results: WikiSearchResult[] = matches.map((m) => ({
    pageTitle: m.title,
    pageType: m.page_type as WikiPageType,
    heading: m.heading,
    content: m.content,
    similarity: m.similarity,
    canonicalUrl: urlMap.get(m.page_id) || "",
    pageId: m.page_id,
  }));

  return {
    results: results.slice(0, maxResults),
    matchType: "semantic",
  };
}
