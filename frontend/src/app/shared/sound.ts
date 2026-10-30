/**
 * Sonidos cortos de aviso (Fase 12b-4) con Web Audio: sin archivos. El navegador solo deja sonar después de que la
 * persona tocó algo en la página; antes, no suena y no pasa nada.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') {
      void context.resume();
    }
    return context;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

/** "Ding-dong": comanda nueva o plato listo. */
export function chime(): void {
  const ctx = audio();
  if (ctx) {
    tone(ctx, 880, 0, 0.25);
    tone(ctx, 660, 0.22, 0.35);
  }
}

/** Tres pitidos graves: anulación. */
export function alarm(): void {
  const ctx = audio();
  if (ctx) {
    [0, 0.22, 0.44].forEach((t) => tone(ctx, 330, t, 0.16));
  }
}

/** Activa el audio con un toque de la persona (los navegadores lo exigen). */
export function unlockSound(): void {
  audio();
}
