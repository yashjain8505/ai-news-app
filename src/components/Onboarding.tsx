"use client";

import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions";
import { TOPICS as APPETITES, LEVELS } from "@/lib/topics";

type Article = {
  id: string;
  title: string;
  source: string | null;
  summary: string | null;
  tags: string[] | null;
};

const TAGS = APPETITES.map((a) => a.tag);
const LABEL: Record<string, string> = Object.fromEntries(APPETITES.map((a) => [a.tag, a.label]));

// Picked topics seed the mix (equal share); article ratings then fine-tune it.
function computeMix(picks: Set<string>): Record<string, number> {
  const next: Record<string, number> = {};
  const n = picks.size;
  if (n === 0) TAGS.forEach((t) => (next[t] = Math.round(100 / TAGS.length)));
  else TAGS.forEach((t) => (next[t] = picks.has(t) ? Math.round(100 / n) : 0));
  return next;
}

// 5 articles for the rating step. Round-robin across the picked topics (newest
// first) so every chosen topic is represented, not just the one with the most
// recent stories; backfill with the most recent overall so there are always 5.
function pickQuiz(picks: Set<string>, pool: Article[]): Article[] {
  const buckets = [...picks].map((tag) => pool.filter((a) => (a.tags ?? []).includes(tag)));
  const seen = new Set<string>();
  const out: Article[] = [];
  let added = true;
  while (out.length < 5 && added) {
    added = false;
    for (const b of buckets) {
      const next = b.find((a) => !seen.has(a.id));
      if (next) {
        seen.add(next.id);
        out.push(next);
        added = true;
        if (out.length >= 5) break;
      }
    }
  }
  if (out.length < 5) {
    for (const a of pool) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
      if (out.length >= 5) break;
    }
  }
  return out;
}

export default function Onboarding({ name, articles = [] }: { name: string; articles?: Article[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"level" | "topics" | "rate" | "done">("level");
  const [techPref, setTechPref] = useState<number>(2);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [quiz, setQuiz] = useState<Article[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [mix, setMix] = useState<Record<string, number>>({});

  function pickLevel(pref: number) {
    setTechPref(pref);
    setPhase("topics");
  }

  function toggleTopic(tag: string) {
    setPicks((cur) => {
      const next = new Set(cur);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function finishTopics() {
    const q = pickQuiz(picks, articles);
    setQuiz(q);
    // No articles to show (empty DB) — skip straight to done with the topic mix.
    if (q.length === 0) {
      setMix(computeMix(picks));
      setPhase("done");
    } else {
      setPhase("rate");
    }
  }

  function rate(id: string, n: number) {
    setRatings((cur) => ({ ...cur, [id]: n }));
  }

  // Final weights = topic mix, nudged by each article you'd read (+) or skip (−).
  function finishRating() {
    const w = computeMix(picks);
    for (const a of quiz) {
      const r = ratings[a.id];
      if (r == null) continue;
      // 1-6 scale → −15 … +15 (3–4 is roughly neutral); nudges each of the
      // story's tags so what you'd actually read shapes the mix.
      const delta = Math.round((r - 3.5) * 6);
      for (const t of a.tags ?? []) w[t] = Math.max(0, (w[t] ?? 0) + delta);
    }
    setMix(w);
    setPhase("done");
  }

  function finish() {
    const weights: Record<string, number> = {};
    for (const t of TAGS) weights[t] = Math.round(mix[t] ?? 0);
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding({ weights, techPref });
      if (res?.ok) window.location.assign("/");
      else setError("Something went wrong saving your taste. Please try again.");
    });
  }

  const topThree = [...TAGS]
    .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))
    .slice(0, 3)
    .filter((t) => (mix[t] ?? 0) > 0);
  const levelLabel = LEVELS.find((l) => l.pref === techPref)?.label ?? "";
  const ratedCount = quiz.filter((a) => ratings[a.id] != null).length;

  const wrap: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "48px 24px 80px" };
  const ctaBtn: React.CSSProperties = {
    marginTop: 26, background: "var(--accent)", color: "var(--onAccent)", border: 0,
    padding: "12px 22px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em",
    textTransform: "uppercase", cursor: "pointer",
  };
  const stepLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 };
  const h2: React.CSSProperties = { fontSize: 26, lineHeight: 1.12, color: "var(--ink)", margin: "0 0 8px" };
  const lede: React.CSSProperties = { fontSize: 16, color: "var(--muted)", margin: "0 0 22px" };

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

      {phase === "level" && (
        <div>
          <div className="mono" style={stepLabel}>Step 1 of 3</div>
          <h2 className="display" style={h2}>How technical do you want your AI news?</h2>
          <p className="serif" style={lede}>
            This just sets how deep the stories go — a new model launch is simple news either way; only the jargon-heavy deep dives change.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {LEVELS.map((l) => (
              <button
                key={l.pref}
                onClick={() => pickLevel(l.pref)}
                style={{ textAlign: "left", padding: "16px 18px", border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <div style={{ fontSize: 17, lineHeight: 1.15 }}>{l.label}</div>
                <div className="serif" style={{ fontSize: 14, lineHeight: 1.3, marginTop: 3, color: "var(--muted)" }}>{l.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "topics" && (
        <div>
          <div className="mono" style={stepLabel}>Step 2 of 3</div>
          <h2 className="display" style={h2}>Which topics are you into?</h2>
          <p className="serif" style={lede}>
            Tap the ones you want in your feed. Pick as many as you like — next we&#8217;ll show you a few real stories from these.
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
                  <div style={{ fontSize: 12, lineHeight: 1.3, marginTop: 4, color: on ? "rgba(255,255,255,0.82)" : "var(--dim)" }}>{a.hint}</div>
                </button>
              );
            })}
          </div>
          <button onClick={finishTopics} disabled={picks.size === 0} style={{ ...ctaBtn, opacity: picks.size === 0 ? 0.4 : 1, cursor: picks.size === 0 ? "not-allowed" : "pointer" }}>
            Next &rarr;
          </button>
        </div>
      )}

      {phase === "rate" && (
        <div>
          <div className="mono" style={stepLabel}>Step 3 of 3</div>
          <h2 className="display" style={h2}>Which of these would you actually read?</h2>
          <p className="serif" style={lede}>
            Got the gist of your topics — now rate a few real stories from 1 (not for me) to 6 (love it). It shapes what your feed leans toward.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {quiz.map((a) => {
              const r = ratings[a.id];
              return (
                <div key={a.id} style={{ border: "1px solid var(--sep)", padding: "14px 16px" }}>
                  {a.source && (
                    <div className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                      {a.source}
                    </div>
                  )}
                  <div style={{ fontSize: 17, lineHeight: 1.2, color: "var(--ink)" }}>{a.title}</div>
                  {a.summary && (
                    <div className="serif" style={{ fontSize: 14, lineHeight: 1.4, color: "var(--muted)", marginTop: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {a.summary}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>Not for me</span>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>Love it</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => {
                      const on = r === n;
                      return (
                        <button
                          key={n}
                          onClick={() => rate(a.id, n)}
                          className="mono"
                          style={{ flex: 1, padding: "10px 0", fontSize: 14, border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)", cursor: "pointer" }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={finishRating}
            disabled={ratedCount < quiz.length}
            style={{ ...ctaBtn, opacity: ratedCount < quiz.length ? 0.4 : 1, cursor: ratedCount < quiz.length ? "not-allowed" : "pointer" }}
          >
            {ratedCount < quiz.length ? `Rate all ${quiz.length} (${ratedCount}/${quiz.length})` : "Done →"}
          </button>
        </div>
      )}

      {phase === "done" && (
        <div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
            You&#8217;re all set, {name.split(" ")[0]}.
          </h2>
          <p className="serif" style={{ fontSize: 17, color: "var(--muted)", margin: "14px 0 0" }}>
            Depth: <span style={{ color: "var(--ink)" }}>{levelLabel}</span>.
            {topThree.length > 0 && (
              <>
                {" "}You lean:{" "}
                <span style={{ color: "var(--ink)" }}>{topThree.map((t) => LABEL[t]).join(" · ")}</span>.
              </>
            )}
          </p>
          <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--dim)", margin: "10px 0 0" }}>
            Keep tuning it any time from the Taste page.
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
