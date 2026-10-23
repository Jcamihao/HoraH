import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { AssinaturaAvisoComponent } from '../../shared/assinatura-aviso.component';
import { IconComponent, IconeNome } from '../../shared/icon.component';

interface Aba {
  caminho: string;
  rotulo: string;
  icone: IconeNome;
  exato?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, AssinaturaAvisoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app" [class.app--tabbed]="abas().length > 0">
      @if (auth.ehDono() && salao.cadastroConcluido()) { <hh-assinatura-aviso /> }
      <router-outlet />
    </div>
    @if (abas().length) {
      <nav class="tabbar" aria-label="Principal">
        @for (aba of abas(); track aba.caminho) {
          <a [routerLink]="aba.caminho" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!aba.exato }" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
            <hh-icon [nome]="aba.icone" /> {{ aba.rotulo }}
          </a>
        }
        @if (!auth.ehDono()) {
          <button type="button" (click)="auth.sair()"><hh-icon nome="logout" /> Sair</button>
        }
      </nav>
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly salao = inject(EstabelecimentoStore);

  protected readonly abas = computed<Aba[]>(() => {
    if (!this.auth.ehDono()) {
      return [
        { caminho: '/painel/agenda', rotulo: 'Agenda', icone: 'calendar' },
        { caminho: '/painel/meu-perfil', rotulo: 'Meu perfil', icone: 'person', exato: true },
      ];
    }
    // Durante o passo a passo a navegação some: o caminho é um só.
    if (!this.salao.cadastroConcluido()) return [];
    return [
      { caminho: '/painel', rotulo: 'Início', icone: 'home', exato: true },
      { caminho: '/painel/agenda', rotulo: 'Agenda', icone: 'calendar' },
      { caminho: '/painel/profissionais', rotulo: 'Equipe', icone: 'users' },
      { caminho: '/painel/servicos', rotulo: 'Serviços', icone: 'tag' },
      { caminho: '/painel/configuracoes', rotulo: 'Ajustes', icone: 'sliders' },
    ];
  });
}
