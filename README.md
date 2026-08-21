# rwc-knowledge-hub

## Client Communication tab

The matcher that routes a client question to a lane and a rule lives in
`public/comms-matcher.js` — one file, shared by the deployed hub
(`public/index.html`, `#panel-comms`) and the standalone preview
(`client-communication-tab.html`), so the two can't drift.

Run the regression suite after any change to it:

```
node tests/matcher.test.mjs      # -v for scores and runners-up
```

18 match cases plus 12 lane guards. The guards assert that clinical and money
questions never render an answer; a failure there is a client-facing bug.

`answer-bank.json` is compile output from the RWC Client Answer Bank Doc and is
overwritten nightly — fix rule content in the Doc, not here. Missing keywords
can be added as a `KEYS:` line on the rule in the Doc; `KEY_AUGMENTS` in
`comms-matcher.js` is the stopgap for rules that don't have one yet.
