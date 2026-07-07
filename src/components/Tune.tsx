"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMix, reviseReaction, signOut, deleteAccount } from "@/app/actions";
import { TOPICS as APPETITES, LEVELS } from "@/lib/topics";

type Reaction = {
  itemId: string;
  action: "like" | "less" | "neutral";
  title: string;
  source: string | null;
  tags: string[];
};

const TAGS = APPETITES.map((a) => a.tag);
const CHOICES: { v: "less" | "neutral" | "like"; label: string }[] = [
  { v: "less", label: "Bad" },
  { v: "neutral", label: "Neutral" },
  { v: "like", label: "Good" },
];

export default function Tune({
  weights,
  reactions,
  techPref,
  dislikes,
  profile,
}: {
  weights: Record<string, number>;
  reactions: Reaction[];
  techPref: number;
  dislikes: string[];
  profile: {
    name: string | null;
    email: string | null;
    phone: string | null;
    referralSource: string | null;
    memberSince: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [level, setLevel] = useState<number>(techPref);
  const [muted, setMuted] = useState<Set<string>>(new Set(dislikes));
  const [mix, setMix] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    TAGS.forEach((t) => (m[t] = Math.round(weights[t] ?? 0)));
    return m;
  });
  const [rx, setRx] = useState<Reaction[]>(reactions);
  const [saved, setSaved] = useState(false);
  const [authPending, startAuth] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      await saveMix(mix, level, [...muted]);
      setSaved(true);
    });
  }

  function toggleMute(tag: string) {
    setMuted((cur) => {
      const next = new Set(cur);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setSaved(false);
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
          Account
        </span>
        <button
          onClick={() => router.push("/")}
          className="mono bs-tap"
          style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", padding: "6px 13px", cursor: "pointer" }}
        >
          &#8249; Back to feed
        </button>
      </div>

      {/* ---- Profile + account: this comes first ---- */}
      <div style={{ border: "1px solid var(--ruleStrong)", padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span aria-hidden className="display" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, background: "var(--accent)", color: "var(--onAccent)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
            {(profile.name?.trim()?.[0] ?? "R").toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 22, lineHeight: 1.1, color: "var(--ink)" }}>
              {profile.name || "Reader"}
            </div>
            {profile.memberSince && (
              <div className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", marginTop: 3 }}>
                Member since {profile.memberSince}
              </div>
            )}
          </div>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", margin: "20px 0 0" }}>
          {([
            ["Email", profile.email || "Not set"],
            ["Phone", profile.phone || "Not added"],
            ["Heard via", profile.referralSource || "Not set"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--dim)" }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 15, color: "var(--ink)", wordBreak: "break-word" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* sign out / delete */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
        <button
          onClick={() => startAuth(async () => { await signOut(); })}
          disabled={authPending}
          className="mono bs-tap"
          style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", padding: "10px 18px", cursor: "pointer", opacity: authPending ? 0.5 : 1 }}
        >
          Sign out
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mono bs-tap"
            style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", padding: "10px 18px", cursor: "pointer" }}
          >
            Delete account
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="serif" style={{ fontSize: 14, color: "var(--ink)" }}>
              This erases everything, permanently.
            </span>
            <button
              onClick={() => startAuth(async () => { await deleteAccount(); })}
              disabled={authPending}
              className="mono bs-tap"
              style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", border: 0, background: "var(--accent)", color: "var(--onAccent)", padding: "10px 18px", cursor: "pointer", opacity: authPending ? 0.5 : 1 }}
            >
              {authPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={authPending}
              className="mono bs-tap"
              style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", padding: "10px 18px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={{ borderTop: "3px double var(--ruleStrong)", margin: "40px 0 0" }} />
      <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, color: "var(--ink)", margin: "28px 0 18px" }}>
        Preferences
      </h2>

      <h1 className="display" style={{ fontSize: 20, lineHeight: 1.1, color: "var(--ink)", margin: "0 0 12px" }}>
        How technical?
      </h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 34 }}>
        {LEVELS.map((l) => {
          const on = l.pref === level;
          return (
            <button
              key={l.pref}
              onClick={() => { setLevel(l.pref); setSaved(false); }}
              title={l.hint}
              className="bs-tap"
              style={{ padding: "9px 14px", border: on ? "1px solid var(--accent)" : "1px solid var(--sep)", background: on ? "var(--accent)" : "transparent", color: on ? "var(--onAccent)" : "var(--ink)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
      <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
        Your topics
      </h2>
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
      <h2 className="display" style={{ fontSize: 22, lineHeight: 1.1, color: "var(--ink)", margin: "34px 0 4px" }}>
        Muted topics
      </h2>
      <p className="serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)", margin: "0 0 14px" }}>
        Tap a topic to keep it out of your feed.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {APPETITES.map((a) => {
          const on = muted.has(a.tag);
          return (
            <button
              key={a.tag}
              onClick={() => toggleMute(a.tag)}
              className="bs-tap"
              style={{ padding: "8px 13px", border: on ? "1px solid var(--ink)" : "1px solid var(--sep)", background: on ? "var(--ink)" : "transparent", color: on ? "var(--bg)" : "var(--dim)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: on ? "line-through" : "none" }}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      <button
        onClick={save}
        disabled={pending}
        className="bs-tap"
        style={{ marginTop: 22, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "11px 22px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", opacity: pending ? 0.5 : 1 }}
      >
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save all"}
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
                      className="mono bs-tap"
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
