import type { WikiPageType, CleanedSection } from "./types";

interface ExtractedEntity {
  name: string;
  entityType: string;
  aliases: string[];
}

// Page types that map directly to entity types
const PAGE_TYPE_TO_ENTITY: Record<string, string> = {
  quest: "quest",
  weapon: "weapon",
  item: "item",
  character: "character",
  location: "location",
  enemy: "enemy",
  mechanic: "mechanic",
};

// Headings that signal entity names of specific types
const HEADING_ENTITY_HINTS: { pattern: RegExp; entityType: string }[] = [
  { pattern: /^characters?$/i, entityType: "character" },
  { pattern: /^weapons?$/i, entityType: "weapon" },
  { pattern: /^items?$/i, entityType: "item" },
  { pattern: /^enem(y|ies)$/i, entityType: "enemy" },
  { pattern: /^locations?$/i, entityType: "location" },
  { pattern: /^quests?$/i, entityType: "quest" },
  { pattern: /^boss(es)?$/i, entityType: "enemy" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Extract capitalized multi-word phrases that appear multiple times in content
function extractRepeatedCapitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
  if (!matches) return [];

  const counts = new Map<string, number>();
  for (const m of matches) {
    counts.set(m, (counts.get(m) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([name]) => name);
}

export function extractEntities(
  title: string,
  pageType: WikiPageType,
  sections: CleanedSection[]
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // 1. Create canonical entity from page title when page type is specific enough
  const entityType = PAGE_TYPE_TO_ENTITY[pageType];
  if (entityType) {
    const slug = slugify(title);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      entities.push({
        name: title,
        entityType,
        aliases: [],
      });
    }
  }

  // 2. Check section headings for entity hints
  for (const section of sections) {
    if (!section.heading) continue;

    for (const { pattern, entityType: hintType } of HEADING_ENTITY_HINTS) {
      if (pattern.test(section.heading)) {
        // Extract bold/capitalized names from section content
        const phrases = extractRepeatedCapitalizedPhrases(section.content);
        for (const phrase of phrases.slice(0, 5)) {
          const slug = slugify(phrase);
          if (slug && !seen.has(slug)) {
            seen.add(slug);
            entities.push({
              name: phrase,
              entityType: hintType,
              aliases: [],
            });
          }
        }
      }
    }
  }

  // 3. Extract repeated capitalized phrases from full text as potential entities
  if (entities.length === 0 || entityType) {
    const allText = sections.map((s) => s.content).join("\n");
    const phrases = extractRepeatedCapitalizedPhrases(allText);
    for (const phrase of phrases.slice(0, 3)) {
      const slug = slugify(phrase);
      if (slug && !seen.has(slug) && phrase !== title) {
        seen.add(slug);
        entities.push({
          name: phrase,
          entityType: "character", // default guess for repeated proper nouns
          aliases: [],
        });
      }
    }
  }

  return entities;
}
