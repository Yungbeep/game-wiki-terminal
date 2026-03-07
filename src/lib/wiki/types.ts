export type WikiPageType =
  | "quest"
  | "walkthrough"
  | "item"
  | "weapon"
  | "character"
  | "location"
  | "mechanic"
  | "enemy"
  | "lore"
  | "general";

export interface Game {
  id: string;
  slug: string;
  name: string;
  release_year: number | null;
  developer: string | null;
  created_at: string;
}

export interface WikiPage {
  id: string;
  game_id: string;
  url: string;
  canonical_url: string;
  title: string;
  slug: string;
  page_type: WikiPageType;
  summary: string | null;
  clean_text: string | null;
  checksum: string | null;
  source_domain: string | null;
  last_ingested_at: string;
  created_at: string;
  updated_at: string;
}

export interface WikiSection {
  id: string;
  page_id: string;
  heading: string | null;
  section_order: number;
  content: string;
  embedding: number[] | null;
  created_at: string;
}

export interface Entity {
  id: string;
  game_id: string;
  entity_type: string;
  name: string;
  slug: string;
  description: string | null;
  canonical_page_id: string | null;
  created_at: string;
}

export interface EntityAlias {
  id: string;
  entity_id: string;
  alias: string;
}

export interface PageEntityLink {
  id: string;
  page_id: string;
  entity_id: string;
  relationship_type: string;
}

export interface CleanedSection {
  heading: string | null;
  content: string;
  sectionOrder: number;
}

export interface CleanedWikiDocument {
  title: string;
  summary: string | null;
  pageType: WikiPageType;
  sections: CleanedSection[];
  cleanText: string;
  sourceDomain: string | null;
}

export interface WikiSearchResult {
  pageTitle: string;
  pageType: WikiPageType;
  heading: string | null;
  content: string;
  similarity: number;
  canonicalUrl: string;
  pageId: string;
}

export interface IngestResult {
  ok: boolean;
  gameSlug: string;
  page: {
    id: string;
    title: string;
    pageType: WikiPageType;
    canonicalUrl: string;
  };
  sectionsInserted: number;
  entitiesUpserted: number;
  skipped: boolean;
}