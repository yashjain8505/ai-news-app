// The curator's original synthesis of an edition — non-aggregated content that
// gives crawlers and AI answer engines something original to cite.
export default function EditionLede({ synopsis }: { synopsis: string | null }) {
  if (!synopsis) return null;
  return (
    <div style={{ borderLeft: "3px solid var(--accent)", padding: "4px 0 4px 20px", margin: "8px 0 36px" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
        Wotins&#8217; read
      </div>
      <p className="serif" style={{ fontSize: 20, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>
        {synopsis}
      </p>
    </div>
  );
}
