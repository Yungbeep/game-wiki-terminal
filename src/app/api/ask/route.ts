import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

interface ChunkResult {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
  filename: string;
  similarity: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = body?.question as string;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const raw = question.trim();
    const input = raw.toLowerCase();

    let mode: "ask" | "explain" | "summarize" | "quiz" | "learn" | "ingest" = "ask";
    let topic = raw;

      if (input.startsWith("learn:")) {
        mode = "learn";
        topic = raw.replace(/^learn:\s*/i, "").trim();
      }

      if (input.startsWith("ingest ")) {
  mode = "ingest";
  topic = raw.replace(/^ingest\s+/i, "").trim();
    }   
      else if (input.startsWith("explain ")) { 
      mode = "explain";
      topic = raw.replace(/^explain\s+/i, "").trim();
    } else if (input.startsWith("summarize ")) {
      mode = "summarize";
      topic = raw.replace(/^summarize\s+/i, "").trim();
    } else if (input === "quiz me" || input.startsWith("quiz me")) {
      mode = "quiz";
      const m = raw.match(/^quiz me( on )?/i);
      topic = raw.slice(m?.[0]?.length ?? 0).trim();
      if (!topic) topic = "the uploaded materials";
    }

    if (!topic) {
      return NextResponse.json({ error: "Please provide a topic." }, { status: 400 });
    }


  if (mode === "ingest") {
  try {
    const { scrapePage } = await import("@/lib/scrape");
    const { chunkText } = await import("@/lib/chunk");

    const text = await scrapePage(topic);
    const chunks = chunkText(text).slice(0, 500);

    let inserted = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk);

      const { data: duplicate } = await getSupabase().rpc("match_knowledge_duplicate", {
        query_embedding: embedding,
        similarity_threshold: 0.92,
      });

      if (duplicate && duplicate.length > 0) {
        skipped++;
        continue;
      }

      await getSupabase().from("knowledge").insert({
        question: chunk.slice(0, 120),
        answer: chunk,
        embedding,
      });

      inserted++;
    }

    return NextResponse.json({
      answer: `Ingested ${inserted} chunks (${skipped} duplicates skipped) from ${topic}`,
      citations: [],
      sources: [],
      concepts: [],
    });
  } catch (err) {
    console.error("INGEST ERROR:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to ingest URL",
      },
      { status: 500 }
    );
  }
}

if (mode === "learn") {
  const embedding = await generateEmbedding(topic);

  const { error } = await getSupabase().from("knowledge").insert({
    question: topic,
    answer: topic,
    embedding,
  });

  if (error) throw error;

  return NextResponse.json({
    answer: `Learned: ${topic}`,
    citations: [],
    sources: [],
    concepts: [],
  });
}
    if (input === "sources") {
      const { data, error } = await getSupabase()
        .from("documents")
        .select("filename")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const names = (data ?? []).map((d) => d.filename);
      return NextResponse.json({
        answer: names.length ? names.join("\n") : "No sources uploaded yet.",
        citations: [],
        sources: [],
        concepts: [],
      });
    }

    const queryEmbedding = await generateEmbedding(topic);

    // Knowledge Base lookup
    const { data: kbHits, error: kbErr } = await getSupabase().rpc("match_knowledge", {
      query_embedding: queryEmbedding,
      match_threshold: 0.85,
      match_count: 1,
    });

    if (kbErr) {
      console.warn("match_knowledge error:", kbErr);
    }

    const kbTop = kbHits && kbHits.length > 0 ? kbHits[0] : null;

    if (kbTop) {
      return NextResponse.json({
        answer: kbTop.answer,
        citations: [
          {
            filename: "Knowledge Base",
            pageNumber: null,
            similarity: Math.round((kbTop.similarity ?? 0) * 100) / 100,
          },
        ],
        sources: [
          {
            filename: "Knowledge Base",
            pageNumber: null,
            content: kbTop.question ?? "",
            similarity: Math.round((kbTop.similarity ?? 0) * 100) / 100,
          },
        ],
        concepts: [],
      });
    }

    const { data: chunks, error: matchError } = await getSupabase().rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: 8,
    });

    if (matchError) throw matchError;

    const typedChunks = (chunks || []) as ChunkResult[];

    const top = typedChunks[0];
    console.log("ASK MODE:", mode);
    console.log("ASK TOPIC:", topic);
    console.log("TOP MATCH:", top ? { sim: top.similarity, file: top.filename, page: top.page_number } : null);

    if (typedChunks.length === 0) {
      return NextResponse.json({
        answer: "I could not find any relevant information in the uploaded materials to answer this request.",
        citations: [],
        sources: [],
        concepts: [],
      });
    }

    const bestRaw = typedChunks[0]?.similarity ?? 0;
    const best = bestRaw > 1 ? bestRaw / 100 : bestRaw;
    const MIN_RELEVANCE = 0.35;

    if (best < MIN_RELEVANCE) {
      return NextResponse.json({
        answer: "I could not find any relevant information in the uploaded materials to answer this request.",
        citations: [],
        sources: [],
        concepts: [],
      });
    }

    const filteredChunks = typedChunks.filter((c) => {
      const sim = c.similarity > 1 ? c.similarity / 100 : c.similarity;
      return sim >= 0.25;
    });

    const finalChunks = filteredChunks.length > 0 ? filteredChunks : [typedChunks[0]];

    const context = finalChunks
      .map(
        (c, i) =>
          `[Source ${i + 1}: ${c.filename}${c.page_number ? `, p.${c.page_number}` : ""}]\n${c.content}`
      )
      .join("\n\n---\n\n");

    let modeInstruction = "";
    if (mode === "explain") {
      modeInstruction =
        "Explain the topic clearly and simply, like a professor. Use short paragraphs and one concrete example if the sources include one.";
    } else if (mode === "summarize") {
      modeInstruction =
        "Write a structured summary with 3-6 bullet points. Keep it concise and only use what appears in the sources.";
    } else if (mode === "quiz") {
      modeInstruction =
        "Create ONE multiple-choice question based strictly on the sources (A-D), then give the correct answer and a one-sentence explanation with a citation.";
    } else {
      modeInstruction = "Answer the user's question directly and concisely.";
    }

    const systemPrompt = `You are a knowledge assistant. Answer the user's request ONLY using the provided source material.

Rules:
1. Only use information from the provided sources. Do not use any outside knowledge.
2. Cite your sources inline using [Source N] notation.
3. If the sources do not contain enough information to fully answer the request, say so clearly.
4. Do not hallucinate or make up information.
5. Be concise and direct.
6. Do not output code fences or markdown code blocks.

Task:
${modeInstruction}

After your answer, output ONE line in this exact format (no code block):
CONCEPTS_JSON: ["concept1","concept2",...]
Choose 5-8 short concepts from the sources and your answer.`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Sources:\n\n${context}\n\nUser request: ${topic}`,
        },
      ],
    });

    const rawAnswer = completion.choices[0]?.message?.content || "";

    let answer = rawAnswer;
    let concepts: string[] = [];

    const conceptMatch = rawAnswer.match(/CONCEPTS_JSON:\s*(\[[\s\S]*?\])/);
    if (conceptMatch) {
      try {
        concepts = JSON.parse(conceptMatch[1]);
        answer = rawAnswer.replace(/CONCEPTS_JSON:\s*\[[\s\S]*?\]/, "").trim();
      } catch {
        // ignore parse errors
      }
    }

    if (concepts.length > 1) {
      const edges: { source: string; target: string }[] = [];
      for (let i = 0; i < concepts.length; i++) {
        for (let j = i + 1; j < concepts.length; j++) {
          const [source, target] = [concepts[i], concepts[j]].sort();
          edges.push({ source, target });
        }
      }

      for (const edge of edges) {
        try {
          await getSupabase().rpc("upsert_concept_edge", {
            p_source: edge.source,
            p_target: edge.target,
          });
        } catch {
          // ignore
        }
      }
    }

    const citations = finalChunks.map((c) => ({
      filename: c.filename,
      pageNumber: c.page_number,
      similarity: Math.round(c.similarity * 100) / 100,
    }));

    const sources = finalChunks.map((c) => ({
      filename: c.filename,
      pageNumber: c.page_number,
      content: c.content,
      similarity: Math.round(c.similarity * 100) / 100,
    }));

    // Save newly generated answer into Knowledge Base
    if (mode === "ask") {
      try {
        await getSupabase().from("knowledge").insert({
          question: topic,
          answer,
          embedding: queryEmbedding,
        });
      } catch (e) {
        console.warn("Failed to store knowledge:", e);
      }
    }

    return NextResponse.json({ answer, citations, sources, concepts });
  } catch (err) {
    console.error("Q&A error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process question" },
      { status: 500 }
    );
  }
    }