import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';

/** Marca del negocio (fase 8c). {@code logo}: data URL de la imagen o null. */
export interface Branding {
  color: string;
  logo: string | null;
  updatedAt: string | null;
}

/** Encabezado de los documentos para el cliente (decisión 261): nombre comercial y sede principal. */
export interface BusinessHeader {
  businessName: string;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
}

@Injectable({ providedIn: 'root' })
export class BrandingApi {
  private readonly http = inject(HttpClient);

  /** Si falla, la app sigue con los colores de siempre: sin aviso. */
  get(): Observable<Branding> {
    return this.http.get<Branding>('/api/v1/branding', { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  /** Si falla, el documento sale solo con el nombre del negocio: sin aviso. */
  header(): Observable<BusinessHeader> {
    return this.http.get<BusinessHeader>('/api/v1/branding/header', {
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, true),
    });
  }

  setColor(color: string): Observable<Branding> {
    return this.http.put<Branding>('/api/v1/branding/color', { color });
  }

  setLogo(dataUrl: string): Observable<Branding> {
    return this.http.put<Branding>('/api/v1/branding/logo', { dataUrl });
  }

  removeLogo(): Observable<Branding> {
    return this.http.delete<Branding>('/api/v1/branding/logo');
  }
}
