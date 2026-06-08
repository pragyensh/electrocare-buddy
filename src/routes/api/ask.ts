import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { answerWithOpenAI, bestKeywordAnswer } from "@/lib/rag.server";

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
        if (!text) return Response.json({ error: "Missing text" }, { status: 400 });

        const apiKey = process.env.OPENAI_API_KEY;

        if (apiKey) {
          try {
            const { answer, matches } = await answerWithOpenAI(apiKey, text, lang);
            if (answer) {
              return Response.json({
                answer,
                provider: "openai",
                mode: "rag",
                matches,
              });
            }
          } catch (e) {
            console.error("OpenAI RAG failed, falling back to keyword KB:", e);
          }
        }

        // Fallback: keyword KB (original behavior).
        const local = bestKeywordAnswer(text, lang);
        if (local) {
          return Response.json({ answer: local, provider: "local", mode: "keyword" });
        }

        const fallback =
          lang === "hi"
            ? "Maaf kijiye, main aapka sawaal samajh nahi paya. Kripya appliance ka naam aur problem batayein, jaise AC cooling nahi kar raha."
            : "Sorry, I could not understand your question. Please mention the appliance and the problem, for example AC is not cooling.";
        return Response.json({ answer: fallback, provider: "local", mode: "fallback" });
      },
    },
  },
});
