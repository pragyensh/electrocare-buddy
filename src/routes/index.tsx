import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Languages, Bot, User, Volume2, Wrench, RotateCcw, Send } from "lucide-react";
import { SettingsPanel, type AsrProvider, type TtsProvider } from "@/components/SettingsPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ElectroCare — Bilingual Voice Support for Home Appliances" },
      {
        name: "description",
        content:
          "Tap to talk: troubleshoot AC, washing machine, fridge, microwave and geyser problems in English or Hindi.",
      },
      { property: "og:title", content: "ElectroCare Voice Support" },
      {
        property: "og:description",
        content: "Bilingual (EN/HI) voice troubleshooting for everyday electrical equipment.",
      },
    ],
  }),
  component: Index,
});

type Lang = "en-IN" | "hi-IN";
type Status = "idle" | "listening" | "thinking" | "speaking" | "error";
type Msg = { id: string; role: "user" | "assistant"; text: string };

const COPY = {
  "en-IN": {
    label: "English",
    greeting: "Hi! I'm ElectroCare. Tap the mic and tell me what's wrong with your appliance.",
    placeholder: "Type your problem or tap the mic…",
    tapStart: "Tap to speak",
    tapStop: "Tap to stop",
    status: {
      idle: "Idle",
      listening: "Listening…",
      thinking: "Thinking…",
      speaking: "Speaking…",
      error: "Error",
    },
    quick: [
      "My AC is not cooling",
      "Washing machine is leaking",
      "Fridge is making noise",
      "Geyser has no hot water",
    ],
    you: "You",
    bot: "ElectroCare",
    listeningHint: "Listening — speak now",
    reset: "New conversation",
    noSpeech: "Speech recognition isn't supported in this browser. You can still type.",
  },
  "hi-IN": {
    label: "हिंदी",
    greeting:
      "Namaste! Main ElectroCare hoon. Mic dabakar batayein appliance mein kya problem hai.",
    placeholder: "Apni problem likhein ya mic dabayein…",
    tapStart: "Bolne ke liye dabayein",
    tapStop: "Rokne ke liye dabayein",
    status: {
      idle: "Taiyaar",
      listening: "Sun raha hoon…",
      thinking: "Soch raha hoon…",
      speaking: "Bol raha hoon…",
      error: "Error",
    },
    quick: [
      "Mera AC cooling nahi kar raha",
      "Washing machine leak ho rahi hai",
      "Fridge se awaaz aa rahi hai",
      "Geyser garam paani nahi de raha",
    ],
    you: "Aap",
    bot: "ElectroCare",
    listeningHint: "Sun raha hoon — abhi boliye",
    reset: "Nayi baatcheet",
    noSpeech: "Is browser mein speech recognition support nahi hai. Aap type kar sakte hain.",
  },
} as const;

function Index() {
  const [lang, setLang] = useState<Lang>("en-IN");
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [asrProvider, setAsrProvider] = useState<AsrProvider>("browser");
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("browser");
  const t = COPY[lang];
  const [messages, setMessages] = useState<Msg[]>([
    { id: crypto.randomUUID(), role: "assistant", text: COPY["en-IN"].greeting },
  ]);

  const recognitionRef = useRef<any>(null);
  const finalRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speechSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim]);

  useEffect(() => {
    // Update greeting on language change (only the lead greeting)
    setMessages((prev) => {
      const rest = prev.slice(1);
      return [{ id: crypto.randomUUID(), role: "assistant", text: t.greeting }, ...rest];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function startListening() {
    setError("");
    setInterim("");
    finalRef.current = "";

    if (asrProvider === "deepgram") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const mr = new MediaRecorder(stream, { mimeType: mime });
        mediaChunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) mediaChunksRef.current.push(e.data);
        };
        mr.onstop = async () => {
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          const blob = new Blob(mediaChunksRef.current, { type: mime });
          if (!blob.size) {
            setStatus("idle");
            return;
          }
          setStatus("thinking");
          try {
            const res = await fetch(`/api/asr?lang=${encodeURIComponent(lang)}`, {
              method: "POST",
              headers: { "Content-Type": mime },
              body: blob,
            });
            const data = (await res.json()) as { transcript?: string; error?: string };
            if (!res.ok) throw new Error(data.error || `ASR ${res.status}`);
            const txt = (data.transcript || "").trim();
            if (txt) void ask(txt);
            else setStatus("idle");
          } catch (e: any) {
            setStatus("error");
            setError(e.message || "Deepgram failed");
          }
        };
        mediaRecorderRef.current = mr;
        mr.start();
        setStatus("listening");
      } catch (e: any) {
        setStatus("error");
        setError(e.message || "Microphone permission denied");
      }
      return;
    }

    if (!speechSupported) {
      setStatus("error");
      setError(t.noSpeech);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setStatus("listening");
    rec.onerror = (e: any) => {
      setStatus("error");
      setError(e.error ? `Mic error: ${e.error}` : "Microphone error");
    };
    rec.onresult = (event: any) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const txt = r[0]?.transcript || "";
        if (r.isFinal) finalRef.current = (finalRef.current + " " + txt).trim();
        else live = (live + " " + txt).trim();
      }
      setInterim(finalRef.current || live);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      const finalText = finalRef.current.trim();
      setInterim("");
      if (finalText) void ask(finalText);
      else setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = rec;
    rec.start();
  }

  function stopListening() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      return;
    }
    recognitionRef.current?.stop();
  }

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text: clean };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setStatus("thinking");
    setError("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, lang }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = (await res.json()) as { answer: string };
      const botMsg: Msg = { id: crypto.randomUUID(), role: "assistant", text: data.answer };
      setMessages((m) => [...m, botMsg]);
      void speak(data.answer);
    } catch (e: any) {
      setStatus("error");
      setError(e.message || "Request failed");
    }
  }

  async function speak(text: string) {
    if (ttsProvider === "openai") {
      try {
        setStatus("speaking");
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current?.pause();
        audioRef.current = audio;
        audio.onended = () => {
          setStatus("idle");
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setStatus("idle");
          URL.revokeObjectURL(url);
        };
        await audio.play();
        return;
      } catch {
        // fall through to browser TTS
      }
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setStatus("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = lang === "hi-IN" ? 0.94 : 0.98;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((vv) => vv.lang?.toLowerCase().startsWith(lang.toLowerCase()));
    if (v) u.voice = v;
    u.onstart = () => setStatus("speaking");
    u.onend = () => setStatus("idle");
    u.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(u);
  }

  function reset() {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setStatus("idle");
    setInterim("");
    setError("");
    setDraft("");
    setMessages([{ id: crypto.randomUUID(), role: "assistant", text: t.greeting }]);
  }

  const isListening = status === "listening";

  return (
    <div className="min-h-screen text-foreground" style={{ background: "var(--gradient-bg)" }}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <Wrench size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">ElectroCare</h1>
              <p className="text-xs text-muted-foreground">
                Bilingual voice support for home appliances
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SettingsPanel
              asr={asrProvider}
              tts={ttsProvider}
              onAsrChange={setAsrProvider}
              onTtsChange={setTtsProvider}
            />
            <button
              onClick={reset}
              className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground sm:inline-flex"
              type="button"
            >
              <RotateCcw size={14} /> {t.reset}
            </button>
          </div>
        </header>

        {/* Controls row */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1 text-sm">
            <Languages size={16} className="ml-2 text-muted-foreground" />
            {(["en-IN", "hi-IN"] as Lang[]).map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  lang === code
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                type="button"
              >
                {COPY[code].label}
              </button>
            ))}
          </div>

          <StatusPill status={status} label={t.status[status]} />
        </div>

        {/* Chat */}
        <div
          ref={scrollRef}
          className="mb-4 flex-1 overflow-y-auto rounded-3xl border border-border bg-card/50 p-4 backdrop-blur"
          style={{ boxShadow: "var(--shadow-card)", minHeight: "50vh" }}
        >
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} youLabel={t.you} botLabel={t.bot} />
            ))}
            {status === "thinking" && (
              <div className="flex items-center gap-2 pl-12 text-sm text-muted-foreground">
                <span className="inline-flex gap-1">
                  <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                </span>
              </div>
            )}
            {isListening && interim && (
              <div className="ml-auto max-w-[80%] rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm italic text-primary">
                {interim}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {/* Quick prompts */}
        <div className="mb-3 flex flex-wrap gap-2">
          {t.quick.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              type="button"
              className="rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Composer */}
        <form
          className="flex items-end gap-3 rounded-3xl border border-border bg-card/60 p-3"
          style={{ boxShadow: "var(--shadow-card)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <button
            type="button"
            aria-label={isListening ? t.tapStop : t.tapStart}
            onClick={isListening ? stopListening : startListening}
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-primary-foreground transition active:scale-95 ${
              isListening ? "mic-pulse" : ""
            }`}
            style={{
              background: isListening
                ? "linear-gradient(135deg, oklch(0.7 0.24 25), oklch(0.78 0.2 15))"
                : "var(--gradient-primary)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {isListening ? <MicOff size={26} /> : <Mic size={26} />}
          </button>

          <div className="flex flex-1 flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              {isListening ? t.listeningHint : t.tapStart}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.placeholder}
                className="flex-1 rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </form>

        <button
          onClick={reset}
          className="mt-4 inline-flex items-center justify-center gap-2 self-center rounded-full px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground sm:hidden"
          type="button"
        >
          <RotateCcw size={14} /> {t.reset}
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg, youLabel, botLabel }: { msg: Msg; youLabel: string; botLabel: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser ? "var(--secondary)" : "var(--gradient-primary)",
          color: isUser ? "var(--secondary-foreground)" : "var(--primary-foreground)",
        }}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {isUser ? youLabel : botLabel}
        </span>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border border-border bg-card text-card-foreground"
          }`}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, label }: { status: Status; label: string }) {
  const color =
    status === "listening"
      ? "oklch(0.72 0.22 25)"
      : status === "thinking"
        ? "oklch(0.8 0.18 70)"
        : status === "speaking"
          ? "oklch(0.78 0.16 195)"
          : status === "error"
            ? "oklch(0.65 0.24 25)"
            : "oklch(0.7 0.03 250)";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs">
      {status === "listening" ? (
        <span className="inline-flex h-4 items-end gap-[2px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="bar inline-block w-[2px] rounded-full"
              style={{ height: "100%", background: color }}
            />
          ))}
        </span>
      ) : status === "speaking" ? (
        <Volume2 size={14} style={{ color }} />
      ) : (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
      )}
      <span className="text-foreground/90">{label}</span>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-muted-foreground"
      style={{ animation: "wave 1s ease-in-out infinite", animationDelay: `${delay}s` }}
    />
  );
}
