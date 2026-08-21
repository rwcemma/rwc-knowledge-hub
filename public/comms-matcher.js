/* ─────────────────────────────────────────────────────────────────────────
   RWC Client Communication — matching engine.

   Single source of truth for lane routing and rule matching. Loaded by
   public/index.html (the deployed hub) and client-communication-tab.html
   (the standalone copy), and required directly by tests/matcher.test.mjs.

   Plain script, no build step, no dependencies. Exposes window.RWCComms in
   the browser and module.exports under Node.

   Design notes — why it looks like this:
     · Scoring is IDF-weighted token overlap, maxed over a rule's keys rather
       than summed, so a rule with 12 keys can't out-collect a rule with 6.
     · Substring containment ("store" inside "e-store") is never a match.
       Tokens must match after normalisation and plural folding.
     · Below CONFIDENCE_FLOOR the caller must render Lane B, not a green
       card. A wrong green card is the failure mode that reaches clients.
   ───────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RWCComms = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ── 1. Lane C detectors — clinical ─────────────────────────────────────
   These run before any rule matching and override it. Split into HARD
   (always wins) and SOFT (may be released by documented lab prep, see
   isClinical below). */

const HARD_CLINICAL = [
  /\b(symptom|symptoms|flare|flaring|herx|die.?off|detox reaction|healing crisis)\b/i,
  /\b(pain|hurting|nausea|nauseous|headache|migraine|dizzy|dizziness|rash|swelling|swollen|fatigue|exhausted|insomnia|palpitation)\b/i,
  /\b(should i (take|stop|pause|start|keep|continue|try|increase|decrease|double)|can i (take|stop|pause|mix|combine))\b/i,
  /\b(dose|dosage|how much should i|how many should i|twice a day|with food|empty stomach)\b/i,
  /\d\s*-?\s*\d*\s*(mg|mcg|ml|iu|grams?)\b/i,   // "2-3mg of melatonin" has no \b before mg
  /\b\d+\s*(caps?|capsules?|tabs?|tablets?|pills?|scoops?|drops?|pumps?|sprays?)\b/i,
  /\b(caps?|capsules?|tablets?|pills?|scoops?|drops?)\s+(daily|a day|per day|every day|each day|twice)\b/i,
  /\b(advil|tylenol|ibuprofen|motrin|aspirin|benadryl|zyrtec|claritin|prescription)\b/i,
  /\b(is (this|that|it) normal|is (this|that) (bad|serious|concerning)|should i be worried|worse|getting worse)\b/i,
  /\bwhat (do|does) (my|the|this|that) [a-z0-9 ]{0,25}\b(result|results|lab|labs|number|numbers|level|levels|value|values|marker|markers) mean\b/i,
  /\b(explain|interpret|go over) (my|the|these|those) (result|results|lab|labs|number|numbers|level|levels)\b/i,
  /\bis my [a-z0-9 ]{0,20}(high|low|normal|elevated|off)\b/i,
  /\b(feeling (worse|awful|terrible|off)|reacting to|reaction to|side effect)\b/i
];

/* Soft: naming a medication is only clinical when it isn't a documented
   prep instruction. "Can I test while on antibiotics" is answerable
   (Answer Bank § 16.2); "should I stop my antibiotics" is not — that one
   trips HARD_CLINICAL's should-i-stop pattern and never reaches here. */
const SOFT_CLINICAL = [
  /\b(antibiotic|antibiotics)\b/i
];

/* Collection / testing context that releases a SOFT match. */
const PREP_CONTEXT = /\b(test|testing|collect|collecting|collection|sample|specimen|draw|kit|urine|stool|panel|requisition|fast|fasting)\b/i;

/* Combination detectors: each fires only when EVERY pattern matches. Both of
   these were found in the real chat corpus falling through to Lane B — safe,
   because a gap still hands off, but labelled "undocumented" when they are in
   fact questions no one here may answer. */
const SUBSTANCE = /\b(cleanse|detox|protocol|binder|supplement|supplements|medication|meds?|herb|herbs|tincture|drops|capsule|suppositor\w*|probiotic|melatonin|glutathione|charcoal|bentonite|wormwood|black walnut|clove|cloves|steroid|prednisone|antibiotic|antibiotics|cellcore|viradchem|nanoglut|boswellia|a-?fng)\b/i;

const COMBO_CLINICAL = [
  /* "I'm mid parasite cleanse — should I wait to do the labs?" Answer Bank § 6:
     never tell a client whether a deviation invalidated a sample and never tell
     them whether to reschedule a collection. Requires a named substance, so the
     documented menstruation timing rule (§ 16.1) stays answerable. */
  {
    name: 'delay-collection-around-a-substance',
    all: [
      SUBSTANCE,
      /\b(wait|hold off|holding off|delay|postpone|push (it|them|this) back|reschedule)\b/i,
      /\b(lab|labs|test|testing|collect|collecting|collection|sample|draw|bloodwork|blood work)\b/i
    ]
  },
  /* "Am I supposed to do the boric suppositories for 7 days and then the
     probiotic?" — protocol sequencing is the practitioner's call. */
  {
    name: 'protocol-sequencing',
    all: [
      SUBSTANCE,
      /\b(am i supposed to|do i keep|do i continue|how long do i|how many days|then do the|along with the|at the same time|before or after|first or)\b/i
    ]
  }
];

/* "Take the test" is not "take a substance". Neutralised before the
   clinical patterns run so the can-i-take verb form doesn't misfire. */
const TAKE_A_TEST = /\b(take|taking|do|doing) (the|this|my|a|that) (test|oat|dutch|htma|panel|kit|sample|draw|collection|labs?)\b/gi;

/* "Sorry to be a pain" is an apology, not a symptom. Only the article forms
   preceded by be/being/such/what are neutralised — "I have a pain in my side"
   and "a pain in my knee" still read as symptoms, which is the point. */
const PAIN_IDIOM = /\b(be|being|such|what) a pain\b/gi;

function clinicalProbe(q) {
  return String(q).replace(TAKE_A_TEST, 'perform $2 $3').replace(PAIN_IDIOM, '$1 a nuisance');
}

function isClinical(q) {
  const probe = clinicalProbe(q);
  if (HARD_CLINICAL.some(r => r.test(probe))) return true;
  if (COMBO_CLINICAL.some(c => c.all.every(r => r.test(probe)))) return true;
  if (!SOFT_CLINICAL.some(r => r.test(probe))) return false;
  /* Soft-only hit: release it when the question is plainly about a test or
     a collection, where the prep rules are documented and quotable. */
  return !PREP_CONTEXT.test(probe);
}

/* ── 2. Lane C detectors — money ────────────────────────────────────────── */

const PAYMENT = [
  /\b(invoice|charge|charged|billing|bill|refund|refunded|payment|paid|pay|price|pricing|cost|costs|rate|subscription|card declined|failed payment|overcharged|discount)\b/i,
  /\$\s?\d/,
  /\b(\d{2,4})\s?(dollars|usd)\b/i,
  /\bhow much (is|are|was|does|do|would|will|to|for)\b/i,
  /\bhow much\s*[?.!,]?\s*$/i
];

function isPayment(q) { return PAYMENT.some(r => r.test(q)); }

/* ── 3. Normalisation ───────────────────────────────────────────────────── */

/* Deliberately short. IDF weighting handles the rest, and words that look
   like noise elsewhere carry meaning here — "no requisition", "won't let me
   book", "never got the email" all hinge on a word a bigger list would eat. */
const STOP = new Set(('a an the and or but if is are was were be been being am i me my mine we us our ' +
  'you your he she it its they them their this that these those to of in on at for with from by as so ' +
  'than then here there theres when where what which who how why do does did doing have has had will ' +
  'would shall may might must could should can go going just also any some yet about into again more ' +
  'most very really please thanks thank hi hello hey ok okay one been ' +
  /* Pure filler. Added after a real message matched the cellcore_sale key
     "discount right now" on nothing but "right" and "now" — high-frequency
     words that carry no intent but still accumulate score. */
  'right now anything something everything thing things sorry actually maybe ' +
  'probably well much many lot bit cuz gonna wanna').split(' '));

function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")   // curly → straight
    .replace(/'/g, '')                        // won't → wont, isn't → isnt
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* Plural folding only — no aggressive stemming, which would collide more
   than it merges on a vocabulary this small. */
function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

function allTokens(s) {
  const n = normalize(s);
  return n ? n.split(' ').map(stem) : [];
}

function contentTokens(s) {
  const t = allTokens(s).filter(w => w && !STOP.has(w));
  return t.length ? t : allTokens(s);   // a key made entirely of stopwords still has to match on something
}

function uniq(a) { return Array.from(new Set(a)); }

/* ── 4. IDF over the active rule set ────────────────────────────────────── */

const idfCache = new WeakMap();

function idfFor(topics) {
  let m = idfCache.get(topics);
  if (m) return m;
  const df = new Map();
  for (const t of topics) {
    const seen = new Set();
    for (const k of (t.keys || [])) for (const tok of contentTokens(k)) seen.add(tok);
    for (const tok of contentTokens(t.topic || '')) seen.add(tok);
    for (const tok of seen) df.set(tok, (df.get(tok) || 0) + 1);
  }
  const N = topics.length || 1;
  m = { N, df, get(tok) { return Math.log((N + 1) / (1 + (df.get(tok) || 0))) + 1; } };
  idfCache.set(topics, m);
  return m;
}

/* ── 5. Scoring ─────────────────────────────────────────────────────────── */

/* Score of one rule against one query.

   Per key:  M²/W  where W = total IDF of the key's tokens and M = IDF of the
   subset the query actually covers. That is coverage (M/W) multiplied by
   evidence (M), so a key is only strong when the query covers most of it AND
   the covered tokens are discriminating ones. A contiguous phrase hit adds
   half the key's total weight on top.

   The rule takes its BEST key, never the sum — that is what stops long key
   lists from accumulating incidental credit. */
function score(q, t, idf) {
  idf = idf || idfFor([t]);
  const qSet = new Set(contentTokens(q));
  const qPhrase = ' ' + allTokens(q).join(' ') + ' ';

  let best = 0;
  for (const k of (t.keys || [])) {
    const kt = uniq(contentTokens(k));
    if (!kt.length) continue;
    let W = 0, M = 0;
    for (const tok of kt) {
      const w = idf.get(tok);
      W += w;
      if (qSet.has(tok)) M += w;
    }
    if (M <= 0) continue;
    let s = (M * M) / W;
    const kPhrase = allTokens(k).join(' ');
    if (kPhrase && qPhrase.includes(' ' + kPhrase + ' ')) s += 0.5 * W;
    if (s > best) best = s;
  }

  /* Topic text is a weak tiebreak, never a match on its own. */
  const tt = uniq(contentTokens(t.topic || ''));
  if (tt.length) {
    let m = 0;
    for (const tok of tt) if (qSet.has(tok)) m += idf.get(tok);
    best += 0.15 * m / Math.sqrt(tt.length);
  }
  return best;
}

/* Below this, the caller renders Lane B rather than a green card. Tuned
   against tests/matcher.test.mjs: every correct match in the suite scores
   6.4 or better, and the wrong matches found while probing real phrasings
   sit at 4.8 and below, so the floor is set in the gap between them.
   Raising it trades recall for safety, which is the correct direction to
   err — a VA submitting a gap costs nothing, a wrong answer reaches a
   client. Re-run the suite after changing it. */
const CONFIDENCE_FLOOR = 5.0;

/* Alternates ("Did you mean") shown when a runner-up is within this much of
   the winner. */
const ALT_WINDOW = 0.8;

/* ── 6. Bundled FAQ topics ──────────────────────────────────────────────── */

/* Rules from the Client FAQ SOPs that the Answer Bank compile does not yet
   emit. They fill real gaps (can't book, e-store activation, Amazon, health
   coach) and are merged UNDER the fetched Answer Bank — see mergeTopics. */
const BUNDLED_TOPICS = [
  {
    id:"reschedule", topic:"Rescheduling or cancelling an appointment",
    keys:["reschedule","rescheduling","cancel","cancelling","move my appointment","change my appointment","move my appt","push my appointment","can't make","cannot make","different time","another day","reschedule to next week"],
    answer:"We need <strong>24 hours' notice</strong> to reschedule or cancel at no charge. They can do it themselves in Practice Better, or we can do it for them.",
    caution:"If they're inside 24 hours, don't mention fees in your reply — check with Front Desk first.",
    reply:"Hello [Name],\n\nI'd be happy to help get that moved for you — no need to keep wrestling with it on your end.\n\nCould you let me know a couple of days or times that work best? Once I have those I'll get you back on the schedule and send a confirmation.\n\nPlease let us know if there's anything else we can help with!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Appointment Scheduling, No-Shows & Add-On Appointments",
    url:"https://docs.google.com/document/d/16SPq5ugNYr01YWHiESGmBe1itJuoixwA7JN_ini0AUM/edit"
  },
  {
    id:"cantbook", topic:"Client can't find where to book",
    keys:["can't book","cannot book","wont let me book","won't let me book","not letting me book","won't let me schedule","no availability showing","nothing to book","booking link","can't find where","request a session","can't schedule anything"],
    answer:"Usually their <strong>package hasn't been set up in Practice Better yet</strong> — a client can't self-book until it is.",
    caution:"Check the package first, then contact Emma Moore to get it set up. Don't tell the client it's a system error until you know.",
    reply:"Hello [Name],\n\nThank you for letting us know! I'm looking into why that isn't showing up for you — this is on our end to sort out, not something you did wrong.\n\nI'll get it fixed and confirm with you as soon as you're able to book. If you'd rather I just schedule it for you in the meantime, I'm happy to do that — let me know what days work best.\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Appointment Scheduling, No-Shows & Add-On Appointments",
    url:"https://docs.google.com/document/d/16SPq5ugNYr01YWHiESGmBe1itJuoixwA7JN_ini0AUM/edit"
  },
  {
    id:"notreviewed", topic:"Results are in but the provider hasn't reviewed them",
    keys:["results are in","got my results","results uploaded","when will the doctor look","has the doctor seen","reviewed my results"],
    answer:"Their provider reviews results <strong>with them at the appointment</strong>. They already have access to the documents in Practice Better.",
    caution:"Do not comment on anything in the results — not even that they look fine. If they have no upcoming appointment, help them book one.",
    reply:"Hello [Name],\n\nThank you for checking in! Your results are in your Practice Better portal, so you're welcome to look at them anytime.\n\nYour provider will walk through everything with you at your appointment — they like to review results alongside your symptoms and history so you're connecting all the dots together rather than looking at numbers on their own.\n\nPlease let us know if you have any questions in the meantime!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"retest", topic:"Why they need to re-run labs they already have",
    keys:["already had that test","why do i need to test again","did this test last year","retest","test again","already have labs","already did this test"],
    answer:"Three valid reasons: results are <strong>too old</strong> to reflect their current state, it was the <strong>wrong panel</strong> (we prefer Mosaic OAT), or it's a <strong>new baseline</strong> to track progress.",
    caution:null,
    reply:"Hello [Name],\n\nThat's a fair question! There are a few reasons we may re-run testing. Sometimes previous results are old enough that they no longer reflect what's happening now, and sometimes a different lab or panel was used than the ones our providers work with.\n\nAnd in a lot of cases it's about getting a fresh baseline so your provider can actually measure your progress as you move through your protocol.\n\nIt's less about repeating work and more about making sure your provider has the right data to build an accurate plan. Let us know if you have any other questions!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"addon", topic:"Extra or add-on appointments",
    keys:["extra appointment","additional appointment","see the doctor more","more appointments","add on appointment","another appointment cost","see her sooner"],
    answer:"Extra appointments are available, but pricing varies by provider and this involves an invoice — <strong>Front Desk handles it</strong>.",
    caution:"Never mention chat access — not every plan includes provider chat. Do not quote a price.",
    handoff:true,
    reply:"Hello [Name],\n\nThank you so much for reaching out! I want to ensure you get the proper support here, so I'm passing this along to the correct team member and they'll get back to you very soon with everything you need.\n\nThank you for your patience with us!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Appointment Scheduling, No-Shows & Add-On Appointments",
    url:"https://docs.google.com/document/d/16SPq5ugNYr01YWHiESGmBe1itJuoixwA7JN_ini0AUM/edit"
  },
  {
    id:"chattime", topic:"How long until a provider replies in chat",
    keys:["chat response","how long for a reply","no response in chat","haven't heard back","provider hasn't replied","messaged my provider","response time"],
    answer:"Reply windows depend on the plan, and <strong>not every client has provider chat</strong>. Confirm what this client actually has before saying anything about chat.",
    caution:"Never state a response time or reference chat access you have not confirmed for this client. Hand off.",
    handoff:true,
    reply:"Hello [Name],\n\nThank you so much for reaching out about this. I want to ensure you get the proper support here, so I'm passing this along to the correct team member and they'll get back to you very soon.\n\nThank you for your patience with us!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"chatpaused", topic:"Chat access stopped working",
    keys:["can't message","chat not working","can't send a message","chat is locked","lost chat access","chat disabled"],
    answer:"Chat send access is paused when a care plan is paused — they keep read access to everything. <strong>Christian</strong> handles pausing and unpausing.",
    caution:"If the chat is paused but the plan is active, flag Christian and Emma Lile via Trello.",
    reply:"Hello [Name],\n\nThanks for flagging that! Let me look into your chat access and get it sorted out.\n\nJust so you know, nothing you've sent or received is ever deleted — you'll still have all of your previous messages and information there.\n\nI'll confirm with you as soon as it's working again. Please let us know if there's anything else we can help with in the meantime!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"estore", topic:"E-store account activation email",
    keys:["activation email","activate my account","never got the email","account activation","can't log into the store","store password","set up my store account","customer account activation"],
    answer:"Resend the activation email — subject line <strong>\"Customer account activation\"</strong>. Tell them to check spam.",
    caution:null,
    reply:"Hello [Name],\n\nSure thing! I'm sorry that activation email never made it to you — I've just sent it over again, so it may take a minute to show up.\n\nOur emails do sometimes land in the spam or junk folder, so it's worth a peek there if you don't see it. The subject line will say \"Customer account activation.\"\n\nIf it still doesn't turn up, let us know and we'll get it resent!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Failed Payments, Card Issues, Onboarding & First Appointment Questions",
    url:"https://docs.google.com/document/d/1wdIcmogVvhQj-6EhQRfPV8Y1ydctfOGA4782VJAd__I/edit"
  },
  {
    id:"wherebuy", topic:"Where to order supplements",
    keys:["where do i order my supplements","where do i buy my supplements","order my supplements","buy my supplements","supplement store","store link","discount code","where to get my supplements","how do i order"],
    answer:"Store: <strong>synergizedsupps.com/collections/all</strong><br>Discount code: <strong>HEALTH</strong>",
    caution:null,
    reply:"Hello [Name],\n\nHappy to help! You can find your supplements here: https://synergizedsupps.com/collections/all\n\nUse code HEALTH at checkout for your discount. Everything recommended in your protocol should be available there.\n\nLet us know if you have any trouble finding something and we'd be happy to help!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"notinstore", topic:"A supplement isn't on the e-store",
    keys:["not on the store","isnt on the store","isn't on the store","not in your store","isnt in the store","can't find the supplement","out of stock","don't carry","special order","supplement isnt on"],
    answer:"It may be a specialty product we don't stock. Send the <strong>special order form</strong> → we quote it → they pay the invoice → we order it.",
    caution:"⚠️ The special order form link is still unconfirmed. Pass this to Front Desk rather than sending a link you're unsure of.",
    reply:"Hello [Name],\n\nThank you for reaching out! That one isn't in our standard store, but we can often special order it for you.\n\nI'm getting you the right form to fill out so we can quote it for the quantity you need. Once you're happy with the quote and the invoice is paid, we'll place the order on your behalf.\n\nI'll follow up shortly with that link!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"amazon", topic:"They found it cheaper on Amazon",
    keys:["amazon","cheaper somewhere else","cheaper online","found it for less","why so expensive"],
    answer:"We advise against Amazon — <strong>quality, potency, and purity can't be verified</strong> there. Acknowledge that cost matters, but be clear quality affects how well the protocol works.",
    caution:null,
    reply:"Hello [Name],\n\nI completely understand wanting to keep costs down, and I'm glad you asked before ordering!\n\nWe do steer clients away from Amazon for supplements, because Amazon doesn't regulate what's sold on the platform — there's no way to verify the quality, potency, or purity of what actually arrives. Our store products are sourced and quality-controlled so you know exactly what you're getting.\n\nDon't hesitate to reach out if cost is a concern and we'll see what we can do to help!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  },
  {
    id:"inperson", topic:"In-person vs virtual appointments",
    keys:["in person","in-person","come to the office","visit the office","office location","see you in person","virtual or in person","drive to"],
    answer:"Availability differs by provider — <strong>don't assume the provider they want offers in-person</strong>. Check the office location SOP, and confirm before promising anything.",
    caution:"If they've also proposed a specific date and time, confirm that separately — don't let it get lost while you answer the in-person part.",
    reply:"Hello [Name],\n\nThank you for reaching out! Let me confirm what's available for in-person visits with your provider and I'll come right back to you.\n\nI've also made a note of the day and time you mentioned so we don't lose it — I'll confirm that with you at the same time.\n\nI'll follow up shortly!\n\nBest,\n[Your name]",
    src:"Dr. Jaban Office Location & In-Person vs. Virtual Appointment Availability",
    url:"https://docs.google.com/document/d/1t0NJFkRTVZ6vz8h3WjLKSfuJfVPJ-Uq2kO26VQTiD8U/edit"
  },
  {
    id:"coach", topic:"Never heard from their health coach",
    keys:["health coach","never heard from my coach","haven't met my coach","who is my coach","coach hasn't reached out"],
    answer:"Confirm their plan includes coaching, then contact the coach directly and notify management.",
    caution:"Never tell the client the coach dropped the ball. Say someone will be reaching out shortly — then make sure it happens.",
    reply:"Hello [Name],\n\nThank you for letting us know, and I'm sorry for the wait!\n\nI'm reaching out to your health coach now so they can get in touch with you about next steps. You should be hearing from them shortly.\n\nI'll follow up to make sure that happens. Please let us know if there's anything else we can help with in the meantime!\n\nBest,\n[Your name]",
    src:"RWC Client FAQ — Labs & Results, Health Coaching, Chat Access & Supplements",
    url:"https://docs.google.com/document/d/1IjHABAelPb4DulCfVVpCb9vnCRc3phoIfEI8kJ-2Plo/edit"
  }
];

/* Key augments — extra client phrasings layered onto Answer Bank rules by id.

   The proper home for these is a `KEYS:` line on the rule in the Answer Bank
   Doc (rwc-sop-hub SKILL.md, Job 3 Step 2), which the compile emits verbatim.
   They live here because answer-bank.json is compile output and gets
   overwritten nightly — a fix written into that file would not survive.
   Anything added here should be migrated to the Doc and then deleted. */
const KEY_AUGMENTS = {
  results_timing: ['when will my kit arrive', 'kit arrive', 'when does my kit ship', 'waiting on my kit', 'kit hasnt arrived', 'kit still hasnt come',
    'any update on my labs', 'any update on my results', 'update on my results', 'update on my testing'],
  oat_prep_foods: ['on antibiotics', 'antibiotics before the test', 'can i test on antibiotics', 'taking antibiotics'],
  newclient_rate: ['add my daughter', 'add my son', 'add my daughter as a client', 'my daughter as a client', 'get my son started', 'start my child'],

  /* Every entry below was taken from a real client message in the Aug 2026
     chat export that fell through to Lane B while the right rule existed.
     Phrased as the client wrote it, not as we would. */
  reschedule: ['is there anything sooner', 'anything sooner', 'next day available', 'next available',
    'does she have time on', 'do you have anything the week of', 'anything open', 'any openings',
    'change my appt', 'move my appt', 'what times are available', 'what is her next opening',
    'cant make it wednesday', 'is thursday open'],
  selfbook: ['set up an appointment', 'schedule another appointment', 'get scheduled', 'book my second appointment',
    'appointment with my practitioner', 'second meeting', 'schedule my next appointment'],
  blood_draw: ['send me the order', 'send me the orders', 'send that form so i can get labs drawn',
    'send me the form', 'when will i have the requisition', 'when will i have the lab requisition',
    'which location', 'closest location', 'closer to me', 'do you send the order to the lab',
    'print the requisition', 'the one with the barcode', 'where do i go for the draw'],
  fedex_return: ['send my sample back', 'sending my sample back', 'getting my sample sent off'],
  welcome_call: ['how do i get started with my onboarding', 'get started with onboarding',
    'onboarding appointment', 'access my onboarding']
};

/* Bundled entries the Answer Bank now covers better. Dropped on merge so the
   two never compete for the same question.
     turnaround → results_timing (per-lab figures, not one blanket number)
     labprep    → labprep         (same id, Answer Bank wins on id anyway)
     refund     → payment lane catches it before rule matching runs */
const SUPERSEDED = new Set(['turnaround', 'labprep', 'refund']);

function withAugments(t) {
  const add = KEY_AUGMENTS[t.id];
  if (!add) return t;
  const keys = (t.keys || []).slice();
  for (const k of add) if (!keys.includes(k)) keys.push(k);
  return Object.assign({}, t, { keys: keys });
}

/* Answer Bank first (canonical), bundled FAQ topics only where they add an
   id the compile doesn't emit. Augments apply to BOTH — several of the
   phrasings found in the real chat export belong to bundled rules such as
   `reschedule`, and applying them to the fetched bank alone silently dropped
   them. Returns {topics, added}. */
function mergeTopics(fetched) {
  const bank = (Array.isArray(fetched) ? fetched.filter(Boolean) : []).map(withAugments);
  const have = new Set(bank.map(t => t.id));
  const extra = BUNDLED_TOPICS
    .filter(t => !have.has(t.id) && !SUPERSEDED.has(t.id))
    .map(withAugments);
  return { topics: bank.concat(extra), added: extra.length };
}

/* ── 7. Classification ──────────────────────────────────────────────────── */

/* Returns one of:
     {lane:'clinical'}
     {lane:'payment'}
     {lane:'gap',    ranked}                     — nothing confident enough
     {lane:'handoff', topic, alternates, score}  — matched, but Front Desk only
     {lane:'answer',  topic, alternates, score}  — matched, VA may answer
   Lane order is fixed: clinical, then payment, then rules. */
function classify(q, topics) {
  if (isClinical(q)) return { lane: 'clinical' };
  if (isPayment(q)) return { lane: 'payment' };

  const idf = idfFor(topics);
  const ranked = topics
    .map(t => ({ t, n: score(q, t, idf) }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (!ranked.length || ranked[0].n < CONFIDENCE_FLOOR) return { lane: 'gap', ranked };

  const top = ranked[0];
  const alternates = ranked.slice(1, 3)
    .filter(x => x.n >= top.n * ALT_WINDOW)
    .map(x => x.t);

  return {
    lane: top.t.handoff ? 'handoff' : 'answer',
    topic: top.t,
    alternates,
    score: top.n
  };
}

return {
  BUNDLED_TOPICS, SUPERSEDED, KEY_AUGMENTS, mergeTopics,
  HARD_CLINICAL, SOFT_CLINICAL, COMBO_CLINICAL, PAYMENT,
  isClinical, isPayment, normalize, stem, allTokens, contentTokens,
  idfFor, score, classify,
  CONFIDENCE_FLOOR, ALT_WINDOW
};
});
