import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { DiaDisponivelDto, MeuAgendamentoDto, SlotDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataDoInstante, diaLongo, horaDoInstante, nomeDoFuso } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { formatarDuracao } from '../../core/horarios';
import { formatarReais } from '../../core/money';
import { baixarIcs, montarIcs } from '../../core/publico';
import { IconComponent } from '../../shared/icon.component';
import { SeletorHorarioComponent } from './seletor-horario.component';

/** Página do link único: o cliente vê o próprio horário e, dentro do prazo, remarca ou cancela. */
@Component({
  selector: 'app-meu-agendamento',
  imports: [IconComponent, RouterLink, SeletorHorarioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pub">
      <header class="pub-hero pub-hero--compacto">
        <div class="pub-wrap">
          @if (remarcando()) {
            <button type="button" class="pub-back" (click)="remarcando.set(false)"><hh-icon nome="chevron-left" /> Voltar</button>
          }
          <h1 class="pub-nome">{{ ag()?.salao?.nome ?? 'Seu horário' }}</h1>
        </div>
      </header>

      <div class="pub-wrap">
        @if (carregando()) {
          <main class="pub-main" aria-busy="true"><div class="pub-skeleton"></div><div class="pub-skeleton"></div></main>
        } @else if (naoEncontrado()) {
          <main class="pub-main"><div class="pub-vazio"><strong>Não encontramos este horário</strong>O link pode estar incompleto. Peça outro ao salão.</div></main>
        } @else if (ag(); as a) {
          @if (remarcando()) {
            <main class="pub-main" [class.pub-main--dock]="novo()">
              <h2 class="pub-q">Escolha o novo dia e horário</h2>
              <p class="pub-sub">{{ a.servico.nome }} com {{ a.profissional.nome }}</p>
              @if (carregandoDias()) {
                <div class="pub-skeleton" aria-busy="true"></div>
              } @else {
                <hh-seletor-horario [dias]="dias()" [selecionado]="novo()?.inicio ?? ''" [buscar]="buscarHorarios" [observacao]="'Horários de ' + fusoNome() + '.'" (escolher)="novo.set($event)" />
              }
              @if (erro()) { <p class="pub-aviso pub-aviso--erro" role="alert">{{ erro() }}</p> }
            </main>
            @if (novo(); as n) {
              <div class="pub-dock"><div class="pub-wrap"><button type="button" class="pub-btn" [disabled]="trabalhando()" (click)="remarcar()">Remarcar para {{ n.hora }}</button></div></div>
            }
          } @else {
            <main class="pub-main">
              <h2 class="pub-q">{{ titulo() }}</h2>
              @if (aviso()) { <p class="pub-aviso" role="status">{{ aviso() }}</p> }
              @if (erro()) { <p class="pub-aviso pub-aviso--erro" role="alert">{{ erro() }}</p> }

              <div class="pub-quando" [class.pub-quando--cancelado]="a.status === 'CANCELADO'">
                <span class="pub-quando__dia">{{ dia(a.inicio) }}</span>
                <span class="pub-quando__hora">{{ hora(a.inicio) }}</span>
                <span class="pub-quando__detalhe">{{ a.servico.nome }} com {{ a.profissional.nome }}<br />{{ duracao(a.duracaoMin) }} · {{ reais(a.precoCentavos) }}<br />Para {{ a.clienteNome }}</span>
              </div>

              @if (a.podeConfirmar) {
                <div class="pub-acoes" style="margin-top: 0; margin-bottom: 12px">
                  <button type="button" class="pub-btn" [disabled]="trabalhando()" (click)="confirmar()"><hh-icon nome="check" /> Confirmo que vou</button>
                </div>
              } @else if (a.status === 'AGENDADO' && a.confirmacao === 'CONFIRMADO' && futuro()) {
                <p class="pub-aviso" role="status">Presença confirmada. Esperamos você!</p>
              }
              @if (a.podeAlterar) {
                <p class="pub-sub">Você pode remarcar ou cancelar até {{ dia(a.limiteAlteracao) }} às {{ hora(a.limiteAlteracao) }}.</p>
                <div class="pub-acoes">
                  <button type="button" class="pub-btn" [disabled]="trabalhando()" (click)="abrirRemarcar()"><hh-icon nome="calendar" /> Remarcar</button>
                  <button type="button" class="pub-btn pub-btn--suave" (click)="adicionarAoCalendario(a)"><hh-icon nome="calendar" /> Adicionar ao calendário</button>
                  <button type="button" class="pub-btn pub-btn--perigo" [disabled]="trabalhando()" (click)="cancelar()">{{ confirmandoCancelar() ? 'Toque de novo para cancelar' : 'Cancelar horário' }}</button>
                </div>
              } @else if (a.status === 'AGENDADO' && futuro()) {
                <p class="pub-aviso">O prazo para mudar sozinho terminou em {{ dia(a.limiteAlteracao) }} às {{ hora(a.limiteAlteracao) }}. Para remarcar ou cancelar, fale com o salão.</p>
                <div class="pub-acoes"><button type="button" class="pub-btn pub-btn--suave" (click)="adicionarAoCalendario(a)"><hh-icon nome="calendar" /> Adicionar ao calendário</button></div>
              } @else if (a.status === 'CANCELADO') {
                <div class="pub-acoes"><a class="pub-btn" [routerLink]="['/', a.salao.slug]" [queryParams]="{ profissional: a.profissional.id, servico: a.servico.id }">Marcar outro horário</a></div>
              }
            </main>
          }
        }
        <footer class="pub-rodape">Agendamento pelo Hora H</footer>
      </div>
    </div>
  `,
})
export class MeuAgendamentoPage {
  private readonly api = inject(Api);
  private readonly titulo_ = inject(Title);

  readonly token = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly naoEncontrado = signal(false);
  protected readonly trabalhando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly ag = signal<MeuAgendamentoDto | null>(null);
  protected readonly remarcando = signal(false);
  protected readonly carregandoDias = signal(false);
  protected readonly dias = signal<DiaDisponivelDto[]>([]);
  protected readonly novo = signal<SlotDto | null>(null);
  protected readonly confirmandoCancelar = signal(false);

  protected readonly fuso = computed(() => this.ag()?.salao.fusoHorario ?? 'America/Sao_Paulo');
  protected readonly fusoNome = computed(() => nomeDoFuso(this.fuso()));
  protected readonly futuro = computed(() => (this.ag() ? new Date(this.ag()!.inicio).getTime() > Date.now() : false));
  protected readonly titulo = computed(() => {
    const a = this.ag();
    if (!a) return '';
    if (a.status === 'CANCELADO') return 'Horário cancelado';
    if (a.status === 'CONCLUIDO') return 'Atendimento concluído';
    if (a.status === 'FALTOU') return 'Falta registrada';
    return this.futuro() ? 'Seu horário' : 'Atendimento encerrado';
  });
  protected readonly reais = formatarReais;
  protected readonly duracao = formatarDuracao;

  protected readonly buscarHorarios = (data: string): Promise<SlotDto[]> =>
    this.api.get<SlotDto[]>(`/meu-agendamento/${this.token()}/horarios`, { data });

  constructor() {
    queueMicrotask(() => void this.carregar());
  }

  protected dia(iso: string): string {
    return diaLongo(dataDoInstante(iso, this.fuso()));
  }
  protected hora(iso: string): string {
    return horaDoInstante(iso, this.fuso());
  }

  private async carregar(): Promise<void> {
    try {
      const a = await this.api.get<MeuAgendamentoDto>(`/meu-agendamento/${this.token()}`);
      this.ag.set(a);
      this.titulo_.setTitle(`Seu horário | ${a.salao.nome}`);
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.naoEncontrado.set(true);
      else this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async confirmar(): Promise<void> {
    this.trabalhando.set(true);
    this.erro.set('');
    try {
      this.ag.set(await this.api.post<MeuAgendamentoDto>(`/meu-agendamento/${this.token()}/confirmar`));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.trabalhando.set(false);
    }
  }

  protected async abrirRemarcar(): Promise<void> {
    this.remarcando.set(true);
    this.novo.set(null);
    this.erro.set('');
    this.carregandoDias.set(true);
    try {
      this.dias.set(await this.api.get<DiaDisponivelDto[]>(`/meu-agendamento/${this.token()}/dias`));
    } catch (e) {
      this.dias.set([]);
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregandoDias.set(false);
    }
  }

  protected async remarcar(): Promise<void> {
    const novo = this.novo();
    if (!novo) return;
    this.trabalhando.set(true);
    this.erro.set('');
    try {
      this.ag.set(await this.api.post<MeuAgendamentoDto>(`/meu-agendamento/${this.token()}/remarcar`, { inicio: novo.inicio }));
      this.remarcando.set(false);
      this.aviso.set('Horário remarcado.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.novo.set(null);
    } finally {
      this.trabalhando.set(false);
    }
  }

  /** Dois toques: o primeiro pede confirmação (cancelar não tem volta pelo link). */
  protected async cancelar(): Promise<void> {
    if (!this.confirmandoCancelar()) {
      this.confirmandoCancelar.set(true);
      setTimeout(() => this.confirmandoCancelar.set(false), 5000);
      return;
    }
    this.confirmandoCancelar.set(false);
    this.trabalhando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      this.ag.set(await this.api.post<MeuAgendamentoDto>(`/meu-agendamento/${this.token()}/cancelar`));
      this.aviso.set('O salão já pode usar esse espaço para outra pessoa.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.trabalhando.set(false);
    }
  }

  protected adicionarAoCalendario(a: MeuAgendamentoDto): void {
    baixarIcs(
      montarIcs({
        id: this.token().slice(0, 16), inicio: a.inicio, fim: a.fim,
        titulo: `${a.servico.nome} - ${a.salao.nome}`,
        descricao: `Com ${a.profissional.nome}. Para ver, remarcar ou cancelar: ${location.origin}/agendamento/${this.token()}`,
      }),
    );
  }
}
