"use client";

import { useEffect, useState, useTransition } from "react";
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REFERRALS = [
  "Twitter / X",
  "LinkedIn",
  "Substack or newsletter",
  "Google search",
  "Friend or colleague",
  "Reddit",
  "Other",
];

// Status lines the curating animation cycles through while the taste saves.
const CURATE_STEPS = [
  "Reading today's edition",
  "Matching your topics",
  "Ranking the stories for you",
  "Assembling your briefing",
];

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

type Phase = "profile" | "level" | "topics" | "rate" | "review" | "curating" | "ready";

export default function Onboarding({
  name,
  email = "",
  articles = [],
}: {
  name: string;
  email?: string;
  articles?: Article[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("profile");

  // Profile step.
  const [fullName, setFullName] = useState(name ?? "");
  const [contactEmail, setContactEmail] = useState(email ?? "");
  const [phone, setPhone] = useState("");
  const [referral, setReferral] = useState<string>("");
  const [referralOther, setReferralOther] = useState("");

  // Taste steps.
  const [techPref, setTechPref] = useState<number>(2);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [quiz, setQuiz] = useState<Article[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [mix, setMix] = useState<Record<string, number>>({});

  // Curating animation cursor.
  const [curateStep, setCurateStep] = useState(0);
  useEffect(() => {
    if (phase !== "curating") return;
    setCurateStep(0);
    const t = setInterval(() => setCurateStep((s) => Math.min(s + 1, CURATE_STEPS.length - 1)), 950);
    return () => clearInterval(t);
  }, [phase]);

  const nameOk = fullName.trim().length >= 2;
  const emailOk = EMAIL_RE.test(contactEmail.trim());
  const referralOk = referral !== "" && (referral !== "Other" || referralOther.trim().length > 0);
  const profileOk = nameOk && emailOk && referralOk;

  function submitProfile() {
    if (!profileOk) return;
    setPhase("level");
  }

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
    if (q.length === 0) {
      setMix(computeMix(picks));
      setPhase("review");
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
      const delta = Math.round((r - 3.5) * 6);
      for (const t of a.tags ?? []) w[t] = Math.max(0, (w[t] ?? 0) + delta);
    }
    setMix(w);
    setPhase("review");
  }

  // Save everything, then play the curating animation for a beat (min ~3.4s so
  // it reads as "working"), land on "This is your briefing", then enter.
  function finish() {
    const weights: Record<string, number> = {};
    for (const t of TAGS) weights[t] = Math.round(mix[t] ?? 0);
    const referralSource = referral === "Other" ? referralOther.trim() : referral;
    setError(null);
    setPhase("curating");
    const started = Date.now();
    startTransition(async () => {
      const res = await completeOnboarding({
        weights,
        techPref,
        profile: {
          fullName: fullName.trim(),
          email: contactEmail.trim(),
          phone: phone.trim(),
          referralSource,
        },
      });
      const wait = Math.max(0, 3400 - (Date.now() - started));
      if (res?.ok) {
        setTimeout(() => {
          setPhase("ready");
          setTimeout(() => window.location.assign("/"), 1300);
        }, wait);
      } else {
        setPhase("review");
        setError("Something went wrong saving your details. Please try again.");
      }
    });
  }

  const topThree = [...TAGS]
    .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))
    .slice(0, 3)
    .filter((t) => (mix[t] ?? 0) > 0);
  const levelLabel = LEVELS.find((l) => l.pref === techPref)?.label ?? "";
  const ratedCount = quiz.filter((a) => ratings[a.id] != null).length;
  const firstName = (fullName.trim() || name).split(" ")[0];

  const wrap: React.CSSProperties = { maxWidth: 560, margin: "0 auto", padding: "48px 24px 80px" };
  const ctaBtn: React.CSSProperties = {
    marginTop: 26, background: "var(--accent)", color: "var(--onAccent)", border: 0,
    padding: "13px 24px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
  const stepLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 };
  const h2: React.CSSProperties = { fontSize: 26, lineHeight: 1.12, color: "var(--ink)", margin: "0 0 8px" };
  const lede: React.CSSProperties = { fontSize: 16, color: "var(--muted)", margin: "0 0 22px" };
  const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)", margin: "0 0 6px" };
  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "var(--bg)", border: "1px solid var(--ruleStrong)",
    color: "var(--ink)", padding: "12px 14px", fontFamily: "inherit", fontSize: 15,
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

      {phase === "profile" && (
        <div>
          <div className="mono" style={stepLabel}>Step 1 of 4</div>
          <h2 className="display" style={h2}>First, a little about you.</h2>
          <p className="serif" style={lede}>
            So we know who we&#8217;re building the briefing for. We&#8217;ll only ever use this to run your account.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label className="mono" style={fieldLabel} htmlFor="ob-name">Full name</label>
              <input id="ob-name" style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
            <div>
              <label className="mono" style={fieldLabel} htmlFor="ob-email">Email address</label>
              <input id="ob-email" style={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com" type="email" inputMode="email" autoComplete="email" />
            </div>
            <div>
              <label className="mono" style={fieldLabel} htmlFor="ob-phone">
                Phone number <span style={{ color: "var(--faint)" }}>(optional)</span>
              </label>
              <input id="ob-phone" style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" type="tel" inputMode="tel" autoComplete="tel" />
            </div>
            <div>
              <span className="mono" style={fieldLabel}>Where did you hear about us?</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REFERRALS.map((r) => {
                  const on = referral === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReferral(r)}
                      className="mono bs-tap"
                      style={{ fontSize: 12, letterSpacing: "0.03em", padding: "8px 14px", border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)" }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              {referral === "Other" && (
                <input style={{ ...input, marginTop: 10 }} value={referralOther} onChange={(e) => setReferralOther(e.target.value)} placeholder="Tell us where" />
              )}
            </div>
          </div>
          <button
            onClick={submitProfile}
            disabled={!profileOk}
            className="bs-tap"
            style={{ ...ctaBtn, opacity: profileOk ? 1 : 0.4, cursor: profileOk ? "pointer" : "not-allowed" }}
          >
            Continue &rarr;
          </button>
          {!profileOk && (nameOk || emailOk) && (
            <p className="serif" style={{ fontSize: 13, color: "var(--dim)", margin: "12px 0 0" }}>
              {!nameOk ? "Add your name" : !emailOk ? "Enter a valid email" : "Pick where you heard about us"} to continue.
            </p>
          )}
        </div>
      )}

      {phase === "level" && (
        <div>
          <div className="mono" style={stepLabel}>Step 2 of 4</div>
          <h2 className="display" style={h2}>How technical do you want your AI news?</h2>
          <p className="serif" style={lede}>
            This just sets how deep the stories go. A new model launch is simple news either way; only the jargon-heavy deep dives change.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {LEVELS.map((l) => (
              <button
                key={l.pref}
                onClick={() => pickLevel(l.pref)}
                className="bs-tap"
                style={{ textAlign: "left", padding: "16px 18px", border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", fontFamily: "inherit" }}
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
          <div className="mono" style={stepLabel}>Step 3 of 4</div>
          <h2 className="display" style={h2}>Which topics are you into?</h2>
          <p className="serif" style={lede}>
            Tap the ones you want in your feed. Pick as many as you like, next we&#8217;ll show you a few real stories from these.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {APPETITES.map((a) => {
              const on = picks.has(a.tag);
              return (
                <button
                  key={a.tag}
                  onClick={() => toggleTopic(a.tag)}
                  className="bs-tap"
                  style={{ textAlign: "left", padding: "14px 16px", border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)", fontFamily: "inherit" }}
                >
                  <div style={{ fontSize: 16, lineHeight: 1.15 }}>{a.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.3, marginTop: 4, color: on ? "rgba(255,255,255,0.82)" : "var(--dim)" }}>{a.hint}</div>
                </button>
              );
            })}
          </div>
          <button onClick={finishTopics} disabled={picks.size === 0} className="bs-tap" style={{ ...ctaBtn, opacity: picks.size === 0 ? 0.4 : 1, cursor: picks.size === 0 ? "not-allowed" : "pointer" }}>
            Next &rarr;
          </button>
        </div>
      )}

      {phase === "rate" && (
        <div>
          <div className="mono" style={stepLabel}>Step 4 of 4</div>
          <h2 className="display" style={h2}>Which of these would you actually read?</h2>
          <p className="serif" style={lede}>
            Got the gist of your topics, now rate a few real stories from 1 (not for me) to 6 (love it). It shapes what your feed leans toward.
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
                          className="mono bs-tap"
                          style={{ flex: 1, padding: "10px 0", fontSize: 14, border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)" }}
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
            className="bs-tap"
            style={{ ...ctaBtn, opacity: ratedCount < quiz.length ? 0.4 : 1, cursor: ratedCount < quiz.length ? "not-allowed" : "pointer" }}
          >
            {ratedCount < quiz.length ? `Rate all ${quiz.length} (${ratedCount}/${quiz.length})` : "Done →"}
          </button>
        </div>
      )}

      {phase === "review" && (
        <div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
            You&#8217;re all set, {firstName}.
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
            Keep tuning it any time from the Account page.
          </p>
          <button disabled={pending} onClick={finish} className="bs-tap" style={{ ...ctaBtn, opacity: pending ? 0.5 : 1 }}>
            Build my briefing
          </button>
          {error && (
            <p className="serif" style={{ fontSize: 14, color: "var(--accent)", margin: "14px 0 0" }}>
              {error}
            </p>
          )}
        </div>
      )}

      {phase === "curating" && (
        <div style={{ padding: "20px 0 0" }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
            Curating
          </div>
          <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink)", margin: "8px 0 26px" }}>
            Building your briefing&#8230;
          </h2>

          {/* progress bar */}
          <div style={{ height: 4, background: "var(--rule)", overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--accent)", animation: "bsfill 3.4s ease-in-out forwards" }} />
          </div>

          {/* cycling status lines */}
          <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
            {CURATE_STEPS.map((s, i) => {
              const active = i === curateStep;
              const done = i < curateStep;
              return (
                <li key={s} className="mono" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: active ? "var(--ink)" : done ? "var(--dim)" : "var(--faint)", opacity: i <= curateStep ? 1 : 0.5, transition: "color .3s, opacity .3s" }}>
                  <span aria-hidden style={{ width: 16, textAlign: "center", color: "var(--accent)", animation: active ? "bsscan 1s ease-in-out infinite" : "none" }}>
                    {done ? "✓" : active ? "▸" : "·"}
                  </span>
                  {s}
                </li>
              );
            })}
          </ul>

          {/* the topics lighting up */}
          {picks.size > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 28 }}>
              {[...picks].map((t, i) => (
                <span key={t} className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", padding: "6px 12px", border: "1px solid var(--accent)", color: "var(--accent)", animation: "bsrise .5s ease both", animationDelay: `${i * 0.12}s` }}>
                  {LABEL[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === "ready" && (
        <div style={{ padding: "40px 0", textAlign: "center", animation: "bsrise .5s ease both" }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)" }}>
            Ready
          </div>
          <h2 className="display" style={{ fontSize: "clamp(30px,5vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "10px 0 0" }}>
            This is your briefing, {firstName}.
          </h2>
          <p className="serif" style={{ fontSize: 16, color: "var(--muted)", margin: "12px 0 0" }}>
            Taking you in&#8230;
          </p>
        </div>
      )}
    </main>
  );
}
