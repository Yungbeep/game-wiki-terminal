import * as cheerio from "cheerio";
import { classifyPageType } from "./classify";
import type { CleanedWikiDocument, CleanedSection } from "./types";

const REMOVE_SELECTORS = [
  "script", "style", "noscript", "iframe",
  "nav", "footer", "header",
  ".sidebar", ".nav", ".navigation", ".menu", ".toc",
  ".footer", ".header", ".ad", ".ads", ".advertisement",
  ".cookie-banner", ".popup", ".modal",
  "#sidebar", "#nav", "#footer", "#header",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
];

const ARTICLE_SELECTORS = [
  "article", "main", "#content", "#mw-content-text",
  ".mw-parser-output", ".wiki-content", ".article-content",
  ".page-content", "[role='main']", ".entry-content",
];

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function extractTitle($: cheerio.CheerioAPI): string {
  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle?.trim()) return ogTitle.trim();

  const h1 = $("h1").first().text().trim();
  if (h1) return h1;

  const title = $("title").text().trim();
  return title.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, "").trim() || title;
}

function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeToText($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  const parts: string[] = [];

  el.contents().each((_, node) => {
    if (node.type === "text") {
      const t = (node as unknown as { data: string }).data;
      if (t) parts.push(t);
    } else if (node.type === "tag") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tag = (node as any).tagName?.toLowerCase() as string | undefined;
      const child = $(node);

      if (tag === "br") {
        parts.push("\n");
      } else if (tag === "li") {
        parts.push("\n- " + nodeToText($, child));
      } else if (tag === "ol") {
        let idx = 1;
        child.children("li").each((_, li) => {
          parts.push(`\n${idx}. ` + nodeToText($, $(li)));
          idx++;
        });
      } else if (tag === "ul") {
        child.children("li").each((_, li) => {
          parts.push("\n- " + nodeToText($, $(li)));
        });
      } else if (tag === "p") {
        parts.push("\n\n" + nodeToText($, child));
      } else if (tag === "table") {
        child.find("tr").each((_, tr) => {
          const cells: string[] = [];
          $(tr).find("th, td").each((_, cell) => {
            cells.push($(cell).text().trim());
          });
          if (cells.length > 0) parts.push("\n" + cells.join(" | "));
        });
      } else {
        parts.push(nodeToText($, child));
      }
    }
  });

  return parts.join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSections($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): CleanedSection[] {
  const sections: CleanedSection[] = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];
  let order = 0;

  const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

  function flushSection() {
    const text = collapseWhitespace(currentContent.join("\n"));
    if (text.length > 10) {
      sections.push({
        heading: currentHeading,
        content: text,
        sectionOrder: order++,
      });
    }
    currentContent = [];
  }

  root.children().each((_, el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = (el as any).tagName?.toLowerCase() as string | undefined;
    const $el = $(el);

    if (tag && headingTags.has(tag)) {
      flushSection();
      currentHeading = $el.text().trim() || null;
    } else {
      const text = nodeToText($, $el);
      if (text.trim()) currentContent.push(text);
    }
  });

  flushSection();

  if (sections.length === 0) {
    const fullText = collapseWhitespace(nodeToText($, root));
    if (fullText.length > 10) {
      sections.push({
        heading: null,
        content: fullText,
        sectionOrder: 0,
      });
    }
  }

  return sections;
}

export function normalizeHtml(html: string, url: string): CleanedWikiDocument {
  const $ = cheerio.load(html);

  for (const sel of REMOVE_SELECTORS) {
    $(sel).remove();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: cheerio.Cheerio<any> | null = null;
  for (const sel of ARTICLE_SELECTORS) {
    const found = $(sel).first();
    if (found.length > 0) {
      root = found;
      break;
    }
  }
  if (!root) {
    root = $("body");
  }

  const title = extractTitle($);
  const sections = extractSections($, root);
  const headings = sections.map((s) => s.heading).filter(Boolean) as string[];
  const cleanText = sections.map((s) => {
    const prefix = s.heading ? `## ${s.heading}\n` : "";
    return prefix + s.content;
  }).join("\n\n");

  const pageType = classifyPageType({ url, title, headings });

  const summary = sections.length > 0
    ? sections[0].content.slice(0, 300).trim()
    : null;

  return {
    title,
    summary,
    pageType,
    sections,
    cleanText,
    sourceDomain: extractDomain(url),
  };
}
