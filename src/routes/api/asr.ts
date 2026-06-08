import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

export const Route = createFileRoute("/api/asr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) return Response.json({ error: "Deepgram not configured" }, { status: 501 });

        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") || "en";
        const contentType = request.headers.get("content-type") || "audio/webm";
        const audio = await request.arrayBuffer();
        if (!audio.byteLength) return Response.json({ error: "Empty audio" }, { status: 400 });

        const dgUrl = new URL("https://api.deepgram.com/v1/listen");
        dgUrl.searchParams.set("model", "nova-2");
        dgUrl.searchParams.set("language", lang.startsWith("hi") ? "hi" : "en-IN");
        dgUrl.searchParams.set("smart_format", "true");
        dgUrl.searchParams.set("punctuate", "true");

        const res = await fetch(dgUrl.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": contentType,
          },
          body: audio,
        });
        if (!res.ok) {
          return Response.json(
            { error: `Deepgram failed: ${res.status}`, detail: await res.text() },
            { status: 502 },
          );
        }
        const data = (await res.json()) as any;
        const transcript =
          data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        return Response.json({ transcript });
      },
    },
  },
});
