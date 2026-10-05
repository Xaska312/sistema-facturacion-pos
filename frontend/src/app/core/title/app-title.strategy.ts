import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'POS Híbrido';

/** "Productos · POS Híbrido"; sin título de ruta, solo el nombre de la app. */
export function formatPageTitle(pageTitle: string | undefined | null): string {
  return pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
}

/** Título de la pestaña según el {@code title} de la ruta activa. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(formatPageTitle(this.buildTitle(snapshot)));
  }
}
