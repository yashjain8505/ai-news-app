import { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Flip a subscriber to unsubscribed by their token. Returns a coarse outcome so
// GET can render a page and POST (one-click) can return a bare status. The list
// is service-role only, so all of this runs server-side with that client.
async function unsubscribe(
  token: string | null
): Promise<"ok" | "invalid" | "error"> {
  if (!token || !UUID_RE.test(token)) return "invalid";
  const svc = supabaseService();
  if (!svc) return "error";
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("unsubscribe_token", token)
    .select("id");
  if (error) return "error";
  if (!data || data.length === 0) return "invalid"; // unknown/already-removed token
  return "ok";
}

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — Wortins</title>
<style>
  body{margin:0;background:#f3ecda;color:#1b1712;font-family:Georgia,"Times New Roman",serif;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:460px;text-align:center;border:1px solid #1b1712;background:#e7dfcb;padding:40px 32px}
  .mark{display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;
    background:#9c2b1d;color:#f3ecda;font-size:30px;font-weight:700;margin-bottom:18px}
  h1{font-size:26px;margin:0 0 10px}
  p{font-size:16px;line-height:1.55;color:#4a4338;margin:0 0 22px}
  a{display:inline-block;color:#9c2b1d;text-decoration:none;font-style:italic;font-size:15px}
</style></head><body>
<div class="card"><div class="mark">W</div>${body}
<a href="https://www.wortins.com">Return to Wortins &rarr;</a></div>
</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Human click from the email footer link.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const res = await unsubscribe(token);
  if (res === "ok")
    return page(
      "Unsubscribed",
      `<h1>You're unsubscribed</h1><p>You won't receive the Wortins Daily anymore. Changed your mind? You can subscribe again anytime from the site.</p>`
    );
  if (res === "invalid")
    return page(
      "Link expired",
      `<h1>This link isn't valid</h1><p>It may have already been used, or the address was already removed. Nothing more to do.</p>`
    );
  return page(
    "Something went wrong",
    `<h1>Something went wrong</h1><p>We couldn't process that just now. Please try the link again in a moment.</p>`
  );
}

// One-click unsubscribe (RFC 8058): mail clients POST here directly.
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const res = await unsubscribe(token);
  return new Response(null, { status: res === "error" ? 500 : 200 });
}
