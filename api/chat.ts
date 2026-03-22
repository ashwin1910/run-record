import type { VercelRequest, VercelResponse } from '@vercel/node';

const ARK_API_KEY = process.env.ARK_API_KEY;
// Support both naming conventions — VITE_ works in Vercel env vars, just not in Vite client code
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// BytePlus ModelArk API (OpenAI-compatible)
const ARK_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const ARK_MODEL = 'seed-2-0-mini-260215';

const SYSTEM_PROMPT = `You are a running companion. The user is on a solo run and talking to you through voice. Everything you say will be spoken aloud via text-to-speech, so keep responses natural and conversational. Do not use formatting, bullet points, or special characters.

PERSONALITY:
You are sharp, concise, and warm. Like a smart friend, not a coach or motivational speaker. Default to short answers (1-3 sentences). Only give longer explanations when explicitly asked ("explain in detail", "tell me more", "go deeper"). Use a Socratic style when teaching — ask follow-up questions to keep the runner engaged. Never say "as an AI" or "I don't have personal opinions".

MODES — detect the user's intent and respond in the appropriate mode:
- teach: User asks you to explain something. Adapt length to their request.
- capture: User says "note this", "record this", "save this thought" or similar. Acknowledge briefly ("Got it." or "Noted."), then capture their thought faithfully in auto_captures.
- converse: General conversation about any topic.
- recap: User says "recap" or "what have we covered". Summarize the run so far — what was taught, what was discussed, what notes were captured.

AUTO-CAPTURE (be liberal):
Independently of the user's explicit requests, listen for noteworthy statements. If the user says something insightful, original, interesting, or worth remembering — an idea, a realization, an essay fragment, a question worth exploring later — silently capture it in auto_captures. Be liberal: capture anything moderately interesting. Do NOT mention that you captured it. Types: "insight" (a realization or connection), "note" (a general thought), "essay_fragment" (part of a longer piece the user is developing), "question" (a question worth revisiting).

OUTPUT FORMAT:
Always respond with valid JSON and nothing else:
{
  "spoken_response": "Your conversational response here. Keep under 100 words unless depth was requested.",
  "mode": "teach | capture | converse | recap",
  "auto_captures": [],
  "follow_up": null
}

spoken_response is read aloud. Keep it natural. auto_captures can be empty. follow_up is null unless you have a genuinely interesting question.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check env vars are configured
  if (!ARK_API_KEY) {
    console.error('ARK_API_KEY not set');
    return res.status(500).json({ error: 'Server not configured: missing ARK_API_KEY' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase env vars not set. SUPABASE_URL:', !!SUPABASE_URL, 'SERVICE_KEY:', !!SUPABASE_SERVICE_KEY);
    return res.status(500).json({ error: 'Server not configured: missing Supabase credentials' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: no token' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
    });
    if (!verifyRes.ok) {
      const verifyErr = await verifyRes.text();
      console.error('Auth verify failed:', verifyRes.status, verifyErr);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (e) {
    console.error('Auth verification error:', e);
    return res.status(401).json({ error: 'Auth verification failed' });
  }

  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Build messages array for AI
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...(history || []).map((h: { role: string; content: string }) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: message },
  ];

  try {
    const aiRes = await fetch(`${ARK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('AI service error:', aiRes.status, err);
      return res.status(502).json({ error: 'AI service error', detail: err });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty AI response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty AI response' });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        spoken_response: content,
        mode: 'converse',
        auto_captures: [],
        follow_up: null,
      };
    }

    // Ensure response has all required fields
    if (!parsed.spoken_response) {
      parsed.spoken_response = content;
    }
    if (!parsed.auto_captures) {
      parsed.auto_captures = [];
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
