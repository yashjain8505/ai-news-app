"use client";

import { useState } from "react";
import { subscribeNewsletter } from "@/app/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Front-page subscribe band for the Wortins Daily. Placeholder capture: the email
// lands in our own `subscribers` table so we stay free to pick a sender (Substack,
// Resend, …) later without re-collecting anyone. Styled to the newspaper look.
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
        marginTop: 26,
        border: "1px solid var(--ruleStrong)",
        background: "var(--ph1)",
        padding: "22px 24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px 32px",
      }}
    >
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
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
          style={{ fontSize: "clamp(24px,3vw,32px)", lineHeight: 1.05, margin: "8px 0 0", color: "var(--ink)" }}
        >
          Keep up with AI in five minutes
        </h2>
        <p
          className="serif"
          style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dim)", margin: "8px 0 0", maxWidth: "46ch" }}
        >
          The Wortins Daily, one email each morning with the most interesting AI
          stories, summarized.
        </p>
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        {state === "done" ? (
          <div
            style={{
              border: "1px solid var(--accent)",
              background: "var(--bg)",
              padding: "16px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span className="display" style={{ fontSize: 22, color: "var(--accent)", lineHeight: 1 }}>
              ✓
            </span>
            <p className="serif" style={{ margin: 0, fontSize: 15, color: "var(--ink)" }}>
              You&rsquo;re in. The next Wortins Daily lands in your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div style={{ display: "flex", gap: 10 }}>
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
                  flex: 1,
                  minWidth: 0,
                  background: "var(--bg)",
                  border: "1px solid var(--ruleStrong)",
                  color: "var(--ink)",
                  padding: "12px 14px",
                  fontFamily: "inherit",
                  fontSize: 15,
                }}
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="mono bs-tap"
                style={{
                  flexShrink: 0,
                  background: "var(--accent)",
                  color: "var(--onAccent)",
                  border: 0,
                  padding: "0 20px",
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
            <p
              className="mono"
              style={{
                margin: "10px 0 0",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: state === "error" ? "var(--accent)" : "var(--faint)",
              }}
            >
              {state === "error" && msg
                ? msg
                : "One email each morning · unsubscribe anytime"}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
