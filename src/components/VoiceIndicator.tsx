import type { VoiceState } from '../lib/types';

interface VoiceIndicatorProps {
  state: VoiceState;
}

export function VoiceIndicator({ state }: VoiceIndicatorProps) {
  const stateConfig = {
    IDLE: {
      label: 'Ready',
      bgClass: 'bg-sand/40',
      ringClass: 'ring-sand/30',
      animation: '',
      innerContent: (
        <div className="w-6 h-6 rounded-full bg-sand/60" />
      ),
    },
    LISTENING: {
      label: 'Listening...',
      bgClass: 'bg-warm-brown/20',
      ringClass: 'ring-warm-brown/30',
      animation: 'animate-gentle-pulse',
      innerContent: (
        <div className="w-6 h-6 rounded-full bg-warm-brown" />
      ),
    },
    PROCESSING: {
      label: 'Thinking...',
      bgClass: 'bg-warm-brown/10',
      ringClass: 'ring-warm-brown/20',
      animation: '',
      innerContent: (
        <div className="animate-rotate-dots flex items-center justify-center w-full h-full">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-warm-brown mx-1"
              style={{
                opacity: 0.4 + (i * 0.3),
              }}
            />
          ))}
        </div>
      ),
    },
    SPEAKING: {
      label: 'Speaking...',
      bgClass: 'bg-warm-brown/15',
      ringClass: 'ring-warm-brown/25',
      animation: '',
      innerContent: (
        <div className="flex items-center justify-center gap-1 h-full">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-warm-brown animate-gentle-wave"
              style={{
                height: `${12 + (i % 3) * 8}px`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      ),
    },
  };

  const config = stateConfig[state];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Main indicator circle */}
      <div
        className={`w-40 h-40 rounded-full flex items-center justify-center ring-4 ${config.ringClass} ${config.bgClass} ${config.animation} transition-all duration-500`}
      >
        {config.innerContent}
      </div>

      {/* State label */}
      <p className="text-slate text-sm font-mono tracking-wider uppercase">
        {config.label}
      </p>
    </div>
  );
}
