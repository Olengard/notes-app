export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const openaiKey = req.headers["x-openai-key"];
  if (!openaiKey) return res.status(400).json({ error: "Missing OpenAI API key" });

  try {
    // Collect raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Forward multipart form to OpenAI Whisper
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": req.headers["content-type"],
      },
      body,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
