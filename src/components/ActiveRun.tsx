import { useCallback, useState } from 'react';
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
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activeRun, elapsedSeconds, startRun, endRun, handleUserSpeech } = useRunSession(userId);

  // Voice callback — just passes through to handleUserSpeech
  // "end run" is handled by the button only, not by voice detection in the callback
  // (voice engine detects silence → processes → AI responds naturally)
  const onUserSpeech = useCallback(async (transcript: string): Promise<string> => {
    try {
      return await handleUserSpeech(transcript);
    } catch (e) {
      console.error('Speech handling error:', e);
      return "Sorry, I had a hiccup. Could you say that again?";
    }
  }, [handleUserSpeech]);

  const { state: voiceState, start: startVoice, stop: stopVoice, interimTranscript } = useVoiceEngine({
    onUserSpeech,
    ttsRate: 1.1,
  });

  const handleStartRun = async () => {
    setError(null);
    try {
      await startRun();
      startVoice();
    } catch (e) {
      console.error('Failed to start run:', e);
      setError('Failed to start run. Check your connection and try again.');
    }
  };

  const handleStopRun = async () => {
    if (ending) return; // prevent double-tap
    setEnding(true);
    stopVoice();
    try {
      const run = await endRun();
      if (run) {
        navigate(`/runs/${run.id}`);
      } else {
        navigate('/');
      }
    } catch (e) {
      console.error('Failed to end run:', e);
      setEnding(false);
      navigate('/');
    }
  };

  // Pre-run state
  if (!activeRun) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl text-espresso mb-3">Ready to run?</h1>
          <p className="text-slate text-sm mb-10 max-w-xs mx-auto">
            Tap start, then talk naturally. I'll listen, teach, and capture your thoughts.
          </p>

          {error && (
            <p className="text-terracotta text-sm mb-4">{error}</p>
          )}

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

      {/* Interim transcript (what user is currently saying) */}
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
        disabled={ending}
        className="mt-12 px-8 py-3 border border-sand text-slate rounded-full text-sm
                   hover:bg-linen hover:text-espresso active:scale-95 transition-all
                   disabled:opacity-50"
      >
        {ending ? 'Ending run...' : 'End Run'}
      </button>
    </div>
  );
}
