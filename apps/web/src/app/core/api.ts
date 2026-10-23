import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Cliente fino da API (mesma origem: `/api`). */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(caminho: string, params?: Record<string, string>): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api${caminho}`, { params: new HttpParams({ fromObject: params ?? {} }) }));
  }

  post<T>(caminho: string, corpo?: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api${caminho}`, corpo ?? {}));
  }

  put<T>(caminho: string, corpo: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`/api${caminho}`, corpo));
  }

  patch<T>(caminho: string, corpo: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`/api${caminho}`, corpo));
  }

  delete<T = void>(caminho: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`/api${caminho}`));
  }
}
