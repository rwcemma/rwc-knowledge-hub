# rwc-knowledge-hub

> ⚠️ **This repository is public.** Everything committed here is world-readable
> at `raw.githubusercontent.com`, including `sops.json` and `answer-bank.json`.
> Never commit client chat exports, message transcripts, names, or query logs.

## Client Communication tab

A VA pastes what a client asked and gets back one of three things: the answer
plus a pasteable reply, a holding reply because no rule covers it, or a holding
reply because it's clinical or about money and they must not answer at all.

### How a question gets routed

```
question
  ├─ clinical detector ──────────────► hand off, no answer shown
  ├─ money detector ─────────────────► hand off, no answer shown
  ├─ keyword matcher (score ≥ 5.0) ──► the matching rule
  └─ everything else ────────────────► AI fallback ─► a rule, or the gap card
```

The keyword matcher absorbs *format* variance — case, punctuation, missing
apostrophes, plurals, word order, filler words. It cannot absorb *vocabulary*
variance: a client writing "any update on my labs" shares no word with the
turnaround rule. That's what the AI fallback is for, and why the query log
matters more than either.

### Files

| File | Role |
|---|---|
| `public/comms-matcher.js` | Lane detectors, scoring, bundled FAQ topics. Shared by both pages so they can't drift. |
| `public/index.html` | The deployed hub. Netlify publishes `public/`. |
| `client-communication-tab.html` | Standalone preview of the same tab. Not deployed. |
| `answer-bank.json` | 31 compiled rules. Fetched at page load. **Never hand-edit** — the nightly compile overwrites it. |
| `netlify/functions/classify.js` | `/api/classify` — AI fallback. Selects a rule id, never writes a reply. |
| `netlify/functions/log-query.js` | `/api/log-query` — records what VAs type, so keyword lists come from real traffic. |

### Tests

```
node tests/matcher.test.mjs      # matching accuracy — -v for scores and runners-up
node tests/fallback.e2e.mjs      # guardrails in a real browser (skips without Playwright)
```

The unit suite covers 18 match cases plus 12 lane guards. The e2e suite covers
the wiring: that clinical and money questions never reach the classifier, that
the classifier can only surface a stored reply, that a hallucinated rule id
falls back to the gap card, and that the tab still works with the API down.
Run both before pushing — a failure in either is a client-facing bug.

### AI fallback

Only consulted when the keyword matcher finds nothing confident. It is sent the
question and a list of `{id, topic}` pairs, and returns one id or null. The
browser then renders the **stored** reply for that id from its own copy of the
bank, so a hallucinated id simply fails the lookup. The model never writes reply
text and is never reached by a clinical or money question.

Mode is the `LLM_FALLBACK` constant at the top of the tab's script:

- `'off'` — deterministic matcher only
- `'shadow'` — **current setting.** Consults the classifier and logs what it
  would have picked, while the VA still sees the normal gap card. Read a week of
  the log before promoting it.
- `'on'` — renders the pick, badged so the VA knows it was matched by meaning
  and should check it before sending

### Netlify environment variables

| Var | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/ask`, `/api/classify` | Already set for the SOP Assistant |
| `CLAUDE_CLASSIFY_MODEL` | `/api/classify` | Defaults to `claude-haiku-4-5` |
| `SLACK_WEBHOOK_URL` | `/api/sop-needed` | Posts gaps to `#sop-needed` |
| `AIRTABLE_API_KEY` | `/api/log-query` | Token with `data.records:write` |
| `AIRTABLE_LOG_BASE` | `/api/log-query` | Base id, `appXXXXXXXXXXXXXX` |
| `AIRTABLE_LOG_TABLE` | `/api/log-query` | Defaults to `Comms Queries` |

With the Airtable vars unset, logging is a silent no-op — the tab works, it just
learns nothing. The log holds **client message text**, so it must stay in an
access-controlled base.

Log table columns: `Question` (text), `Lane` (text), `Matched Rule` (text),
`Score` (number), `LLM Rule` (text), `LLM Reason` (text), `Mode` (text).

### Improving matching

1. **Wrong answer text** → fix the Answer Bank Doc, not this repo.
2. **Right rule exists but wasn't found** → add a `KEYS:` line to that rule in
   the Doc, in the client's words. The compile uses them verbatim. Read the
   query log to find out which phrasings to add.
3. **`KEY_AUGMENTS`** in `comms-matcher.js` is the stopgap for rules that don't
   have a `KEYS:` line yet — it survives the nightly compile. Migrate entries to
   the Doc and delete them from here.
