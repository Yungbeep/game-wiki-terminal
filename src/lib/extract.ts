/* eslint-disable @typescript-eslint/no-require-imports */
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";

export interface ExtractedText {
  text: string;
  pageNumbers?: Map<number, number>; // char offset -> page number
}

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedText> {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "txt":
    case "md":
      return { text: buffer.toString("utf-8") };
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractedText> {
  const pageNumbers = new Map<number, number>();
  let fullText = "";

  const data = await pdfParse(buffer, {
    pagerender: undefined,
  });

  // pdf-parse concatenates all pages; we parse page-by-page via the raw text
  // For page tracking, we re-parse with a custom page renderer
  const rawPages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item: { str: string }) => item.str).join(" ");
      rawPages.push(text);
      return text;
    },
  });

  if (rawPages.length > 0) {
    let offset = 0;
    for (let i = 0; i < rawPages.length; i++) {
      pageNumbers.set(offset, i + 1);
      fullText += rawPages[i] + "\n\n";
      offset = fullText.length;
    }
  } else {
    fullText = data.text;
  }

  return { text: fullText || data.text, pageNumbers };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
