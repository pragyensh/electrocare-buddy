import { useEffect, useState } from "react";
import { Settings, Cpu, Mic, Volume2, Check, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type AsrProvider = "browser" | "deepgram";
export type TtsProvider = "browser" | "openai" | "sarvam";

export type ProviderStatus = {
  ai: { active: string; model: string; fallback: boolean };
  asr: { available: string[]; hasDeepgram: boolean };
  tts: { available: string[]; hasOpenAI: boolean; hasSarvam?: boolean };
};

export function SettingsPanel({
  asr,
  tts,
  onAsrChange,
  onTtsChange,
}: {
  asr: AsrProvider;
  tts: TtsProvider;
  onAsrChange: (p: AsrProvider) => void;
  onTtsChange: (p: TtsProvider) => void;
}) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/providers")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground transition hover:text-foreground"
        >
          <Settings size={16} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Providers</SheetTitle>
          <SheetDescription>
            Switch ASR / TTS providers. AI reasoning uses OpenAI when configured.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6 text-sm">
          <Section
            icon={<Cpu size={14} />}
            title="AI reasoning"
            badge={status?.ai.active ?? "…"}
            badgeOk={!!status && !status.ai.fallback}
          >
            <p className="text-xs text-muted-foreground">{status?.ai.model ?? "Checking…"}</p>
            {status?.ai.fallback && (
              <p className="mt-2 text-xs text-yellow-500">
                OPENAI_API_KEY missing — using local keyword KB fallback.
              </p>
            )}
          </Section>

          <Section icon={<Mic size={14} />} title="Speech-to-Text" badge={asr} badgeOk>
            <ProviderToggle
              value={asr}
              onChange={onAsrChange as (v: string) => void}
              options={[
                { value: "browser", label: "Browser (Web Speech)", enabled: true },
                {
                  value: "deepgram",
                  label: "Deepgram",
                  enabled: !!status?.asr.hasDeepgram,
                  hint: status && !status.asr.hasDeepgram ? "DEEPGRAM_API_KEY missing" : undefined,
                },
              ]}
            />
          </Section>

          <Section icon={<Volume2 size={14} />} title="Text-to-Speech" badge={tts} badgeOk>
            <ProviderToggle
              value={tts}
              onChange={onTtsChange as (v: string) => void}
              options={[
                {
                  value: "browser",
                  label: "Browser (speechSynthesis)",
                  enabled: true,
                },
                {
                  value: "openai",
                  label: "OpenAI (gpt-4o-mini-tts)",
                  enabled: !!status?.tts.hasOpenAI,
                  hint: status && !status.tts.hasOpenAI ? "OPENAI_API_KEY missing" : undefined,
                },
                {
                  value: "sarvam",
                  label: "Sarvam AI Hindi TTS",
                  enabled: !!status?.tts.hasSarvam,
                  hint: status && !status.tts.hasSarvam ? "SARVAM_API_KEY missing" : undefined,
                },
              ]}
            />
          </Section>

          <div className="mt-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
            Keys are read from server env: <code>OPENAI_API_KEY</code>,{" "}
            <code>DEEPGRAM_API_KEY</code>. Missing keys fall back gracefully.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon,
  title,
  badge,
  badgeOk,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeOk: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground/90">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
            badgeOk
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
          }`}
        >
          {badgeOk ? <Check size={10} /> : <X size={10} />} {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function ProviderToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; enabled: boolean; hint?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={!o.enabled}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
            value === o.value
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-[10px] text-yellow-500">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
