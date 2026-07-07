import React from "react";

// Minimal, dependency-free Markdown renderer for our own authored blog posts.
// Supports the disciplined subset we write in: ##/###/#### headings, - / * and
// 1. lists, > blockquotes, ``` fenced code, --- rules, and inline **bold**,
// *italic* / _italic_, `code`, and [links](url). Content is first-party (never
// user input), so we render to React nodes (no dangerouslySetInnerHTML).

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Pattern = {
  re: RegExp;
  node: (m: RegExpMatchArray, key: string) => React.ReactNode;
};

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};
const codeStyle: React.CSSProperties = {
  fontFamily: "var(--mono, ui-monospace, monospace)",
  fontSize: "0.9em",
  background: "var(--rule)",
  padding: "1px 5px",
  borderRadius: 4,
};

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const patterns: Pattern[] = [
    {
      re: /\[([^\]]+)\]\(([^)\s]+)\)/,
      node: (m, key) => {
        const href = m[2];
        const external = /^https?:\/\//.test(href);
        return (
          <a
            key={key}
            href={href}
            style={linkStyle}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {inline(m[1], key)}
          </a>
        );
      },
    },
    {
      re: /\*\*([^*]+)\*\*/,
      node: (m, key) => (
        <strong key={key} style={{ color: "var(--ink)" }}>
          {inline(m[1], key)}
        </strong>
      ),
    },
    { re: /\*([^*\n]+)\*/, node: (m, key) => <em key={key}>{inline(m[1], key)}</em> },
    { re: /_([^_\n]+)_/, node: (m, key) => <em key={key}>{inline(m[1], key)}</em> },
    {
      re: /`([^`]+)`/,
      node: (m, key) => (
        <code key={key} style={codeStyle}>
          {m[1]}
        </code>
      ),
    },
  ];

  const nodes: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    let best: RegExpMatchArray | null = null;
    let bestIdx = Infinity;
    let bestPat: Pattern | null = null;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m && m.index !== undefined && m.index < bestIdx) {
        best = m;
        bestIdx = m.index;
        bestPat = p;
      }
    }
    if (!best || !bestPat) {
      nodes.push(rest);
      break;
    }
    if (bestIdx > 0) nodes.push(rest.slice(0, bestIdx));
    nodes.push(bestPat.node(best, `${keyPrefix}-${k++}`));
    rest = rest.slice(bestIdx + best[0].length);
  }
  return nodes;
}

const pStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.7,
  color: "var(--ink)",
  margin: "0 0 20px",
  maxWidth: "68ch",
};

export default function BlogContent({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `b-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // skip closing fence
      out.push(
        <pre
          key={nextKey()}
          style={{
            background: "var(--rule)",
            padding: "14px 16px",
            borderRadius: 6,
            overflowX: "auto",
            fontSize: 14,
            margin: "0 0 20px",
          }}
        >
          <code style={{ fontFamily: "var(--mono, ui-monospace, monospace)" }}>
            {buf.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(
        <hr
          key={nextKey()}
          style={{
            border: "none",
            borderTop: "1px solid var(--rule)",
            margin: "32px 0",
          }}
        />
      );
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const Tag = (level === 1 ? "h2" : `h${Math.min(level, 6)}`) as
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      const big = Tag === "h2";
      out.push(
        <Tag
          key={nextKey()}
          id={slugify(text)}
          className="display"
          style={{
            fontSize: big ? 26 : 20,
            lineHeight: 1.2,
            color: "var(--ink)",
            margin: big ? "36px 0 14px" : "28px 0 12px",
          }}
        >
          {inline(text, nextKey())}
        </Tag>
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]))
        buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(
        <blockquote
          key={nextKey()}
          className="serif"
          style={{
            borderLeft: "3px solid var(--accent)",
            padding: "4px 0 4px 18px",
            margin: "0 0 20px",
            color: "var(--muted)",
            fontSize: 18,
            lineHeight: 1.6,
          }}
        >
          {inline(buf.join(" "), nextKey())}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push(
        <ul
          key={nextKey()}
          className="serif"
          style={{ margin: "0 0 20px", paddingLeft: 22, color: "var(--ink)" }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 18, lineHeight: 1.6, margin: "0 0 8px" }}>
              {inline(it, `${nextKey()}-li${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      out.push(
        <ol
          key={nextKey()}
          className="serif"
          style={{ margin: "0 0 20px", paddingLeft: 24, color: "var(--ink)" }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 18, lineHeight: 1.6, margin: "0 0 8px" }}>
              {inline(it, `${nextKey()}-li${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph — gather consecutive plain lines
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|```|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(
        lines[i]
      )
    ) {
      buf.push(lines[i++]);
    }
    out.push(
      <p key={nextKey()} className="serif" style={pStyle}>
        {inline(buf.join(" "), nextKey())}
      </p>
    );
  }

  return <>{out}</>;
}
