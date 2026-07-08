"use client";

import { useState } from "react";
import { subscribeNewsletter } from "@/app/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Front-page subscribe band for the Wortins Daily. A wide, short horizontal strip
// — pitch on the left, inline email + button on the right — so it adds minimal
// vertical height to the masthead (no tall box pushing the feed down). Wraps to a
// stacked layout on narrow screens. Emails land in our own `subscribers` table so
// we stay free to pick a sender (Substack, Resend, …) later. Newspaper look.
export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState("error");
      setMsg("Enter a valid email address.");
      return;
    }
    setState("loading");
    setMsg(null);
    const res = await subscribeNewsletter(value);
    if (res.ok) {
      setState("done");
      setEmail("");
    } else {
      setState("error");
      setMsg(
        res.error === "invalid"
          ? "Enter a valid email address."
          : "Something went wrong, please try again."
      );
    }
  }

  return (
    <section
      aria-label="Subscribe to the Wortins Daily"
      style={{
        border: "1px solid var(--ruleStrong)",
        background: "var(--ph1)",
        padding: "14px 18px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px 28px",
      }}
    >
      {/* Pitch — left */}
      <div style={{ minWidth: 200 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          Subscribe · Free
        </div>
        <h2
          className="display"
          style={{ fontSize: 20, lineHeight: 1.1, margin: "4px 0 0", color: "var(--ink)" }}
        >
          Keep up with AI in five minutes
        </h2>
        <p
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1.4,
            color: "var(--faint)",
            margin: "5px 0 0",
          }}
        >
          One email each morning · unsubscribe anytime
        </p>
      </div>

      {/* Form / done — right */}
      {state === "done" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid var(--accent)",
            background: "var(--bg)",
            padding: "10px 14px",
          }}
        >
          <span className="display" style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1 }}>
            ✓
          </span>
          <p className="serif" style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: "var(--ink)" }}>
            You&rsquo;re in. The next Wortins Daily lands in your inbox.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate style={{ flex: "1 1 300px", maxWidth: 460, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="nl-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "error") {
                  setState("idle");
                  setMsg(null);
                }
              }}
              disabled={state === "loading"}
              style={{
                flex: "1 1 200px",
                minWidth: 0,
                boxSizing: "border-box",
                background: "var(--bg)",
                border: "1px solid var(--ruleStrong)",
                color: "var(--ink)",
                padding: "11px 13px",
                fontFamily: "inherit",
                fontSize: 15,
              }}
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="mono bs-tap"
              style={{
                flex: "0 0 auto",
                background: "var(--accent)",
                color: "var(--onAccent)",
                border: 0,
                padding: "11px 22px",
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: state === "loading" ? "default" : "pointer",
                opacity: state === "loading" ? 0.6 : 1,
              }}
            >
              {state === "loading" ? "Subscribing…" : "Subscribe"}
            </button>
          </div>
          {state === "error" && msg && (
            <p
              className="mono"
              style={{
                margin: "8px 0 0",
                fontSize: 10,
                letterSpacing: "0.06em",
                lineHeight: 1.4,
                textTransform: "uppercase",
                color: "var(--accent)",
              }}
            >
              {msg}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
