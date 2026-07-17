import "server-only";

// GA4 Data API client — dependency-free.
//
// We don't pull in @google-analytics/data (it drags gRPC + google-gax). Instead
// we sign a short-lived service-account JWT with node:crypto, exchange it for an
// OAuth access token, and POST plain JSON to the Data API's runReport endpoint.
// This keeps the bundle lean (matching the rest of the app) and gives us exactly
// the reports the dashboard needs.
//
// SECURITY: this module reads the service-account private key, so it is
// `server-only` — importing it from a Client Component is a build error, and the
// key can never be bundled to the browser. Treat it like adminData.ts.

import { createSign } from "node:crypto";

// --- config ------------------------------------------------------------------

const PROPERTY_ID = process.env.GA4_PROPERTY_ID?.trim();
// The base64 service-account JSON, accepted under several names so a small naming
// slip doesn't silently disable GA. GA-specific names win; otherwise fall back to
// the Search Console service account — it's the SAME Google account, so granting
// it GA "Viewer" makes it work for both. Only GA4_PROPERTY_ID is strictly needed.
const SA_JSON_B64 = (
  process.env.GA_SERVICE_ACCOUNT_JSON_B64 ??
  process.env.GA_SERVICE_ACCOUNT_B64 ??
  process.env.GSC_SERVICE_ACCOUNT_B64 ??
  ""
).trim();

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

// Parse the base64'd service-account JSON once. Any malformed input degrades to
// null (→ gaConfigured false) rather than throwing at import time, so a bad or
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

// True only when we have both a property to query and credentials to query it
// with. Callers check this to decide whether to render GA panels or a
// "connect Google Analytics" note — mirroring adminData.ts's `adminConfigured`.
export const gaConfigured = Boolean(PROPERTY_ID && serviceAccount);

export const gaPropertyId = PROPERTY_ID ?? null;

// --- token minting -----------------------------------------------------------

function b64url(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input, "utf8") : input)
    .toString("base64url");
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
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.private_key)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

// Cache the access token in module memory and reuse it until it's near expiry.
// Each serverless instance keeps its own copy; that's fine — worst case is one
// extra token exchange per cold start.
let cachedToken: { value: string; expiresAtSec: number } | null = null;

async function getAccessToken(): Promise<string> {
  const sa = serviceAccount;
  if (!sa) throw new Error("GA service account not configured");

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
    // Never let a slow token endpoint hang a request forever.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GA token exchange failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("GA token exchange returned no access_token");

  cachedToken = {
    value: json.access_token,
    expiresAtSec: nowSec + (json.expires_in ?? 3600),
  };
  return cachedToken.value;
}

// --- report types ------------------------------------------------------------

export type GaDateRange = { startDate: string; endDate: string; name?: string };

export type GaReportRequest = {
  dateRanges: GaDateRange[];
  dimensions?: string[];
  metrics: string[];
  orderBys?: object[];
  dimensionFilter?: object;
  limit?: number;
  keepEmptyRows?: boolean;
  metricAggregations?: string[];
};

// A normalized row: dimension values and metric values as parallel arrays, in
// the order requested. Numbers are pre-parsed so callers don't repeat Number().
export type GaRow = { dims: string[]; metrics: number[] };

export type GaReport = {
  rows: GaRow[];
  totals: number[];
  rowCount: number;
};

const EMPTY_REPORT: GaReport = { rows: [], totals: [], rowCount: 0 };

type RawResponse = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  totals?: { metricValues?: { value?: string }[] }[];
  rowCount?: number;
};

function normalize(raw: RawResponse): GaReport {
  const rows: GaRow[] = (raw.rows ?? []).map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => d.value ?? ""),
    metrics: (r.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
  const totals = (raw.totals?.[0]?.metricValues ?? []).map((m) => Number(m.value ?? 0));
  return { rows, totals, rowCount: raw.rowCount ?? rows.length };
}

function toRequestBody(req: GaReportRequest): object {
  return {
    dateRanges: req.dateRanges,
    dimensions: req.dimensions?.map((name) => ({ name })),
    metrics: req.metrics.map((name) => ({ name })),
    orderBys: req.orderBys,
    dimensionFilter: req.dimensionFilter,
    limit: req.limit,
    keepEmptyRows: req.keepEmptyRows,
    metricAggregations: req.metricAggregations,
  };
}

// --- public API --------------------------------------------------------------

// Run a single report. Returns an empty report when GA isn't configured so the
// dashboard can render regardless; throws only on a real API/network error so
// the caller can surface it per-panel.
export async function runReport(req: GaReportRequest): Promise<GaReport> {
  if (!gaConfigured) return EMPTY_REPORT;
  const token = await getAccessToken();
  const res = await fetch(`${DATA_API}/properties/${PROPERTY_ID}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toRequestBody(req)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GA runReport failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return normalize((await res.json()) as RawResponse);
}

// Batch up to 5 reports into one HTTP round-trip. Returns reports in the same
// order requested; empty array when GA isn't configured.
export async function batchRunReports(reqs: GaReportRequest[]): Promise<GaReport[]> {
  if (!gaConfigured) return reqs.map(() => EMPTY_REPORT);
  if (reqs.length === 0) return [];
  const token = await getAccessToken();
  const res = await fetch(`${DATA_API}/properties/${PROPERTY_ID}:batchRunReports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: reqs.map(toRequestBody) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GA batchRunReports failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { reports?: RawResponse[] };
  return (json.reports ?? []).map(normalize);
}

// Relative date range helper: `daysAgo(28)` → last 28 days incl. today.
export function daysAgo(n: number, name?: string): GaDateRange {
  return { startDate: `${n}daysAgo`, endDate: "today", name };
}
