import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Casca nativa (Android e iOS) do Hora H.
 *
 * O app nativo carrega o site publicado (`HORAH_URL`), e não uma cópia embutida: o login usa cookie `httpOnly`
 * na mesma origem da API (`/api`), que só funciona assim. Em teste, `HORAH_URL` pode ser o endereço do seu
 * computador na rede (http://192.168.x.x:4200); o Android precisa de `cleartext` para http, e isso é ligado sozinho.
 *
 * Variáveis: HORAH_URL (obrigatória) e HORAH_APP_ID (identificador do app nas lojas; troque ANTES de publicar,
 * porque depois não dá para mudar).
 */
const url = (process.env['HORAH_URL'] ?? '').replace(/\/+$/, '');
if (!url) {
  throw new Error(
    'Defina HORAH_URL com o endereço do Hora H (ex.: HORAH_URL=https://horah.exemplo.com npm run mobile:sync). ' +
      'Veja o README, "App no celular".',
  );
}

const config: CapacitorConfig = {
  appId: process.env['HORAH_APP_ID'] ?? 'br.com.horah.app',
  appName: 'Hora H',
  webDir: 'dist/web/browser',
  backgroundColor: '#0a0908',
  server: {
    url,
    cleartext: url.startsWith('http://'),
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0908',
  },
  android: {
    backgroundColor: '#0a0908',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0a0908',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
