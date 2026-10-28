import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { NotificacaoDto, NotificacoesDto, TipoNotificacao } from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataBRDoInstante, horaDoInstante } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { NavbarComponent } from '../../shared/navbar.component';

const ROTULO: Record<TipoNotificacao, { texto: string; classe: string }> = {
  novo_agendamento: { texto: 'Novo', classe: 'badge--ok' },
  cancelamento: { texto: 'Cancelado', classe: '' },
  cancelamento_automatico: { texto: 'Sem resposta', classe: 'badge--wait' },
  lembrete_sem_entrega: { texto: 'Não entregue', classe: 'badge--bad' },
  whatsapp_caiu: { texto: 'WhatsApp', classe: 'badge--bad' },
};

@Component({
  selector: 'app-notificacoes',
  imports: [NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel" rotulo="Início" titulo="Notificações" />
    <main class="page page--tabbed">
      <h1 class="large-title">Notificações</h1>
      <p class="large-sub">O que aconteceu na sua agenda.</p>
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (!lista().length) {
        <div class="empty"><h2>Nada por aqui</h2><p>Novos agendamentos, cancelamentos e avisos do WhatsApp aparecem aqui.</p></div>
      } @else {
        @if (naoLidas() > 0) {
          <button type="button" class="btn btn--plain" style="margin-top: 8px" (click)="marcarTodas()">Marcar todas como lidas</button>
        }
        <div class="group" style="margin-top: 16px">
          @for (n of lista(); track n.id) {
            <button type="button" class="row row--link" (click)="abrir(n)">
              <span class="row__main">
                <span class="row__title" [style.font-weight]="n.lida ? 400 : 700">{{ n.titulo }}</span>
                <span class="row__sub">{{ n.corpo }}</span>
                <span class="row__sub">{{ quando(n) }}</span>
              </span>
              <span [class]="'badge ' + rotulo(n).classe">{{ rotulo(n).texto }}</span>
            </button>
          }
        </div>
      }
    </main>
  `,
})
export class NotificacoesPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly salaoStore = inject(EstabelecimentoStore);

  protected readonly lista = signal<NotificacaoDto[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly naoLidas = computed(() => this.lista().filter((n) => !n.lida).length);
  private readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');

  constructor() {
    void this.carregar();
  }

  protected rotulo(n: NotificacaoDto) {
    return ROTULO[n.tipo];
  }

  protected quando(n: NotificacaoDto): string {
    return `${dataBRDoInstante(n.criadaEm, this.fuso())} às ${horaDoInstante(n.criadaEm, this.fuso())}`;
  }

  private async carregar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      this.lista.set((await this.api.get<NotificacoesDto>('/notificacoes')).itens);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async abrir(n: NotificacaoDto): Promise<void> {
    if (!n.lida) {
      this.lista.update((l) => l.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      void this.api.post(`/notificacoes/${n.id}/lida`).catch(() => undefined);
    }
    if (n.agendamentoId) {
      await this.router.navigate(['/painel/agenda', n.agendamentoId]);
    } else if (n.tipo === 'whatsapp_caiu') {
      await this.router.navigate(['/painel/whatsapp']);
    }
  }

  protected async marcarTodas(): Promise<void> {
    this.lista.update((l) => l.map((x) => ({ ...x, lida: true })));
    try {
      await this.api.post('/notificacoes/lidas');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
