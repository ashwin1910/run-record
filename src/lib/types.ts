// ── Voice State Machine ──
export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';

// ── Orchestrator Response (from OpenAI) ──
export interface OrchestratorResponse {
  spoken_response: string;
  mode: 'teach' | 'capture' | 'converse' | 'recap';
  auto_captures: AutoCapture[];
  follow_up: string | null;
}

export interface AutoCapture {
  type: 'insight' | 'note' | 'essay_fragment' | 'question';
  content: string;
  tags: string[];
}

// ── Database Types ──
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  preferences: UserPreferences;
  created_at: string;
}

export interface UserPreferences {
  tts_voice?: string;
  tts_rate?: number;
  silence_timeout_ms?: number;
}

export interface RunSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  topics: string[] | null;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
}

export interface RunEntry {
  id: string;
  run_id: string;
  entry_type: 'transcript_user' | 'transcript_assistant' | 'note';
  content: string;
  note_type: 'insight' | 'note' | 'essay_fragment' | 'question' | null;
  tags: string[] | null;
  timestamp_in_run: number;
  created_at: string;
}

// ── Chat API ──
export interface ChatRequest {
  run_id: string;
  message: string;
  history: ChatMessage[];
  timestamp_in_run: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Run Session Context (in-memory during active run) ──
export interface ActiveRunState {
  runId: string;
  startedAt: Date;
  history: ChatMessage[];
  elapsedSeconds: number;
}
