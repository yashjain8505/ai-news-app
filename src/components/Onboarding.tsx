"use client";

import { useMemo, useState, useTransition } from "react";
import { QuizArticle } from "@/lib/types";
import { completeOnboarding } from "@/app/actions";
import { optImg } from "@/lib/img";
import { TOPICS as APPETITES } from "@/lib/topics";

const CARDS = 5; // real stories to rate after picking topics
const TOPIC_SEED = 3; // base weight each topic you pick starts with

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
  const [phase, setPhase] = useState<"topics" | "calibrate" | "done">("topics");
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
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

  function toggleTopic(tag: string) {
    setPicks((cur) => {
      const next = new Set(cur);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // Topics chosen → seed the score for each, then rate a few real stories.
  function startCalibrate() {
    const seeded = emptyScores();
    picks.forEach((t) => (seeded[t] = TOPIC_SEED));
    setScores(seeded);
    setPhase("calibrate");
  }

  // A 1–6 rating on the current story: 6 loves it (+2.5), 1 skips it (−2.5).
  function rate(n: number) {
    const card = cards[idx];
    const delta = n - 3.5;
    const next = { ...scores };
    for (const t of card.tags ?? []) next[t] = (next[t] ?? 0) + delta;
    setScores(next);
    if (idx + 1 >= cards.length) {
      setMix(computeMix(next));
      setPhase("done");
    } else {
      setIdx(idx + 1);
    }
  }

  function finish() {
    const weights: Record<string, number> = {};
    for (const t of TAGS) weights[t] = Math.round(mix[t] ?? 0);
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding({ weights });
      if (res?.ok) {
        // Hard navigation guarantees a fresh server render of "/" (a soft push can
        // serve the cached "redirect to onboarding" payload and strand the user).
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

  const ctaBtn: React.CSSProperties = {
    marginTop: 26,
    background: "var(--accent)",
    color: "var(--onAccent)",
    border: 0,
    padding: "12px 22px",
    fontFamily: "inherit",
    fontSize: 14,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
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

      {phase === "topics" && (
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
            Step 1 of 2
          </div>
          <h2 className="display" style={{ fontSize: 26, lineHeight: 1.12, color: "var(--ink)", margin: "0 0 8px" }}>
            What do you like reading about in AI?
          </h2>
          <p className="serif" style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 22px" }}>
            Tap the topics you want in your feed. Pick as many as you like — you can change this anytime.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {APPETITES.map((a) => {
              const on = picks.has(a.tag);
              return (
                <button
                  key={a.tag}
                  onClick={() => toggleTopic(a.tag)}
                  style={{ textAlign: "left", padding: "14px 16px", border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <div style={{ fontSize: 16, lineHeight: 1.15 }}>{a.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.3, marginTop: 4, color: on ? "rgba(255,255,255,0.82)" : "var(--dim)" }}>
                    {a.hint}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={startCalibrate} disabled={picks.size === 0} style={{ ...ctaBtn, opacity: picks.size === 0 ? 0.4 : 1, cursor: picks.size === 0 ? "not-allowed" : "pointer" }}>
            Next &rarr;
          </button>
        </div>
      )}

      {phase === "calibrate" && cards[idx] && (
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
            Step 2 of 2 · Story {idx + 1} of {cards.length}
          </div>
          <div style={{ height: 3, background: "var(--rule)", marginBottom: 20 }}>
            <div style={{ height: 3, background: "var(--accent)", width: `${((idx + 1) / cards.length) * 100}%` }} />
          </div>
          <h2 className="display" style={{ fontSize: 22, lineHeight: 1.14, color: "var(--ink)", margin: "0 0 4px" }}>
            Got the gist of your topics.
          </h2>
          <p className="serif" style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 18px" }}>
            Now tell us which of these you&#8217;d actually read — rate each 1 to 6.
          </p>

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
            <div style={{ fontSize: 15, color: "var(--ink)", marginBottom: 10 }}>
              How likely are you to read this?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => rate(n)}
                  aria-label={`Rate ${n} of 6`}
                  className="mono"
                  style={{ flex: 1, height: 48, fontSize: 17, border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)" }}>1 · Skip</span>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)" }}>6 · Love it</span>
            </div>
          </div>
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
          <button disabled={pending} onClick={finish} style={{ ...ctaBtn, opacity: pending ? 0.5 : 1 }}>
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
