"use client";

import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions";
import { TOPICS as APPETITES, LEVELS } from "@/lib/topics";

const TAGS = APPETITES.map((a) => a.tag);
const LABEL: Record<string, string> = Object.fromEntries(
  APPETITES.map((a) => [a.tag, a.label])
);

// Liked topics become the taste mix: each liked topic gets an equal share.
function computeMix(picks: Set<string>): Record<string, number> {
  const next: Record<string, number> = {};
  const n = picks.size;
  if (n === 0) {
    TAGS.forEach((t) => (next[t] = Math.round(100 / TAGS.length)));
  } else {
    TAGS.forEach((t) => (next[t] = picks.has(t) ? Math.round(100 / n) : 0));
  }
  return next;
}

export default function Onboarding({ name }: { name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"level" | "like" | "dislike" | "done">("level");
  const [techPref, setTechPref] = useState<number>(2);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [dislikes, setDislikes] = useState<Set<string>>(new Set());
  const [mix, setMix] = useState<Record<string, number>>({});

  function pickLevel(pref: number) {
    setTechPref(pref);
    setPhase("like");
  }

  function toggleLike(tag: string) {
    setLikes((cur) => {
      const next = new Set(cur);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleDislike(tag: string) {
    setDislikes((cur) => {
      const next = new Set(cur);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function finishLike() {
    // If they liked everything there's nothing left to exclude — skip ahead.
    const remaining = TAGS.filter((t) => !likes.has(t));
    if (remaining.length === 0) {
      setMix(computeMix(likes));
      setPhase("done");
    } else {
      setPhase("dislike");
    }
  }

  function finishDislike() {
    setMix(computeMix(likes));
    setPhase("done");
  }

  function finish() {
    const weights: Record<string, number> = {};
    for (const t of TAGS) weights[t] = Math.round(mix[t] ?? 0);
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding({
        weights,
        techPref,
        dislikes: [...dislikes],
      });
      if (res?.ok) {
        window.location.assign("/");
      } else {
        setError("Something went wrong saving your taste. Please try again.");
      }
    });
  }

  const remaining = APPETITES.filter((a) => !likes.has(a.tag));
  const topThree = [...TAGS]
    .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))
    .slice(0, 3)
    .filter((t) => (mix[t] ?? 0) > 0);
  const levelLabel = LEVELS.find((l) => l.pref === techPref)?.label ?? "";

  const wrap: React.CSSProperties = { maxWidth: 620, margin: "0 auto", padding: "48px 24px 80px" };
  const ctaBtn: React.CSSProperties = {
    marginTop: 26, background: "var(--accent)", color: "var(--onAccent)", border: 0,
    padding: "12px 22px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em",
    textTransform: "uppercase", cursor: "pointer",
  };
  const stepLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10,
  };
  const h2: React.CSSProperties = {
    fontSize: 26, lineHeight: 1.12, color: "var(--ink)", margin: "0 0 8px",
  };
  const lede: React.CSSProperties = {
    fontSize: 16, color: "var(--muted)", margin: "0 0 22px",
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

      {phase === "like" && (
        <div>
          <div className="mono" style={stepLabel}>Step 2 of 3</div>
          <h2 className="display" style={h2}>What do you like reading about?</h2>
          <p className="serif" style={lede}>
            Tap the ones you actually want more of. Pick as many as you like.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {APPETITES.map((a) => {
              const on = likes.has(a.tag);
              return (
                <button
                  key={a.tag}
                  onClick={() => toggleLike(a.tag)}
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
          <button onClick={finishLike} disabled={likes.size === 0} style={{ ...ctaBtn, opacity: likes.size === 0 ? 0.4 : 1, cursor: likes.size === 0 ? "not-allowed" : "pointer" }}>
            Next &rarr;
          </button>
        </div>
      )}

      {phase === "dislike" && (
        <div>
          <div className="mono" style={stepLabel}>Step 3 of 3</div>
          <h2 className="display" style={h2}>Anything you&#8217;d rather not read about?</h2>
          <p className="serif" style={lede}>
            Tap anything you want to see less of — we&#8217;ll keep it out of your feed. Or skip this; it&#8217;s optional.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {remaining.map((a) => {
              const on = dislikes.has(a.tag);
              return (
                <button
                  key={a.tag}
                  onClick={() => toggleDislike(a.tag)}
                  style={{ textAlign: "left", padding: "14px 16px", border: on ? "1px solid var(--ink)" : "1px solid var(--sep)", background: on ? "var(--ink)" : "transparent", color: on ? "var(--bg)" : "var(--muted)", cursor: "pointer", fontFamily: "inherit", opacity: on ? 1 : 0.9 }}
                >
                  <div style={{ fontSize: 16, lineHeight: 1.15, textDecoration: on ? "line-through" : "none" }}>{a.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.3, marginTop: 4, color: on ? "rgba(255,255,255,0.7)" : "var(--dim)" }}>
                    {a.hint}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={finishDislike} style={ctaBtn}>
            {dislikes.size === 0 ? "Skip →" : "Done →"}
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
                <span style={{ color: "var(--ink)" }}>
                  {topThree.map((t) => LABEL[t]).join(" · ")}
                </span>
                .
              </>
            )}
            {dislikes.size > 0 && (
              <>
                {" "}Muting:{" "}
                <span style={{ color: "var(--ink)" }}>
                  {[...dislikes].map((t) => LABEL[t]).join(" · ")}
                </span>
                .
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
