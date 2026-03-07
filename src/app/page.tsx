"use client";

import BootGate from "@/components/BootGate";
import { useState, useRef, useEffect, useCallback, FormEvent } from "react";

interface Citation {
  filename: string;
  pageNumber: number | null;
  similarity: number;
}

interface Source {
  filename: string;
  pageNumber: number | null;
  content: string;
  similarity: number;
}

interface Message {
  role: "user" | "system";
  content: string;
  citations?: Citation[];
  sources?: Source[];
  concepts?: string[];
}



export default function Home() {
  const [gameSlug, setGameSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
  'Game Wiki Terminal v1.0\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nAsk about quests, items, NPCs, maps, and builds.\nUpload sources or ingest wiki pages.\n\nType "help" for available commands.',}
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(
    new Set()
  );
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
  inputRef.current?.focus();
}, [isLoading]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | null, paste?: string) => {
      if ((!files || files.length === 0) && !paste) return;

      setIsLoading(true);
      const fileNames = files
        ? Array.from(files)
            .map((f) => f.name)
            .join(", ")
        : "pasted text";
      addMessage({ role: "user", content: `> upload ${fileNames}` });

      const formData = new FormData();
      if (files) {
        Array.from(files).forEach((f) => formData.append("files", f));
      }
      if (paste) {
        formData.append("pasteText", paste);
      }

      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          addMessage({ role: "system", content: `ERROR: ${data.error}` });
        } else {
          const summary = data.results
            .map(
              (r: { filename: string; chunks: number }) =>
                `  ${r.filename}: ${r.chunks} chunks indexed`
            )
            .join("\n");
          addMessage({
            role: "system",
            content: `Ingestion complete.\n${summary}\n\nYou can now ask questions about your materials.\nType your question or "help" for commands.`,
          });
          
        }
      } catch {
        addMessage({
          role: "system",
          content: "ERROR: Failed to connect to ingestion service.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage]
  );

  const handleAsk = useCallback(
    async (question: string) => {
      setIsLoading(true);
      addMessage({ role: "user", content: `> ${question}` });

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();

        if (!res.ok) {
          addMessage({ role: "system", content: `ERROR: ${data.error}` });
        } else {
          addMessage({
            role: "system",
            content: data.answer,
            citations: data.citations,
            sources: data.sources,
            concepts: data.concepts,
          });
        }
      } catch {
        addMessage({
          role: "system",
          content: "ERROR: Failed to connect to Q&A service.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage]
  );

  const handleWikiIngest = useCallback(
    async (slug: string, url: string) => {
      setIsLoading(true);
      addMessage({ role: "user", content: `> wiki ingest ${url}` });
      try {
        const res = await fetch("/api/wiki/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameSlug: slug, url }),
        });
        const data = await res.json();
        if (!res.ok) {
          addMessage({ role: "system", content: `ERROR: ${data.error}` });
        } else if (data.skipped) {
          addMessage({
            role: "system",
            content: `Page already ingested (unchanged): ${data.page.title} [${data.page.pageType}]`,
          });
        } else {
          addMessage({
            role: "system",
            content: `Wiki page ingested: ${data.page.title}\n  Type: ${data.page.pageType}\n  Sections: ${data.sectionsInserted}\n  Entities: ${data.entitiesUpserted}`,
          });
        }
      } catch {
        addMessage({ role: "system", content: "ERROR: Failed to ingest wiki page." });
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage]
  );

  const handleWikiSearch = useCallback(
    async (query: string) => {
      setIsLoading(true);
      addMessage({ role: "user", content: `> wiki search ${query}` });
      try {
        const res = await fetch("/api/wiki/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, gameSlug: gameSlug || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          addMessage({ role: "system", content: `ERROR: ${data.error}` });
        } else if (!data.results || data.results.length === 0) {
          addMessage({ role: "system", content: "No wiki results found." });
        } else {
          const lines = data.results.slice(0, 5).map(
            (r: { pageTitle: string; pageType: string; heading: string | null; content: string; similarity: number }) =>
              `[${r.pageType}] ${r.pageTitle}${r.heading ? ` > ${r.heading}` : ""}\n  ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}\n  (${Math.round(r.similarity * 100)}% match)`
          );
          addMessage({
            role: "system",
            content: `Wiki results (${data.matchType} match):\n\n${lines.join("\n\n")}`,
          });
        }
      } catch {
        addMessage({ role: "system", content: "ERROR: Failed to search wiki." });
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, gameSlug]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      setInput("");

      if (trimmed.toLowerCase() === "help") {
        addMessage({
          role: "system",
         content: `Available commands:
            upload                   - Upload source files
            paste                    - Paste source text
            clear                    - Clear terminal
            help                     - Show this help message
            sources                  - List indexed sources
            explain <topic>          - Explain a game topic
            summarize <topic>        - Summarize a game topic
            quiz me on <topic>       - Generate a quiz question
            learn: <text>            - Save knowledge directly
            ingest <url>             - Ingest a wiki/web page

          Wiki commands:
            /game <name>             - Set current game context
            wiki ingest <url>        - Ingest a structured wiki page
            wiki search <query>      - Search the wiki database

          Examples:
            /game marathon
            wiki ingest https://example.com/wiki/quest-page
            wiki search first quest
            explain stamina damage`,
        });
        return;
      }
      if (trimmed.toLowerCase() === "clear") {
        setMessages([]);
        return;
      }
      if (trimmed.toLowerCase() === "upload") {
        fileInputRef.current?.click();
        return;
      }
      if (trimmed.toLowerCase() === "paste") {
        setShowPaste(true);
        return;
      }

      // /game <slug> - set game context
      const gameMatch = trimmed.match(/^\/game\s+(.+)/i);
      if (gameMatch) {
        const slug = gameMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
        setGameSlug(slug);
        addMessage({
          role: "system",
          content: `Game context set to: ${slug}\nWiki commands will now filter by this game.`,
        });
        return;
      }

      // wiki ingest <url> - structured wiki ingestion
      const wikiIngestMatch = trimmed.match(/^wiki\s+ingest\s+(.+)/i);
      if (wikiIngestMatch) {
        const url = wikiIngestMatch[1].trim();
        if (!gameSlug) {
          addMessage({
            role: "system",
            content: 'Set a game context first with /game <name>\nExample: /game marathon',
          });
          return;
        }
        handleWikiIngest(gameSlug, url);
        return;
      }

      // wiki search <query> - structured wiki search
      const wikiSearchMatch = trimmed.match(/^wiki\s+search\s+(.+)/i);
      if (wikiSearchMatch) {
        const query = wikiSearchMatch[1].trim();
        handleWikiSearch(query);
        return;
      }

      handleAsk(trimmed);
    },
    [input, isLoading, addMessage, handleAsk, handleWikiIngest, handleWikiSearch, gameSlug]
  );

  const toggleSource = useCallback((idx: number) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  return (
    <BootGate alwaysPlay>
    <main className="flex min-h-screen items-center justify-center p-4">
      <div
        className="w-full max-w-3xl flex flex-col"
        style={{ height: "90vh" }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-t-lg"
          style={{
            background: "rgba(0,0,0,0.35)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "rgba(215, 251, 232, 0.28)" }}
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "rgba(215, 251, 232, 0.28)" }}
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "rgba(215, 251, 232, 0.28)" }}
          />
          <span
            className="ml-4 text-sm"
            style={{ color: "var(--fg-dim)" }}
          >
            game-wiki-terminal
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderTop: "none",
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
              {msg.role === "user" ? (
                <span style={{ color: "var(--accent)" }}>{msg.content}</span>
              ) : (
                <div>
                  <span style={{ color: "var(--fg-dim)" }}>{msg.content}</span>

                  {msg.citations && msg.citations.length > 0 && (
                    <div
                      className="mt-3 pt-2"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        CITATIONS:
                      </span>
                      {msg.citations.map((c, ci) => (
                        <div
                          key={ci}
                          className="text-xs ml-2"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          [{ci + 1}] {c.filename}
                          {c.pageNumber ? ` (p.${c.pageNumber})` : ""} —{" "}
                          {Math.round(c.similarity * 100)}% match
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleSource(i)}
                        className="text-xs cursor-pointer hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        {expandedSources.has(i) ? "▼ Hide" : "▶ Show"} source
                        snippets
                      </button>
                      {expandedSources.has(i) && (
                        <div className="mt-2 space-y-2">
                          {msg.sources.map((s, si) => (
                            <div
                              key={si}
                              className="text-xs p-2 rounded"
                              style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div style={{ color: "var(--fg-muted)" }}>
                                — {s.filename}
                                {s.pageNumber ? ` (p.${s.pageNumber})` : ""}
                              </div>
                              <div
                                className="mt-1"
                                style={{ color: "var(--fg-dim)" }}
                              >
                                {s.content.length > 400
                                  ? s.content.slice(0, 400) + "..."
                                  : s.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.concepts && msg.concepts.length > 0 && (
                    <div
                      className="mt-3 pt-2"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        RELATED CONCEPTS:
                      </span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {msg.concepts.map((concept, ci) => (
                          <button
                            key={ci}
                            onClick={() => {
                              setInput(`explain ${concept}`);
                              inputRef.current?.focus();
                            }}
                            className="text-xs px-2 py-1 rounded cursor-pointer hover:brightness-125 transition-all"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--accent)",
                            }}
                          >
                            {">"} explain {concept}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm">
              <span
                className="cursor-blink"
                style={{ color: "var(--accent)" }}
              >
                ▊
              </span>
              <span style={{ color: "var(--fg-muted)" }}>Processing...</span>
            </div>
          )}
        </div>

        {/* Paste text modal */}
        {showPaste && (
          <div
            className="p-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderTop: "none",
            }}
          >
            <div
              className="text-xs mb-2"
              style={{ color: "var(--fg-muted)" }}
            >
              Paste your text content below, then press Ctrl+Enter or click
              Submit:
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  handleUpload(null, pasteText);
                  setPasteText("");
                  setShowPaste(false);
                }
              }}
              className="w-full h-32 p-2 rounded text-sm resize-none outline-none"
              style={{
                background: "var(--bg)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                fontFamily: "inherit",
              }}
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  handleUpload(null, pasteText);
                  setPasteText("");
                  setShowPaste(false);
                }}
                className="text-xs px-3 py-1 rounded cursor-pointer"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                Submit
              </button>
              <button
                onClick={() => {
                  setShowPaste(false);
                  setPasteText("");
                }}
                className="text-xs px-3 py-1 rounded cursor-pointer"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Input area */}
<div
  className="rounded-b-lg"
  style={{
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderTop: "none",
  }}
>
  <form onSubmit={handleSubmit} className="flex items-center">
    <span
      className="pl-3 text-sm"
      style={{ color: "var(--accent)" }}
    >
      {"$"}
    </span>
    <input
      ref={inputRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      disabled={isLoading}
      placeholder='Type a command or question... ("help" for commands)'
      className="flex-1 bg-transparent p-3 text-sm outline-none placeholder:opacity-30"
      style={{ color: "var(--fg)", fontFamily: "inherit" }}
      autoFocus
    />
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={isLoading}
      className="text-xs px-3 py-1 mr-2 rounded cursor-pointer"
      style={{
        border: "1px solid var(--border)",
        color: "var(--fg-muted)",
      }}
      title="Upload files"
    >
      Upload
    </button>
    <button
      type="button"
      onClick={() => setShowPaste(true)}
      disabled={isLoading}
      className="text-xs px-3 py-1 mr-3 rounded cursor-pointer"
      style={{
        border: "1px solid var(--border)",
        color: "var(--fg-muted)",
      }}
      title="Paste text"
    >
      Paste
    </button>
  </form>
</div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => {
            handleUpload(e.target.files);
            e.target.value = "";
          }}

          
        />
      </div>
    </main>
    </BootGate>
  );
}
