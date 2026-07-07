"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Story = {
  title: string;
  source: string | null;
  summary: string | null;
  take: string | null;
  href: string;
};
type Sec = { title: string; stories: Story[] };

const WD = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function prettyDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]}, ${MO[m - 1]} ${d}, ${y}`;
}
function tidy(s: string | null): string {
  if (!s) return "";
  const t = s.trim().replace(/\s+/g, " ");
  return /[.!?…]$/.test(t) ? t : t + ".";
}

const CSS = `
.cx{min-height:100vh;background:#f3ecda;color:#1b1712;font-family:Georgia,'Times New Roman',serif}
.cx *{box-sizing:border-box}
.cx .wrap{max-width:760px;margin:0 auto;padding:26px 18px 90px}
.cx header{border-bottom:3px solid #1b1712;padding-bottom:12px;margin-bottom:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cx .logo{display:inline-block;width:30px;height:30px;background:#9c2b1d;color:#f3ecda;font-weight:700;text-align:center;line-height:30px;font-size:20px}
.cx h1{font-size:22px;letter-spacing:.08em;margin:0}
.cx .sub{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6a6052;margin-top:2px;flex-basis:100%}
.cx .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0 22px}
.cx select{font:inherit;padding:6px 8px;border:1px solid #d8ccb2;background:#fff8ea;border-radius:6px;color:#1b1712}
.cx button{font:inherit;cursor:pointer;border:1px solid #1b1712;background:#1b1712;color:#f3ecda;padding:7px 13px;border-radius:6px}
.cx button.ghost{background:transparent;color:#1b1712}
.cx button:active{transform:translateY(1px)}
.cx .status{font-family:ui-monospace,monospace;font-size:12px;color:#6a6052}
.cx .card{border:1px solid #d8ccb2;background:#fbf6e9;border-radius:10px;padding:16px 18px;margin:0 0 18px}
.cx .card>.head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.cx .label{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d}
.cx .hint{font-size:12.5px;color:#6a6052;font-style:italic;margin:0 0 12px}
.cx .titlebox{font-size:20px;font-weight:700;line-height:1.25}
.cx pre.note{white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,monospace;font-size:13px;line-height:1.55;margin:0;color:#1b1712}
.cx .post h2{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d;border-bottom:2px solid #1b1712;padding-bottom:5px;margin:22px 0 10px}
.cx .post h2:first-child{margin-top:2px}
.cx .post p{font-size:15.5px;line-height:1.55;margin:0 0 6px}
.cx .post .story{margin:0 0 16px}
.cx .post .story .t{font-size:16px}
.cx .post .story .t a{color:#1b1712;text-decoration:none}
.cx .post .story .src{font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6a6052}
.cx .post blockquote{margin:6px 0 0;padding:2px 0 2px 14px;border-left:3px solid #9c2b1d;color:#3a342a;font-style:italic;font-size:14.5px;line-height:1.5}
.cx .post hr{border:none;border-top:1px solid #d8ccb2;margin:22px 0 14px}
.cx .post a{color:#9c2b1d}
.cx .copied{color:#9c2b1d;font-family:ui-monospace,monospace;font-size:11px;margin-left:8px}
.cx .steps{background:#fff8ea;border:1px dashed #d8ccb2;border-radius:10px;padding:12px 16px;margin:0 0 20px;font-size:13.5px;line-height:1.6}
.cx .steps b{color:#9c2b1d}
`;

type Props = {
  dates: string[];
  dateISO: string;
  title: string;
  synopsis: string | null;
  sections: Sec[];
  noteText: string;
  editionUrl: string;
  siteUrl: string;
  empty?: boolean;
};

export default function Composer(props: Props) {
  const { dates, dateISO, title, synopsis, sections, noteText, editionUrl, siteUrl, empty } = props;
  const router = useRouter();
  const postRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<{ k: string; msg: string } | null>(null);

  function showFlash(k: string, ok: boolean) {
    setFlash({ k, msg: ok ? "copied ✓" : "select + ⌘C to copy" });
    setTimeout(() => setFlash(null), ok ? 1200 : 2600);
  }

  async function copyPlain(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch {}
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove(); return ok;
  }

  async function copyPost(): Promise<boolean> {
    const el = postRef.current; if (!el) return false;
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([el.innerHTML], { type: "text/html" }),
            "text/plain": new Blob([el.innerText], { type: "text/plain" }),
          }),
        ]);
        return true;
      }
    } catch {}
    // Fallback: select the rendered node so formatting survives the copy.
    const sel = window.getSelection();
    if (!sel) return false;
    const range = document.createRange();
    range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    return ok;
  }

  if (empty) {
    return (
      <div className="cx">
        <style>{CSS}</style>
        <div className="wrap">
          <header><span className="logo">W</span><h1>WORTINS → SUBSTACK</h1></header>
          <p className="status">No editions found yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cx">
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <span className="logo">W</span>
          <h1>WORTINS → SUBSTACK</h1>
          <div className="sub">Daily composer · copy → paste → publish</div>
        </header>

        <div className="steps">
          <b>How to use (≈5 min/day):</b>{" "}
          1) Pick the edition (defaults to the latest). &nbsp;
          2) In Substack, click <b>New post</b> — paste the <b>Title</b>, then paste the <b>Full post</b> into the body. &nbsp;
          3) Hit <b>Publish</b>. &nbsp;
          Want a quick <b>Note</b> instead? Copy the Note block and paste it into the Substack Notes box (the link becomes a preview card automatically).
        </div>

        <div className="controls">
          <span className="status">Edition:</span>
          <select
            value={dateISO}
            onChange={(e) => router.push(`/compose?date=${e.target.value}`)}
          >
            {dates.map((d) => (
              <option key={d} value={d}>{prettyDate(d)}</option>
            ))}
          </select>
          <button className="ghost" onClick={() => router.push("/compose")}>Latest</button>
        </div>

        {/* TITLE */}
        <div className="card">
          <div className="head">
            <span className="label">Post title</span>
            <span>
              <button onClick={async () => showFlash("title", await copyPlain(title))}>Copy title</button>
              {flash?.k === "title" && <span className="copied">{flash.msg}</span>}
            </span>
          </div>
          <div className="titlebox">{title}</div>
        </div>

        {/* FULL POST */}
        <div className="card">
          <div className="head">
            <span className="label">Full post — paste into the Substack post body</span>
            <span>
              <button onClick={async () => showFlash("post", await copyPost())}>Copy post</button>
              {flash?.k === "post" && <span className="copied">{flash.msg}</span>}
            </span>
          </div>
          <p className="hint">Copies with formatting (headings, bold, links). Each headline links back to wortins.com.</p>
          <div className="post" ref={postRef}>
            {synopsis && <p>{synopsis}</p>}
            {sections.map((sec) => (
              <div key={sec.title}>
                <h2>{sec.title}</h2>
                {sec.stories.map((st, i) => (
                  <div className="story" key={i}>
                    <p className="t">
                      <strong><a href={st.href}>{st.title}</a></strong>
                      {st.source && <span className="src">{"  — " + st.source}</span>}
                    </p>
                    {st.summary && <p>{tidy(st.summary)}</p>}
                    {st.take && (
                      <blockquote><em>Our take: </em>{tidy(st.take)}</blockquote>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <hr />
            <p>
              <strong>Read the full interactive briefing</strong>, every story with our take, at{" "}
              <a href={siteUrl}>wortins.com</a>. A fresh AI edition every morning.
            </p>
          </div>
        </div>

        {/* NOTE */}
        <div className="card">
          <div className="head">
            <span className="label">Short Note — paste into Substack Notes</span>
            <span>
              <button onClick={async () => showFlash("note", await copyPlain(noteText))}>Copy Note</button>
              {flash?.k === "note" && <span className="copied">{flash.msg}</span>}
            </span>
          </div>
          <p className="hint">Plain text; the wortins link on its own line becomes a preview card on paste.</p>
          <pre className="note">{noteText}</pre>
        </div>

        <p className="status">Edition {dateISO} · {editionUrl}</p>
      </div>
    </div>
  );
}
