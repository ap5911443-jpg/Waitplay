import { useCallback, useRef } from "react";

export function useAudioPlayer(soundEnabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      const winWithWebkit = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = winWithWebkit.AudioContext || winWithWebkit.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [soundEnabled]);

  const playTone = useCallback(
    (freq: number, type: OscillatorType, duration: number, gainValue = 0.1) => {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [getAudioContext]
  );

  const playCardFlip = useCallback(() => {
    playTone(480, "sine", 0.08, 0.05);
  }, [playTone]);

  const playMatchFound = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(523.25, "triangle", 0.12, 0.08); // C5
    setTimeout(() => playTone(659.25, "triangle", 0.15, 0.08), 80); // E5
  }, [getAudioContext, playTone]);

  const playMismatch = useCallback(() => {
    playTone(220, "sawtooth", 0.12, 0.04);
  }, [playTone]);

  const playVictory = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playTone(freq, "triangle", 0.25, 0.08);
      }, idx * 100);
    });
  }, [getAudioContext, playTone]);

  const playInputAlert = useCallback(() => {
    playTone(880, "sine", 0.15, 0.08);
    setTimeout(() => playTone(880, "sine", 0.15, 0.08), 160);
  }, [playTone]);

  return {
    playCardFlip,
    playMatchFound,
    playMismatch,
    playVictory,
    playInputAlert,
  };
}
