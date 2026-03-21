import type { VoiceState } from './types';

type TransitionHandler = (from: VoiceState, to: VoiceState) => void;

const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  IDLE: ['LISTENING'],
  LISTENING: ['PROCESSING', 'IDLE'],
  PROCESSING: ['SPEAKING', 'IDLE'],
  SPEAKING: ['LISTENING', 'IDLE'],
};

export class VoiceStateMachine {
  private state: VoiceState = 'IDLE';
  private listeners: TransitionHandler[] = [];

  getState(): VoiceState {
    return this.state;
  }

  canTransition(to: VoiceState): boolean {
    return VALID_TRANSITIONS[this.state].includes(to);
  }

  transition(to: VoiceState): boolean {
    if (!this.canTransition(to)) {
      console.warn(`Invalid transition: ${this.state} → ${to}`);
      return false;
    }

    const from = this.state;
    this.state = to;

    for (const listener of this.listeners) {
      listener(from, to);
    }

    return true;
  }

  onTransition(handler: TransitionHandler): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== handler);
    };
  }

  reset(): void {
    this.state = 'IDLE';
  }
}
