import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

const comToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Anexa o access token e, num 401, tenta renovar a sessão uma vez antes de desistir. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const rotaDeAuth = req.url.startsWith('/api/auth/');
  const enviada = rotaDeAuth ? req : comToken(req, auth.accessToken());

  return next(enviada).pipe(
    catchError((erro: unknown) => {
      if (erro instanceof HttpErrorResponse && erro.status === 401 && !rotaDeAuth && auth.logado()) {
        return from(auth.renovar()).pipe(
          switchMap((ok) => {
            if (!ok) {
              auth.expirou();
              return throwError(() => erro);
            }
            return next(comToken(req, auth.accessToken()));
          }),
        );
      }
      return throwError(() => erro);
    }),
  );
};
