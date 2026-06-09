import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import {
  OUT_OF_DOMAIN_RESPONSE,
  answerWithOpenAI,
  bestKeywordAnswer,
  classifySupportedDomain,
} from "@/lib/rag.server";

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          text?: string;
          lang?: string;
          history?: {
            role: string;
            text: string;
          }[];
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const text = (body.text || "").trim();
        const history = body.history || [];
        const lang = body.lang === "hi-IN" || body.lang === "hi" ? "hi" : "en";
        if (!text) return Response.json({ error: "Missing text" }, { status: 400 });

        const groqKey = process.env.GROQ_API_KEY;
        const domain = classifySupportedDomain(text);

        console.log(
          "[ElectroCare] User question",
          JSON.stringify({ text, lang, hasGroq: !!groqKey, domain }),
        );
        const isFollowUp = /describe|detail|detail mein|aur batao|more|explain|samjhao/i.test(text);
        if (!domain.inDomain && !isFollowUp) {
          console.log(
            "[ElectroCare] Domain classification blocked retrieval",
            JSON.stringify({ text, reason: domain.reason }),
          );
          return Response.json({
            answer: OUT_OF_DOMAIN_RESPONSE,
            provider: groqKey ? "groq" : "local",
            mode: "out_of_domain",
            domain,
          });
        }

        if (groqKey) {
          try {
            const { answer, matches, confidence, contextMode } = await answerWithOpenAI(
              groqKey,
              text,
              lang,
              history,
            );
            if (answer) {
              return Response.json({
                answer,
                provider: "groq",
                mode: contextMode,
                confidence,
                matches,
              });
            }
          } catch (e) {
            console.error(
              "[ElectroCare] Groq answer generation failed; not returning retrieved KB as answer",
              e,
            );
            const fallback =
              lang === "hi"
                ? "Maaf kijiye, AI answer abhi generate nahi ho pa raha. Kripya thodi der baad dobara try karein."
                : "Sorry, I could not generate an AI answer right now. Please try again in a moment.";
            return Response.json(
              { answer: fallback, provider: "groq", mode: "groq_error" },
              { status: 200 },
            );
          }
        }

        // Fallback only when OpenAI credentials are not configured.
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
