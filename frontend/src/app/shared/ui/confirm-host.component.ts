import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConfirmService } from '../confirm';
import { ButtonComponent } from './button.component';
import { DialogComponent } from './dialog.component';

/**
 * Donde se pintan las confirmaciones de `ConfirmService` (decisión 338; va una vez en `AppComponent`). Es un diálogo
 * `alertdialog` con ícono y mensaje; el foco arranca en el primer botón del pie, "Cancelar".
 */
@Component({
  selector: 'app-confirm-host',
  imports: [DialogComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let request = confirm.request();
    <app-dialog [visible]="open()" (visibleChange)="!$event && confirm.reject()" [modal]="true" [role]="'alertdialog'"
                [header]="request?.header">
      @if (request) {
        <div class="ui-confirm-content">
          <i [class]="request.icon + ' ui-confirm-icon'" aria-hidden="true"></i>
          <span class="ui-confirm-message">{{ request.message }}</span>
        </div>
      }
      <ng-template #footer>
        @if (request) {
          <app-button [label]="request.rejectLabel" severity="secondary" [text]="true" (clicked)="confirm.reject()" />
          <app-button [label]="request.acceptLabel" [severity]="request.danger ? 'danger' : 'primary'"
                      (clicked)="confirm.accept()" />
        }
      </ng-template>
    </app-dialog>
  `,
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly open = computed(() => this.confirm.request() !== null);
}
