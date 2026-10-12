import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ScaleFormat, ScalePlu } from './api.models';

/** Báscula etiquetadora (fase 8e): formato de las etiquetas y PLU → producto. */
@Injectable({ providedIn: 'root' })
export class ScaleApi {
  private readonly http = inject(HttpClient);

  settings(): Observable<ScaleFormat> {
    return this.http.get<ScaleFormat>('/api/v1/scale/settings');
  }

  saveSettings(format: ScaleFormat): Observable<ScaleFormat> {
    return this.http.put<ScaleFormat>('/api/v1/scale/settings', format);
  }

  plus(): Observable<ScalePlu[]> {
    return this.http.get<ScalePlu[]>('/api/v1/scale/plus');
  }

  assign(plu: string, productId: string): Observable<ScalePlu> {
    return this.http.put<ScalePlu>(`/api/v1/scale/plus/${encodeURIComponent(plu)}`, { productId });
  }

  remove(plu: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/scale/plus/${encodeURIComponent(plu)}`);
  }
}
