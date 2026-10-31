import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Papel, type AgendamentoDto, type AgendaDto, type BloqueioDto, type FaixaHorario, type ProfissionalDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AgendaEstado, classeStatus, rotuloConfirmacao, rotuloStatus, type ModoAgenda } from '../../core/agenda';
import {
  HORAS_PADRAO, andarNaVisao, contarPorDia, diasDaSemana, gradeDoMes, horaCheia, horasDeFuncionamento, janelaDaVisao, mesmoPeriodo, pontoDoSeletor, unirHoras,
} from '../../core/agenda-grade';
import { AuthStore } from '../../core/auth.store';
import {
  dataDoInstante, diaDoMes, diaLongo, fusoDoAparelho, horaDoInstante, hojeNoFuso, intervaloCurto, mesCurto, mesEAno, nomeDoFuso, rotuloDoDia, somarDias,
} from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

type Item =
  | { tipo: 'agendamento'; chave: string; hora: string; ag: AgendamentoDto }
  | { tipo: 'bloqueio'; chave: string; hora: string; bl: BloqueioDto; ate: string; inteiro: boolean };

interface BlocoDaHora {
  hora: number;
  itens: Item[];
}

interface ChipDaSemana {
  hora: number;
  ags: AgendamentoDto[];
}

interface ColunaDaSemana {
  dia: string;
  rotulo: string;
  num: number;
  mes: string;
  ocupado: boolean;
  selecionado: boolean;
  hoje: boolean;
  chips: ChipDaSemana[];
}

interface CelulaDoMes {
  data: string;
  num: number;
  dentro: boolean;
  hoje: boolean;
  qtd: number;
}

const A_CADA_MINUTO = 60_000;
const ROTULOS_DA_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ABAS: { modo: ModoAgenda; rotulo: string }[] = [
  { modo: 'dia', rotulo: 'Dia' },
  { modo: 'semana', rotulo: 'Semana' },
  { modo: 'mes', rotulo: 'Mês' },
];
const ANTERIOR = { dia: 'Dia anterior', semana: 'Semana anterior', mes: 'Mês anterior' };
const PROXIMO = { dia: 'Próximo dia', semana: 'Próxima semana', mes: 'Próximo mês' };

@Component({
  selector: 'app-agenda',
  imports: [RouterLink, IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Agenda" />
    <main class="page page--tabbed page--fab">
      <h1 class="large-title">Agenda</h1>
      <p class="large-sub large-sub--aberto">{{ subtitulo() }}</p>
      <div class="large-tabs">
        <div class="seg seg--dark" role="tablist" aria-label="Visão da agenda">
          @for (aba of abas; track aba.modo) {
            <button type="button" role="tab" id="aba-{{ aba.modo }}" aria-controls="agenda-painel" [attr.aria-selected]="estado.modo() === aba.modo" (click)="estado.modo.set(aba.modo)">{{ aba.rotulo }}</button>
          }
        </div>
      </div>

      @if (estado.aviso(); as aviso) {
        <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso }}</p>
      }
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }
      @if (fusoDiferente()) {
        <p class="banner" style="margin-top: 16px">Os horários seguem o relógio do salão ({{ nomeFuso() }}), que é diferente do seu aparelho.</p>
      }

      <div class="stepper" [class.stepper--dia]="estado.modo() === 'dia'">
        <button type="button" class="stepper__lado stepper__lado--ant" tabindex="-1" aria-hidden="true" (click)="andar(-1)">
          <span class="stepper__txt">{{ anterior().texto }}</span><small>{{ anterior().micro }}</small>
        </button>
        <button type="button" class="stepper__seta" [attr.aria-label]="rotuloAnterior()" (click)="andar(-1)"><hh-icon nome="chevron-left" /></button>
        <span class="stepper__atual" aria-live="polite">
          <span class="sr-only">{{ rotulo() }}</span>
          <span class="stepper__txt" aria-hidden="true">{{ atual().texto }}</span><small aria-hidden="true">{{ atual().micro }}</small>
        </span>
        <button type="button" class="stepper__seta" [attr.aria-label]="rotuloProximo()" (click)="andar(1)"><hh-icon nome="chevron-right" /></button>
        <button type="button" class="stepper__lado stepper__lado--prox" tabindex="-1" aria-hidden="true" (click)="andar(1)">
          <span class="stepper__txt">{{ proximo().texto }}</span><small>{{ proximo().micro }}</small>
        </button>
      </div>

      @if (equipe().length > 1) {
        <div class="group">
          <div class="row row--field">
            <label for="filtro-prof">Profissional</label>
            <select id="filtro-prof" class="input" [value]="estado.profissionalId()" (change)="estado.profissionalId.set($any($event.target).value)">
              <option value="">Todos</option>
              @for (p of equipe(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
            </select>
          </div>
        </div>
      }
      @if (!hojeVisivel()) {
        <button type="button" class="btn btn--plain" style="margin-top: 4px" (click)="irParaHoje()">Voltar para hoje</button>
      }

      <div id="agenda-painel" role="tabpanel" [attr.aria-labelledby]="'aba-' + estado.modo()" [attr.aria-busy]="carregando()">
      @if (carregando()) {
        <div class="stack" style="margin-top: 24px"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (estado.modo() === 'dia') {
        @if (!temItensNoDia()) {
          <p class="agenda-aviso">Dia livre: nenhum agendamento ou bloqueio.</p>
        }
        <div class="horas">
          @for (bloco of blocosDoDia(); track bloco.hora) {
            @if (bloco.itens.length) {
              @for (item of bloco.itens; track item.chave) {
                @if (item.tipo === 'agendamento') {
                  @let a = item.ag;
                  @let selo = seloDe(a);
                  <a class="reuniao" [class.reuniao--cancelada]="a.status === 'CANCELADO'" [routerLink]="['/painel/agenda', a.id]">
                    <span class="reuniao__hora">{{ item.hora }}<small><span class="sr-only">até </span>{{ hora(a.fim) }}</small></span>
                    <span class="reuniao__corpo">
                      <span class="reuniao__topo">
                        <span class="row__main">
                          <span class="row__title">{{ a.cliente.nome }}</span>
                          <span class="row__sub">{{ a.servico.nome }}@if (mostrarProfissional()) { · {{ a.profissional.nome }} }</span>
                        </span>
                        <hh-icon nome="chevron-right" />
                      </span>
                      @if (selo) { <span class="reuniao__rodape"><span [class]="'badge ' + selo.classe">{{ selo.texto }}</span></span> }
                    </span>
                  </a>
                } @else {
                  <div class="slot slot--bloqueio">
                    <span class="slot__hora">@if (item.inteiro) { Dia } @else { {{ item.hora }} }</span>
                    <span class="slot__barra">
                      <span class="slot__texto">
                        <span class="slot__titulo">Bloqueado{{ item.inteiro ? ' o dia todo' : ' até ' + item.ate }}</span>
                        <span class="slot__sub">{{ item.bl.motivo ?? 'Sem motivo' }}@if (mostrarProfissional()) { · {{ nomeDe(item.bl.profissionalId) }} }</span>
                      </span>
                      <button type="button" class="btn btn--small" [class.btn--bad]="removendoId() === item.bl.id" (click)="remover(item.bl.id)">
                        {{ removendoId() === item.bl.id ? 'Confirmar' : 'Remover' }}
                      </button>
                    </span>
                  </div>
                }
              }
            } @else {
              <div class="slot">
                <span class="slot__hora">{{ bloco.hora }}h</span>
                <span class="slot__barra slot__barra--vazio">Sem horários</span>
              </div>
            }
          }
        </div>
      } @else if (estado.modo() === 'semana') {
        @if (!temAtendimentoNaSemana()) {
          <p class="agenda-aviso">Nenhum agendamento nesta semana.</p>
        }
        <div class="semana">
          @for (col of semana().colunas; track col.dia) {
            <div class="semana__col" [class.semana__col--sel]="col.selecionado">
              <span class="semana__dia">{{ col.rotulo }}</span>
              <button type="button" class="tile" [class.tile--ocupado]="col.ocupado" [class.tile--sel]="col.selecionado" [class.tile--hoje]="col.hoje"
                [attr.aria-current]="col.hoje ? 'date' : null" [attr.aria-label]="rotuloDoTile(col)" (click)="abrirDia(col.dia)">
                <span class="tile__num">{{ col.num }}</span><small>{{ col.mes }}</small>
              </button>
              @for (chip of col.chips; track chip.hora) {
                @if (chip.ags.length === 1) {
                  <a class="chip-hora" [routerLink]="['/painel/agenda', chip.ags[0].id]" [attr.aria-label]="rotuloDoChip(chip)">{{ chip.hora }}<small>h</small></a>
                } @else if (chip.ags.length > 1) {
                  <button type="button" class="chip-hora" [attr.aria-label]="rotuloDoChip(chip)" (click)="abrirDia(col.dia)">{{ chip.hora }}<small>h</small></button>
                } @else {
                  <span class="chip-hora chip-hora--vazio" aria-hidden="true"></span>
                }
              }
            </div>
          }
        </div>
      } @else {
        @if (!temAtendimentoNoMes()) {
          <p class="agenda-aviso">Nenhum agendamento neste mês.</p>
        }
        <div class="mes">
          @for (nome of rotulosDaSemana; track nome) { <span class="mes__cab">{{ nome }}</span> }
          @for (semana of mes(); track semana[0].data) {
            @for (c of semana; track c.data) {
              <button type="button" class="mes__dia" [class.mes__dia--fora]="!c.dentro" [class.mes__dia--hoje]="c.hoje"
                [attr.aria-current]="c.hoje ? 'date' : null" [attr.aria-label]="rotuloDaCelula(c)" (click)="abrirDia(c.data)">
                <span class="contagem" [class.contagem--zero]="!c.qtd" aria-hidden="true">{{ c.qtd }}</span>
                <span class="mes__num" aria-hidden="true">{{ c.num }}</span>
              </button>
            }
          }
        </div>
      }
      </div>

      @if (!restrito()) {
        <p class="group__header">Folgas</p>
        <div class="group">
          <a class="row row--link" routerLink="/painel/agenda/bloquear">
            <span class="row__main"><span class="row__title">Bloquear horário</span><span class="row__sub">Folga, almoço extra, consulta: o cliente deixa de ver esses horários.</span></span>
          </a>
        </div>
      }
    </main>
    @if (!restrito()) {
      <a class="fab" routerLink="/painel/agenda/novo"><hh-icon nome="plus" /> Marcar horário</a>
    }
  `,
})
export class AgendaPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly salaoStore = inject(EstabelecimentoStore);
  protected readonly estado = inject(AgendaEstado);

  protected readonly abas = ABAS;
  protected readonly rotulosDaSemana = ROTULOS_DA_SEMANA;

  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly dados = signal<AgendaDto>({ agendamentos: [], bloqueios: [] });
  protected readonly equipe = signal<ProfissionalDto[]>([]);
  protected readonly removendoId = signal('');
  /** Horário de funcionamento do salão (só o dono lê); vazio cai na faixa padrão de 7h às 20h. */
  private readonly funcionamento = signal<FaixaHorario[]>([]);

  protected readonly restrito = this.salaoStore.restrito;

  protected readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');
  private readonly agora = signal(new Date());
  protected readonly hoje = computed(() => hojeNoFuso(this.fuso(), this.agora()));
  protected readonly dataAtual = computed(() => this.estado.data() ?? this.hoje());

  /** O que a visão atual precisa buscar na API (a do mês inclui os dias de fora que completam a grade). */
  private readonly janela = computed(() => janelaDaVisao(this.estado.modo(), this.dataAtual()));
  protected readonly hojeVisivel = computed(() => mesmoPeriodo(this.estado.modo(), this.dataAtual(), this.hoje()));

  protected readonly rotulo = computed(() => {
    const modo = this.estado.modo();
    if (modo === 'dia') return rotuloDoDia(this.dataAtual(), this.hoje());
    if (modo === 'mes') return mesEAno(this.dataAtual());
    const dias = diasDaSemana(this.dataAtual());
    return intervaloCurto(dias[0], dias[6]);
  });
  protected readonly subtitulo = computed(() => {
    const modo = this.estado.modo();
    if (modo === 'dia') return diaLongo(this.dataAtual());
    if (modo === 'mes') return mesEAno(this.dataAtual());
    return this.salaoStore.dados()?.nome ?? '';
  });

  protected readonly anterior = computed(() => pontoDoSeletor(this.estado.modo(), andarNaVisao(this.estado.modo(), this.dataAtual(), -1)));
  protected readonly atual = computed(() => pontoDoSeletor(this.estado.modo(), this.dataAtual()));
  protected readonly proximo = computed(() => pontoDoSeletor(this.estado.modo(), andarNaVisao(this.estado.modo(), this.dataAtual(), 1)));
  protected readonly rotuloAnterior = computed(() => ANTERIOR[this.estado.modo()]);
  protected readonly rotuloProximo = computed(() => PROXIMO[this.estado.modo()]);

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

  /** Horas do expediente: a faixa do salão, ou 7h às 20h enquanto não há horário cadastrado. */
  private readonly horasBase = computed(() => (this.funcionamento().length ? horasDeFuncionamento(this.funcionamento()) : [...HORAS_PADRAO]));

  // ---- Visão Dia
  private readonly itensDoDia = computed(() => this.porDia().get(this.dataAtual()) ?? []);
  protected readonly temItensNoDia = computed(() => this.itensDoDia().length > 0);
  /** Uma entrada por hora: os itens que começam nela, ou nenhum (horário vazio). Hora com item nunca some. */
  protected readonly blocosDoDia = computed<BlocoDaHora[]>(() => {
    const itens = this.itensDoDia();
    const horas = unirHoras(this.horasBase(), itens.map((i) => horaCheia(i.hora)));
    return horas.map((hora) => ({ hora, itens: itens.filter((i) => horaCheia(i.hora) === hora) }));
  });

  // ---- Visão Semana
  protected readonly semana = computed(() => {
    const fuso = this.fuso();
    const porDiaEHora = new Map<string, AgendamentoDto[]>();
    for (const ag of this.dados().agendamentos) {
      if (ag.status === 'CANCELADO') continue;
      const chave = `${dataDoInstante(ag.inicio, fuso)}|${horaCheia(horaDoInstante(ag.inicio, fuso))}`;
      porDiaEHora.set(chave, [...(porDiaEHora.get(chave) ?? []), ag]);
    }
    const dias = diasDaSemana(this.dataAtual());
    const comAgendamento = [...porDiaEHora.keys()].filter((k) => dias.includes(k.split('|')[0])).map((k) => Number(k.split('|')[1]));
    const horas = unirHoras(this.horasBase(), comAgendamento);
    const colunas: ColunaDaSemana[] = dias.map((dia, i) => ({
      dia,
      rotulo: ROTULOS_DA_SEMANA[i],
      num: diaDoMes(dia),
      mes: mesCurto(dia),
      ocupado: horas.some((h) => porDiaEHora.has(`${dia}|${h}`)),
      selecionado: dia === this.dataAtual(),
      hoje: dia === this.hoje(),
      chips: horas.map((hora) => ({ hora, ags: porDiaEHora.get(`${dia}|${hora}`) ?? [] })),
    }));
    return { colunas, total: comAgendamento.length };
  });
  protected readonly temAtendimentoNaSemana = computed(() => this.semana().total > 0);

  // ---- Visão Mês
  private readonly contagemDoMes = computed(() => contarPorDia(this.dados().agendamentos, this.fuso()));
  protected readonly mes = computed<CelulaDoMes[][]>(() => {
    const contagem = this.contagemDoMes();
    return gradeDoMes(this.dataAtual()).map((semana) =>
      semana.map((c) => ({ data: c.data, num: diaDoMes(c.data), dentro: c.dentro, hoje: c.data === this.hoje(), qtd: contagem.get(c.data) ?? 0 })),
    );
  });
  protected readonly temAtendimentoNoMes = computed(() => this.mes().some((s) => s.some((c) => c.dentro && c.qtd > 0)));

  private pedido = 0;

  constructor() {
    void this.iniciar();

    // Recarrega quando muda o que está na tela.
    effect(() => {
      const { de, ate } = this.janela();
      const prof = this.profissionalFiltro();
      if (!this.salaoStore.dados()) return;
      void this.carregar(de, ate, prof);
    });

    // A agenda muda sozinha (cliente marca pelo link): atualiza ao voltar para a aba e a cada minuto.
    const atualizar = () => {
      if (document.visibilityState !== 'visible') return;
      this.agora.set(new Date());
      const { de, ate } = this.janela();
      void this.carregar(de, ate, this.profissionalFiltro(), true);
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

  protected hora(iso: string): string {
    return horaDoInstante(iso, this.fuso());
  }

  protected nomeDe(id: string): string {
    return this.equipe().find((p) => p.id === id)?.nome ?? '';
  }

  /** Só estados que dizem algo ganham selo; "agendado" é o normal, a não ser que o cliente já tenha confirmado. */
  protected seloDe(a: AgendamentoDto): { classe: string; texto: string } | null {
    if (a.status !== 'AGENDADO') return { classe: classeStatus(a.status), texto: rotuloStatus(a.status) };
    if (a.confirmacao === 'CONFIRMADO') return { classe: 'badge--ok', texto: rotuloConfirmacao(a.confirmacao) };
    return null;
  }

  protected rotuloDoTile(col: ColunaDaSemana): string {
    const total = col.chips.reduce((n, c) => n + c.ags.length, 0);
    return `${diaLongo(col.dia)}: ${this.contagemPorExtenso(total)}. Abrir o dia`;
  }

  protected rotuloDoChip(chip: ChipDaSemana): string {
    const nomes = chip.ags.map((a) => a.cliente.nome).join(', ');
    return chip.ags.length === 1 ? `${chip.hora}h, ${nomes}. Abrir o atendimento` : `${chip.hora}h, ${chip.ags.length} atendimentos: ${nomes}. Abrir o dia`;
  }

  protected rotuloDaCelula(c: CelulaDoMes): string {
    return `${diaLongo(c.data)}: ${this.contagemPorExtenso(c.qtd)}`;
  }

  private contagemPorExtenso(n: number): string {
    return n === 0 ? 'sem atendimentos' : n === 1 ? '1 atendimento' : `${n} atendimentos`;
  }

  protected andar(passo: number): void {
    this.estado.aviso.set('');
    this.estado.data.set(andarNaVisao(this.estado.modo(), this.dataAtual(), passo));
  }

  protected irParaHoje(): void {
    this.estado.data.set(null);
  }

  /** Toque num dia da semana ou do mês: abre aquele dia na visão Dia. */
  protected abrirDia(dia: string): void {
    this.estado.aviso.set('');
    this.estado.data.set(dia);
    this.estado.modo.set('dia');
  }

  private async iniciar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      if (this.auth.ehDono()) this.equipe.set((await this.api.get<ProfissionalDto[]>('/profissionais')).filter((p) => p.ativo));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.carregando.set(false);
      return;
    }
    // O horário do salão só ajusta a faixa de horas da tela: se falhar, vale a faixa padrão.
    if (this.auth.ehDono()) {
      try {
        this.funcionamento.set(await this.api.get<FaixaHorario[]>('/estabelecimento/horarios'));
      } catch {
        /* segue com 7h às 20h */
      }
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
      const { de, ate } = this.janela();
      await this.carregar(de, ate, this.profissionalFiltro(), true);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
