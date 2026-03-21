import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendChatMessage, generateSummary } from '../lib/api';
import type { ChatMessage, RunSession, OrchestratorResponse, ActiveRunState } from '../lib/types';

interface UseRunSessionReturn {
  activeRun: ActiveRunState | null;
  elapsedSeconds: number;
  startRun: () => Promise<string>;
  endRun: () => Promise<RunSession | null>;
  handleUserSpeech: (transcript: string) => Promise<string>;
  lastResponse: OrchestratorResponse | null;
}

export function useRunSession(userId: string | undefined): UseRunSessionReturn {
  const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastResponse, setLastResponse] = useState<OrchestratorResponse | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);

  // Timer
  useEffect(() => {
    if (activeRun) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - activeRun.startedAt.getTime()) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeRun]);

  const startRun = useCallback(async (): Promise<string> => {
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('run_sessions')
      .insert({
        user_id: userId,
        started_at: new Date().toISOString(),
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    historyRef.current = [];
    const runState: ActiveRunState = {
      runId: data.id,
      startedAt: new Date(),
      history: [],
      elapsedSeconds: 0,
    };
    setActiveRun(runState);
    setElapsedSeconds(0);
    return data.id;
  }, [userId]);

  const handleUserSpeech = useCallback(async (transcript: string): Promise<string> => {
    if (!activeRun) throw new Error('No active run');

    const timestampInRun = Math.floor((Date.now() - activeRun.startedAt.getTime()) / 1000);

    // Save user transcript to Supabase
    await supabase.from('run_entries').insert({
      run_id: activeRun.runId,
      entry_type: 'transcript_user',
      content: transcript,
      timestamp_in_run: timestampInRun,
    });

    // Add to history
    historyRef.current.push({ role: 'user', content: transcript });

    // Call AI
    const response = await sendChatMessage({
      run_id: activeRun.runId,
      message: transcript,
      history: historyRef.current.slice(-30), // Last 30 messages for context
      timestamp_in_run: timestampInRun,
    });

    setLastResponse(response);

    // Save assistant response to Supabase
    await supabase.from('run_entries').insert({
      run_id: activeRun.runId,
      entry_type: 'transcript_assistant',
      content: response.spoken_response,
      timestamp_in_run: timestampInRun,
    });

    // Add to history
    historyRef.current.push({ role: 'assistant', content: response.spoken_response });

    // Save any auto-captures
    if (response.auto_captures && response.auto_captures.length > 0) {
      const notes = response.auto_captures.map((capture) => ({
        run_id: activeRun.runId,
        entry_type: 'note' as const,
        content: capture.content,
        note_type: capture.type,
        tags: capture.tags,
        timestamp_in_run: timestampInRun,
      }));
      await supabase.from('run_entries').insert(notes);
    }

    return response.spoken_response;
  }, [activeRun]);

  const endRun = useCallback(async (): Promise<RunSession | null> => {
    if (!activeRun) return null;

    // Stop timer
    if (timerRef.current) clearInterval(timerRef.current);

    const duration = Math.floor((Date.now() - activeRun.startedAt.getTime()) / 1000);

    // Generate AI summary
    let summary = '';
    try {
      summary = await generateSummary(activeRun.runId);
    } catch (e) {
      console.error('Failed to generate summary:', e);
      summary = 'Summary generation failed. You can review the full transcript below.';
    }

    // Update run session in Supabase
    const { data, error } = await supabase
      .from('run_sessions')
      .update({
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
        summary,
        status: 'completed',
      })
      .eq('id', activeRun.runId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update run session:', error);
    }

    setActiveRun(null);
    setElapsedSeconds(0);
    historyRef.current = [];
    setLastResponse(null);

    return data;
  }, [activeRun]);

  return {
    activeRun,
    elapsedSeconds,
    startRun,
    endRun,
    handleUserSpeech,
    lastResponse,
  };
}
