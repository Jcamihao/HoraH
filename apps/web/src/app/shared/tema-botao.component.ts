import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TemaStore } from '../core/tema.store';
import { IconComponent } from './icon.component';

/** Botão fixo no canto superior direito: liga e desliga o modo escuro em qualquer tela. */
@Component({
  selector: 'hh-tema-botao',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="tema-botao"
      role="switch"
      [attr.aria-checked]="tema.tema() === 'escuro'"
      [attr.aria-label]="'Modo escuro'"
      [attr.title]="tema.tema() === 'escuro' ? 'Desativar o modo escuro' : 'Ativar o modo escuro'"
      (click)="tema.alternar()"
    >
      <hh-icon [nome]="tema.tema() === 'escuro' ? 'sun' : 'moon'" />
    </button>
  `,
})
export class TemaBotaoComponent {
  protected readonly tema = inject(TemaStore);
}
