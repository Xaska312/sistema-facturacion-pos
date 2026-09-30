import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';

/**
 * Muestra el contenido solo si la sesión tiene el permiso: {@code *hasPermission="'sales:void'"}.
 * Es solo UX: el backend valida cada permiso.
 */
@Directive({ selector: '[hasPermission]' })
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private rendered = false;

  readonly hasPermission = input.required<string>();

  constructor() {
    effect(() => {
      const allowed = this.auth.hasPermission(this.hasPermission());
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
