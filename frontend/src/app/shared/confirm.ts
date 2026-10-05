import { Injectable, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

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

/** Confirmaciones con el mismo estilo en toda la app (se pintan en el p-confirmdialog global). */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly confirmation = inject(ConfirmationService);

  ask(options: ConfirmOptions): void {
    const danger = options.danger ?? false;
    const rejectLabel = options.rejectLabel ?? 'Cancelar';
    this.confirmation.confirm({
      header: options.header,
      message: options.message,
      icon: danger ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle',
      acceptLabel: options.acceptLabel,
      rejectLabel,
      acceptButtonProps: { label: options.acceptLabel, severity: danger ? 'danger' : 'primary' },
      rejectButtonProps: { label: rejectLabel, severity: 'secondary', text: true },
      defaultFocus: 'reject',
      accept: options.accept,
      reject: options.reject,
    });
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
