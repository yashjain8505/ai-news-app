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
  return (
    <div className="cx">
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <span className="logo">W</span>
          <h1>WORTINS → BLUESKY</h1>
          <div className="sub">
            {queue.run_date} · {queue.slot} · review, edit, schedule
          </div>
        </header>

        {/* YOUR POSTS, auto-post 1 hour apart */}
        <ScheduleSection queue={queue} envKey={envKey} />

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

type SchedState = { loading: boolean; error: string | null; times: string[] | null };

// Approve the top ~3 candidate posts; they schedule now, +1h, +2h via
// /api/bluesky/schedule, each linking to its own story page. Editing locks once
// the queue row has been actioned (status "posted") so a revisit cannot
// double-schedule.
function ScheduleSection({ queue, envKey }: { queue: QueueRow; envKey: string }) {
  const top = (queue.candidates ?? []).slice(0, 3);
  const already = queue.status === "posted";

  const [texts, setTexts] = useState<string[]>(top.map((c) => c.draft_text ?? ""));
  const [state, setState] = useState<SchedState>({ loading: false, error: null, times: null });
  const [done, setDone] = useState<boolean>(already);

  const overAny = texts.some((t) => t.length > MAX);
  const emptyAny = texts.some((t) => !t.trim());
  const canSchedule = top.length > 0 && !done && !state.loading && !overAny && !emptyAny;

  function setAt(i: number, value: string) {
    setTexts((prev) => prev.map((t, j) => (j === i ? value : t)));
  }

  async function schedule() {
    if (!canSchedule) return;
    setState({ loading: true, error: null, times: null });
    try {
      const posts = top.map((c, i) => ({ slug: c.slug ?? "", text: texts[i].trim() }));
      const res = await fetch("/api/bluesky/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: envKey, queueId: queue.id, posts }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        scheduled?: { scheduled_for: string }[];
        count?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState({ loading: false, error: data.error || `Failed (${res.status}).`, times: null });
        return;
      }
      setState({
        loading: false,
        error: null,
        times: (data.scheduled ?? []).map((s) => s.scheduled_for),
      });
      setDone(true);
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Network error.", times: null });
    }
  }

  if (top.length === 0) {
    return (
      <>
        <h2>Your posts</h2>
        <p className="status">No candidate posts to schedule.</p>
      </>
    );
  }

  return (
    <>
      <h2>Your posts, auto-post 1 hour apart</h2>
      {already && <p className="status">These posts were already approved and scheduled.</p>}
      {top.map((c, i) => {
        const t = texts[i];
        const over = t.length > MAX;
        const when = i === 0 ? "now" : `+${i}h`;
        return (
          <div className={`card${done ? " posted" : ""}`} key={c.slug ?? i}>
            <div className="head">
              <span className="label">
                Post {i + 1} · {when}
              </span>
              <span className={`count${over ? " over" : ""}`}>
                {t.length} / {MAX}
              </span>
            </div>
            <p className="hint">{c.title ?? c.slug ?? `Story ${i + 1}`}</p>
            <textarea value={t} onChange={(e) => setAt(i, e.target.value)} disabled={done} spellCheck />
          </div>
        );
      })}

      <div className="row">
        <span className="status">
          {done
            ? "Approved and scheduled."
            : `${top.length} post${top.length > 1 ? "s" : ""}, posting now, +1h, +2h.`}
        </span>
        <button type="button" onClick={schedule} disabled={!canSchedule}>
          {done ? "Scheduled" : state.loading ? "Scheduling…" : "Approve & schedule"}
        </button>
      </div>

      {state.times && state.times.length > 0 && (
        <p className="row">
          <span className="ok">
            Scheduled:{" "}
            {state.times
              .map(
                (iso, i) =>
                  `${i === 0 ? "now" : `+${i}h`} (${new Date(iso).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })})`
              )
              .join(" · ")}
          </span>
        </p>
      )}
      {state.error && (
        <p className="row">
          <span className="err">{state.error}</span>
        </p>
      )}
    </>
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
