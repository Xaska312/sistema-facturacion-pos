import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  header: string;
  message: string;
  /** Verbo claro de la acción ("Anular venta", "Desactivar sucursal"), nunca "Aceptar" o "Sí". */
  acceptLabel: string;
  rejectLabel?: string;
  /** Acción destructiva: botón rojo e icono de advertencia. */
  danger?: boolean;
  accept: () => void;
  reject?: () => void;
}

/** Lo que pinta la confirmación abierta (`app-confirm-host`, una sola en la app). */
export interface ConfirmRequest {
  header: string;
  message: string;
  icon: string;
  acceptLabel: string;
  rejectLabel: string;
  danger: boolean;
  accept: () => void;
  reject?: () => void;
}

/**
 * Confirmaciones con el mismo estilo en toda la app (decisión 338: se pintan en `app-confirm-host`, que reemplaza al
 * p-confirmdialog de PrimeNG). El foco arranca en "Cancelar" para que un Enter distraído no confirme; Escape y la X
 * también cancelan. Una confirmación nueva reemplaza a la que esté abierta.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly current = signal<ConfirmRequest | null>(null);
  /** La confirmación abierta, o null. */
  readonly request = this.current.asReadonly();

  ask(options: ConfirmOptions): void {
    const danger = options.danger ?? false;
    this.current.set({
      header: options.header,
      message: options.message,
      icon: danger ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle',
      acceptLabel: options.acceptLabel,
      rejectLabel: options.rejectLabel ?? 'Cancelar',
      danger,
      accept: options.accept,
      reject: options.reject,
    });
  }

  /** Confirma la abierta: se cierra y corre su acción. */
  accept(): void {
    const request = this.current();
    this.current.set(null);
    request?.accept();
  }

  /** Cancela la abierta (botón, X o Escape). */
  reject(): void {
    const request = this.current();
    this.current.set(null);
    request?.reject?.();
  }

  /** Activar/desactivar un registro con textos coherentes. */
  toggleActive(options: { active: boolean; noun: string; name: string; consequence?: string; accept: () => void }): void {
    const activate = !options.active;
    const verb = activate ? 'Activar' : 'Desactivar';
    this.ask({
      header: `${verb} ${options.noun}`,
      message: `¿${verb} ${options.name}?${!activate && options.consequence ? ` ${options.consequence}` : ''}`,
      acceptLabel: `${verb} ${options.noun}`,
      danger: !activate,
      accept: options.accept,
    });
  }
}
