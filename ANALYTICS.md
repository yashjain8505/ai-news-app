# Admin analytics dashboard (`/admin/analytics`)

A private, admin-gated dashboard that fuses **Google Analytics** (acquisition/traffic)
with the app's own **Supabase** product data (engagement, content, subscribers), plus
an on-demand **AI analyst brief**. Growth-first.

- Route: `src/app/admin/analytics/page.tsx` (gated by `isAdmin()`, `noindex`, never cached)
- Data brain: `src/lib/analyticsData.ts` → `getAnalyticsOverview(days)`
- GA client: `src/lib/ga.ts` (service-account JWT → Data API `runReport`, zero deps)
- AI brief: `src/lib/aiBrief.ts` + `actions.ts` + `Brief.tsx` (runs only on button click)
- Charts: `src/app/admin/analytics/charts.tsx` (hand-rolled SVG/CSS, no chart lib)

Every panel **degrades gracefully**: missing GA creds → GA panels show a "connect GA"
note; missing service role → product panels hidden with a note; missing Anthropic key →
brief button hidden. The page never crashes on missing config.

## Environment variables

| Var | Required for | Notes |
|-----|--------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Product + newsletter panels | Already used by the rest of admin. |
| `ADMIN_SECRET` | Admin login | Already used by the rest of admin. |
| `GA4_PROPERTY_ID` | GA panels | The numeric property ID (NOT the `G-XXXX` measurement ID). |
| `GA_SERVICE_ACCOUNT_JSON_B64` | GA panels | `base64` of a GA-read service-account JSON key. |
| `ANTHROPIC_API_KEY` | AI brief | Optional. Enables the "Generate brief" button. |
| `ANALYTICS_BRIEF_MODEL` | AI brief | Optional. Defaults to `claude-sonnet-5`. |

Set these in `.env.local` for local dev and in Vercel project env for production.

## Google Analytics Data API setup (one-time)

1. **Property ID** — analytics.google.com → Admin → Property → *Property details* → copy
   the numeric **Property ID**.
2. Google Cloud console → create/pick a project → **APIs & Services → Library** →
   enable **Google Analytics Data API**.
3. **IAM & Admin → Service Accounts → Create** (no roles needed) → open it → **Keys →
   Add key → JSON** → download.
   - Shortcut: this project already uses `GSC_SERVICE_ACCOUNT_B64` for Search Console.
     You can reuse that same service account — just enable the GA Data API on its project
     and grant its email Viewer on the GA property (step 4).
4. GA → Admin → **Property Access Management → +** → add the service-account email
   (`…@….iam.gserviceaccount.com`) with the **Viewer** role.
5. Encode the key and set the env var:
   ```bash
   base64 -i /path/to/service-account.json | pbcopy   # macOS
   # → paste into GA_SERVICE_ACCOUNT_JSON_B64=...
   ```

## Cost

The AI brief is the only paid call and it runs **only when an admin clicks "Generate
brief"** — never on page load. GA and Supabase reads are free within normal quota.
