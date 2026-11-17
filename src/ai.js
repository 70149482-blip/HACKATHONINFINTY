require('dotenv').config();

class AiError extends Error {}

const SYSTEM_PROMPT = `You convert a meeting transcript into project-management records for NovaWorks Technologies.

You receive a transcript and a directory of existing users (id, name, role, specialization, skills).
Return ONE JSON object and nothing else (no markdown, no commentary) with exactly this shape:

{"projects":[{"name":"","clientName":"","description":"","managerId":"","deadline":"YYYY-MM-DD","tasks":[{"title":"","description":"","assigneeId":"","deadline":"YYYY-MM-DD","estimatedHours":0}]}]}

Rules:
1. Follow the FINAL agreed decisions. When a date, estimate, owner or deadline is changed later in the meeting, use the latest agreed value and discard the earlier one.
2. Ignore rejected or excluded features and future work. Never create tasks for them.
3. Keep each client engagement as a separate project. Keep separately discussed tasks separate, even if the same person owns them.
4. managerId must be the id of an existing user with role MANAGER. assigneeId must be the id of an existing user with role AGENT. Use ids exactly as they appear in the directory.
5. Never invent users. People mentioned who are not in the directory (for example client contacts or end users) must not be added and must not receive tasks.
6. Task titles should use the names agreed in the meeting. Descriptions should briefly state the agreed scope, including important boundaries (what is NOT included).
7. estimatedHours is developer effort in hours as a positive number, not a count of days.
8. All dates are in 2026 and formatted YYYY-MM-DD. A task deadline must not be later than its project deadline.
9. If a required value (manager, owner, date, hours) truly cannot be determined from the transcript, set it to null. Do not guess.
10. Do not include cost, progress, or management-hour fields.`;

function extractJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiError('The AI did not return a JSON result. Please try again.');
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new AiError('The AI returned a result that could not be read. Please try again.');
  }
}

async function callClaude(transcript, directory) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your-anthropic-api-key')
    throw new AiError('ANTHROPIC_API_KEY is not set on the server. Add it to the .env file and restart.');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `USER DIRECTORY (JSON):\n${JSON.stringify(directory)}\n\nMEETING TRANSCRIPT:\n${transcript}\n\nReturn only the JSON object.`,
        }],
      }),
    });
  } catch (e) {
    throw new AiError('Could not reach the AI service. Check the internet connection and try again.');
  }
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const detail = data && data.error && data.error.message ? data.error.message : `status ${res.status}`;
    throw new AiError(`The AI service returned an error: ${detail}`);
  }
  if (data.stop_reason === 'max_tokens') throw new AiError('The AI result was cut off. Try a shorter transcript.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return text;
}

// directory contains id, name, role, specialization, skills only (no emails, no passwords).
async function extractDraft(transcript, directory) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return extractJson(await callClaude(transcript, directory));
    } catch (e) {
      lastErr = e;
      if (!(e instanceof AiError) || !/JSON|read/.test(e.message)) break; // retry only on unreadable output
    }
  }
  throw lastErr;
}

module.exports = { extractDraft, extractJson, AiError };
