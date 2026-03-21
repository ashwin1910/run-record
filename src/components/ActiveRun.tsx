import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoiceIndicator } from './VoiceIndicator';
import { useVoiceEngine } from '../hooks/useVoiceEngine';
import { useRunSession } from '../hooks/useRunSession';

interface ActiveRunProps {
  userId: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ActiveRun({ userId }: ActiveRunProps) {
  const navigate = useNavigate();
  const { activeRun, elapsedSeconds, startRun, endRun, handleUserSpeech } = useRunSession(userId);

  const onUserSpeech = useCallback(async (transcript: string): Promise<string> => {
    // Check for end run command
    const lower = transcript.toLowerCase();
    if (lower.includes('end run') || lower.includes('stop run')) {
      const run = await endRun();
      if (run) {
        navigate(`/runs/${run.id}`);
      }
      return "Great run! Let me put together your summary.";
    }
    return handleUserSpeech(transcript);
  }, [handleUserSpeech, endRun, navigate]);

  const { state: voiceState, start: startVoice, stop: stopVoice, interimTranscript } = useVoiceEngine({
    onUserSpeech,
    ttsRate: 1.1,
  });

  const handleStartRun = async () => {
    try {
      await startRun();
      startVoice();
    } catch (e) {
      console.error('Failed to start run:', e);
    }
  };

  const handleStopRun = async () => {
    stopVoice();
    const run = await endRun();
    if (run) {
      navigate(`/runs/${run.id}`);
    } else {
      navigate('/');
    }
  };

  // Pre-run state
  if (!activeRun) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl text-espresso mb-3">Ready to run?</h1>
          <p className="text-slate text-sm mb-10 max-w-xs">
            Tap start, then talk naturally. I'll listen, teach, and capture your thoughts.
          </p>

          <button
            onClick={handleStartRun}
            className="w-40 h-40 rounded-full bg-warm-brown text-white flex items-center justify-center
                       text-lg font-medium shadow-lg hover:bg-warm-brown-light active:scale-95
                       transition-all mx-auto"
          >
            Start Run
          </button>

          <button
            onClick={() => navigate('/')}
            className="mt-8 text-slate text-sm hover:text-espresso transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  // Active run state
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      {/* Voice state indicator */}
      <VoiceIndicator state={voiceState} />

      {/* Interim transcript (what user is saying) */}
      {interimTranscript && (
        <p className="mt-6 text-slate text-sm font-mono max-w-xs text-center opacity-60">
          {interimTranscript}
        </p>
      )}

      {/* Timer */}
      <p className="mt-10 font-mono text-4xl text-espresso tracking-wider">
        {formatTime(elapsedSeconds)}
      </p>

      {/* Stop button */}
      <button
        onClick={handleStopRun}
        className="mt-12 px-8 py-3 border border-sand text-slate rounded-full text-sm
                   hover:bg-linen hover:text-espresso active:scale-95 transition-all"
      >
        End Run
      </button>
    </div>
  );
}
