// Netlify Function: /api/ask
// Proxies the SOP Assistant chat to Anthropic's Messages API.
// The browser POSTs { prompt } here; we forward to Claude with the server-side ANTHROPIC_API_KEY
// (stored as a Netlify env var, NEVER shipped to the browser) and return { reply }.

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY env var not set on Netlify project" }),
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

  const prompt = (body && body.prompt) || "";
  if (!prompt) {
    return new Response(JSON.stringify({ error: "missing prompt" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Model choice: claude-haiku-4-5 is cheap + fast, good fit for a chat that
  // re-sends the SOP knowledge base on every turn. Swap to sonnet for richer answers.
  const model = Netlify.env.get("CLAUDE_MODEL") || "claude-haiku-4-5";
  const maxTokens = parseInt(Netlify.env.get("CLAUDE_MAX_TOKENS") || "1200", 10);

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error", anthropicRes.status, errText);
      return new Response(
        JSON.stringify({ error: `claude api error ${anthropicRes.status}` }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }

    const data = await anthropicRes.json();
    const reply =
      data?.content?.[0]?.text ||
      "I'm having trouble connecting. Please use the SOP Browser or contact your supervisor.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("ask function exception:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const config = { path: "/api/ask" };
