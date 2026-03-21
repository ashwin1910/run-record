import { useRef, useState, useCallback, useEffect } from 'react';
import { VoiceStateMachine } from '../lib/stateMachine';
import type { VoiceState } from '../lib/types';

const SILENCE_TIMEOUT_MS = 2000;
const INTERRUPT_KEYWORD = 'pause';

interface UseVoiceEngineOptions {
  onUserSpeech: (transcript: string) => Promise<string>;
  ttsRate?: number;
  ttsVoice?: string;
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
  ttsVoice,
}: UseVoiceEngineOptions): UseVoiceEngineReturn {
  const [state, setState] = useState<VoiceState>('IDLE');
  const [interimTranscript, setInterimTranscript] = useState('');

  const machineRef = useRef(new VoiceStateMachine());
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isSpeakingRef = useRef(false);
  const shouldListenRef = useRef(false);

  // Sync state machine to React state
  useEffect(() => {
    const unsub = machineRef.current.onTransition((_from, to) => {
      setState(to);
    });
    return unsub;
  }, []);

  // ── Audio Cues ──
  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.15;
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
    playTone(523, 0.15); // C5
    setTimeout(() => playTone(659, 0.2), 120); // E5
  }, [playTone]);

  const playProcessingTap = useCallback(() => {
    playTone(440, 0.08, 'triangle');
    setTimeout(() => playTone(440, 0.08, 'triangle'), 120);
  }, [playTone]);

  // ── Speech Recognition Setup ──
  const createRecognition = useCallback((): SpeechRecognition | null => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    return recognition;
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Silence detected — transition to PROCESSING
      if (machineRef.current.getState() === 'LISTENING') {
        const recognition = recognitionRef.current;
        if (recognition) {
          recognition.onend = null; // Prevent auto-restart
          recognition.stop();
        }
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // ── TTS ──
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = ttsRate;
      utterance.pitch = 1.0;

      // Try to find a female voice
      const voices = window.speechSynthesis.getVoices();
      if (ttsVoice) {
        const match = voices.find((v) => v.name.includes(ttsVoice));
        if (match) utterance.voice = match;
      } else {
        // Default: pick a good female voice
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Samantha') ||
              v.name.includes('Karen') ||
              v.name.includes('Moira') ||
              v.name.includes('Female'))
        );
        if (preferred) utterance.voice = preferred;
      }

      utterance.onend = () => {
        isSpeakingRef.current = false;
        resolve();
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        resolve();
      };

      isSpeakingRef.current = true;
      window.speechSynthesis.speak(utterance);
    });
  }, [ttsRate, ttsVoice]);

  // ── Keyword Detection During Speaking ──
  const startKeywordListener = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const kw = new SpeechRecognition();
    kw.continuous = true;
    kw.interimResults = true;
    kw.lang = 'en-US';

    kw.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        if (transcript.includes(INTERRUPT_KEYWORD)) {
          // Interrupt!
          window.speechSynthesis.cancel();
          isSpeakingRef.current = false;
          kw.stop();
          return;
        }
      }
    };

    kw.onerror = () => { /* ignore keyword listener errors */ };
    try { kw.start(); } catch { /* ignore */ }
    return kw;
  }, []);

  // ── Main Listening Loop ──
  const startListening = useCallback(() => {
    const machine = machineRef.current;
    if (machine.getState() !== 'IDLE' && machine.getState() !== 'SPEAKING') {
      // Only transition from valid states
    }

    if (!machine.canTransition('LISTENING')) return;
    machine.transition('LISTENING');
    playListeningChime();

    const recognition = createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    let finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (machine.getState() !== 'LISTENING') return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
      // Reset silence timer on any speech
      startSilenceTimer();
    };

    recognition.onend = () => {
      // iOS kills recognition — auto-restart if we should still be listening
      if (machine.getState() === 'LISTENING' && shouldListenRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
        return;
      }

      // If we got speech, process it
      if (finalTranscript.trim() && machine.getState() === 'LISTENING') {
        setInterimTranscript('');
        clearSilenceTimer();

        if (!machine.canTransition('PROCESSING')) return;
        machine.transition('PROCESSING');
        playProcessingTap();

        const userText = finalTranscript.trim();
        finalTranscript = '';

        // Check for "end run" command
        if (userText.toLowerCase().includes('end run') || userText.toLowerCase().includes('stop run')) {
          machine.transition('IDLE');
          shouldListenRef.current = false;
          return;
        }

        // Call the AI
        onUserSpeech(userText)
          .then(async (response) => {
            if (machine.getState() !== 'PROCESSING') return;
            machine.transition('SPEAKING');

            // Start keyword listener for "pause" interrupt
            const kwListener = startKeywordListener();

            await speak(response);

            // Stop keyword listener
            if (kwListener) try { kwListener.stop(); } catch { /* ignore */ }

            // After speaking, go back to listening
            if (shouldListenRef.current && machine.getState() === 'SPEAKING') {
              startListening();
            }
          })
          .catch((err) => {
            console.error('Chat error:', err);
            // Recover to listening
            if (shouldListenRef.current) {
              startListening();
            }
          });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        // Expected — user was quiet, restart
        return;
      }
      if (event.error === 'aborted') return;
      console.error('Recognition error:', event.error);
    };

    try {
      recognition.start();
      startSilenceTimer();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }, [onUserSpeech, playListeningChime, playProcessingTap, createRecognition, startSilenceTimer, clearSilenceTimer, speak, startKeywordListener]);

  // ── Public Controls ──
  const start = useCallback(() => {
    shouldListenRef.current = true;
    // Ensure AudioContext is created (requires user gesture)
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    // Load voices (async on some browsers)
    window.speechSynthesis.getVoices();
    startListening();
  }, [startListening]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimer();
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    machineRef.current.transition('IDLE');
    machineRef.current.reset();
    setInterimTranscript('');
  }, [clearSilenceTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearSilenceTimer();
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [clearSilenceTimer]);

  return { state, start, stop, interimTranscript };
}
