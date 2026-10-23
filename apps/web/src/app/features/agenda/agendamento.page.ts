import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AgendamentoDto, StatusAgendamento } from '@hora-h/shared';
import { Api } from '../../core/api';
import { classeStatus, rotuloConfirmacao, rotuloOrigem, rotuloStatus } from '../../core/agenda';
import { diaLongo, dataDoInstante, horaDoInstante } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { formatarDuracao } from '../../core/horarios';
import { formatarReais } from '../../core/money';
import { formatarWhatsapp, linkWhatsapp } from '../../core/whatsapp';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-agendamento',
  imports: [IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/agenda" rotulo="Agenda" [titulo]="ag()?.cliente?.nome ?? ''" />
    <main class="page page--tabbed">
      @if (carregando()) {
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      } @else if (ag(); as a) {
        <h1 class="large-title">{{ a.cliente.nome }}</h1>
        <p class="large-sub">{{ dia() }} às {{ hora(a.inicio) }}</p>
        @if (aviso()) { <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso() }}</p> }
        @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

        <p class="group__header">Atendimento</p>
        <div class="group">
          <div class="row"><span class="row__main"><span class="row__title">Serviço</span></span><span class="row__detail">{{ a.servico.nome }}</span></div>
          <div class="row"><span class="row__main"><span class="row__title">Profissional</span></span><span class="row__detail">{{ a.profissional.nome }}</span></div>
          <div class="row"><span class="row__main"><span class="row__title">Horário</span></span><span class="row__detail">{{ hora(a.inicio) }} às {{ hora(a.fim) }} ({{ duracao(a.duracaoMin) }})</span></div>
          <div class="row"><span class="row__main"><span class="row__title">Preço</span></span><span class="row__detail">{{ reais(a.precoCentavos) }}</span></div>
        </div>

        <p class="group__header">Cliente</p>
        <div class="group">
          <div class="row"><span class="row__main"><span class="row__title">Nome</span></span><span class="row__detail">{{ a.cliente.nome }}</span></div>
          <a class="row row--link" [href]="whatsapp(a)" target="_blank" rel="noopener noreferrer">
            <span class="row__main"><span class="row__title">WhatsApp</span><span class="row__sub">Abrir conversa</span></span>
            <span class="row__detail">{{ telefone(a) }}</span>
          </a>
        </div>

        <p class="group__header">Situação</p>
        <div class="group">
          <div class="row">
            <span class="row__main"><span class="row__title">Atendimento</span></span>
            <span [class]="'badge ' + classe(a.status)">{{ rotuloDe(a.status) }}</span>
          </div>
          @if (a.status === 'AGENDADO') {
            <div class="row"><span class="row__main"><span class="row__title">Confirmação do cliente</span></span><span class="row__detail">{{ confirmacao(a) }}</span></div>
          }
          <div class="row"><span class="row__main"><span class="row__title">Marcado por</span></span><span class="row__detail">{{ origem(a) }}</span></div>
        </div>

        @if (a.status === 'AGENDADO') {
          @if (jaComecou()) {
            <div class="stack" style="margin-top: 24px">
              <button type="button" class="btn btn--filled btn--block" [disabled]="trabalhando()" (click)="mudar('CONCLUIDO')"><hh-icon nome="check" /> Marcar como concluído</button>
              <button type="button" class="btn btn--block" [disabled]="trabalhando()" (click)="mudar('FALTOU')">Cliente faltou</button>
            </div>
          } @else {
            <p class="group__footer">Depois que o horário começar, você poderá marcar como concluído ou faltou.</p>
          }
          <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="trabalhando()" (click)="copiarLink()"><hh-icon nome="copy" /> Copiar link do cliente</button>
          <p class="group__footer">O link deixa o cliente ver, cancelar ou remarcar o horário sozinho, dentro do prazo do salão.</p>

          <div class="danger-zone">
            <button type="button" class="btn btn--bad btn--block" [disabled]="trabalhando()" (click)="cancelar()">
              {{ confirmandoCancelar() ? 'Toque de novo para cancelar' : 'Cancelar agendamento' }}
            </button>
            @if (confirmandoCancelar()) { <p class="hint" style="margin-top: 8px">O horário volta a ficar livre. O cliente não é avisado automaticamente.</p> }
          </div>
        } @else if (a.status === 'CANCELADO') {
          @if (!jaComecou()) {
            <button type="button" class="btn btn--block" style="margin-top: 24px" [disabled]="trabalhando()" (click)="mudar('AGENDADO')">Reabrir agendamento</button>
            <p class="group__footer">Só funciona se o horário ainda estiver livre.</p>
          }
        } @else {
          <button type="button" class="btn btn--block" style="margin-top: 24px" [disabled]="trabalhando()" (click)="mudar('AGENDADO')">Desfazer e voltar para agendado</button>
          <p class="group__footer">Use se marcou {{ a.status === 'CONCLUIDO' ? 'concluído' : 'falta' }} sem querer.</p>
        }
      } @else if (erro()) {
        <p class="banner banner--bad" style="margin-top: 24px" role="alert">{{ erro() }}</p>
      }
    </main>
  `,
})
export class AgendamentoPage {
  private readonly api = inject(Api);
  private readonly salaoStore = inject(EstabelecimentoStore);

  readonly id = input.required<string>();

  protected readonly ag = signal<AgendamentoDto | null>(null);
  protected readonly carregando = signal(true);
  protected readonly trabalhando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly confirmandoCancelar = signal(false);

  private readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');
  protected readonly dia = computed(() => {
    const a = this.ag();
    return a ? diaLongo(dataDoInstante(a.inicio, this.fuso())) : '';
  });
  protected readonly jaComecou = computed(() => {
    const a = this.ag();
    return a ? new Date(a.inicio).getTime() <= Date.now() : false;
  });

  protected readonly classe = classeStatus;
  protected readonly rotuloDe = rotuloStatus;
  protected readonly reais = formatarReais;
  protected readonly duracao = formatarDuracao;

  constructor() {
    queueMicrotask(() => void this.carregar());
  }

  protected hora(iso: string): string {
    return horaDoInstante(iso, this.fuso());
  }
  protected whatsapp(a: AgendamentoDto): string {
    return linkWhatsapp(a.cliente.whatsapp);
  }
  protected telefone(a: AgendamentoDto): string {
    return formatarWhatsapp(a.cliente.whatsapp);
  }
  protected confirmacao(a: AgendamentoDto): string {
    return rotuloConfirmacao(a.confirmacao);
  }
  protected origem(a: AgendamentoDto): string {
    return rotuloOrigem(a.origem);
  }

  private async carregar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      this.ag.set(await this.api.get<AgendamentoDto>(`/agenda/agendamentos/${this.id()}`));
    } catch (e) {
      this.erro.set(mensagemDeErro(e, 'Não encontramos este agendamento.'));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async mudar(status: StatusAgendamento): Promise<void> {
    this.trabalhando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      this.ag.set(await this.api.patch<AgendamentoDto>(`/agenda/agendamentos/${this.id()}/status`, { status }));
      this.aviso.set(
        { CONCLUIDO: 'Marcado como concluído.', FALTOU: 'Falta registrada.', AGENDADO: 'Voltou para agendado.', CANCELADO: 'Agendamento cancelado.' }[status],
      );
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.trabalhando.set(false);
    }
  }

  protected async cancelar(): Promise<void> {
    if (!this.confirmandoCancelar()) {
      this.confirmandoCancelar.set(true);
      setTimeout(() => this.confirmandoCancelar.set(false), 5000);
      return;
    }
    this.confirmandoCancelar.set(false);
    await this.mudar('CANCELADO');
  }

  protected async copiarLink(): Promise<void> {
    this.erro.set('');
    try {
      const { link } = await this.api.get<{ link: string }>(`/agenda/agendamentos/${this.id()}/link`);
      await navigator.clipboard.writeText(link);
      this.aviso.set('Link copiado. Cole no WhatsApp do cliente.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e, 'Não foi possível copiar o link.'));
    }
  }
}
