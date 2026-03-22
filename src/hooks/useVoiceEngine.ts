import { useRef, useState, useCallback, useEffect } from 'react';
import type { VoiceState } from '../lib/types';

const SILENCE_TIMEOUT_MS = 2000;

interface UseVoiceEngineOptions {
  onUserSpeech: (transcript: string) => Promise<string>;
  ttsRate?: number;
}

interface UseVoiceEngineReturn {
  state: VoiceState;
  start: () => void;
  stop: () => void;
  interimTranscript: string;
}

export function useVoiceEngine({
  onUserSpeech,
  ttsRate = 1.1,
}: UseVoiceEngineOptions): UseVoiceEngineReturn {
  const [state, setState] = useState<VoiceState>('IDLE');
  const [interimTranscript, setInterimTranscript] = useState('');

  const stateRef = useRef<VoiceState>('IDLE');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const shouldRunRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const processingRef = useRef(false);
  const voicesLoadedRef = useRef(false);
  const onUserSpeechRef = useRef(onUserSpeech);

  // Keep callback ref fresh (avoids stale closure problem)
  useEffect(() => {
    onUserSpeechRef.current = onUserSpeech;
  }, [onUserSpeech]);

  // ── State helper ──
  const setVoiceState = useCallback((newState: VoiceState) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  // ── Audio Cues ──
  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.12;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio cue failed — not critical
    }
  }, []);

  const playListeningChime = useCallback(() => {
    playTone(523, 0.15);
    setTimeout(() => playTone(659, 0.2), 120);
  }, [playTone]);

  const playProcessingTap = useCallback(() => {
    playTone(440, 0.08, 'triangle');
    setTimeout(() => playTone(440, 0.08, 'triangle'), 120);
  }, [playTone]);

  // ── TTS (with voice pre-loading) ──
  const loadVoices = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoadedRef.current = true;
        resolve();
        return;
      }
      // Some browsers load voices async
      window.speechSynthesis.onvoiceschanged = () => {
        voicesLoadedRef.current = true;
        resolve();
      };
      // Timeout fallback
      setTimeout(resolve, 1000);
    });
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = ttsRate;
      utterance.pitch = 1.0;

      // Pick a female English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Samantha') ||
            v.name.includes('Karen') ||
            v.name.includes('Moira') ||
            v.name.includes('Zira') ||
            v.name.toLowerCase().includes('female'))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }, [ttsRate]);

  // ── Silence Timer ──
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'LISTENING') return;
      if (!finalTranscriptRef.current.trim()) return;

      // We have speech and silence — process it
      processingRef.current = true;

      // Stop recognition (will trigger onend, but processingRef prevents auto-restart)
      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.stop(); } catch { /* ignore */ }
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // ── Process speech and call AI ──
  const processAndRespond = useCallback(async (userText: string) => {
    setVoiceState('PROCESSING');
    playProcessingTap();
    setInterimTranscript('');

    try {
      const response = await onUserSpeechRef.current(userText);

      if (!shouldRunRef.current) return; // stopped while processing

      setVoiceState('SPEAKING');

      await speak(response);

      if (!shouldRunRef.current) return; // stopped while speaking

      // Back to listening
      setVoiceState('LISTENING');
      playListeningChime();
      finalTranscriptRef.current = '';
      processingRef.current = false;
      startRecognition();
    } catch (err) {
      console.error('Chat error:', err);
      if (shouldRunRef.current) {
        // Recover to listening
        setVoiceState('LISTENING');
        playListeningChime();
        finalTranscriptRef.current = '';
        processingRef.current = false;
        startRecognition();
      }
    }
  }, [setVoiceState, playProcessingTap, playListeningChime, speak]);

  // ── Speech Recognition ──
  const startRecognition = useCallback(() => {
    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch { /* ignore */ }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (stateRef.current !== 'LISTENING') return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);

      // Check for "pause" keyword during listening (also useful if AI was speaking via TTS
      // but we handle that via SpeechSynthesis cancel)

      // Reset silence timer — user is still talking
      if (finalTranscriptRef.current.trim() || interim) {
        resetSilenceTimer();
      }
    };

    recognition.onend = () => {
      // If we flagged for processing, do it
      if (processingRef.current && finalTranscriptRef.current.trim()) {
        const userText = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = '';
        processAndRespond(userText);
        return;
      }

      // iOS kills recognition after ~60s of silence — auto-restart
      if (stateRef.current === 'LISTENING' && shouldRunRef.current && !processingRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('Recognition error:', event.error);
      // Try to recover
      if (stateRef.current === 'LISTENING' && shouldRunRef.current) {
        setTimeout(() => {
          if (shouldRunRef.current) startRecognition();
        }, 1000);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }, [resetSilenceTimer, processAndRespond]);

  // ── Public Controls ──
  const start = useCallback(async () => {
    shouldRunRef.current = true;
    finalTranscriptRef.current = '';
    processingRef.current = false;

    // Init AudioContext (requires user gesture)
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    // Pre-load voices
    await loadVoices();

    setVoiceState('LISTENING');
    playListeningChime();
    startRecognition();
  }, [setVoiceState, playListeningChime, startRecognition, loadVoices]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    processingRef.current = false;
    clearSilenceTimer();
    window.speechSynthesis.cancel();

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    finalTranscriptRef.current = '';
    setInterimTranscript('');
    setVoiceState('IDLE');
  }, [clearSilenceTimer, setVoiceState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRunRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return { state, start, stop, interimTranscript };
}
