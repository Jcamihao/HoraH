import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthStore } from './core/auth.store';
import { NativoService } from './core/nativo.service';

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
    // Dentro do app nativo (Capacitor): barra de status, botão voltar do Android e splash.
    provideAppInitializer(() => inject(NativoService).iniciar()),
    // PWA: guarda o site para abrir rápido e permitir "instalar". Só em produção; a API nunca é guardada em cache.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
