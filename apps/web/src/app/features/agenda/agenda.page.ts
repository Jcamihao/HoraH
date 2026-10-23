import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Papel, type AgendamentoDto, type AgendaDto, type BloqueioDto, type ProfissionalDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AgendaEstado, classeStatus, rotuloStatus } from '../../core/agenda';
import { AuthStore } from '../../core/auth.store';
import {
  dataDoInstante, diaLongo, fusoDoAparelho, horaDoInstante, hojeNoFuso, inicioDaSemana, intervaloCurto, nomeDoFuso, rotuloDoDia, somarDias,
} from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

type Item =
  | { tipo: 'agendamento'; chave: string; hora: string; ag: AgendamentoDto }
  | { tipo: 'bloqueio'; chave: string; hora: string; bl: BloqueioDto; ate: string; inteiro: boolean };

const A_CADA_MINUTO = 60_000;

@Component({
  selector: 'app-agenda',
  imports: [RouterLink, IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Agenda">
      @if (!restrito()) { <a routerLink="/painel/agenda/novo"><hh-icon nome="plus" /> Novo</a> }
    </hh-navbar>
    <main class="page page--tabbed">
      <h1 class="large-title">Agenda</h1>
      <p class="large-sub">{{ subtitulo() }}</p>

      @if (estado.aviso(); as aviso) {
        <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso }}</p>
      }
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }
      @if (fusoDiferente()) {
        <p class="banner" style="margin-top: 16px">Os horários seguem o relógio do salão ({{ nomeFuso() }}), que é diferente do seu aparelho.</p>
      }

      <div class="seg" role="tablist" aria-label="Visão da agenda" style="margin-top: 16px">
        <button type="button" role="tab" [attr.aria-selected]="estado.modo() === 'dia'" (click)="estado.modo.set('dia')">Dia</button>
        <button type="button" role="tab" [attr.aria-selected]="estado.modo() === 'semana'" (click)="estado.modo.set('semana')">Semana</button>
      </div>

      <div class="group" style="margin-top: 12px">
        <div class="row date-nav">
          <button type="button" class="btn btn--plain" [attr.aria-label]="estado.modo() === 'dia' ? 'Dia anterior' : 'Semana anterior'" (click)="andar(-1)"><hh-icon nome="chevron-left" /></button>
          <span class="date-nav__label" aria-live="polite">{{ rotulo() }}</span>
          <button type="button" class="btn btn--plain" [attr.aria-label]="estado.modo() === 'dia' ? 'Próximo dia' : 'Próxima semana'" (click)="andar(1)"><hh-icon nome="chevron-right" /></button>
        </div>
        @if (equipe().length > 1) {
          <div class="row row--field">
            <label for="filtro-prof">Profissional</label>
            <select id="filtro-prof" class="input" [value]="estado.profissionalId()" (change)="estado.profissionalId.set($any($event.target).value)">
              <option value="">Todos</option>
              @for (p of equipe(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
            </select>
          </div>
        }
      </div>
      @if (!hojeVisivel()) {
        <button type="button" class="btn btn--plain" style="margin-top: 4px" (click)="irParaHoje()">Voltar para hoje</button>
      }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else {
        @for (dia of dias(); track dia) {
          @let itens = itensDe(dia);
          @if (estado.modo() === 'semana') {
            <p class="group__header">{{ rotuloDoDia(dia) }}</p>
          } @else {
            <div style="margin-top: 16px"></div>
          }
          @if (itens.length) {
            <div class="group">
              @for (item of itens; track item.chave) {
                @if (item.tipo === 'agendamento') {
                  @let a = item.ag;
                  <a class="row row--link" [class.row--muted]="a.status === 'CANCELADO'" [routerLink]="['/painel/agenda', a.id]">
                    <span class="agenda-hora">{{ item.hora }}<small>{{ hora(a.fim) }}</small></span>
                    <span class="row__main">
                      <span class="row__title">{{ a.cliente.nome }}</span>
                      <span class="row__sub">{{ a.servico.nome }}@if (mostrarProfissional()) { · {{ a.profissional.nome }} }</span>
                    </span>
                    @if (a.status !== 'AGENDADO') { <span [class]="'badge ' + classe(a.status)">{{ rotulo2(a.status) }}</span> }
                    @else if (a.confirmacao === 'CONFIRMADO') { <span class="badge badge--ok">Confirmado</span> }
                  </a>
                } @else {
                  <div class="row row--block">
                    <span class="agenda-hora">@if (item.inteiro) { Dia<small>todo</small> } @else { {{ item.hora }}<small>{{ item.ate }}</small> }</span>
                    <span class="row__main">
                      <span class="row__title">Bloqueado</span>
                      <span class="row__sub">{{ item.bl.motivo ?? 'Sem motivo' }}@if (mostrarProfissional()) { · {{ nomeDe(item.bl.profissionalId) }} }</span>
                    </span>
                    <button type="button" class="btn btn--small" [class.btn--bad]="removendoId() === item.bl.id" (click)="remover(item.bl.id)">
                      {{ removendoId() === item.bl.id ? 'Confirmar' : 'Remover' }}
                    </button>
                  </div>
                }
              }
            </div>
          } @else if (estado.modo() === 'semana') {
            <div class="group"><div class="row"><span class="row__sub" style="margin: 0">Sem agendamentos</span></div></div>
          } @else {
            <div class="empty">
              <h2>Dia livre</h2>
              <p>Nenhum agendamento ou bloqueio neste dia.</p>
            </div>
          }
        }
      }

      @if (!restrito()) {
        <p class="group__header">Folgas</p>
        <div class="group">
          <a class="row row--link" routerLink="/painel/agenda/bloquear">
            <span class="row__main"><span class="row__title">Bloquear horário</span><span class="row__sub">Folga, almoço extra, consulta: o cliente deixa de ver esses horários.</span></span>
          </a>
        </div>
      }
    </main>
  `,
})
export class AgendaPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly salaoStore = inject(EstabelecimentoStore);
  protected readonly estado = inject(AgendaEstado);

  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly dados = signal<AgendaDto>({ agendamentos: [], bloqueios: [] });
  protected readonly equipe = signal<ProfissionalDto[]>([]);
  protected readonly removendoId = signal('');

  protected readonly restrito = this.salaoStore.restrito;
  protected readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');
  private readonly agora = signal(new Date());
  protected readonly hoje = computed(() => hojeNoFuso(this.fuso(), this.agora()));
  protected readonly dataAtual = computed(() => this.estado.data() ?? this.hoje());

  protected readonly dias = computed(() => {
    const d = this.dataAtual();
    if (this.estado.modo() === 'dia') return [d];
    const segunda = inicioDaSemana(d);
    return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  });
  protected readonly hojeVisivel = computed(() => this.dias().includes(this.hoje()));
  protected readonly rotulo = computed(() => {
    const dias = this.dias();
    return this.estado.modo() === 'dia' ? rotuloDoDia(dias[0], this.hoje()) : intervaloCurto(dias[0], dias[6]);
  });
  protected readonly subtitulo = computed(() => (this.estado.modo() === 'dia' ? diaLongo(this.dataAtual()) : this.salaoStore.dados()?.nome ?? ''));
  protected readonly mostrarProfissional = computed(() => this.auth.ehDono() && !this.estado.profissionalId() && this.equipe().length > 1);
  protected readonly fusoDiferente = computed(() => this.fuso() !== fusoDoAparelho());
  protected readonly nomeFuso = computed(() => nomeDoFuso(this.fuso()));

  private readonly porDia = computed(() => {
    const fuso = this.fuso();
    const mapa = new Map<string, Item[]>();
    const guardar = (dia: string, item: Item) => mapa.set(dia, [...(mapa.get(dia) ?? []), item]);
    for (const ag of this.dados().agendamentos) {
      guardar(dataDoInstante(ag.inicio, fuso), { tipo: 'agendamento', chave: ag.id, hora: horaDoInstante(ag.inicio, fuso), ag });
    }
    for (const bl of this.dados().bloqueios) {
      const primeiro = dataDoInstante(bl.inicio, fuso);
      const ultimo = dataDoInstante(new Date(new Date(bl.fim).getTime() - 1).toISOString(), fuso);
      for (let dia = primeiro; dia <= ultimo; dia = somarDias(dia, 1)) {
        const hora = dia === primeiro ? horaDoInstante(bl.inicio, fuso) : '00:00';
        const horaFim = horaDoInstante(bl.fim, fuso);
        // Fim exatamente à meia-noite local é o fim do dia anterior (24:00), não 00:00 do dia seguinte.
        const ate = dia === ultimo && horaFim !== '00:00' ? horaFim : '24:00';
        guardar(dia, { tipo: 'bloqueio', chave: `${bl.id}:${dia}`, hora, bl, ate, inteiro: hora === '00:00' && ate === '24:00' });
      }
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.hora.localeCompare(b.hora));
    return mapa;
  });

  private pedido = 0;

  constructor() {
    void this.iniciar();

    // Recarrega quando muda o que está na tela.
    effect(() => {
      const [primeiro, ultimo] = [this.dias()[0], this.dias().at(-1)!];
      const prof = this.profissionalFiltro();
      if (!this.salaoStore.dados()) return;
      void this.carregar(primeiro, ultimo, prof);
    });

    // A agenda muda sozinha (cliente marca pelo link): atualiza ao voltar para a aba e a cada minuto.
    const atualizar = () => {
      if (document.visibilityState !== 'visible') return;
      this.agora.set(new Date());
      void this.carregar(this.dias()[0], this.dias().at(-1)!, this.profissionalFiltro(), true);
    };
    const relogio = setInterval(atualizar, A_CADA_MINUTO);
    document.addEventListener('visibilitychange', atualizar);
    inject(DestroyRef).onDestroy(() => {
      this.estado.aviso.set(''); // o recado vale uma vez só
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', atualizar);
    });
  }

  /** Profissional não escolhe: só vê a própria agenda. */
  private profissionalFiltro(): string {
    return this.auth.usuario()?.papel === Papel.PROFISSIONAL ? '' : this.estado.profissionalId();
  }

  protected itensDe(dia: string): Item[] {
    return this.porDia().get(dia) ?? [];
  }

  protected hora(iso: string): string {
    return horaDoInstante(iso, this.fuso());
  }

  protected rotuloDoDia(dia: string): string {
    return rotuloDoDia(dia, this.hoje());
  }

  protected nomeDe(id: string): string {
    return this.equipe().find((p) => p.id === id)?.nome ?? '';
  }

  protected readonly classe = classeStatus;
  protected readonly rotulo2 = rotuloStatus;

  protected andar(passo: number): void {
    this.estado.aviso.set('');
    this.estado.data.set(somarDias(this.dataAtual(), passo * (this.estado.modo() === 'dia' ? 1 : 7)));
  }

  protected irParaHoje(): void {
    this.estado.modo.set('dia');
    this.estado.data.set(null);
  }

  private async iniciar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      if (this.auth.ehDono()) this.equipe.set((await this.api.get<ProfissionalDto[]>('/profissionais')).filter((p) => p.ativo));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.carregando.set(false);
    }
  }

  private async carregar(de: string, ate: string, profissionalId: string, silencioso = false): Promise<void> {
    const meu = ++this.pedido;
    if (!silencioso) this.carregando.set(true);
    try {
      const resposta = await this.api.get<AgendaDto>('/agenda', { de, ate, ...(profissionalId ? { profissionalId } : {}) });
      if (meu !== this.pedido) return; // chegou depois de o usuário já ter mudado de dia
      this.dados.set(resposta);
      this.erro.set('');
    } catch (e) {
      if (meu === this.pedido) this.erro.set(mensagemDeErro(e));
    } finally {
      if (meu === this.pedido) this.carregando.set(false);
    }
  }

  /** Dois toques: o primeiro pede confirmação, o segundo remove (e o primeiro some se o usuário desistir). */
  protected async remover(id: string): Promise<void> {
    if (this.removendoId() !== id) {
      this.removendoId.set(id);
      setTimeout(() => this.removendoId() === id && this.removendoId.set(''), 4000);
      return;
    }
    this.removendoId.set('');
    try {
      await this.api.delete(`/bloqueios/${id}`);
      await this.carregar(this.dias()[0], this.dias().at(-1)!, this.profissionalFiltro(), true);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
