import { supabase } from './supabase';
import type { ChatRequest, OrchestratorResponse } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

export async function sendChatMessage(req: ChatRequest): Promise<OrchestratorResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat API error: ${res.status} ${err}`);
  }

  return res.json();
}

export async function generateSummary(runId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/summarize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ run_id: runId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Summary API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.summary;
}
