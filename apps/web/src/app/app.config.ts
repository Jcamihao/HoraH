import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthStore } from './core/auth.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({
        // Uma transição interrompida por outra navegação não é erro; só silencia o aviso.
        onViewTransitionCreated: ({ transition }) => {
          for (const p of [transition.ready, transition.finished, transition.updateCallbackDone]) p.catch(() => undefined);
        },
      }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Antes de qualquer tela: tenta retomar a sessão pelo cookie, para não piscar o login.
    provideAppInitializer(() => inject(AuthStore).restaurar()),
  ],
};
