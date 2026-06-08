import { createFileRoute } from "@tanstack/react-router";
import kb from "@/data/knowledge-base.json";

type Entry = {
  id: string;
  keywords: string[];
  question_en: string;
  question_hi: string;
  answer_en: string;
  answer_hi: string;
};

const ENTRIES = kb as Entry[];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreEntry(entry: Entry, queryTokens: string[], rawQuery: string): number {
  let score = 0;
  const q = rawQuery.toLowerCase();
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (q.includes(k)) score += 3;
    for (const tok of queryTokens) {
      if (tok === k) score += 2;
      else if (k.includes(tok) || tok.includes(k)) score += 1;
    }
  }
  // Also match against question text
  const qEn = tokenize(entry.question_en);
  const qHi = tokenize(entry.question_hi);
  for (const tok of queryTokens) {
    if (qEn.includes(tok)) score += 1;
    if (qHi.includes(tok)) score += 1;
  }
  return score;
}

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { text?: string; lang?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const text = (body.text || "").trim();
        const lang = body.lang === "hi-IN" || body.lang === "hi" ? "hi" : "en";

        if (!text) {
          return Response.json({ error: "Missing text" }, { status: 400 });
        }

        const tokens = tokenize(text);
        let best: Entry | null = null;
        let bestScore = 0;
        for (const entry of ENTRIES) {
          const s = scoreEntry(entry, tokens, text);
          if (s > bestScore) {
            bestScore = s;
            best = entry;
          }
        }

        if (!best || bestScore === 0) {
          const fallback =
            lang === "hi"
              ? "Maaf kijiye, main aapka sawaal samajh nahi paya. Kripya appliance ka naam aur problem batayein, jaise AC cooling nahi kar raha."
              : "Sorry, I could not understand your question. Please mention the appliance and the problem, for example AC is not cooling.";
          return Response.json({ answer: fallback, matchedId: null, confidence: 0 });
        }

        const answer = lang === "hi" ? best.answer_hi : best.answer_en;
        return Response.json({
          answer,
          matchedId: best.id,
          matchedQuestion: lang === "hi" ? best.question_hi : best.question_en,
          confidence: bestScore,
        });
      },
    },
  },
});
