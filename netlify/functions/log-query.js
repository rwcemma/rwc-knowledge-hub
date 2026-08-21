// Netlify Function: /api/log-query
//
// Records what VAs actually type into the Client Communication tab, so the
// keyword lists can be written from real traffic instead of guesswork. Every
// search is logged: the ones that matched, the ones that fell to Lane B, and
// what the AI classifier would have picked. Reading a month of this is how you
// learn that eleven people asked "any update on my labs" and no rule caught it.
//
//   POST { question, lane, matchedId, score, llmId, llmReason, mode }
//
// ⚠️ The logged question is the CLIENT'S OWN MESSAGE. It can contain names and
// health details. It must land somewhere access-controlled — never this repo,
// which is public. Airtable is the default target below.
//
// Env (all optional — with none set this is a silent no-op, which is the right
// behaviour for a logging path: it must never break the tab):
//   AIRTABLE_API_KEY    personal access token with data.records:write
//   AIRTABLE_LOG_BASE   base id, e.g. appXXXXXXXXXXXXXX
//   AIRTABLE_LOG_TABLE  table name, defaults to "Comms Queries"
//
// Expected columns: Question (text), Lane (text), Matched Rule (text),
// Score (number), LLM Rule (text), LLM Reason (text), Mode (text).

const MAX_QUESTION = 600;
const ok = (body = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return ok({ ok: false, reason: "invalid JSON" }); }

  const question = String((body && body.question) || "").trim().slice(0, MAX_QUESTION);
  if (!question) return ok({ ok: false, reason: "empty question" });

  const key = Netlify.env.get("AIRTABLE_API_KEY");
  const base = Netlify.env.get("AIRTABLE_LOG_BASE");
  const table = Netlify.env.get("AIRTABLE_LOG_TABLE") || "Comms Queries";
  if (!key || !base) return ok({ ok: false, reason: "logging not configured" });

  const score = Number(body.score);
  const fields = {
    "Question": question,
    "Lane": String(body.lane || "").slice(0, 40),
    "Matched Rule": String(body.matchedId || "").slice(0, 80),
    "LLM Rule": String(body.llmId || "").slice(0, 80),
    "LLM Reason": String(body.llmReason || "").slice(0, 120),
    "Mode": String(body.mode || "").slice(0, 20),
  };
  if (Number.isFinite(score)) fields["Score"] = Math.round(score * 100) / 100;

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        // typecast lets Airtable coerce into single-selects if the columns are set up that way
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      },
    );
    if (!res.ok) {
      console.error("log-query: airtable error", res.status, await res.text());
      return ok({ ok: false, reason: "airtable rejected" });
    }
    return ok();
  } catch (e) {
    console.error("log-query: failed", e);
    return ok({ ok: false, reason: "log failed" });
  }
};
