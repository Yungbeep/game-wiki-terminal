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
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
            'Terminal of Knowledge v1.0\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nAsk questions, upload files, paste text, or run commands.\nSupported formats: PDF, TXT, MD, DOCX\n\nType "help" for available commands.',}
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
          upload                 - Upload files
          paste                  - Paste text for ingestion
          clear                  - Clear terminal
          help                   - Show this help message
          sources                - List uploaded sources
          explain <topic>        - Explain a topic from sources
          summarize <topic>      - Summarize a topic from sources
          quiz me on <topic>     - Generate a quiz question
          learn: <text>          - Save knowledge directly
          ingest <url>           - Ingest a webpage into the library

        Or just type a question.`,
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

      handleAsk(trimmed);
    },
    [input, isLoading, addMessage, handleAsk]
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
            background: "#1a2e1a",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "#ff5f56" }}
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "#ffbd2e" }}
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: "#27c93f" }}
          />
          <span
            className="ml-4 text-sm"
            style={{ color: "var(--fg-dim)" }}
          >
            terminal-of-knowledge
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
