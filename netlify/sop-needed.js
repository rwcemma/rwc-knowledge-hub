// Netlify Function: /api/sop-needed
// Posts a gap-detected question to the #sop-needed Slack channel via an
// incoming webhook. The browser POSTs { question }; we format it as
// "SOP NEEDED: / Question: ..." and forward to the webhook URL stored in
// the SLACK_WEBHOOK_URL env var (NEVER shipped to the browser).

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhook = Netlify.env.get("SLACK_WEBHOOK_URL");
  if (!webhook) {
    return new Response(
      JSON.stringify({ error: "SLACK_WEBHOOK_URL env var not set on Netlify project" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const question = (body && body.question || "").trim();
  if (!question) {
    return new Response(JSON.stringify({ error: "missing question" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Slack incoming-webhook payload. The *bold* asterisks render as bold in Slack mrkdwn.
  const slackPayload = {
    text: `*SOP NEEDED:*\nQuestion: ${question}`,
  };

  try {
    const slackRes = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      console.error("Slack webhook error", slackRes.status, errText);
      return new Response(
        JSON.stringify({ error: `slack webhook error ${slackRes.status}` }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("sop-needed function exception:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const config = { path: "/api/sop-needed" };
