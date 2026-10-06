import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { MAX_TOUR_STEPS, TourDefinition, TourId, markTourSeen, readSeenTours, toursKey } from './tour';

interface ActiveTour {
  tour: TourDefinition;
  index: number;
}

/**
 * Estado del recorrido guiado. Las pantallas llaman {@link offer} al estar listas (se muestra solo la primera vez)
 * y {@link start} para repetirlo; {@link replayRequests} permite pedirlo desde fuera (menú de usuario, ayuda).
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  /** AuthService se pide al usarlo: así la capa del recorrido (en la raíz) no depende de HTTP al crearse. */
  private readonly injector = inject(Injector);
  private readonly state = signal<ActiveTour | null>(null);
  private readonly replay = signal<{ id: TourId; seq: number } | null>(null);

  readonly active = this.state.asReadonly();
  readonly step = computed(() => {
    const s = this.state();
    return s ? s.tour.steps[s.index] : null;
  });
  readonly replayRequests = this.replay.asReadonly();

  private key(): string {
    return toursKey(this.injector.get(AuthService).user()?.id ?? 'anon');
  }

  hasSeen(id: TourId): boolean {
    return readSeenTours(this.key()).includes(id);
  }

  /** Muestra el recorrido solo si este usuario aún no lo ha visto en este equipo. */
  offer(tour: TourDefinition): void {
    if (!this.hasSeen(tour.id)) {
      this.start(tour);
    }
  }

  start(tour: TourDefinition): void {
    if (tour.steps.length === 0) {
      return;
    }
    this.state.set({ tour: { ...tour, steps: tour.steps.slice(0, MAX_TOUR_STEPS) }, index: 0 });
  }

  /** Pide repetir un recorrido; la pantalla que lo define lo inicia. */
  requestReplay(id: TourId): void {
    this.replay.update((r) => ({ id, seq: (r?.seq ?? 0) + 1 }));
  }

  /** La pantalla que atendió el pedido lo borra (si no, se repetiría al volver a ella). */
  clearReplay(): void {
    this.replay.set(null);
  }

  /** Atiende un pedido de repetir pendiente para este recorrido; devuelve si lo había. */
  takeReplay(tour: TourDefinition): boolean {
    if (this.replay()?.id !== tour.id) {
      return false;
    }
    this.clearReplay();
    this.start(tour);
    return true;
  }

  next(): void {
    const s = this.state();
    if (!s) {
      return;
    }
    if (s.index + 1 >= s.tour.steps.length) {
      this.finish();
    } else {
      this.state.set({ ...s, index: s.index + 1 });
    }
  }

  previous(): void {
    const s = this.state();
    if (s && s.index > 0) {
      this.state.set({ ...s, index: s.index - 1 });
    }
  }

  /** Terminar o saltar: en ambos casos queda como visto. */
  finish(): void {
    const s = this.state();
    if (s) {
      markTourSeen(this.key(), s.tour.id);
      this.state.set(null);
    }
  }
}
