import { WikiPageType } from "./types";

interface ClassifyInput {
  url: string;
  title: string;
  headings: string[];
}

const PATTERNS: { type: WikiPageType; keywords: string[] }[] = [
  { type: "quest", keywords: ["quest", "mission", "objective", "task"] },
  { type: "walkthrough", keywords: ["walkthrough", "guide", "how to", "tutorial", "step-by-step"] },
  { type: "weapon", keywords: ["weapon", "gun", "rifle", "sword", "pistol", "shotgun", "blade", "firearm"] },
  { type: "item", keywords: ["item", "consumable", "material", "resource", "collectible", "pickup"] },
  { type: "character", keywords: ["character", "npc", "companion", "merchant", "vendor"] },
  { type: "location", keywords: ["location", "map", "area", "region", "zone", "dungeon", "biome"] },
  { type: "enemy", keywords: ["enemy", "boss", "creature", "monster", "mob"] },
  { type: "mechanic", keywords: ["mechanic", "system", "crafting", "skill", "ability", "stat", "perk"] },
  { type: "lore", keywords: ["lore", "history", "backstory", "codex", "journal", "legend"] },
];

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

export function classifyPageType(input: ClassifyInput): WikiPageType {
  const scores = new Map<WikiPageType, number>();

  for (const { type, keywords } of PATTERNS) {
    let total = 0;
    // URL gets highest weight
    total += scoreText(input.url, keywords) * 3;
    // Title gets medium weight
    total += scoreText(input.title, keywords) * 2;
    // Headings contribute
    for (const h of input.headings) {
      total += scoreText(h, keywords);
    }
    if (total > 0) scores.set(type, total);
  }

  if (scores.size === 0) return "general";

  let best: WikiPageType = "general";
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  return best;
}
