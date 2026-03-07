import { NextRequest, NextResponse } from "next/server";
import { searchWiki } from "@/lib/wiki/searchWiki";
import type { WikiPageType } from "@/lib/wiki/types";

const VALID_PAGE_TYPES = new Set([
  "quest", "walkthrough", "item", "weapon", "character",
  "location", "mechanic", "enemy", "lore", "general",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, gameSlug, pageType } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const pageTypeHint = pageType && VALID_PAGE_TYPES.has(pageType)
      ? (pageType as WikiPageType)
      : undefined;

    const result = await searchWiki({
      query: query.trim(),
      gameSlug: gameSlug || undefined,
      pageTypeHint,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Wiki search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to search wiki" },
      { status: 500 }
    );
  }
}
