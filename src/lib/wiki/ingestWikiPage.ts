import crypto from "crypto";
import axios from "axios";
import { normalizeHtml } from "./normalize";
import { extractEntities } from "./extract";
import { generateEmbeddings } from "../embeddings";
import { getSupabase } from "../supabase";
import {
  resolveOrCreateGame,
  upsertWikiPage,
  replaceSections,
  upsertEntity,
  upsertEntityAlias,
  linkEntityToPage,
} from "../supabase/wiki";
import type { IngestResult } from "./types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip fragment, trailing slash, common tracking params
    u.hash = "";
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("ref");
    let path = u.pathname.replace(/\/+$/, "") || "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return url;
  }
}

export async function ingestWikiPage(params: {
  gameSlug: string;
  url: string;
  force?: boolean;
}): Promise<IngestResult> {
  const { gameSlug, url, force = false } = params;

  // 1. Resolve or create game
  const game = await resolveOrCreateGame(gameSlug);

  // 2. Fetch page HTML
  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeout: 30000,
  });

  const html = res.data as string;

  // 3. Normalize/canonicalize URL
  const canonicalUrl = canonicalizeUrl(url);

  // 4. Clean and parse HTML
  const doc = normalizeHtml(html, url);

  // 5. Compute checksum
  const checksum = crypto.createHash("sha256").update(doc.cleanText).digest("hex");

  // 6. Check if already ingested with same checksum
  if (!force) {
    const { data: existing } = await getSupabase()
      .from("wiki_pages")
      .select("id, checksum")
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();

    if (existing && existing.checksum === checksum) {
      return {
        ok: true,
        gameSlug,
        page: {
          id: existing.id,
          title: doc.title,
          pageType: doc.pageType,
          canonicalUrl,
        },
        sectionsInserted: 0,
        entitiesUpserted: 0,
        skipped: true,
      };
    }
  }

  // 7. Upsert wiki_pages row
  const pageSlug = slugify(doc.title);
  const page = await upsertWikiPage({
    game_id: game.id,
    url,
    canonical_url: canonicalUrl,
    title: doc.title,
    slug: pageSlug,
    page_type: doc.pageType,
    summary: doc.summary,
    clean_text: doc.cleanText,
    checksum,
    source_domain: doc.sourceDomain,
  });

  // 8. Generate embeddings for each section
  const sectionTexts = doc.sections.map((s) => {
    const prefix = s.heading ? `${s.heading}: ` : "";
    return prefix + s.content;
  });

  const embeddings = sectionTexts.length > 0
    ? await generateEmbeddings(sectionTexts)
    : [];

  // 9. Replace sections
  const sectionRows = doc.sections.map((s, i) => ({
    heading: s.heading,
    section_order: s.sectionOrder,
    content: s.content,
    embedding: embeddings[i] || null,
  }));

  const sectionsInserted = await replaceSections(page.id, sectionRows);

  // 10. Extract entities
  const extractedEntities = extractEntities(doc.title, doc.pageType, doc.sections);

  let entitiesUpserted = 0;
  for (const ent of extractedEntities) {
    const entityId = await upsertEntity({
      game_id: game.id,
      entity_type: ent.entityType,
      name: ent.name,
      slug: slugify(ent.name),
      canonical_page_id: page.id,
    });

    // Add aliases
    for (const alias of ent.aliases) {
      await upsertEntityAlias(entityId, alias);
    }

    // Link entity to page
    await linkEntityToPage(page.id, entityId, "canonical");

    entitiesUpserted++;
  }

  return {
    ok: true,
    gameSlug,
    page: {
      id: page.id,
      title: doc.title,
      pageType: doc.pageType,
      canonicalUrl,
    },
    sectionsInserted,
    entitiesUpserted,
    skipped: false,
  };
}
