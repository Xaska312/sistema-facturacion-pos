import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);

  /** Pregúntale a tu negocio: la conversación va completa (no se guarda en el servidor). */
  ask(question: string, history: AskTurn[]): Observable<AskAnswer> {
    return this.http.post<AskAnswer>('/api/v1/ai/ask', { question, history });
  }

  usage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/usage');
  }
}
