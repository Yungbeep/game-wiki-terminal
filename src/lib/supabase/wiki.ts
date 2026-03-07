import { getSupabase } from "../supabase";
import type { Game, WikiPage, WikiPageType } from "../wiki/types";

export async function resolveOrCreateGame(slug: string): Promise<Game> {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("games")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) return existing as Game;

  // Create with name derived from slug
  const name = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const { data, error } = await sb
    .from("games")
    .insert({ slug, name })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create game: ${error.message}`);
  return data as Game;
}

export async function upsertWikiPage(page: {
  game_id: string;
  url: string;
  canonical_url: string;
  title: string;
  slug: string;
  page_type: WikiPageType;
  summary: string | null;
  clean_text: string | null;
  checksum: string;
  source_domain: string | null;
}): Promise<WikiPage> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("wiki_pages")
    .upsert(
      {
        ...page,
        last_ingested_at: new Date().toISOString(),
      },
      { onConflict: "canonical_url" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert wiki page: ${error.message}`);
  return data as WikiPage;
}

export async function replaceSections(
  pageId: string,
  sections: { heading: string | null; section_order: number; content: string; embedding: number[] | null }[]
): Promise<number> {
  const sb = getSupabase();

  // Delete existing sections for this page
  await sb.from("wiki_sections").delete().eq("page_id", pageId);

  if (sections.length === 0) return 0;

  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < sections.length; i += batchSize) {
    const batch = sections.slice(i, i + batchSize).map((s) => ({
      page_id: pageId,
      heading: s.heading,
      section_order: s.section_order,
      content: s.content,
      embedding: s.embedding,
    }));

    const { error } = await sb.from("wiki_sections").insert(batch);
    if (error) throw new Error(`Failed to insert sections: ${error.message}`);
    inserted += batch.length;
  }

  return inserted;
}

export async function upsertEntity(params: {
  game_id: string;
  entity_type: string;
  name: string;
  slug: string;
  canonical_page_id: string | null;
}): Promise<string> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("entities")
    .upsert(params, { onConflict: "game_id,entity_type,slug" })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to upsert entity: ${error.message}`);
  return data.id;
}

export async function upsertEntityAlias(entityId: string, alias: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from("entity_aliases")
    .upsert({ entity_id: entityId, alias }, { onConflict: "entity_id,alias" });
}

export async function linkEntityToPage(
  pageId: string,
  entityId: string,
  relationshipType: string = "mentions"
): Promise<void> {
  const sb = getSupabase();
  await sb
    .from("page_entity_links")
    .upsert(
      { page_id: pageId, entity_id: entityId, relationship_type: relationshipType },
      { onConflict: "page_id,entity_id,relationship_type" }
    );
}

export async function findPageByTitle(gameId: string, title: string): Promise<WikiPage | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("wiki_pages")
    .select("*")
    .eq("game_id", gameId)
    .ilike("title", title)
    .limit(1)
    .maybeSingle();

  return (data as WikiPage) || null;
}

export async function findPageBySlug(gameId: string, slug: string): Promise<WikiPage | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("wiki_pages")
    .select("*")
    .eq("game_id", gameId)
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  return (data as WikiPage) || null;
}

export async function findEntityByName(gameId: string, name: string): Promise<{ id: string; name: string; entity_type: string; canonical_page_id: string | null } | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("entities")
    .select("id, name, entity_type, canonical_page_id")
    .eq("game_id", gameId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function findEntityByAlias(gameId: string, alias: string): Promise<{ id: string; entity_id: string; alias: string } | null> {
  const sb = getSupabase();

  // Two-step: find alias, then verify game_id through entity
  const { data: aliasRows } = await sb
    .from("entity_aliases")
    .select("id, entity_id, alias")
    .ilike("alias", alias)
    .limit(10);

  if (!aliasRows || aliasRows.length === 0) return null;

  for (const row of aliasRows) {
    const { data: entity } = await sb
      .from("entities")
      .select("id")
      .eq("id", row.entity_id)
      .eq("game_id", gameId)
      .maybeSingle();

    if (entity) {
      return { id: row.id, entity_id: row.entity_id, alias: row.alias };
    }
  }

  return null;
}

export async function getPageSections(pageId: string): Promise<{ heading: string | null; content: string; section_order: number }[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("wiki_sections")
    .select("heading, content, section_order")
    .eq("page_id", pageId)
    .order("section_order");

  if (error) throw new Error(`Failed to get sections: ${error.message}`);
  return data || [];
}

export async function matchWikiSections(
  queryEmbedding: number[],
  matchCount: number = 10,
  filterGameId?: string,
  filterPageType?: string
): Promise<{
  id: string;
  page_id: string;
  title: string;
  page_type: string;
  heading: string | null;
  content: string;
  similarity: number;
}[]> {
  const sb = getSupabase();

  const { data, error } = await sb.rpc("match_wiki_sections", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_game_id: filterGameId || null,
    filter_page_type: filterPageType || null,
  });

  if (error) throw new Error(`match_wiki_sections failed: ${error.message}`);
  return data || [];
}
