import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async () => {
        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
        return Response.json({
          ai: {
            active: hasOpenAI ? "openai" : "local-kb",
            model: hasOpenAI ? "gpt-4o-mini + text-embedding-3-small" : "keyword match",
            fallback: !hasOpenAI,
          },
          asr: {
            available: ["browser", ...(hasDeepgram ? ["deepgram"] : [])],
            hasDeepgram,
          },
          tts: {
            available: ["browser", ...(hasOpenAI ? ["openai"] : [])],
            hasOpenAI,
          },
        });
      },
    },
  },
});
