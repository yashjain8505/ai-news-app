"use client";

import { useMemo, useState, useTransition } from "react";
import { QuizArticle } from "@/lib/types";
import { completeOnboarding } from "@/app/actions";
import { optImg } from "@/lib/img";

const CARDS = 12;

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
const LABEL: Record<string, string> = Object.fromEntries(
  APPETITES.map((a) => [a.tag, a.label])
);

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function host(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function emptyScores(): Record<string, number> {
  return Object.fromEntries(TAGS.map((t) => [t, 0]));
}

export default function Onboarding({
  articles,
  name,
}: {
  articles: QuizArticle[];
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"calibrate" | "mix" | "done">("calibrate");
  const [idx, setIdx] = useState(0);
  const [slider, setSlider] = useState(3);
  const [scores, setScores] = useState<Record<string, number>>(emptyScores());
  const [mix, setMix] = useState<Record<string, number>>({});

  const cards = useMemo(() => shuffle(articles).slice(0, CARDS), [articles]);

  function computeMix(s: Record<string, number>) {
    const raw = TAGS.map((t) => Math.max(0, s[t] ?? 0));
    const total = raw.reduce((a, b) => a + b, 0);
    const next: Record<string, number> = {};
    if (total <= 0) {
      TAGS.forEach((t) => (next[t] = Math.round(100 / TAGS.length)));
    } else {
      TAGS.forEach((t, i) => (next[t] = Math.round((raw[i] / total) * 100)));
    }
    return next;
  }

  function advance() {
    const card = cards[idx];
    const delta = slider - 3;
    const next = { ...scores };
    for (const t of card.tags ?? []) next[t] = (next[t] ?? 0) + delta;
    setScores(next);
    if (idx + 1 >= cards.length) {
      setMix(computeMix(next));
      setPhase("mix");
    } else {
      setIdx(idx + 1);
      setSlider(3);
    }
  }

  function setBar(tag: string, v: number) {
    const val = Math.max(0, Math.min(100, v));
    const others = TAGS.filter((t) => t !== tag);
    const othersTotal = others.reduce((a, t) => a + (mix[t] ?? 0), 0);
    const remaining = 100 - val;
    const next: Record<string, number> = { ...mix, [tag]: val };
    if (othersTotal > 0) {
      for (const t of others) next[t] = (mix[t] ?? 0) * (remaining / othersTotal);
    } else {
      for (const t of others) next[t] = remaining / others.length;
    }
    setMix(next);
  }

  function finish() {
    const weights: Record<string, number> = {};
    for (const t of TAGS) weights[t] = Math.round(mix[t] ?? 0);
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding({ weights });
      if (res?.ok) {
        // Hard navigation: guarantees a fresh server render of "/" so we land in
        // the feed. A soft router.push can serve the cached "redirect to
        // onboarding" payload and strand the user on this screen (they had to
        // refresh manually). A full load re-evaluates the session + taste.
        window.location.assign("/");
      } else {
        setError("Something went wrong saving your taste. Please try again.");
      }
    });
  }

  const topThree = [...TAGS]
    .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))
    .slice(0, 3);

  const wrap: React.CSSProperties = {
    maxWidth: 620,
    margin: "0 auto",
    padding: "48px 24px 80px",
  };

  return (
    <main style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
        <span aria-hidden className="display" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "var(--accent)", color: "var(--onAccent)", fontSize: 18, lineHeight: 1 }}>
          W
        </span>
        <span className="display" style={{ fontSize: 24, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink)" }}>
          Wortins
        </span>
      </div>

      {phase === "calibrate" && cards[idx] && (
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
            Article {idx + 1} of {cards.length}
          </div>
          <div style={{ height: 3, background: "var(--rule)", marginBottom: 26 }}>
            <div style={{ height: 3, background: "var(--accent)", width: `${((idx + 1) / cards.length) * 100}%` }} />
          </div>
          <h2 className="display" style={{ fontSize: 22, lineHeight: 1.1, color: "var(--ink)", margin: "0 0 18px" }}>
            Would you read this?
          </h2>

          <div style={{ border: "1px solid var(--rule)", background: "var(--ph1)" }}>
            {cards[idx].image_url && (
              <div className="news-photo" style={{ aspectRatio: "16/9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optImg(cards[idx].image_url, 900) ?? ""}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="news-photo__screen" />
              </div>
            )}
            <div style={{ padding: "16px 18px" }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)" }}>
                {host(cards[idx].url)}
              </div>
              <h3 className="display" style={{ fontSize: 24, lineHeight: 1.12, color: "var(--ink)", margin: "8px 0 0" }}>
                {cards[idx].title}
              </h3>
              {cards[idx].summary && (
                <p className="serif" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--muted)", margin: "10px 0 0" }}>
                  {cards[idx].summary}
                </p>
              )}
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 15, color: "var(--ink)" }}>How likely are you to read this?</span>
              <span className="mono" style={{ fontSize: 14, color: "var(--accent)" }}>{slider}</span>
            </div>
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)" }}>Skip</span>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)" }}>Definitely</span>
            </div>
          </div>

          <button
            onClick={advance}
            style={{ marginTop: 24, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "12px 22px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
          >
            {idx + 1 >= cards.length ? "See my mix" : "Next"}
          </button>
        </div>
      )}

      {phase === "mix" && (
        <div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
            Your mix
          </h2>
          <p className="serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--muted)", margin: "10px 0 24px" }}>
            Here&#8217;s what we picked up. Drag any bar to tune the intensity, it always totals 100%.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            onClick={() => setPhase("done")}
            style={{ marginTop: 28, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "12px 22px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
          >
            Continue
          </button>
        </div>
      )}

      {phase === "done" && (
        <div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
            You&#8217;re all set, {name.split(" ")[0]}.
          </h2>
          <p className="serif" style={{ fontSize: 17, color: "var(--muted)", margin: "14px 0 0" }}>
            You lean:{" "}
            <span style={{ color: "var(--ink)" }}>
              {topThree.map((t) => `${LABEL[t]} ${Math.round(mix[t] ?? 0)}%`).join(" · ")}
            </span>
            .
          </p>
          <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--dim)", margin: "10px 0 0" }}>
            Keep tuning it any time by reacting as you read.
          </p>
          <button
            disabled={pending}
            onClick={finish}
            style={{ marginTop: 26, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "12px 22px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", opacity: pending ? 0.5 : 1 }}
          >
            {pending ? "Building your briefing…" : "Enter Wortins"}
          </button>
          {error && (
            <p className="serif" style={{ fontSize: 14, color: "var(--accent)", margin: "14px 0 0" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
