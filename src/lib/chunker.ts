export interface Chunk {
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;

export function chunkText(
  text: string,
  pageNumbers?: Map<number, number> // char offset -> page number
): Chunk[] {
  const clean = (text ?? "").trim();
  if (!clean) return [];

  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  if (step <= 0) {
    throw new Error(
      `Invalid chunk config: CHUNK_SIZE (${CHUNK_SIZE}) must be > CHUNK_OVERLAP (${CHUNK_OVERLAP})`
    );
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  // If pageNumbers exists, ensure iteration is ordered by offset.
  const pageEntries = pageNumbers
    ? Array.from(pageNumbers.entries()).sort((a, b) => a[0] - b[0])
    : null;

  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);

    // Try to break at a sentence/paragraph boundary (lookahead)
    if (end < clean.length) {
      const slice = clean.slice(start, Math.min(end + 100, clean.length));
      const breakPoints = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf(".\n"),
        slice.lastIndexOf("\n"),
      ];

      for (const bp of breakPoints) {
        // bp is relative to slice start
        if (bp > CHUNK_SIZE * 0.5) {
          end = Math.min(start + bp + 1, clean.length);
          break;
        }
      }
    }

    // Hard safety: ensure progress
    if (end <= start) {
      end = Math.min(start + CHUNK_SIZE, clean.length);
      if (end <= start) break; // nothing left
    }

    const content = clean.slice(start, end).trim();

    if (content.length > 0) {
      let pageNumber: number | null = null;

      if (pageEntries) {
        // Find the last page entry whose offset <= start
        for (const [offset, page] of pageEntries) {
          if (offset <= start) pageNumber = page;
          else break;
        }
      }

      chunks.push({ content, pageNumber, chunkIndex });
      chunkIndex++;
    }

    const nextStart = end - CHUNK_OVERLAP;

    // Critical safety: always move forward at least `step`
    start = Math.max(nextStart, start + step);

    if (start >= clean.length) break;
  }

  return chunks;
}