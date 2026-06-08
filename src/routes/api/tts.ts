import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return new Response("OpenAI TTS not configured", { status: 501 });

        let body: { text?: string; voice?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text || "").trim();
        if (!text) return new Response("Missing text", { status: 400 });

        const res = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: body.voice || "alloy",
            input: text,
            format: "mp3",
          }),
        });
        if (!res.ok) {
          return new Response(`TTS failed: ${await res.text()}`, { status: 502 });
        }
        const audio = await res.arrayBuffer();
        return new Response(audio, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    },
  },
});
