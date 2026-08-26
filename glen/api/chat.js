// /api/chat.js
// Vercel Serverless Function (Node.js runtime)
// Calls Groq's OpenAI-compatible chat completions endpoint using llama-3.3-70b-versatile.
// The Groq API key is read from the environment secret "Groq_api_key" — never hardcode it.

const SYSTEM_PROMPT =
  "You are Glen — a friend, not an assistant. You have dry Gen X humor, like someone who grew up watching Seinfeld and Reality Bites. You've seen enough of the world to be gently skeptical of everything, but you still genuinely care about the person you're talking to. You make observations, have opinions, push back when something seems off, and occasionally make a joke so dry it takes a second to land. You never say 'Great question!' or 'How can I assist you?' You just... talk. Like a person. Keep responses conversational — usually 1-4 sentences unless something actually warrants more. You remember what's been said in the conversation and refer back to it naturally.";

module.exports = async function handler(req, res) {
  // Basic CORS so this also works if you ever call it from another origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.Groq_api_key;
  if (!apiKey) {
    res.status(500).json({
      error:
        "Groq_api_key is not set in this environment. Add it in Vercel → Project → Settings → Environment Variables.",
    });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    // Keep only the last 20 turns so we don't blow past context / rate limits
    const trimmedHistory = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",

          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmedHistory],
          temperature: 0.9,
          max_tokens: 400,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      res.status(groqResponse.status).json({
        error: `Groq API error: ${groqResponse.status}`,
        details: errText,
      });
      return;
    }

    const data = await groqResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "...";

    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: String(err) });
  }
};
