const config = require('../config');

/**
 * Generates an operator-facing natural language summary using Gemini LLM if key available,
 * with instantaneous graceful fallback to template text if unconfigured or failed.
 */
async function generateAISummary(ticket) {
  const fallbackSummary = `Asset ${ticket.asset_id} (${ticket.fault_type.toUpperCase()} Fault) — ${ticket.affected_households} households affected across ${ticket.affected_pole_count} poles in PIN ${ticket.pincode}. Confidence: ${ticket.confidence_level} (${Math.round(ticket.confidence_score * 100)}%). ${ticket.confidence_reason}`;

  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackSummary;
  }

  try {
    const prompt = `You are a real-time smart grid assistant for Karnataka State Power Distribution Board (KSPDB).
Convert the following fault ticket structured data into a concise, professional 2-sentence operator action summary for a 2am control room dispatcher. Include the fault location, affected households, confidence level, and clear next steps.

Fault Data:
- Fault Type: ${ticket.fault_type}
- Asset/Span: ${ticket.asset_id}
- DT ID: ${ticket.dt_id || 'N/A'}
- Feeder ID: ${ticket.feeder_id || 'N/A'}
- Affected Poles: ${ticket.affected_pole_count}
- Affected Households: ${ticket.affected_households}
- PIN Code: ${ticket.pincode}
- Coordinates: (${ticket.lat}, ${ticket.lon})
- Confidence Level: ${ticket.confidence_level} (${Math.round(ticket.confidence_score * 100)}%)
- Reason: ${ticket.confidence_reason}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[AI_SUMMARY] Gemini API returned status ${response.status}. Using fallback.`);
      return fallbackSummary;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return text.trim();
    }
  } catch (err) {
    console.warn(`[AI_SUMMARY] Gemini API request failed (${err.message}). Using graceful fallback template.`);
  }

  return fallbackSummary;
}

module.exports = {
  generateAISummary
};
