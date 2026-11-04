import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Faixa preta ao lado dos formulários de entrada (só no desktop): marca, promessa do produto e a linha de público. */
@Component({
  selector: 'hh-auth-lado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <span class="brand">Hora</span>
    <div>
      <p class="auth__titulo">A agenda do seu salão, <em>no celular.</em></p>
      <svg class="auth__onda" width="180" height="22" viewBox="0 0 180 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M2 12c14-12 26-12 40 0s26 12 40 0 26-12 40 0 26 12 40 0 10-6 14-5" />
      </svg>
    </div>
    <p class="auth__rodape">Salão, unhas, sobrancelha, barbearia.</p>
  `,
})
export class AuthLadoComponent {}
