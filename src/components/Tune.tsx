"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMix, reviseReaction } from "@/app/actions";

type Reaction = {
  itemId: string;
  action: "like" | "less" | "neutral";
  title: string;
  source: string | null;
  tags: string[];
};

const APPETITES: { tag: string; label: string }[] = [
  { tag: "lab-power", label: "Big-lab power plays" },
  { tag: "strategy", label: "Strategy & analysis" },
  { tag: "drama", label: "Drama & personalities" },
  { tag: "tools", label: "New tools" },
  { tag: "economics", label: "Money, deals & funding" },
  { tag: "policy", label: "Policy & regulation" },
  { tag: "regional", label: "Global & regional" },
  { tag: "technical", label: "Technical & research" },
  { tag: "culture", label: "Culture & society" },
  { tag: "future-of-work", label: "Jobs & future of work" },
];
const TAGS = APPETITES.map((a) => a.tag);
const CHOICES: { v: "less" | "neutral" | "like"; label: string }[] = [
  { v: "less", label: "Bad" },
  { v: "neutral", label: "Neutral" },
  { v: "like", label: "Good" },
];

export default function Tune({
  weights,
  reactions,
}: {
  weights: Record<string, number>;
  reactions: Reaction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mix, setMix] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    TAGS.forEach((t) => (m[t] = Math.round(weights[t] ?? 0)));
    return m;
  });
  const [rx, setRx] = useState<Reaction[]>(reactions);
  const [saved, setSaved] = useState(false);

  function setBar(tag: string, v: number) {
    const val = Math.max(0, Math.min(100, v));
    const others = TAGS.filter((t) => t !== tag);
    const othersTotal = others.reduce((a, t) => a + (mix[t] ?? 0), 0);
    const remaining = 100 - val;
    const next: Record<string, number> = { ...mix, [tag]: val };
    if (othersTotal > 0) for (const t of others) next[t] = (mix[t] ?? 0) * (remaining / othersTotal);
    else for (const t of others) next[t] = remaining / others.length;
    setMix(next);
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      await saveMix(mix);
      setSaved(true);
    });
  }

  function flip(i: number, next: "like" | "less" | "neutral") {
    const r = rx[i];
    if (r.action === next) return;
    reviseReaction(r.itemId, r.tags, r.action, next);
    setRx((cur) => cur.map((x, j) => (j === i ? { ...x, action: next } : x)));
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <span className="display" style={{ fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink)" }}>
          Tune
        </span>
        <button
          onClick={() => router.push("/")}
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", padding: "6px 13px", cursor: "pointer" }}
        >
          &#8249; Back to feed
        </button>
      </div>

      <h1 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
        Your mix
      </h1>
      <p className="serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--muted)", margin: "8px 0 22px" }}>
        Drag any bar to change what your feed leans toward. It always totals 100%.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {APPETITES.map((a) => (
          <div key={a.tag}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, color: "var(--ink)" }}>{a.label}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>
                {Math.round(mix[a.tag] ?? 0)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(mix[a.tag] ?? 0)}
              onChange={(e) => setBar(a.tag, Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent)", marginTop: 4 }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={pending}
        style={{ marginTop: 22, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "11px 22px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", opacity: pending ? 0.5 : 1 }}
      >
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save mix"}
      </button>

      <div style={{ borderTop: "3px double var(--ruleStrong)", margin: "44px 0 0" }} />
      <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, color: "var(--ink)", margin: "28px 0 4px" }}>
        Recent reactions
      </h2>
      <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)", margin: "0 0 20px" }}>
        Mis-clicked or changed your mind? Set it straight.
      </p>
      {rx.length === 0 ? (
        <p className="mono" style={{ fontSize: 12, color: "var(--faint)" }}>
          No reactions yet. React to a few stories and they will show up here.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rx.map((r, i) => (
            <div
              key={`${r.itemId}-${i}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: i === rx.length - 1 ? "none" : "1px solid var(--rule)" }}
            >
              <div style={{ minWidth: 0 }}>
                {r.source && (
                  <div className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>
                    {r.source}
                  </div>
                )}
                <div style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.25 }}>{r.title}</div>
              </div>
              <div style={{ display: "flex", flexShrink: 0, border: "1px solid var(--sep)" }}>
                {CHOICES.map((c) => {
                  const on = r.action === c.v;
                  return (
                    <button
                      key={c.v}
                      onClick={() => flip(i, c.v)}
                      className="mono"
                      style={{ fontSize: 11, padding: "6px 10px", border: 0, borderLeft: c.v === "less" ? "0" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--dim)", cursor: "pointer" }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
