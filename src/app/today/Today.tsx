"use client";

import { useRef, useState } from "react";

type Story = { slug: string; headline: string; line: string; card: string };
type Cover = { headline: string; card: string; photo: string | null };
type Props = {
  dateISO: string; dateLabel: string; title: string; subtitle: string; cover: Cover | null; body: string;
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
.td .ttl{font-size:21px;line-height:1.25;font-weight:700;margin:0 0 8px}
.td .dek{font-size:15px;line-height:1.45;color:#5a5244;margin:0 0 12px}
.td .fld{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a7f6a;margin:14px 0 4px}
.td pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:15px;line-height:1.6;margin:0;max-height:200px;overflow:auto;color:#3a342a}
.td button,.td a.btn{display:block;width:100%;font:inherit;font-size:17px;cursor:pointer;border:1px solid #1b1712;background:#1b1712;color:#f3ecda;padding:14px;border-radius:10px;margin-top:10px;text-align:center;text-decoration:none}
.td button.ghost,.td a.btn.ghost{background:transparent;color:#1b1712}
.td button.rust,.td a.btn.rust{background:#9c2b1d;border-color:#9c2b1d;color:#fff}
.td .row a.btn{flex:1;font-size:15px}
.td button[disabled]{opacity:.55}
.td .row{display:flex;gap:8px}
.td .row button{flex:1}
.td .story{border-top:1px solid #e6dcc6;padding:14px 0 4px}
.td .st{font-size:16px;line-height:1.35;font-weight:700;margin:0 0 8px}
.td img.shot{width:100%;border-radius:10px;border:1px solid #ded3ba;display:block;margin-top:10px}
.td .ok{position:fixed;left:50%;transform:translateX(-50%);bottom:22px;background:#1b1712;color:#f3ecda;
  font-family:ui-monospace,monospace;font-size:13px;padding:10px 18px;border-radius:999px;z-index:20}
`;

// One in-memory blob per slug. The card is a server-rendered 1080x1350 PNG that
// takes ~3s to generate and is NOT edge-cached, so it must be fetched at most
// once per story per visit, and never with cache:'no-store' (which forced a
// fresh 3s render on every single tap and made the button look dead).
const blobs = new Map<string, Blob>();

export default function Today(p: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(m: string) {
    setFlash(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1600);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); say(`${what} copied`); } catch { say("copy failed"); }
      ta.remove();
    }
  }

  async function getBlob(s: Story): Promise<Blob> {
    const hit = blobs.get(s.slug);
    if (hit) return hit;
    const res = await fetch(s.card); // default cache, never no-store
    if (!res.ok) throw new Error(String(res.status));
    const b = await res.blob();
    blobs.set(s.slug, b);
    return b;
  }

  // Fetch once, show it, and keep the blob so Share is instant afterwards.
  async function load(s: Story) {
    if (shown[s.slug] || busy) return;
    setBusy(s.slug);
    say("making the image…");
    try {
      const b = await getBlob(s);
      setShown((m) => ({ ...m, [s.slug]: URL.createObjectURL(b) }));
      say("ready");
    } catch {
      say("image failed, tap again");
    } finally {
      setBusy(null);
    }
  }

  async function share(s: Story) {
    setBusy(s.slug);
    try {
      const b = await getBlob(s);
      const file = new File([b], `wortins-${s.slug.slice(0, 40)}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = file.name; a.click();
        say("saved");
      }
    } catch {
      say("could not share");
    } finally {
      setBusy(null);
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
        <div className="sub">{p.dateLabel}</div>

        <div className="card">
          <div className="lbl">Substack post</div>
          <div className="fld">Title</div>
          <p className="ttl">{p.title}</p>
          <div className="fld">Subtitle</div>
          <p className="dek">{p.subtitle}</p>
          <div className="fld">Post</div>
          <pre>{p.body}</pre>
          <button onClick={() => copy(p.title, "Title")}>Copy title</button>
          <button onClick={() => copy(p.subtitle, "Subtitle")}>Copy subtitle</button>
          <button onClick={() => copy(p.body, "Post")}>Copy post</button>
          {p.cover && (
            <>
              <div className="fld">Cover image · {p.cover.headline}</div>
              <div className="row">
                <a className="btn rust" href={p.cover.card} target="_blank" rel="noopener noreferrer">Wortins card ↗</a>
                {p.cover.photo && (
                  <a className="btn ghost" href={p.cover.photo} target="_blank" rel="noopener noreferrer">Article photo ↗</a>
                )}
              </div>
            </>
          )}
          <a className="btn ghost" href="https://wortins.substack.com/publish/post?type=newsletter"
             target="_blank" rel="noopener noreferrer">Open Substack ↗</a>
        </div>

        <div className="card">
          <div className="lbl">Images · {p.stories.length} stories</div>
          {p.stories.map((s) => {
            const isBusy = busy === s.slug;
            const src = shown[s.slug];
            return (
              <div className="story" key={s.slug}>
                <p className="st">{s.headline}</p>
                {src && <img className="shot" src={src} alt={s.headline} />}
                <div className="row">
                  {!src ? (
                    <button className="rust" disabled={isBusy} onClick={() => load(s)}>
                      {isBusy ? "Making image…" : "Get image"}
                    </button>
                  ) : (
                    <button className="rust" disabled={isBusy} onClick={() => share(s)}>
                      {isBusy ? "Working…" : "Save / Share"}
                    </button>
                  )}
                  <button className="ghost" onClick={() => copy(`${s.headline}\n\n${s.line}`, "Caption")}>
                    Copy caption
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {flash && <div className="ok">{flash}</div>}
    </div>
  );
}
