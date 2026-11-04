import { Injectable, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { TemaStore } from './tema.store';

const FUNDO = { claro: '#fafafa', escuro: '#0a0908' } as const;

/**
 * Ajustes de quando o site roda dentro do app nativo (Capacitor): barra de status no tema certo, botão "voltar"
 * do Android e splash. No navegador e no PWA não faz nada. Os plugins são importados na hora, então o site
 * comum não carrega código nativo.
 */
@Injectable({ providedIn: 'root' })
export class NativoService {
  private readonly tema = inject(TemaStore);

  /** Verdadeiro só dentro do app Android ou iOS. */
  readonly nativo = Capacitor.isNativePlatform();

  iniciar(): void {
    if (!this.nativo) return;
    document.documentElement.classList.add('app-nativo');
    void this.esconderSplash();
    void this.voltarDoAndroid();
    // A barra de status acompanha o tema do app (letras claras no escuro, escuras no claro).
    effect(() => void this.barraDeStatus(this.tema.tema()));
  }

  private async esconderSplash(): Promise<void> {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch {
      // Sem o plugin nativo: o splash some sozinho pelo tempo configurado.
    }
  }

  private async barraDeStatus(tema: 'claro' | 'escuro'): Promise<void> {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: tema === 'escuro' ? Style.Dark : Style.Light });
      if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: FUNDO[tema] });
    } catch {
      // Plugin indisponível (ou comando só do outro sistema): a barra fica como está.
    }
  }

  private async voltarDoAndroid(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) history.back();
        else void App.exitApp();
      });
    } catch {
      // Sem o plugin: o Android usa o comportamento padrão.
    }
  }
}
