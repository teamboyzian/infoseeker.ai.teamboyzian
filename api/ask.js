// /api/ask.js
// Robust GPT + Google hybrid search endpoint

import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question, mode, maxDocs } = req.body;

  if (!question) return res.status(400).json({ error: "Question is required." });

  try {
    // --------------------------
    // 1️⃣ Google Custom Search
    // --------------------------
    const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${encodeURIComponent(question)}&num=${maxDocs || 3}`;
    const googleRes = await fetch(googleUrl);

    let googleData;
    const contentType = googleRes.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await googleRes.text();
      console.error("Google API returned non-JSON:", text);
      return res.status(500).json({ error: "Google API returned invalid response" });
    } else {
      googleData = await googleRes.json();
    }

    let citations = [];
    let contextText = "";

    if (googleData.items && googleData.items.length > 0) {
      googleData.items.forEach((item, idx) => {
        citations.push({ id: idx + 1, title: item.title, url: item.link });
        contextText += `${item.title}: ${item.snippet}\n`;
      });
    }

    // --------------------------
    // 2️⃣ OpenAI GPT-4o-mini
    // --------------------------
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an educational AI assistant. Answer clearly, accurately, and cite sources if available." },
          { role: "user", content: `Question: ${question}\nUse context:\n${contextText}` }
        ],
        max_tokens: 400
      })
    });

    const gptContentType = gptRes.headers.get("content-type");
    let gptData;
    if (!gptContentType || !gptContentType.includes("application/json")) {
      const text = await gptRes.text();
      console.error("GPT API returned non-JSON:", text);
      return res.status(500).json({ error: "GPT API returned invalid response" });
    } else {
      gptData = await gptRes.json();
    }

    const answer = gptData?.choices?.[0]?.message?.content || "No answer found.";
    const confidence = 0.95; // Optional static or computed
    const recency = googleData.items ? true : false;

    return res.status(200).json({ answer, citations, confidence, recency });

  } catch (err) {
    console.error("Internal server error:", err);
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
