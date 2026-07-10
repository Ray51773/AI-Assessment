# AI Foundation Security Checker

A single-file, no-build, no-backend tool for running a lightweight first-pass
security assessment of an AI system (chatbot, RAG assistant, or agent). It
covers 19 checks across five domains — Input & Prompt Security, Data & RAG
Security, Output & Model Security, Agent & Tool Integration Security, and
Governance & Monitoring — and produces a radar-chart report with a
plain-language gap list.

Everything lives in **`index.html`**. Open it directly in a browser (double-click
the file, or host it anywhere static) and it works — no server, no npm
install, no build step.

## What it is, and isn't

This is a **lightweight foundation check**, not a penetration test, red-team
engagement, or certified compliance audit. It's meant to surface common,
high-value gaps in under an hour and give both a security consultant and a
non-technical client a shared, plain-language picture of where the weak
points are. A clean result here does not mean the system is secure — it means
it passed a small, fixed set of checks. Framework references shown in the UI
(NIST AI RMF, ISO/IEC 42001, MITRE ATLAS) are indicative orientation pointers,
not a certified compliance crosswalk.

## How it works

- **Guided checks** (15 of the 19): structured questions with four possible
  answers — Yes / Partially / No / Not applicable — plus a "Why this matters"
  expander with plain-language reasoning and what evidence would prove the
  control is in place.
- **Automated checks** (4 of the 19): the tool sends small, clearly-labelled
  test payloads (prompt injection variants, system-prompt extraction
  attempts, a cross-tenant data leakage probe, and a sensitive-data
  elicitation probe) directly from your browser to an endpoint you configure,
  and applies a transparent heuristic (canary-token matching for injection,
  keyword/regex detection for the rest) to suggest a result. You always
  confirm or override the suggestion — some of these (e.g. "did this leak
  another user's data?") need human judgment the tool can't fully automate.
- Every check is weighted by severity (Critical/High/Medium/Low) and rolled
  up into a domain score, then averaged into an overall score and mapped to a
  maturity band (Ad Hoc / Developing / Managed / Robust).
- State autosaves to the browser's `localStorage` and can be exported/imported
  as JSON — a consultant can save a client's assessment and reopen it later,
  or send it back to the client. Credentials are excluded from JSON exports
  by default (there's an opt-in checkbox to include them).
- The Report tab has an inline SVG radar chart (no charting library, no CDN
  dependency — the whole tool works fully offline once loaded), a severity-sorted
  gap list in plain language, a per-domain technical detail accordion, and
  three export options: PNG (chart only), Print/PDF (one-page stakeholder
  summary via the browser's print dialog), and full JSON.

## Hosting it

Because it's one static HTML file with everything inlined, any static host
works:

- **Cloudflare Pages**: create a project, set the build output directory to
  the folder containing `index.html` with no build command, and deploy. Or
  just drag-and-drop the file in the Pages dashboard.
- **GitHub Pages / Netlify / S3+CloudFront / any static bucket**: upload
  `index.html` as-is.
- **Local / air-gapped use**: just open the file in a browser. No server
  needed for the guided checks, scoring, chart, or export/import — those all
  run purely client-side. (The automated tests still need network access
  from the browser to whatever endpoint you point them at.)

There is nothing to build and no environment variables to set. If you fork
this to customize the check list or wording, just edit `index.html` directly
— the check data lives in the `CHECKS` array near the top of the `<script>`
block.

## Running it live in a client session

1. Open `index.html` and fill in **Setup**: client/org name, system being
   assessed, assessor name, and session type (self-serve vs
   consultant-facilitated) — this is just metadata for the report header.
2. If you'll run the automated tests, configure the **endpoint** in Setup:
   URL, auth header, and the request body template. The default template
   targets an OpenAI-compatible chat completion endpoint
   (`{"messages":[{"role":"user","content":"{{PROMPT}}"}]}`); edit it to match
   a RAG/query endpoint if needed (e.g. `{"query":"{{PROMPT}}"}`), and update
   the response text path accordingly (e.g. `answer` instead of
   `choices.0.message.content`). Use **Test connection** to confirm it's
   wired up correctly before running real probes.
3. Say the credential warning out loud if the client is watching: requests go
   straight from the browser to their endpoint via `fetch()` — nothing passes
   through any server related to this tool. If the endpoint doesn't allow
   browser-based requests (CORS), the request will simply fail in the
   browser; no data will have been sent. This is common for hosted APIs not
   designed for direct browser calls, and is worth flagging to the client as
   an architectural note in its own right.
4. Work through **Guided Checks** together — the "Why this matters" expander
   on each item is written so you can read it aloud to a non-technical client
   and it still makes sense, while still being precise enough for a technical
   stakeholder.
5. Run **Automated Tests** for the domains that have them. Each check shows
   the exact payload sent and the raw response, with a suggested result you
   confirm or override — useful for narrating what's happening to the client
   in real time.
6. Review the **Report** tab together: radar chart, domain scores, and the
   gap list sorted by severity. Use **Export summary (Print/PDF)** for a
   one-pager to leave with a non-technical stakeholder, and **Export JSON**
   to keep a working file you can reopen next session or hand off for deeper
   technical follow-up.

## Limitations to be upfront about

- The automated probes cover a small, fixed set of known attack patterns.
  Passing them is evidence of a baseline, not proof of resistance to novel or
  targeted attacks.
- CORS will block automated tests against many endpoints not built for
  direct browser access; that's a browser security feature, not a bug in
  this tool. Where it applies, judge that check manually against other
  evidence (server logs, existing pen-test results, etc.).
- Heuristic detection (canary matching, keyword/regex scanning) is
  intentionally simple and transparent so it's easy to sanity-check, but it
  can both over- and under-flag. Always read the actual response before
  confirming a result.
- Guided checks rely on self-attestation. They're a fast way to structure a
  conversation about controls, not independent verification that the control
  actually works as described.
