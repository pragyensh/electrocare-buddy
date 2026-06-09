import * as fs from "fs";
import * as path from "path";

export interface ChunkedDocument {
  id: string;
  filePath: string;
  title: string;
  section: string;
  content: string;
  fullText: string;
  keywords: string[];
}

/**
 * Recursively read markdown files from a directory
 */
function readMarkdownFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      readMarkdownFiles(filePath, fileList);
    } else if (file.endsWith(".md")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

/**
 * Extract sections from markdown content
 * Returns array of { section: string, content: string }
 */
function parseMarkdownSections(content: string): { section: string; content: string }[] {
  const sections: { section: string; content: string }[] = [];
  const lines = content.split("\n");

  let currentSection = "Overview";
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // New section found
      if (currentContent.length > 0) {
        sections.push({
          section: currentSection,
          content: currentContent.join("\n").trim(),
        });
        currentContent = [];
      }
      currentSection = line.replace(/^## /, "").trim();
    } else if (line.startsWith("# ")) {
      // Skip main title
      continue;
    } else {
      currentContent.push(line);
    }
  }

  // Push final section
  if (currentContent.length > 0) {
    sections.push({
      section: currentSection,
      content: currentContent.join("\n").trim(),
    });
  }

  return sections.filter((s) => s.content.length > 0);
}

/**
 * Extract title from markdown (first H1)
 */
function extractTitle(content: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

/**
 * Extract keywords from content (simple heuristic)
 */
function extractKeywords(title: string, section: string, content: string): string[] {
  const text = `${title} ${section} ${content}`.toLowerCase();
  const words = text.match(/\b\w{4,}\b/g) || [];
  const uniqueWords = [...new Set(words)];
  // Return top 15 words as keywords
  return uniqueWords.slice(0, 15);
}

/**
 * Load all markdown files from knowledge directory and chunk them
 */
export function loadAndChunkMarkdownDocs(knowledgeDir: string): ChunkedDocument[] {
  const chunks: ChunkedDocument[] = [];
  const mdFiles = readMarkdownFiles(knowledgeDir);

  for (const filePath of mdFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const title = extractTitle(content);
      const sections = parseMarkdownSections(content);

      // Create a unique ID from filename without extension
      const relPath = path.relative(knowledgeDir, filePath);
      const docIdBase = relPath.replace(/\\/g, "/").replace(/\.md$/, "");

      for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
        const section = sections[sectionIdx];
        const chunkId = `${docIdBase}#${section.section.toLowerCase().replace(/\s+/g, "-")}`;

        const keywords = extractKeywords(title, section.section, section.content);

        chunks.push({
          id: chunkId,
          filePath: relPath,
          title,
          section: section.section,
          content: section.content,
          fullText: content,
          keywords,
        });
      }
    } catch (err) {
      console.error(`[ElectroCare] Error loading markdown file ${filePath}:`, err);
    }
  }

  console.log(
    `[ElectroCare] Loaded ${mdFiles.length} markdown files, created ${chunks.length} chunks`,
  );
  return chunks;
}

/**
 * Format chunks for logging (debug info)
 */
export function formatChunkInfo(chunks: ChunkedDocument[]): string {
  const grouped: { [key: string]: number } = {};
  for (const chunk of chunks) {
    grouped[chunk.filePath] = (grouped[chunk.filePath] || 0) + 1;
  }

  let summary = `Total: ${chunks.length} chunks from ${Object.keys(grouped).length} files:\n`;
  for (const [file, count] of Object.entries(grouped).sort()) {
    summary += `  - ${file}: ${count} chunks\n`;
  }
  return summary;
}
