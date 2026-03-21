import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  "mode": "teach" | "capture" | "converse" | "recap",
  "auto_captures": [],
  "follow_up": null
}

spoken_response is read aloud. Keep it natural. auto_captures can be empty. follow_up is null unless you have a genuinely interesting question.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify JWT with Supabase
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY || '' },
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch {
    return res.status(401).json({ error: 'Auth verification failed' });
  }

  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Build messages array for OpenAI
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(history || []).map((h: { role: string; content: string }) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await openaiRes.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    // Parse the structured JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: treat as plain text response
      parsed = {
        spoken_response: content,
        mode: 'converse',
        auto_captures: [],
        follow_up: null,
      };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
