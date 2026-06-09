import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";
import { SarvamAIClient } from "sarvamai";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          text?: string;
          voice?: string;
          provider?: string;
          lang?: string;
        };

        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const text = (body.text || "").trim();

        if (!text) {
          return new Response("Missing text", { status: 400 });
        }

        // ---------- SARVAM ----------
        if (body.provider === "sarvam") {
          const sarvamKey = process.env.SARVAM_API_KEY;

          console.log("[SARVAM] TTS REQUEST", {
            text,
            provider: body.provider,
            lang: body.lang,
          });

          if (!sarvamKey) {
            return new Response("SARVAM_API_KEY missing", {
              status: 501,
            });
          }

          try {
            const client = new SarvamAIClient({
              apiSubscriptionKey: sarvamKey,
            });

            const response = await client.textToSpeech.convert({
              text,
              model: "bulbul:v3",
              speaker: "shubh",
              target_language_code: body.lang === "hi-IN" ? "hi-IN" : "en-IN",
            });

            console.log("[SARVAM] AUDIO GENERATED");

            const audioBuffer = Buffer.from(response.audios.join(""), "base64");

            return new Response(audioBuffer, {
              status: 200,
              headers: {
                "Content-Type": "audio/wav",
              },
            });
          } catch (err: any) {
            console.error("[SARVAM ERROR]", err);
            return new Response(`Sarvam TTS failed: ${err?.message || "Unknown error"}`, {
              status: 502,
            });
          }
        }

        // ---------- OPENAI ----------
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
          return new Response("OpenAI TTS not configured", {
            status: 501,
          });
        }

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
          headers: {
            "Content-Type": "audio/mpeg",
          },
        });
      },
    },
  },
});
