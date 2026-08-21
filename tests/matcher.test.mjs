/* Client Communication matcher — regression suite.
 *
 *   node tests/matcher.test.mjs          run it
 *   node tests/matcher.test.mjs -v       also print scores and runners-up
 *
 * Cases come from HANDOFF-FOR-CLAUDE-CODE.md § 5. Baseline before the
 * rewrite was 11/18 with 6 wrong-rule hits; wrong-rule is the failure that
 * reaches a client, so it is counted separately and any occurrence fails
 * the run. No dependencies, no build step. */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const M = require(join(ROOT, 'public/comms-matcher.js'));
const bank = JSON.parse(readFileSync(join(ROOT, 'answer-bank.json'), 'utf8'));
const { topics, added } = M.mergeTopics(bank.templates);

const verbose = process.argv.includes('-v');

/* Must resolve to a specific rule. */
const MATCH_CASES = [
  ['how long until my results come back',        'results_timing'],
  ['when will my kit arrive',                    'results_timing'],
  ['i need to move my appointment to next week', 'reschedule'],
  ['it wont let me book anything',               'cantbook'],
  ['can i drink decaf before my dutch test',     'labprep'],
  ['i never got the activation email',           'estore'],
  ['where do i order my supplements',            'wherebuy'],
  ['do i need to fast before my blood draw',     'blood_draw'],
  ['im on my period can i still collect',        'collect_period'],
  ['how do i ship the sample back',              'fedex_return'],
  ['what happens after my care plan is done',    'after_plan'],
  ['when does my 3 months start',                'careplan_start'],
  ['i missed my welcome call',                   'welcome_call'],
  ['theres no requisition form in my box',       'no_requisition'],
  ['can i take the test if im on antibiotics',   'oat_prep_foods'],
  ['my supplement isnt on the store',            'notinstore'],
  ['is it cheaper on amazon',                    'amazon'],
  ['i want to add my daughter as a client',      'newclient_rate']
];

/* Must never render a green card. */
const LANE_CASES = [
  ['should i stop my binder im feeling worse',   'clinical'],
  ['my knee is swelling should i take advil',    'clinical'],
  ['what does my OAT result mean',               'clinical'],
  ['when will my refund come through',           'payment'],
  ['why was i charged $125 instead of $90',      'payment'],
  ['can i get my daughter started, how much',    'payment']
];

/* Extra guards on behaviour the handoff calls out as load-bearing. */
const GUARD_CASES = [
  ['should i stop taking my binder',                       'clinical'],
  ['my supplement is out of stock, should i take something else', 'clinical'],
  ['can i take advil before my blood draw',                'clinical'],
  ['is my cortisol high',                                  'clinical'],
  ['what is the price of the dutch test',                  'payment'],
  ['asdfgh qwerty zxcvbn',                                 'gap']
];

let pass = 0, wrongRule = 0, overRouted = 0, missed = 0;
const rows = [];

for (const [q, want] of MATCH_CASES) {
  const r = M.classify(q, topics);
  const got = r.topic ? r.topic.id : r.lane.toUpperCase();
  let verdict;
  if (got === want) { verdict = 'ok'; pass++; }
  else if (r.lane === 'clinical' || r.lane === 'payment') { verdict = 'OVER-ROUTED'; overRouted++; }
  else if (r.lane === 'gap') { verdict = 'missed'; missed++; }
  else { verdict = 'WRONG RULE'; wrongRule++; }
  rows.push([verdict, q, got, want, r.score]);
}

let laneFail = 0;
for (const [q, want] of [...LANE_CASES, ...GUARD_CASES]) {
  const r = M.classify(q, topics);
  const ok = r.lane === want;
  if (!ok) laneFail++;
  rows.push([ok ? 'ok' : 'LANE FAIL', q, r.lane + (r.topic ? ':' + r.topic.id : ''), want, r.score]);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nrules loaded: ${bank.templates.length} from answer-bank.json + ${added} bundled FAQ = ${topics.length}`);
console.log(`confidence floor: ${M.CONFIDENCE_FLOOR}\n`);
for (const [v, q, got, want, s] of rows) {
  const score = typeof s === 'number' ? s.toFixed(2) : '—';
  console.log(`${pad(v, 12)} ${pad(q, 46)} → ${pad(got, 18)} ${v === 'ok' ? '' : 'want ' + want}${verbose ? '  [' + score + ']' : ''}`);
}

if (verbose) {
  console.log('\nrunners-up:');
  for (const [q] of MATCH_CASES) {
    const idf = M.idfFor(topics);
    const top = topics.map(t => ({ id: t.id, n: M.score(q, t, idf) }))
      .sort((a, b) => b.n - a.n).slice(0, 3)
      .map(x => `${x.id} ${x.n.toFixed(2)}`).join(' | ');
    console.log(`  ${pad(q, 46)} ${top}`);
  }
}

const total = MATCH_CASES.length;
console.log(`\nmatch cases:  ${pass}/${total} correct · ${wrongRule} wrong-rule · ${overRouted} over-routed · ${missed} missed`);
console.log(`lane guards:  ${LANE_CASES.length + GUARD_CASES.length - laneFail}/${LANE_CASES.length + GUARD_CASES.length} correct`);

const ok = pass >= 17 && wrongRule === 0 && laneFail === 0;
console.log(ok ? '\nPASS\n' : '\nFAIL — target is 17/18 with zero wrong-rule and zero lane failures\n');
process.exit(ok ? 0 : 1);
