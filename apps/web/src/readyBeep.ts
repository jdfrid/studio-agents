export function becameReady(previous: string | null | undefined, next: string | undefined): boolean {
  return Boolean(previous && previous !== "COMPLETED" && next === "COMPLETED");
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** Short two-note chime when a video finishes. Fails silently if the browser blocks audio. */
export function playReadyBeep(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const start = ctx.currentTime + 0.02;
    tone(ctx, 880, start, 0.16);
    tone(ctx, 1175, start + 0.14, 0.28);
    void ctx.resume();
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* autoplay or missing audio API */
  }
}
