import "server-only";

// Google Search Console (Search Analytics) client — dependency-free.
//
// A twin of ga.ts: we don't pull in googleapis (it drags gRPC + google-gax).
// Instead we sign a short-lived service-account JWT with node:crypto, exchange it
// for an OAuth access token, and POST plain JSON to the Search Analytics API.
// This keeps the bundle lean (matching the rest of the app) and gives us exactly
// the query/page/date reports the SEO dashboard needs.
//
// SECURITY: this module reads the service-account private key, so it is
// `server-only` — importing it from a Client Component is a build error, and the
// key can never be bundled to the browser. Treat it like adminData.ts / ga.ts.

import { createSign } from "node:crypto";

// --- config ------------------------------------------------------------------

const SA_JSON_B64 = process.env.GSC_SERVICE_ACCOUNT_B64?.trim();

// The verified Search Console property. Defaults to the known Wortins DOMAIN
// property (captures every subdomain + http/https), overridable via env for
// preview/other properties. Because it has a default, `gscConfigured` depends
// only on whether we have credentials.
const PROPERTY = process.env.GSC_PROPERTY?.trim() || "sc-domain:wortins.com";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

// Parse the base64'd service-account JSON once. Any malformed input degrades to
// null (→ gscConfigured false) rather than throwing at import time, so a bad or
// missing env var can never break the build or an un-provisioned preview.
const serviceAccount: ServiceAccount | null = (() => {
  if (!SA_JSON_B64) return null;
  try {
    const json = Buffer.from(SA_JSON_B64, "base64").toString("utf8");
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) return null;
    return {
      client_email: sa.client_email,
      private_key: sa.private_key,
      token_uri: sa.token_uri || DEFAULT_TOKEN_URI,
    };
  } catch {
    return null;
  }
})();

// True when we have credentials to query with. Callers check this to decide
// whether to render Search panels or a "connect Search Console" note — mirroring
// adminData.ts's `adminConfigured` and ga.ts's `gaConfigured`.
export const gscConfigured = Boolean(serviceAccount);

export const gscProperty = PROPERTY;

// --- token minting -----------------------------------------------------------

function b64url(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input, "utf8") : input).toString(
    "base64url",
  );
}

// Signs the RS256 assertion JWT that Google exchanges for an access token.
function signAssertion(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.private_key)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

// Cache the access token in module memory and reuse it until near expiry. Each
// serverless instance keeps its own copy; worst case is one extra exchange per
// cold start.
let cachedToken: { value: string; expiresAtSec: number } | null = null;

async function getAccessToken(): Promise<string> {
  const sa = serviceAccount;
  if (!sa) throw new Error("GSC service account not configured");

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtSec - 60 > nowSec) {
    return cachedToken.value;
  }

  const assertion = signAssertion(sa, nowSec);
  const res = await fetch(sa.token_uri ?? DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GSC token exchange failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("GSC token exchange returned no access_token");

  cachedToken = {
    value: json.access_token,
    expiresAtSec: nowSec + (json.expires_in ?? 3600),
  };
  return cachedToken.value;
}

// --- Search Analytics query --------------------------------------------------

export type GscDimension =
  | "query"
  | "page"
  | "date"
  | "country"
  | "device"
  | "searchAppearance";

export type SearchAnalyticsQuery = {
  startDate: string; // YYYY-MM-DD (inclusive)
  endDate: string; // YYYY-MM-DD (inclusive)
  dimensions?: GscDimension[];
  rowLimit?: number; // max 25000
  startRow?: number;
  // Raw passthroughs for advanced use (filters, search type).
  dimensionFilterGroups?: object[];
  type?: "web" | "discover" | "googleNews" | "news" | "image" | "video";
  // "final" = only finalized data (stable, ~2–3 day lag). "all" = includes
  // fresh-but-incomplete recent days. We default to final for trustworthy numbers.
  dataState?: "final" | "all";
  aggregationType?: "auto" | "byPage" | "byProperty";
};

// One Search Analytics row. `keys` holds the dimension values in requested
// order; ctr is a 0..1 fraction; position is the average rank (1 = best).
export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

// Run one Search Analytics query. Returns [] when GSC isn't configured so the
// dashboard renders regardless; throws only on a real API/network error so the
// caller can surface it per-panel.
export async function searchAnalytics(q: SearchAnalyticsQuery): Promise<GscRow[]> {
  if (!gscConfigured) return [];
  const token = await getAccessToken();
  const url = `${API}/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: q.startDate,
      endDate: q.endDate,
      dimensions: q.dimensions,
      rowLimit: q.rowLimit ?? 1000,
      startRow: q.startRow ?? 0,
      dimensionFilterGroups: q.dimensionFilterGroups,
      type: q.type,
      dataState: q.dataState ?? "final",
      aggregationType: q.aggregationType,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GSC searchAnalytics failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    rows?: {
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }[];
  };

  return (json.rows ?? []).map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

// --- sitemaps ----------------------------------------------------------------

// One submitted sitemap, flattened from the Sitemaps API. `submitted`/`indexed`
// sum the per-content-type counts Google reports; `indexed` is often 0 even for
// healthy sitemaps (Google stopped populating it reliably), so treat a present
// `lastDownloaded` + zero errors as the real "it's being read" signal.
export type Sitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  warnings: number;
  errors: number;
  submitted: number;
};

// List submitted sitemaps for the property. Returns null (not []) when the call
// fails — a "Full" (non-Owner) service account may be denied here, and null lets
// the UI say "couldn't read sitemaps" instead of the wrong "no sitemap submitted".
// An empty array is a real answer: the property has no sitemaps submitted.
export async function listSitemaps(): Promise<Sitemap[] | null> {
  if (!gscConfigured) return null;
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return null;
  }
  const url = `${API}/sites/${encodeURIComponent(PROPERTY)}/sitemaps`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!res || !res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    sitemap?: {
      path?: string;
      lastSubmitted?: string;
      lastDownloaded?: string;
      isPending?: boolean;
      isSitemapsIndex?: boolean;
      warnings?: string | number;
      errors?: string | number;
      contents?: { submitted?: string | number }[];
    }[];
  } | null;
  if (!json) return null;

  return (json.sitemap ?? []).map((s) => ({
    path: s.path ?? "",
    lastSubmitted: s.lastSubmitted ?? null,
    lastDownloaded: s.lastDownloaded ?? null,
    isPending: Boolean(s.isPending),
    isSitemapsIndex: Boolean(s.isSitemapsIndex),
    warnings: Number(s.warnings ?? 0),
    errors: Number(s.errors ?? 0),
    submitted: (s.contents ?? []).reduce(
      (acc, c) => acc + Number(c.submitted ?? 0),
      0,
    ),
  }));
}

// --- date helpers ------------------------------------------------------------

// GSC wants YYYY-MM-DD in the property's timezone (America/Los_Angeles for GSC).
// We format in UTC, which is close enough for day-grain SEO reporting.
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// n days before today (UTC). daysAgo(0) === today.
export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDay(d);
}
