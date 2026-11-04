import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';
import { LogoComponent } from './logo.component';

/** Barra superior: voltar à esquerda, título pequeno que aparece ao rolar, ação à direita. */
@Component({
  selector: 'hh-navbar',
  imports: [RouterLink, IconComponent, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="navbar">
      @if (voltar(); as destino) {
        <a class="navbar__back" [routerLink]="destino"><hh-icon nome="chevron-left" /> {{ rotulo() }}</a>
      } @else {
        <span class="brand"><hh-logo [altura]="22" /></span>
      }
      <span class="navbar__title" aria-hidden="true">{{ titulo() }}</span>
      <span class="navbar__action"><ng-content /></span>
    </header>
  `,
})
export class NavbarComponent {
  readonly voltar = input<string | readonly string[] | null>(null);
  readonly rotulo = input('Voltar');
  readonly titulo = input('');
}
