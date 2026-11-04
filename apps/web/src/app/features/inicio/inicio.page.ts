import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaDto, ConexaoWhatsappDto, NotificacoesDto, ProfissionalDto, ServicoDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { hojeNoFuso } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Início" />
    <main class="page page--wide page--tabbed">
      <h1 class="large-title">Início</h1>
      <p class="large-sub">{{ salao()?.nome }}</p>

      @if (erro()) { <p class="banner banner--bad" style="margin-bottom: 16px" role="alert">{{ erro() }}</p> }

      @if (diasDeTeste() !== null) {
        <div class="faixa-teste" style="margin-bottom: 16px">
          <div>
            <span class="tag-escura">Teste grátis</span>
            <strong>{{ diasDeTeste() === 0 ? 'Último dia' : diasDeTeste() === 1 ? 'Falta 1 dia' : 'Faltam ' + diasDeTeste() + ' dias' }}</strong>
          </div>
          <a class="btn btn--dark btn--seta" routerLink="/painel/assinatura">Assinar</a>
        </div>
      }

      <div class="cards">
        <a class="hero" routerLink="/painel/agenda">
          <span class="kicker">Hoje</span>
          <span class="hero__linha">
            <span><small>Agenda</small><strong>{{ resumoHoje() }}</strong></span>
            <span class="hero__seta" aria-hidden="true"><hh-icon nome="arrow-right" /></span>
          </span>
        </a>

        <section class="card">
          <p class="kicker">Seu salão</p>
          <a class="row row--link" routerLink="/painel/profissionais">
            <span class="row__main"><span class="row__title">Equipe</span></span>
            <span class="row__detail soft">{{ carregando() ? '…' : erro() ? '—' : ativosProf() }}</span>
          </a>
          <a class="row row--link" routerLink="/painel/servicos">
            <span class="row__main"><span class="row__title">Serviços</span></span>
            <span class="row__detail soft">{{ carregando() ? '…' : erro() ? '—' : ativosServ() }}</span>
          </a>
          <a class="row row--link" routerLink="/painel/configuracoes">
            <span class="row__main"><span class="row__title">Horário e regras</span></span>
          </a>
        </section>

        @if (naoLidas() > 0 || whatsappDesligado()) {
          <section class="card">
            <p class="kicker kicker--atencao">Atenção</p>
            @if (naoLidas() > 0) {
              <a class="row row--link" routerLink="/painel/notificacoes">
                <span class="row__main"><span class="row__title">Notificações</span><span class="row__sub">{{ naoLidas() === 1 ? '1 aviso novo' : naoLidas() + ' avisos novos' }}</span></span>
                <span class="dot-count">{{ naoLidas() }}</span>
              </a>
            }
            @if (whatsappDesligado()) {
              <a class="row row--link" routerLink="/painel/whatsapp">
                <span class="row__main"><span class="row__title">Conectar o WhatsApp</span><span class="row__sub">Confirmação e lembrete automáticos.</span></span>
              </a>
            }
          </section>
        }

        <section class="card">
          <p class="kicker">Link de agendamento</p>
          <div class="card__corpo">
            <p class="card__link" data-testid="link-publico">{{ linkPublico() }}</p>
            <div class="cluster">
              <button type="button" class="btn btn--filled btn--small" (click)="copiarLink()">Copiar link</button>
              <a class="btn btn--small" [href]="linkPublico()" target="_blank" rel="noopener noreferrer">Abrir página <hh-icon nome="external" /></a>
            </div>
            @if (copiado()) { <p class="hint" role="status">Link copiado.</p> }
          </div>
        </section>
      </div>
    </main>
  `,
})
export class InicioPage {
  private readonly api = inject(Api);
  private readonly store = inject(EstabelecimentoStore);

  protected readonly salao = this.store.dados;
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  private readonly profs = signal<ProfissionalDto[]>([]);
  private readonly servs = signal<ServicoDto[]>([]);
  protected readonly ativosProf = computed(() => this.profs().filter((p) => p.ativo).length);
  protected readonly ativosServ = computed(() => this.servs().filter((s) => s.ativo).length);
  protected readonly copiado = signal(false);
  protected readonly naoLidas = signal(0);
  private readonly whatsapp = signal<ConexaoWhatsappDto | null>(null);
  /** Só sugere conectar se o WhatsApp existe neste ambiente e o salão ainda não conectou. */
  protected readonly whatsappDesligado = computed(() => !!this.whatsapp()?.configurado && this.whatsapp()!.status !== 'CONECTADA');
  private readonly hoje = signal<AgendaDto | null>(null);
  protected readonly linkPublico = computed(() => `${location.origin}/${this.salao()?.slug ?? ''}`);
  protected readonly resumoHoje = computed(() => {
    const ativos = (this.hoje()?.agendamentos ?? []).filter((a) => a.status !== 'CANCELADO');
    if (!this.hoje()) return this.erro() ? 'Não foi possível carregar' : 'Carregando…';
    if (!ativos.length) return 'Nenhum agendamento para hoje';
    return ativos.length === 1 ? '1 agendamento hoje' : `${ativos.length} agendamentos hoje`;
  });
  protected readonly diasDeTeste = computed(() => {
    const a = this.salao()?.assinatura;
    if (!a || a.status !== 'TESTE' || !a.testeFimEm) return null;
    return Math.max(0, Math.ceil((new Date(a.testeFimEm).getTime() - Date.now()) / 86_400_000));
  });

  constructor() {
    void this.carregar();
  }

  private async carregar(): Promise<void> {
    try {
      const salao = await this.store.carregar();
      const dia = hojeNoFuso(salao.fusoHorario);
      const [p, s, h] = await Promise.all([
        this.api.get<ProfissionalDto[]>('/profissionais'),
        this.api.get<ServicoDto[]>('/servicos'),
        this.api.get<AgendaDto>('/agenda', { de: dia, ate: dia }),
      ]);
      this.profs.set(p);
      this.servs.set(s);
      this.hoje.set(h);
      // Avisos extras: se falharem, o início continua útil sem eles.
      void this.api.get<NotificacoesDto>('/notificacoes').then((n) => this.naoLidas.set(n.naoLidas), () => undefined);
      void this.api.get<ConexaoWhatsappDto>('/whatsapp').then((w) => this.whatsapp.set(w), () => undefined);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async copiarLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linkPublico());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 3000);
    } catch (e) {
      this.erro.set(mensagemDeErro(e, 'Não foi possível copiar. Selecione o link e copie à mão.'));
    }
  }
}
