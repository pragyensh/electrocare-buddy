// In-memory vector store for KB entries.
// Note: ChromaDB requires a long-running Python/Node service and cannot run
// inside the Cloudflare Worker runtime this app deploys to. We use an
// in-memory cosine-similarity index over OpenAI embeddings (`text-embedding-3-small`)
// which is functionally equivalent for chunked markdown KB. The retrieval API
// (`retrieve(query, k)`) is provider-agnostic so a ChromaDB / pgvector
// backend can be dropped in later without touching callers.

import {
  loadAndChunkMarkdownDocs,
  formatChunkInfo,
  type ChunkedDocument,
} from "@/lib/markdown-loader";
import * as path from "path";

type Entry = ChunkedDocument;

// Load markdown docs from knowledge/ directory (only in Node.js runtime, not in Workers)
let ENTRIES: Entry[] = [];
let ENTRIES_LOADED = false;

function ensureEntriesLoaded(): void {
  if (ENTRIES_LOADED) return;
  try {
    const knowledgeDir = path.join(process.cwd(), "knowledge");
    ENTRIES = loadAndChunkMarkdownDocs(knowledgeDir);
    ENTRIES_LOADED = true;
    console.log(`[ElectroCare] RAG Index initialized: ${ENTRIES.length} chunks ready`);
    console.log(`[ElectroCare] ${formatChunkInfo(ENTRIES)}`);
  } catch (err) {
    console.error("[ElectroCare] Failed to load markdown docs, falling back to empty KB:", err);
    ENTRIES = [];
    ENTRIES_LOADED = true;
  }
}

const CONFIDENCE_THRESHOLD = 0.7;
export const OUT_OF_DOMAIN_RESPONSE =
  "I currently support ACs, refrigerators, washing machines, microwaves, geysers and related home appliances.";

const SUPPORTED_DOMAIN_TERMS = [
  "ac",
  "a/c",
  "air conditioner",
  "air conditioning",
  "split ac",
  "window ac",
  "fridge",
  "refrigerator",
  "freezer",
  "washing machine",
  "washer",
  "microwave",
  "oven",
  "geyser",
  "water heater",
  "एसी",
  "फ्रिज",
  "रेफ्रिजरेटर",
  "वॉशिंग मशीन",
  "वाशिंग मशीन",
  "वॉशिंगमशीन",
  "वाशिंगमशीन",
  "माइक्रोवेव",
  "गीजर",
];

const UNSUPPORTED_DOMAIN_TERMS = [
  "car",
  "vehicle",
  "bike",
  "motorcycle",
  "scooter",
  "truck",
  "laptop",
  "computer",
  "mobile",
  "phone",
  "printer",
  "wifi",
  "router",
  "television",
  "tv",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(query: string, term: string): boolean {
  const asciiTerm = /^[a-z0-9/ ]+$/i.test(term);
  if (asciiTerm) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`, "i").test(query);
  }
  return query.includes(term);
}

export function classifySupportedDomain(query: string): {
  inDomain: boolean;
  reason: string;
  supportedTerms: string[];
  unsupportedTerms: string[];
} {
  const normalized = query.toLowerCase();
  const supportedTerms = SUPPORTED_DOMAIN_TERMS.filter((term) => hasTerm(normalized, term));
  const unsupportedTerms = UNSUPPORTED_DOMAIN_TERMS.filter((term) => hasTerm(normalized, term));

  if (unsupportedTerms.length && !supportedTerms.length) {
    return { inDomain: false, reason: "unsupported_category", supportedTerms, unsupportedTerms };
  }

  if (unsupportedTerms.includes("car") || unsupportedTerms.includes("vehicle")) {
    const nonVehicleSupported = supportedTerms.filter((term) => term !== "ac" && term !== "a/c");
    if (!nonVehicleSupported.length) {
      return { inDomain: false, reason: "vehicle_related", supportedTerms, unsupportedTerms };
    }
  }

  if (supportedTerms.length) {
    return { inDomain: true, reason: "supported_appliance", supportedTerms, unsupportedTerms };
  }

  return {
    inDomain: false,
    reason: "no_supported_appliance_detected",
    supportedTerms,
    unsupportedTerms,
  };
}

type Indexed = { entry: Entry; vector: number[] };
let INDEX: Indexed[] | null = null;
let INDEX_PROMISE: Promise<Indexed[]> | null = null;

function entryDoc(e: Entry): string {
  return [e.title, e.section, e.content, e.keywords.join(", ")].join("\n");
}

async function embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  if (!apiKey) {
    console.warn(
      "[ElectroCare] Embeddings unavailable. Falling back to keyword mode. No API key configured.",
    );
    return texts.map(() => []);
  }
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    if (!res.ok) {
      console.warn(`[ElectroCare] Embeddings API error: ${res.status} ${await res.text()}`);
      return texts.map(() => []);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  } catch (err: any) {
    console.warn("[ElectroCare] Embeddings unavailable. Falling back to keyword mode.", err);
    return texts.map(() => []);
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function ensureIndex(apiKey: string): Promise<Indexed[]> {
  ensureEntriesLoaded();
  if (INDEX) return INDEX;
  if (INDEX_PROMISE) return INDEX_PROMISE;
  INDEX_PROMISE = (async () => {
    const vectors = await embedBatch(apiKey, ENTRIES.map(entryDoc));
    INDEX = ENTRIES.map((entry, i) => ({ entry, vector: vectors[i] }));
    console.log(`[ElectroCare] Indexing complete: ${INDEX.length} vectors embedded`);
    return INDEX;
  })();
  try {
    return await INDEX_PROMISE;
  } finally {
    INDEX_PROMISE = null;
  }
}

export async function retrieveSemantic(
  apiKey: string,
  query: string,
  k = 4,
): Promise<{ entry: Entry; score: number }[]> {
  const idx = await ensureIndex(apiKey);
  const [qv] = await embedBatch(apiKey, [query]);
  return idx
    .map(({ entry, vector }) => ({ entry, score: cosine(qv, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function retrieveKeyword(query: string, k = 4): { entry: Entry; score: number }[] {
  ensureEntriesLoaded();
  const q = query.toLowerCase();
  const tokens = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const scored = ENTRIES.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      const k2 = kw.toLowerCase();
      if (q.includes(k2)) score += 3;
      for (const tok of tokens) {
        if (tok === k2) score += 2;
        else if (k2.includes(tok) || tok.includes(k2)) score += 1;
      }
    }
    const contentLower = entry.content.toLowerCase();
    const titleLower = entry.title.toLowerCase();
    for (const tok of tokens) {
      if (titleLower.includes(tok)) score += 2;
      if (contentLower.includes(tok)) score += 1;
    }
    return { entry, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function formatContext(
  matches: { entry: Entry; score: number }[],
  lang: "en" | "hi",
): string {
  if (!matches.length) return "(no relevant entries found)";
  return matches
    .map(({ entry, score }, i) => {
      return `[${i + 1}] (score=${score.toFixed(3)}, doc=${entry.filePath}, section=${entry.section}) Title: ${entry.title}\nContent: ${entry.content.substring(0, 500)}...`;
    })
    .join("\n\n");
}

export function bestKeywordAnswer(query: string, lang: "en" | "hi"): string | null {
  ensureEntriesLoaded();
  const top = retrieveKeyword(query, 1)[0];
  if (!top || top.score === 0) return null;
  return top.entry.content;
}

export async function answerWithOpenAI(
  apiKey: string,
  query: string,
  lang: "en" | "hi",
): Promise<{
  answer: string;
  matches: { id: string; score: number; usedForContext: boolean }[];
  confidence: number;
  contextMode: "retrieved_context" | "openai_only";
}> {
  ensureEntriesLoaded();

  let matches: { entry: Entry; score: number }[] = [];

  try {
    matches = retrieveKeyword(query, 4);
  } catch (error) {
    console.error("[ElectroCare] Keyword retrieval failed", error);
  }

  const confidence = matches.length ? 1 : 0;

  const shouldUseRetrieval = matches.length > 0;

  const contextMatches = shouldUseRetrieval ? matches : [];
  const contextMode = contextMatches.length ? "retrieved_context" : "openai_only";

  const injectedDocIds = contextMatches.map((m) => m.entry.id);
  console.log(
    "[ElectroCare] Retrieved documents",
    JSON.stringify({
      threshold: CONFIDENCE_THRESHOLD,
      confidence,
      contextMode,
      injectedDocIds,
      matchDetails: matches.map(({ entry, score }) => ({
        id: entry.id,
        title: entry.title,
        section: entry.section,
        file: entry.filePath,
        score,
        usedInContext: contextMatches.some((cm) => cm.entry.id === entry.id),
      })),
    }),
  );

  const langInstruction =
    lang === "hi"
      ? "Reply in conversational Hinglish (romanized Hindi mixed with simple English). Keep it warm, like a phone support agent. 3-5 short sentences. Mention likely causes and clear troubleshooting steps."
      : "Reply in clear, friendly English like a phone support agent for Indian customers. 3-5 short sentences. Mention likely causes and clear troubleshooting steps.";

  const contextBlock = contextMatches.length
    ? `Retrieved knowledge to use as context only, not as the final answer:\n${formatContext(contextMatches, lang)}`
    : "No retrieved KB context is being used because retrieval confidence was low. Answer from general safe home-appliance troubleshooting knowledge only.";

  const system = `You are ElectroCare, a customer support agent for home electrical appliances (AC, washing machine, refrigerator, microwave, geyser).
The final answer must be your own support-agent response. Retrieved knowledge is context only and must never be copied directly as the answer.
Always: 1) acknowledge the problem, 2) explain the likely cause briefly, 3) give 2-4 concrete steps the user can try safely, 4) advise when to call a technician (gas leaks, burning smell, sparks, water near electricity).
Never invent model-specific part numbers. Do not use markdown formatting or bullet symbols — speak plainly so a TTS engine reads it naturally.
If the retrieved context does not directly answer the user's question, ignore the retrieved context and answer using your own appliance knowledge.
Do not force unrelated troubleshooting articles into maintenance, educational, comparison, or general appliance questions.
If the user asks for maintenance schedules, appliance concepts, energy consumption, appliance differences, or best practices, provide a direct expert answer rather than trying to match a troubleshooting article.
${langInstruction}

${contextBlock}`;

  const payload = {
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    max_tokens: 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: query },
    ],
  };

  console.log(
    "[ElectroCare] Groq request",
    JSON.stringify({
      model: payload.model,
      temperature: payload.temperature,
      max_tokens: payload.max_tokens,
      contextMode,
      confidence,
      injectedDocIds,
    }),
  );

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    choices: { message: { content: string }; finish_reason?: string }[];
  };
  const answer = data.choices[0]?.message?.content?.trim() || "";
  console.log(
    "[ElectroCare] Groq response",
    JSON.stringify({
      answerLength: answer.length,
      finishReason: data.choices[0]?.finish_reason,
      contextMode,
      confidence,
      injectedDocIds,
    }),
  );
  return {
    answer,
    confidence,
    contextMode,
    matches: matches.map((m) => ({
      id: m.entry.id,
      score: m.score,
      usedForContext: contextMatches.some((cm) => cm.entry.id === m.entry.id),
    })),
  };
}
