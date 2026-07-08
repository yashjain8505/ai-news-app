"use client";

import { useState } from "react";

// Row shapes shared with the server page (page.tsx imports these types).
export type Candidate = {
  slug?: string;
  title?: string;
  summary?: string;
  draft_text?: string;
};

export type QueueRow = {
  id: string;
  run_date: string;
  slot: string;
  status: string;
  draft_text: string | null;
  candidates: Candidate[] | null;
  selected_slug: string | null;
  final_text: string | null;
  posted_uri: string | null;
  created_at: string;
  posted_at: string | null;
};

export type ReplyRow = {
  id: string;
  run_date: string;
  slot: string;
  target_uri: string;
  target_cid: string;
  target_author: string | null;
  target_text: string | null;
  target_url: string | null;
  draft_reply: string | null;
  final_reply: string | null;
  status: string;
  posted_uri: string | null;
};

const MAX = 300; // Bluesky post limit.

const CSS = `
.cx{min-height:100vh;background:#f3ecda;color:#1b1712;font-family:Georgia,'Times New Roman',serif}
.cx *{box-sizing:border-box}
.cx .wrap{max-width:720px;margin:0 auto;padding:26px 18px 90px}
.cx header{border-bottom:3px solid #1b1712;padding-bottom:12px;margin-bottom:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cx .logo{display:inline-block;width:30px;height:30px;background:#9c2b1d;color:#f3ecda;font-weight:700;text-align:center;line-height:30px;font-size:20px}
.cx h1{font-size:22px;letter-spacing:.08em;margin:0}
.cx .sub{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6a6052;margin-top:2px;flex-basis:100%}
.cx .status{font-family:ui-monospace,monospace;font-size:12px;color:#6a6052}
.cx .card{border:1px solid #d8ccb2;background:#fbf6e9;border-radius:10px;padding:16px 18px;margin:0 0 18px}
.cx .card>.head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.cx .label{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9c2b1d}
.cx .hint{font-size:12.5px;color:#6a6052;font-style:italic;margin:0 0 12px}
.cx textarea{width:100%;font:inherit;font-size:16px;line-height:1.5;padding:11px 12px;border:1px solid #d8ccb2;background:#fff8ea;border-radius:8px;color:#1b1712;resize:vertical;min-height:96px}
.cx textarea:focus{outline:2px solid #9c2b1d;outline-offset:1px}
.cx .row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.cx .count{font-family:ui-monospace,monospace;font-size:12px;color:#6a6052}
.cx .count.over{color:#9c2b1d;font-weight:700}
.cx button{font:inherit;cursor:pointer;border:1px solid #1b1712;background:#1b1712;color:#f3ecda;padding:7px 13px;border-radius:6px}
.cx button:disabled{opacity:.5;cursor:default}
.cx button:active:not(:disabled){transform:translateY(1px)}
.cx .chips{display:flex;flex-direction:column;gap:6px;margin:12px 0 0}
.cx .chip{text-align:left;font:inherit;font-size:14px;line-height:1.35;cursor:pointer;border:1px solid #d8ccb2;background:#fff8ea;color:#1b1712;padding:8px 11px;border-radius:8px}
.cx .chip:hover{border-color:#9c2b1d}
.cx .chip.active{border-color:#9c2b1d;background:#f6ead2}
.cx .chip .n{font-family:ui-monospace,monospace;font-size:11px;color:#9c2b1d;margin-right:7px}
.cx .reply{border:1px solid #d8ccb2;background:#fbf6e9;border-radius:10px;padding:14px 16px;margin:0 0 14px}
.cx .reply .who{font-weight:700;font-size:14px;margin:0 0 4px}
.cx .reply .tt{font-size:14px;line-height:1.45;color:#3a342a;margin:0 0 6px;white-space:pre-wrap;word-wrap:break-word}
.cx .reply .lnk{font-size:12.5px}
.cx a{color:#9c2b1d}
.cx .ok{color:#1b7a3a;font-family:ui-monospace,monospace;font-size:12px}
.cx .err{color:#9c2b1d;font-family:ui-monospace,monospace;font-size:12px}
.cx .posted{border-color:#bcd3bc;background:#eef5ee}
.cx h2{font-size:15px;font-family:ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#1b1712;border-bottom:2px solid #1b1712;padding-bottom:6px;margin:28px 0 14px}
`;

type PostState = { loading: boolean; url: string | null; error: string | null };

type Props = {
  queue: QueueRow | null;
  replies: ReplyRow[];
  envKey: string;
};

export default function Review({ queue, replies, envKey }: Props) {
  if (!queue) {
    return (
      <div className="cx">
        <style>{CSS}</style>
        <div className="wrap">
          <header>
            <span className="logo">W</span>
            <h1>WORTINS → BLUESKY</h1>
          </header>
          <p className="status">No pending queue row to review.</p>
        </div>
      </div>
    );
  }
  return <ReviewBody queue={queue} replies={replies} envKey={envKey} />;
}

function ReviewBody({ queue, replies, envKey }: { queue: QueueRow; replies: ReplyRow[]; envKey: string }) {
  const candidates = queue.candidates ?? [];

  const [text, setText] = useState<string>(queue.final_text ?? queue.draft_text ?? "");
  const [slug, setSlug] = useState<string | null>(queue.selected_slug ?? null);
  const [post, setPost] = useState<PostState>({
    loading: false,
    url: queue.posted_uri ? bskyUrl(queue.posted_uri) : null,
    error: null,
  });
  const [done, setDone] = useState<boolean>(queue.status === "posted");

  const over = text.length > MAX;

  async function submitPost() {
    if (!text.trim() || over || post.loading || done) return;
    setPost({ loading: true, url: null, error: null });
    try {
      const res = await fetch("/api/bluesky/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: queue.id, key: envKey, text: text.trim(), slug }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok) {
        setPost({ loading: false, url: null, error: data.error || `Failed (${res.status}).` });
        return;
      }
      setPost({ loading: false, url: data.url ?? null, error: null });
      setDone(true);
    } catch (e) {
      setPost({ loading: false, url: null, error: e instanceof Error ? e.message : "Network error." });
    }
  }

  return (
    <div className="cx">
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <span className="logo">W</span>
          <h1>WORTINS → BLUESKY</h1>
          <div className="sub">
            {queue.run_date} · {queue.slot} · review, edit, post
          </div>
        </header>

        {/* YOUR POST */}
        <h2>Your post</h2>
        <div className={`card${done ? " posted" : ""}`}>
          <div className="head">
            <span className="label">Post text</span>
            <span className={`count${over ? " over" : ""}`}>
              {text.length} / {MAX}
            </span>
          </div>
          <p className="hint">
            Edit freely, or pick one of the drafts below. Bluesky caps posts at {MAX} characters.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={done}
            spellCheck
          />

          {candidates.length > 0 && (
            <div className="chips">
              {candidates.slice(0, 5).map((c, i) => {
                const active = slug != null && c.slug === slug;
                return (
                  <button
                    type="button"
                    key={c.slug ?? i}
                    className={`chip${active ? " active" : ""}`}
                    disabled={done}
                    onClick={() => {
                      setText(c.draft_text ?? "");
                      setSlug(c.slug ?? null);
                    }}
                  >
                    <span className="n">{i + 1}</span>
                    {c.title ?? c.slug ?? `Candidate ${i + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          <div className="row">
            <span className="status">
              {done ? "Posted." : slug ? `Selected: ${slug}` : "No candidate selected."}
            </span>
            <button type="button" onClick={submitPost} disabled={done || post.loading || over || !text.trim()}>
              {done ? "Posted" : post.loading ? "Posting…" : "Post to Bluesky"}
            </button>
          </div>

          {post.url && (
            <p className="row">
              <span className="ok">
                Live at{" "}
                <a href={post.url} target="_blank" rel="noreferrer">
                  {post.url}
                </a>
              </span>
            </p>
          )}
          {post.error && (
            <p className="row">
              <span className="err">{post.error}</span>
            </p>
          )}
        </div>

        {/* REPLIES */}
        <h2>Reply to {replies.length} posts</h2>
        {replies.length === 0 ? (
          <p className="status">No reply targets queued for this slot.</p>
        ) : (
          replies.map((r) => <ReplyCard key={r.id} reply={r} envKey={envKey} />)
        )}
      </div>
    </div>
  );
}

function ReplyCard({ reply, envKey }: { reply: ReplyRow; envKey: string }) {
  const [text, setText] = useState<string>(reply.final_reply ?? reply.draft_reply ?? "");
  const [state, setState] = useState<PostState>({
    loading: false,
    url: reply.posted_uri ? bskyUrl(reply.posted_uri) : null,
    error: null,
  });
  const [done, setDone] = useState<boolean>(reply.status === "posted");

  const over = text.length > MAX;

  async function submitReply() {
    if (!text.trim() || over || state.loading || done) return;
    setState({ loading: true, url: null, error: null });
    try {
      const res = await fetch("/api/bluesky/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reply.id, key: envKey, text: text.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok) {
        setState({ loading: false, url: null, error: data.error || `Failed (${res.status}).` });
        return;
      }
      setState({ loading: false, url: data.url ?? null, error: null });
      setDone(true);
    } catch (e) {
      setState({ loading: false, url: null, error: e instanceof Error ? e.message : "Network error." });
    }
  }

  return (
    <div className={`reply${done ? " posted" : ""}`}>
      <p className="who">{reply.target_author || "Unknown author"}</p>
      {reply.target_text && <p className="tt">{reply.target_text}</p>}
      {reply.target_url && (
        <p className="lnk">
          <a href={reply.target_url} target="_blank" rel="noreferrer">
            View the post
          </a>
        </p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={done} spellCheck />
      <div className="row">
        <span className={`count${over ? " over" : ""}`}>
          {text.length} / {MAX}
        </span>
        <button type="button" onClick={submitReply} disabled={done || state.loading || over || !text.trim()}>
          {done ? "Replied" : state.loading ? "Posting…" : "Post reply"}
        </button>
      </div>
      {state.url && (
        <p className="row">
          <span className="ok">
            Live at{" "}
            <a href={state.url} target="_blank" rel="noreferrer">
              {state.url}
            </a>
          </span>
        </p>
      )}
      {state.error && (
        <p className="row">
          <span className="err">{state.error}</span>
        </p>
      )}
    </div>
  );
}

// Build a bsky.app URL from an at:// uri so an already-posted row shows a link.
// at://<did>/app.bsky.feed.post/<rkey> -> https://bsky.app/profile/<did>/post/<rkey>
function bskyUrl(atUri: string): string {
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
  if (!m) return atUri;
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}
