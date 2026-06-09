import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async () => {
        const hasGroq = !!process.env.GROQ_API_KEY;
        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
        const hasSarvam = !!process.env.SARVAM_API_KEY;
        return Response.json({
          ai: {
            active: hasGroq ? "groq" : "local-kb",
            model: hasGroq ? "llama-3.3-70b-versatile + text-embedding-3-small" : "keyword match",
            fallback: !hasGroq,
          },
          asr: {
            available: ["browser", ...(hasDeepgram ? ["deepgram"] : [])],
            hasDeepgram,
          },
          tts: {
            available: [
              "browser",
              ...(hasOpenAI ? ["openai"] : []),
              ...(hasSarvam ? ["sarvam"] : []),
            ],
            hasOpenAI,
            hasSarvam,
          },
        });
      },
    },
  },
});
