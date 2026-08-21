/* Client Communication — end-to-end guardrail suite.
 *
 *   node tests/fallback.e2e.mjs
 *
 * Drives the real page in a real browser with /api/* and the Answer Bank
 * fetch stubbed, and asserts the things that would hurt a client if they
 * broke: clinical and money questions never reach the AI classifier, the
 * classifier can only ever surface a STORED reply, a hallucinated rule id
 * falls back to the gap card, and the tab still works with the API dead.
 *
 * The unit suite (tests/matcher.test.mjs) covers matching accuracy. This one
 * covers wiring. Needs Playwright; skips cleanly with exit 0 if it isn't
 * installed, so it can sit in front of a CI step without blocking it.
 * Override the browser with PLAYWRIGHT_CHROMIUM=/path/to/chrome. */

import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import http from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── locate playwright + chromium, or skip ── */
let chromium;
for (const base of [ROOT, '/opt/node22/lib/node_modules/playwright/', process.env.PLAYWRIGHT_ROOT].filter(Boolean)) {
  try { chromium = createRequire(base.endsWith('/') ? base : base + '/').call(null, 'playwright').chromium; break; } catch {}
}
if (!chromium) { console.log('playwright not installed — skipping e2e guardrail suite'); process.exit(0); }

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const store = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(store)) return undefined;               // let playwright resolve it
  const dir = readdirSync(store).find(d => /^chromium-\d+$/.test(d));
  const p = dir && join(store, dir, 'chrome-linux', 'chrome');
  return p && existsSync(p) ? p : undefined;
}

/* ── static server over public/, with the fallback mode swappable ── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
let MODE = 'shadow';
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  try {
    let buf = readFileSync(join(ROOT, 'public', p));
    if (p === '/index.html' && MODE !== 'shadow') {
      buf = Buffer.from(String(buf).replace("const LLM_FALLBACK = 'shadow';", `const LLM_FALLBACK = '${MODE}';`));
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
const PORT = 8097;
await new Promise(r => srv.listen(PORT, r));

const browser = await chromium.launch({ executablePath: findChromium() });
const BANK = readFileSync(join(ROOT, 'answer-bank.json'), 'utf8');

/* The fallback only runs on Lane B, so these fixtures have to BE gaps. Adding
   a keyword can quietly turn one into a confident match and make every
   assertion below fail for the wrong reason — so verify against the matcher
   itself and say so plainly rather than reporting a phantom regression. */
const M = createRequire(import.meta.url)(join(ROOT, 'public/comms-matcher.js'));
const { topics: MT } = M.mergeTopics(JSON.parse(BANK).templates);
const GAP_Q = 'its been three weeks and i still have nothing';
const GAP_Q2 = 'the freezer thing how does that work';
for (const [name, q] of [['GAP_Q', GAP_Q], ['GAP_Q2', GAP_Q2]]) {
  const lane = M.classify(q, MT).lane;
  if (lane !== 'gap') {
    console.error(`fixture ${name} ("${q}") now resolves to "${lane}", not a gap.`);
    console.error('Pick a phrase the keyword matcher still misses, or these tests prove nothing.');
    process.exit(1);
  }
}

let fails = 0;
const check = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log((cond ? 'ok    ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

async function session(mode, classifyReply, { deadApi = false } = {}) {
  MODE = mode;
  const pg = await browser.newPage();
  const errs = [], logs = [], classifyCalls = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://raw.githubusercontent.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: BANK }));
  if (deadApi) {
    await pg.route('**/api/**', r => r.abort());
  } else {
    await pg.route('**/api/log-query', r => {
      logs.push(JSON.parse(r.request().postData() || '{}'));
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await pg.route('**/api/classify', r => {
      classifyCalls.push(JSON.parse(r.request().postData() || '{}'));
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(classifyReply) });
    });
  }
  await pg.goto(`http://localhost:${PORT}/index.html`);
  await pg.click('.tab:has-text("Client Communication")');
  await pg.waitForFunction(() => !/Loading/.test(document.getElementById('syncTxt').textContent), null, { timeout: 8000 });
  const ask = async q => {
    await pg.fill('#panel-comms #q', q);
    await pg.click('#panel-comms #go');
    await pg.waitForSelector('#panel-comms .lane-tag');
    await pg.waitForTimeout(300);
    return {
      tag: (await pg.textContent('#panel-comms .lane-tag')).trim(),
      topic: (await pg.textContent('#panel-comms .lane-topic')).trim(),
      body: await pg.textContent('#panel-comms .card'),
      reply: (await pg.locator('#panel-comms .reply').count()) ? await pg.textContent('#panel-comms .reply') : ''
    };
  };
  return { pg, errs, logs, classifyCalls, ask };
}

/* ── shadow: the VA sees no change, the classifier only reaches the log ── */
console.log('\n── shadow mode (the default)');
{
  const s = await session('shadow', { id: 'results_timing', reason: 'asks about turnaround' });
  const r = await s.ask(GAP_Q);
  check('gap card is what the VA sees', r.tag === 'Not documented', r.tag);
  check('no answer text leaks into it', !/three weeks|one to two weeks/i.test(r.body));
  check('classifier was consulted', s.classifyCalls.length === 1);
  check('it is sent ids and topics only, never replies',
    s.classifyCalls[0] && Object.keys(s.classifyCalls[0].candidates[0]).join() === 'id,topic');
  const last = s.logs[s.logs.length - 1];
  check('its pick is recorded in the log', last && last.llmId === 'results_timing');

  const c = await s.ask('should i stop my binder im feeling worse');
  check('clinical never reaches the classifier', s.classifyCalls.length === 1, 'calls=' + s.classifyCalls.length);
  check('clinical still hands off', c.tag === 'Hand off');

  const p = await s.ask('when will my refund come through');
  check('money never reaches the classifier', s.classifyCalls.length === 1, 'calls=' + s.classifyCalls.length);
  check('money still hands off', p.tag === 'Front Desk only');

  const a = await s.ask('where do i order my supplements');
  check('a confident keyword match skips the classifier', s.classifyCalls.length === 1);
  check('keyword matches still answer', a.tag === 'You can answer');
  check('every search is logged', s.logs.length === 4, 'logs=' + s.logs.length);
  check('no page errors', s.errs.length === 0, s.errs.join('|'));
  await s.pg.close();
}

/* ── on: the pick is rendered, flagged, and is the stored reply ── */
console.log('\n── on mode');
{
  const s = await session('on', { id: 'results_timing', reason: 'asks about turnaround' });
  const r = await s.ask(GAP_Q);
  check('renders the classifier pick', r.tag === 'You can answer' && /results take/i.test(r.topic), r.topic);
  check('flagged to the VA as matched by meaning', /Matched from your wording/.test(r.body));
  check('the reply is the STORED one, not generated', /Blood panels usually come back/.test(r.reply));
  await s.pg.close();
}

/* ── on, and the pick is a Front Desk rule ── */
console.log('\n── on mode, classifier picks a Front Desk rule');
{
  const s = await session('on', { id: 'labpricing', reason: 'asks a price' });
  const r = await s.ask('whats the damage for the fancy hormone panel');
  check('renders as Front Desk only', r.tag === 'Front Desk only', r.tag);
  /* The on-screen answer deliberately carries figures for the VA's reference
     ("For reference: ..." in the Answer Bank). The guardrail is the pasteable
     reply, which must stay the holding message. */
  check('pasteable reply carries no figure', !/\$\s?\d/.test(r.reply), (r.reply.match(/\$\s?\d+/g) || []).join());
  check('pasteable reply is the holding message', /passing this along to the correct team member/.test(r.reply));
  await s.pg.close();
}

/* ── on, and the classifier misbehaves ── */
console.log('\n── on mode, bad classifier output');
{
  const s = await session('on', { id: 'totally-made-up-rule', reason: 'hallucinated' });
  const r = await s.ask(GAP_Q2);
  check('an id we never offered falls back to the gap card', r.tag === 'Not documented', r.tag);
  await s.pg.close();

  const s2 = await session('on', { id: null, reason: 'no match' });
  const r2 = await s2.ask(GAP_Q2);
  check('null falls back to the gap card', r2.tag === 'Not documented', r2.tag);
  check('gap button still offered', (await s2.pg.locator('#panel-comms .gapbtn').count()) === 1);
  check('no page errors', s2.errs.length === 0, s2.errs.join('|'));
  await s2.pg.close();
}

/* ── every endpoint down ── */
console.log('\n── /api/* unreachable');
{
  const s = await session('on', null, { deadApi: true });
  const a = await s.ask('where do i order my supplements');
  check('keyword answers survive a dead API', a.tag === 'You can answer', a.tag);
  const g = await s.ask(GAP_Q);
  check('gaps survive a dead classifier', g.tag === 'Not documented', g.tag);
  check('no page errors', s.errs.length === 0, s.errs.join('|'));
  await s.pg.close();
}

console.log(fails === 0 ? '\nPASS\n' : `\n${fails} FAILED\n`);
await browser.close();
srv.close();
process.exit(fails === 0 ? 0 : 1);
