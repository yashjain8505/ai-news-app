"use client";

// The AI analyst brief panel. The only interactive island on the dashboard:
// a button that fires the gated server action and renders the structured result,
// with a pending state. It costs an API call ONLY when clicked.

import { useActionState } from "react";
import { generateBriefAction } from "./actions";
import type { BriefResult } from "@/lib/aiBrief";

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mono" style={{ ...label, marginBottom: 8 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li
            key={i}
            className="serif"
            style={{ fontSize: 14, color: "var(--ink)", paddingLeft: 16, position: "relative", lineHeight: 1.4 }}
          >
            <span style={{ position: "absolute", left: 0, color: "var(--accent)" }}>—</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Brief({ range, enabled }: { range: number; enabled: boolean }) {
  const [state, formAction, pending] = useActionState<BriefResult | null, FormData>(
    generateBriefAction,
    null
  );

  return (
    <div style={{ border: "1px solid var(--ruleStrong)", padding: "18px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="mono" style={{ ...label, color: "var(--accent)" }}>
            AI analyst brief
          </div>
          <div
            className="serif"
            style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}
          >
            What&rsquo;s working, what&rsquo;s not, and what to do next — grounded in the numbers below.
          </div>
        </div>

        {enabled ? (
          <form action={formAction}>
            <input type="hidden" name="range" value={range} />
            <button
              type="submit"
              disabled={pending}
              className="mono"
              style={{
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "10px 16px",
                background: pending ? "transparent" : "var(--accent)",
                color: pending ? "var(--dim)" : "var(--onAccent)",
                border: "1px solid var(--accent)",
                cursor: pending ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {pending ? "Analyzing…" : state ? "Regenerate" : "Generate brief"}
            </button>
          </form>
        ) : null}
      </div>

      {!enabled ? (
        <p
          className="serif"
          style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 14, marginBottom: 0, overflowWrap: "anywhere" }}
        >
          Set <span className="mono">ANTHROPIC_API_KEY</span> to enable the brief. The
          dashboard below works without it.
        </p>
      ) : null}

      {pending ? (
        <p className="serif" style={{ fontSize: 14, color: "var(--dim)", marginTop: 16, marginBottom: 0, fontStyle: "italic" }}>
          Reading the metrics and writing your brief…
        </p>
      ) : null}

      {!pending && state && !state.ok ? (
        <p className="serif" style={{ fontSize: 14, color: "var(--accent)", marginTop: 16, marginBottom: 0 }}>
          {state.error}
        </p>
      ) : null}

      {!pending && state && state.ok ? (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <p
            className="display"
            style={{ fontSize: 19, lineHeight: 1.25, color: "var(--ink)", margin: 0 }}
          >
            {state.brief.headline}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            <List title="Working" items={state.brief.working} />
            <List title="Not working" items={state.brief.notWorking} />
          </div>

          {state.brief.doNext.length ? (
            <div>
              <div className="mono" style={{ ...label, marginBottom: 8 }}>
                Do next
              </div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {state.brief.doNext.map((d, i) => (
                  <li key={i} style={{ display: "flex", gap: 12 }}>
                    <span
                      className="display"
                      style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1.2, flexShrink: 0 }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="serif" style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600, lineHeight: 1.35 }}>
                        {d.action}
                      </div>
                      {d.why ? (
                        <div className="serif" style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.35 }}>
                          {d.why}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {state.brief.caveat ? (
            <p className="mono" style={{ fontSize: 11, color: "var(--dim)", margin: 0, letterSpacing: "0.04em" }}>
              ⚠ {state.brief.caveat} · {state.model}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
