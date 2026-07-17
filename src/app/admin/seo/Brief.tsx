"use client";

// The AI SEO action-plan panel — the one interactive island on the dashboard.
//
// Clicking "Generate" fires a gated server action that queues a job + triggers a
// GitHub Actions run (Claude on your subscription — no API key). Because that's
// async, this component then POLLS the job row until it's ready, showing a
// "writing…" state. On load it shows the last completed plan (passed as `initial`
// from the server). Type-only import of the lib keeps the server-only module out
// of the client bundle.

import { useCallback, useEffect, useRef, useState } from "react";
import { requestSeoBriefAction, pollSeoBriefAction } from "./actions";
import type { SeoBrief, SeoAction, SeoBriefRow } from "@/lib/seoBrief";

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

function Badge({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 9,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 6px",
        border: `1px solid ${strong ? "var(--accent)" : "var(--rule)"}`,
        color: strong ? "var(--accent)" : "var(--dim)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Action({ d, n }: { d: SeoAction; n: number }) {
  return (
    <li style={{ display: "flex", gap: 12 }}>
      <span className="display" style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1.2, flexShrink: 0 }}>
        {n}
      </span>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="serif" style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600, lineHeight: 1.35 }}>
            {d.action}
          </span>
          {d.impact ? <Badge text={`${d.impact} impact`} strong={d.impact === "high"} /> : null}
          {d.effort ? <Badge text={d.effort} /> : null}
        </div>
        {d.why ? (
          <div className="serif" style={{ fontSize: 13, color: "var(--muted)", marginTop: 3, lineHeight: 1.35 }}>
            {d.why}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Plan({ brief, model }: { brief: SeoBrief; model: string | null }) {
  return (
    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      <p className="display" style={{ fontSize: 19, lineHeight: 1.25, color: "var(--ink)", margin: 0 }}>
        {brief.headline}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
        <List title="Working" items={brief.working} />
        <List title="Broken" items={brief.broken} />
      </div>

      {brief.doNext.length ? (
        <div>
          <div className="mono" style={{ ...label, marginBottom: 10 }}>
            Do next — ranked by impact
          </div>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
            {brief.doNext.map((d, i) => (
              <Action key={i} d={d} n={i + 1} />
            ))}
          </ol>
        </div>
      ) : null}

      {brief.caveat ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--dim)", margin: 0, letterSpacing: "0.04em" }}>
          ⚠ {brief.caveat}
          {model ? ` · ${model}` : ""}
        </p>
      ) : null}
    </div>
  );
}

type Phase = "idle" | "working" | "ready" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Brief({
  range,
  enabled,
  initial,
}: {
  range: number;
  enabled: boolean;
  initial: SeoBriefRow | null;
}) {
  const [phase, setPhase] = useState<Phase>(initial?.brief ? "ready" : "idle");
  const [brief, setBrief] = useState<SeoBrief | null>(initial?.brief ?? null);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [error, setError] = useState<string | null>(null);

  // Cancel any in-flight poll loop if the component unmounts (e.g. range switch).
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const run = useCallback(async () => {
    setPhase("working");
    setError(null);
    const res = await requestSeoBriefAction(range);
    if (!res.ok) {
      setPhase("error");
      setError(res.error);
      return;
    }
    // Poll the job until the CI worker finishes (~1 min). Cap at 3 minutes.
    const startedAt = Date.now();
    while (!cancelled.current) {
      await sleep(4000);
      if (cancelled.current) return;
      const row = await pollSeoBriefAction(res.briefId);
      if (cancelled.current) return;
      if (row?.status === "ready" && row.brief) {
        setBrief(row.brief);
        setModel(row.model);
        setPhase("ready");
        return;
      }
      if (row?.status === "error") {
        setPhase("error");
        setError(row.error || "The brief job failed.");
        return;
      }
      if (Date.now() - startedAt > 180_000) {
        setPhase("error");
        setError("Still running in CI after 3 minutes — refresh in a moment to pick up the finished plan.");
        return;
      }
    }
  }, [range]);

  const working = phase === "working";
  const btnLabel = working ? "Analyzing…" : brief ? "Regenerate" : "Generate action plan";

  return (
    <div style={{ border: "1px solid var(--ruleStrong)", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="mono" style={{ ...label, color: "var(--accent)" }}>
            AI action plan
          </div>
          <div className="serif" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            What&rsquo;s working, what&rsquo;s broken, and exactly what to do next — written by Claude on your subscription, grounded in the numbers below.
          </div>
        </div>

        {enabled ? (
          <button
            type="button"
            onClick={run}
            disabled={working}
            className="mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "10px 16px",
              background: working ? "transparent" : "var(--accent)",
              color: working ? "var(--dim)" : "var(--onAccent)",
              border: "1px solid var(--accent)",
              cursor: working ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {btnLabel}
          </button>
        ) : null}
      </div>

      {!enabled ? (
        <p className="serif" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 14, marginBottom: 0, overflowWrap: "anywhere" }}>
          Set <span className="mono">GITHUB_DISPATCH_TOKEN</span> to enable the action plan (it runs the brief in GitHub Actions on your Claude subscription). The dashboard below works without it.
        </p>
      ) : null}

      {working ? (
        <p className="serif" style={{ fontSize: 14, color: "var(--dim)", marginTop: 16, marginBottom: 0, fontStyle: "italic" }}>
          Handing your Search Console numbers to Claude in GitHub Actions and writing the plan… this takes about a minute.
        </p>
      ) : null}

      {phase === "error" && error ? (
        <p className="serif" style={{ fontSize: 14, color: "var(--accent)", marginTop: 16, marginBottom: 0 }}>
          {error}
        </p>
      ) : null}

      {phase === "ready" && brief ? <Plan brief={brief} model={model} /> : null}
    </div>
  );
}
