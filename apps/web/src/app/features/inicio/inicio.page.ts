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
    <main class="page page--tabbed">
      <h1 class="large-title">Início</h1>
      <p class="large-sub">{{ salao()?.nome }}</p>

      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (diasDeTeste() !== null) {
        <p class="banner" style="margin-top: 24px">
          Teste grátis: {{ diasDeTeste() === 0 ? 'último dia' : diasDeTeste() === 1 ? 'falta 1 dia' : 'faltam ' + diasDeTeste() + ' dias' }}. Nenhum cartão foi pedido.
        </p>
      }

      <p class="group__header">Seu salão</p>
      <div class="group">
        <a class="row row--link" routerLink="/painel/profissionais">
          <span class="row__main"><span class="row__title">Equipe</span></span>
          <span class="row__detail">{{ carregando() ? '…' : ativosProf() }}</span>
        </a>
        <a class="row row--link" routerLink="/painel/servicos">
          <span class="row__main"><span class="row__title">Serviços</span></span>
          <span class="row__detail">{{ carregando() ? '…' : ativosServ() }}</span>
        </a>
        <a class="row row--link" routerLink="/painel/configuracoes">
          <span class="row__main"><span class="row__title">Horário e regras</span></span>
        </a>
      </div>

      <p class="group__header">Hoje</p>
      <div class="group">
        <a class="row row--link" routerLink="/painel/agenda">
          <span class="row__main"><span class="row__title">Agenda</span><span class="row__sub">{{ resumoHoje() }}</span></span>
        </a>
      </div>

      @if (naoLidas() > 0 || whatsappDesligado()) {
        <p class="group__header">Atenção</p>
        <div class="group">
          @if (naoLidas() > 0) {
            <a class="row row--link" routerLink="/painel/notificacoes">
              <span class="row__main"><span class="row__title">Notificações</span><span class="row__sub">{{ naoLidas() === 1 ? '1 aviso novo' : naoLidas() + ' avisos novos' }}</span></span>
              <span class="badge badge--wait">{{ naoLidas() }}</span>
            </a>
          }
          @if (whatsappDesligado()) {
            <a class="row row--link" routerLink="/painel/whatsapp">
              <span class="row__main"><span class="row__title">Conectar o WhatsApp</span><span class="row__sub">Seus clientes passam a receber confirmação e lembrete, e marcam horário pelo número do salão.</span></span>
            </a>
          }
        </div>
      }

      <p class="group__header">Link de agendamento</p>
      <div class="group">
        <div class="row">
          <span class="row__main"><span class="row__title" style="word-break: break-all" data-testid="link-publico">{{ linkPublico() }}</span><span class="row__sub">Envie para seus clientes marcarem sozinhos.</span></span>
        </div>
      </div>
      <div class="cluster" style="margin-top: 12px">
        <button type="button" class="btn" style="flex: 1" (click)="copiarLink()"><hh-icon nome="copy" /> Copiar link</button>
        <a class="btn" style="flex: 1" [href]="linkPublico()" target="_blank" rel="noopener noreferrer"><hh-icon nome="link" /> Abrir página</a>
      </div>
      @if (copiado()) { <p class="hint" style="margin-top: 8px" role="status">Link copiado.</p> }
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
    if (!this.hoje()) return 'Carregando…';
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
