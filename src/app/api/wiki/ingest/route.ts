import { NextRequest, NextResponse } from "next/server";
import { ingestWikiPage } from "@/lib/wiki/ingestWikiPage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameSlug, url, force } = body;

    if (!gameSlug || typeof gameSlug !== "string") {
      return NextResponse.json({ error: "gameSlug is required" }, { status: 400 });
    }
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const result = await ingestWikiPage({ gameSlug, url, force: !!force });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Wiki ingest error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to ingest wiki page" },
      { status: 500 }
    );
  }
}
