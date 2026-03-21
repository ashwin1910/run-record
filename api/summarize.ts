import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUMMARY_PROMPT = `You are summarizing a running conversation. Given the full transcript, produce a concise summary that captures key topics, what was taught, notable thoughts, and the conversation's arc.

Keep it to 3-5 sentences. Write in third person. Be warm but concise.
Also extract 3-7 short topic tags (1-2 words each).

Respond with valid JSON only:
{
  "summary": "Your 3-5 sentence summary here.",
  "topics": ["topic1", "topic2", "topic3"]
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify JWT
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY || '' },
    });
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid token' });
  } catch {
    return res.status(401).json({ error: 'Auth verification failed' });
  }

  const { run_id } = req.body;
  if (!run_id) return res.status(400).json({ error: 'run_id is required' });

  try {
    // Fetch transcript from Supabase using service key
    const entriesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/run_entries?run_id=eq.${run_id}&entry_type=like.transcript_*&order=created_at`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY || '',
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (!entriesRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch transcript' });
    }

    const entries = await entriesRes.json();

    if (!entries || entries.length === 0) {
      return res.status(200).json({ summary: 'No conversation recorded during this run.', topics: [] });
    }

    // Build transcript text
    const transcript = entries
      .map((e: { entry_type: string; content: string }) => {
        const role = e.entry_type === 'transcript_user' ? 'Runner' : 'AI';
        return `${role}: ${e.content}`;
      })
      .join('\n');

    // Call OpenAI for summary
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: `Here is the full transcript of the run:\n\n${transcript}` },
        ],
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      console.error('OpenAI summary error:', await openaiRes.text());
      return res.status(502).json({ error: 'AI summary generation failed' });
    }

    const data = await openaiRes.json();
    const content = data.choices[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, topics: [] };
    }

    // Update run_sessions with summary and topics
    await fetch(
      `${SUPABASE_URL}/rest/v1/run_sessions?id=eq.${run_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY || '',
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          summary: parsed.summary,
          topics: parsed.topics,
        }),
      }
    );

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Summary handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
