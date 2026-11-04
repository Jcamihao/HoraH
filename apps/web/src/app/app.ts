import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TemaStore } from './core/tema.store';
import { TemaBotaoComponent } from './shared/tema-botao.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TemaBotaoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <hh-tema-botao />
  `,
})
export class App {
  // Instancia o tema logo na partida para o atributo data-tema acompanhar o botão.
  private readonly tema = inject(TemaStore);
}
