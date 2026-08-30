// Search-query segmentation.
//
// Not every Search Console impression comes from a person. Three populations
// show up in the query dimension and they have completely different click
// behaviour, so any metric that averages them describes none of them:
//
//   evergreen → people. The only segment worth writing for or optimising.
//   dated     → alerting tools, aggregators and research agents issuing
//               time-scoped queries ("ai funding july 2026", "latest ...") on a
//               schedule. They rank a fresh exact-match page very highly and
//               essentially never click.
//   operator  → search operators and boolean groups. Tools, never people.
//
// Measured on wortins.com over 90 days: the non-evergreen segments carried 923
// impressions at a predicted 3.8-12.6% CTR and returned ZERO clicks between
// them, while evergreen queries behaved normally. Feeding those segments to the
// content robot means commissioning posts to chase traffic that will never
// convert, and reading them into the CTR makes a healthy site look broken.
//
// Ported from the geo-seo-auditor's src/opportunity.js, where the full scorer
// and its guardrails live. Keep the two in sync if the rules change.

export type QuerySegment = "evergreen" | "dated" | "operator";

const OPERATOR_RE =
  /\b(?:after|before|site|inurl|intitle|filetype|source|related|cache):|\bOR\b|\bAND\b|[()]|["“”].*["“”]/;

const DATED_RE =
  /\b(?:20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|today|yesterday|this week|this month|latest|breaking)\b/i;

// Uppercase OR is Google's operator and is caught above. Monitoring tools also
// emit lowercase boolean lists ("x or y or z announcement"), which a person
// never types — but a single "or" is ordinary human phrasing ("claude or
// chatgpt"), so it takes two before we call it machinery.
function isBooleanList(query: string): boolean {
  return (query.match(/\bor\b/gi) ?? []).length >= 2;
}

export function classifyQuery(query: string): QuerySegment {
  const q = (query ?? "").trim();
  if (!q) return "operator";
  if (OPERATOR_RE.test(q) || isBooleanList(q)) return "operator";
  if (q.length > 90) return "operator";
  if (DATED_RE.test(q)) return "dated";
  return "evergreen";
}

// True only for queries a person plausibly typed and that are worth acting on.
export function isBuyerQuery(query: string): boolean {
  return classifyQuery(query) === "evergreen";
}
