# Admin analytics dashboard (`/admin/analytics`)

A private, admin-gated dashboard that fuses **Google Analytics** (acquisition/traffic)
with the app's own **Supabase** product data (engagement, content, subscribers), plus
an **AI analyst brief** generated out-of-band by a GitHub workflow. Growth-first.

- Route: `src/app/admin/analytics/page.tsx` (gated by `isAdmin()`, `noindex`, never cached)
- Data brain: `src/lib/analyticsData.ts` → `getAnalyticsOverview(days)`
- GA client: `src/lib/ga.ts` (service-account JWT → Data API `runReport`, zero deps)
- Charts: `src/app/admin/analytics/charts.tsx` (hand-rolled SVG/CSS, no chart lib)
- Brief (display): `src/lib/brief.ts` (`getStoredBrief`) + `Brief.tsx` — reads the latest
  stored brief; the app itself makes **no LLM call**.
- Brief (generation): `.github/workflows/analytics-brief.yml` +
  `.github/scripts/analytics-brief.mjs` — runs the `claude` CLI on your Claude
  subscription token and upserts the result into `analytics_briefs`.

Every panel **degrades gracefully**: missing GA creds → GA panels show a "connect GA"
note; missing service role → product panels hidden with a note; no brief generated yet →
the panel explains how to run the workflow. The page never crashes on missing config.

## Environment variables

| Var | Required for | Notes |
|-----|--------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Product + newsletter panels, brief storage read | Already used by the rest of admin. |
| `ADMIN_SECRET` | Admin login | Already used by the rest of admin. |
| `GA4_PROPERTY_ID` | GA panels | The numeric property ID (NOT the `G-XXXX` measurement ID). |
| `GA_SERVICE_ACCOUNT_JSON_B64` | GA panels | `base64` of a GA-read service-account JSON key (can reuse `GSC_SERVICE_ACCOUNT_B64`'s value). |

No Anthropic API key anywhere — see the brief section below.

## AI brief (no API key)

The brief is produced by the **`analytics-brief`** GitHub workflow, not the app:

1. It fetches the computed overview from `GET /api/admin/brief-input?range=N`, which is
   gated by `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (reuses a secret both
   sides already have — no new secret).
2. Pipes it to `claude -p` (the real CLI, authenticated by `CLAUDE_CODE_OAUTH_TOKEN` —
   your Claude subscription, **no metered cost**).
3. Upserts the result into the `analytics_briefs` table. The dashboard reads the latest.

Runs daily on GitHub cron (04:00 UTC / 09:30 IST) and on `workflow_dispatch`. GitHub
secrets needed (both already present for the curator): `CLAUDE_CODE_OAUTH_TOKEN`,
`SUPABASE_SERVICE_KEY`. To refresh manually: repo → **Actions → Analytics brief → Run
workflow**.

## Google Analytics Data API setup (one-time)

1. **Property ID** — analytics.google.com → Admin → Property → *Property details* → copy
   the numeric **Property ID**.
2. Enable the **Google Analytics Data API** on the service account's Google Cloud project.
3. GA → Admin → **Property Access Management → +** → add the service-account email with
   the **Viewer** role.
4. Set `GA4_PROPERTY_ID` (the number) and `GA_SERVICE_ACCOUNT_JSON_B64` (reuse the value
   of `GSC_SERVICE_ACCOUNT_B64`) in Vercel, then redeploy.
