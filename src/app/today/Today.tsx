"use client";

import { useState } from "react";

type Story = { slug: string; headline: string; line: string; card: string };
type Props = {
  dateISO: string; dateLabel: string; title: string; body: string;
  stories: Story[]; siteUrl: string; empty?: boolean;
};

const CSS = `
.td{min-height:100vh;background:#f3ecda;color:#1b1712;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%}
.td *{box-sizing:border-box}
.td .wrap{max-width:640px;margin:0 auto;padding:20px 16px 72px}
.td h1{font-size:20px;letter-spacing:.09em;margin:0}
.td .sub{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a7f6a;margin-top:6px}
.td .card{border:1px solid #ded3ba;background:#faf7f0;border-radius:14px;padding:16px;margin:16px 0}
.td .lbl{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9c2b1d;margin-bottom:10px}
.td .ttl{font-size:21px;line-height:1.25;font-weight:700;margin:0 0 12px}
.td pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:15px;line-height:1.6;margin:0;max-height:220px;overflow:auto;color:#3a342a}
/* buttons sized for thumbs */
.td button,.td a.btn{display:block;width:100%;font:inherit;font-size:17px;cursor:pointer;border:1px solid #1b1712;background:#1b1712;color:#f3ecda;padding:14px;border-radius:10px;margin-top:10px;text-align:center;text-decoration:none}
.td button.ghost{background:transparent;color:#1b1712}
.td button.rust{background:#9c2b1d;border-color:#9c2b1d;color:#fff}
.td .row{display:flex;gap:8px}
.td .row button{flex:1}
.td img.shot{width:100%;border-radius:10px;border:1px solid #ded3ba;display:block}
.td .st{font-size:16px;line-height:1.35;font-weight:700;margin:0 0 8px}
.td .ok{color:#9c2b1d;font-family:ui-monospace,monospace;font-size:12px;text-align:center;margin-top:8px}
`;

export default function Today(p: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1800); };

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied ✓`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); say(`${what} copied ✓`); } catch { say("select and copy manually"); }
      ta.remove();
    }
  }

  // Share the card straight into an app where the OS supports it, otherwise
  // fall back to opening it so a long-press can save it.
  async function shareCard(s: Story) {
    try {
      const res = await fetch(s.card, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], `wortins-${s.slug.slice(0, 40)}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say("image saved ✓");
    } catch {
      window.open(s.card, "_blank");
    }
  }

  if (p.empty) {
    return (
      <div className="td"><style>{CSS}</style><div className="wrap">
        <h1>WORTINS · TODAY</h1><p className="sub">No edition yet.</p>
      </div></div>
    );
  }

  return (
    <div className="td">
      <style>{CSS}</style>
      <div className="wrap">
        <h1>WORTINS · TODAY</h1>
        <div className="sub">{p.dateLabel} · tap to copy or share</div>

        <div className="card">
          <div className="lbl">Substack post</div>
          <p className="ttl">{p.title}</p>
          <pre>{p.body}</pre>
          <button onClick={() => copy(p.title, "Title")}>Copy title</button>
          <button onClick={() => copy(p.body, "Post")}>Copy post</button>
          <a className="btn ghost" href="https://wortins.substack.com/publish/post?type=newsletter"
             target="_blank" rel="noopener noreferrer">Open Substack ↗</a>
        </div>

        <div className="card">
          <div className="lbl">Images · {p.stories.length} cards</div>
          {p.stories.map((s) => (
            <div key={s.slug} style={{ marginBottom: 22 }}>
              <p className="st">{s.headline}</p>
              <img className="shot" src={s.card} alt={s.headline} loading="lazy" />
              <div className="row">
                <button className="rust" onClick={() => shareCard(s)}>Save / Share</button>
                <button className="ghost" onClick={() => copy(s.headline + "\n\n" + s.line, "Caption")}>Copy caption</button>
              </div>
            </div>
          ))}
        </div>

        {flash && <p className="ok">{flash}</p>}
      </div>
    </div>
  );
}
