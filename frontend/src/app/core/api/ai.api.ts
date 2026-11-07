import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';

/** Un mensaje de la conversación con XASKA IA (decisión 296). */
export interface AskTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Preguntas del mes: {@code limit} 0 = el negocio no tiene XASKA IA. */
export interface AskUsage {
  available: boolean;
  limit: number;
  used: number;
}

export interface AskAnswer {
  answer: string;
  /** Lo que se consultó para responder ("Resumen de ventas"…). */
  consulted: string[];
  usage: AskUsage;
}

/** Punto del Resumen del día (decisión 299). */
export interface DigestPoint {
  section: 'SALES' | 'CASH' | 'INVENTORY' | 'MONEY';
  tone: 'good' | 'warning' | 'bad' | 'info';
  title: string;
  detail: string;
}

export interface Digest {
  date: string;
  headline: string;
  points: DigestPoint[];
  figures: { label: string; value: string }[];
  createdAt: string | null;
}

export interface DigestSettings {
  enabled: boolean;
  /** HH:mm en la zona del negocio. */
  sendTime: string;
  recipients: string[];
  limit: number;
  used: number;
}

@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);

  /**
   * Pregúntale a Aska: la conversación va completa (no se guarda en el servidor). Los 4xx los muestra Aska en su panel,
   * no como aviso arriba.
   */
  ask(question: string, history: AskTurn[]): Observable<AskAnswer> {
    return this.http.post<AskAnswer>('/api/v1/ai/ask', { question, history },
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  usage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/usage');
  }

  /** El último Resumen del día (hoy o ayer) con lo que esta persona puede ver; null si no hay. */
  latestDigest(): Observable<Digest | null> {
    return this.http.get<Digest | null>('/api/v1/ai/digest/latest');
  }

  digestSettings(): Observable<DigestSettings> {
    return this.http.get<DigestSettings>('/api/v1/ai/digest/settings');
  }

  saveDigestSettings(enabled: boolean, sendTime: string, recipients: string[]): Observable<DigestSettings> {
    return this.http.put<DigestSettings>('/api/v1/ai/digest/settings', { enabled, sendTime, recipients });
  }

  /** Arma y envía el resumen ahora (reemplaza el del día). */
  runDigest(): Observable<Digest> {
    return this.http.post<Digest>('/api/v1/ai/digest/run', {});
  }
}
