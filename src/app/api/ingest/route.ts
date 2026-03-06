import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { extractText } from "@/lib/extract";
import { chunkText } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ["pdf", "txt", "md", "docx"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const pasteText = formData.get("pasteText") as string | null;

    if (files.length === 0 && !pasteText) {
      return NextResponse.json(
        { error: "No files or text provided" },
        { status: 400 }
      );
    }

    const results: { filename: string; chunks: number }[] = [];

    // Process pasted text as a virtual document
    if (pasteText && pasteText.trim().length > 0) {
      const docResult = await processDocument(
        "pasted-text.txt",
        Buffer.from(pasteText, "utf-8")
      );
      results.push(docResult);
    }

    // Process uploaded files
    for (const file of files) {
      const ext = file.name.toLowerCase().split(".").pop();
      if (!ext || !ALLOWED_TYPES.includes(ext)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name} (max 20MB)` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const docResult = await processDocument(file.name, buffer);
      results.push(docResult);
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Ingestion error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 }
    );
  }
}

async function processDocument(
  filename: string,
  buffer: Buffer
): Promise<{ filename: string; chunks: number }> {
  // Extract text
  const { text, pageNumbers } = await extractText(buffer, filename);

  if (!text.trim()) {
    throw new Error(`No text extracted from ${filename}`);
  }

  // Create document record
  const { data: doc, error: docError } = await getSupabase()
    .from("documents")
    .insert({ filename, content_type: filename.split(".").pop() })
    .select("id")
    .single();

  if (docError) throw docError;

  // Chunk text
  const chunks = chunkText(text, pageNumbers);

  // Generate embeddings
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  // Store chunks with embeddings
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    content: chunk.content,
    page_number: chunk.pageNumber,
    chunk_index: chunk.chunkIndex,
    embedding: JSON.stringify(embeddings[i]),
  }));

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < chunkRows.length; i += batchSize) {
    const batch = chunkRows.slice(i, i + batchSize);
    const { error } = await getSupabase().from("chunks").insert(batch);
    if (error) throw error;
  }

  return { filename, chunks: chunks.length };
}
