import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type {
  AgendamentoCriadoPublicoDto, DiaDisponivelDto, ProfissionalPublicoDto, SalaoPublicoDto, SlotDto,
} from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataDoInstante, diaLongo, horaDoInstante, nomeDoFuso } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { formatarDuracao } from '../../core/horarios';
import { formatarReais } from '../../core/money';
import { baixarIcs, montarIcs } from '../../core/publico';
import { mascaraWhatsapp, whatsappValido } from '../../core/whatsapp';
import { IconComponent } from '../../shared/icon.component';
import { SeletorHorarioComponent } from './seletor-horario.component';

type Etapa = 'quem' | 'servico' | 'quando' | 'dados' | 'pronto';
const ETAPAS: Etapa[] = ['quem', 'servico', 'quando', 'dados', 'pronto'];

/** Página de agendamento do salão, aberta pelo cliente final em `/{slug}`. Sem login. */
@Component({
  selector: 'app-publico',
  imports: [IconComponent, RouterLink, SeletorHorarioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pub">
      <header class="pub-hero" [class.pub-hero--grande]="etapaAtual() === 'quem'" [class.pub-hero--compacto]="etapaAtual() !== 'quem'">
        <div class="pub-wrap">
          @if (voltarPara(); as destino) {
            <button type="button" class="pub-back" (click)="ir(destino)"><hh-icon nome="chevron-left" /> Voltar</button>
          }
          @if (salao(); as s) {
            <h1 class="pub-nome" [class.pub-nome--medio]="s.nome.length > 14 && s.nome.length <= 28" [class.pub-nome--longo]="s.nome.length > 28">{{ s.nome }}</h1>
            @if (etapaAtual() === 'quem') { <p class="pub-lead">Marque seu horário aqui, em menos de um minuto.</p> }
          } @else if (!carregando()) {
            <h1 class="pub-nome pub-nome--medio">Hora H</h1>
          }
        </div>
      </header>

      <div class="pub-wrap">
        @if (carregando()) {
          <main class="pub-main" aria-busy="true"><div class="pub-skeleton"></div><div class="pub-skeleton"></div><div class="pub-skeleton"></div></main>
        } @else if (naoEncontrado()) {
          <main class="pub-main">
            <div class="pub-vazio"><strong>Não encontramos esta página</strong>Confira o endereço que o salão enviou para você.</div>
          </main>
        } @else if (erroGeral()) {
          <main class="pub-main"><p class="pub-aviso pub-aviso--erro" role="alert">{{ erroGeral() }}</p><button type="button" class="pub-btn pub-btn--suave" (click)="carregarSalao()">Tentar de novo</button></main>
        } @else if (salao(); as s) {
          @if (!s.profissionais.length) {
            <main class="pub-main">
              <div class="pub-vazio"><strong>Ainda sem horários online</strong>{{ s.nome }} ainda não abriu a agenda pela internet. Fale direto com o salão.</div>
            </main>
          } @else {
            @switch (etapaAtual()) {
              @case ('quem') {
                <main class="pub-main">
                  <h2 class="pub-q">Com quem você quer marcar?</h2>
                  @for (p of s.profissionais; track p.id) {
                    <button type="button" class="pub-choice" (click)="escolherProfissional(p)">
                      <span class="pub-choice__main">
                        <span class="pub-choice__title">{{ p.nome }}</span>
                        <span class="pub-choice__sub">{{ resumoServicos(p) }}</span>
                      </span>
                      <hh-icon nome="chevron-right" />
                    </button>
                  }
                </main>
              }
              @case ('servico') {
                <main class="pub-main">
                  @if (s.profissionais.length > 1) {
                    <div class="pub-recap"><span>Com <strong>{{ profissional()?.nome }}</strong></span><button type="button" class="pub-link" (click)="ir('quem')">Mudar</button></div>
                  }
                  <h2 class="pub-q">O que você vai fazer?</h2>
                  @for (sv of profissional()?.servicos ?? []; track sv.servicoId) {
                    <button type="button" class="pub-choice" (click)="escolherServico(sv.servicoId)">
                      <span class="pub-choice__main">
                        <span class="pub-choice__title">{{ sv.nome }}</span>
                        <span class="pub-choice__sub">{{ duracao(sv.duracaoMin) }}</span>
                      </span>
                      <span class="pub-choice__detail">{{ reais(sv.precoCentavos) }}</span>
                    </button>
                  }
                </main>
              }
              @case ('quando') {
                <main class="pub-main">
                  <div class="pub-recap"><span><strong>{{ servicoEscolhido()?.nome }}</strong><br />{{ detalheEscolha() }}</span><button type="button" class="pub-link" (click)="ir('servico')">Mudar</button></div>
                  <h2 class="pub-q">Qual dia e horário?</h2>
                  @if (carregandoDias()) {
                    <div class="pub-skeleton" aria-busy="true"></div>
                  } @else {
                    <hh-seletor-horario [dias]="dias()" [selecionado]="slot()?.inicio ?? ''" [buscar]="buscarHorarios" [observacao]="observacaoFuso()" (escolher)="escolherHorario($event)" />
                  }
                  @if (erro()) { <p class="pub-aviso pub-aviso--erro" role="alert">{{ erro() }}</p> }
                </main>
              }
              @case ('dados') {
                <main class="pub-main pub-main--dock">
                  <div class="pub-recap">
                    <span><strong>{{ quando() }}</strong><br />{{ servicoEscolhido()?.nome }} {{ detalheEscolha() }}</span>
                    <button type="button" class="pub-link" (click)="ir('quando')">Mudar</button>
                  </div>
                  <h2 class="pub-q">Seus dados</h2>
                  @if (erro()) { <p class="pub-aviso pub-aviso--erro" role="alert">{{ erro() }}</p> }
                  <label class="pub-campo">
                    <span class="pub-campo__rotulo">Seu nome</span>
                    <input autocomplete="name" autocapitalize="words" placeholder="Como podemos te chamar" [value]="nome()" (input)="nome.set($any($event.target).value)" />
                  </label>
                  <label class="pub-campo" [class.is-invalido]="whatsapp().length > 0 && !whatsappOk()">
                    <span class="pub-campo__rotulo">Seu WhatsApp</span>
                    <input type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 99999-8888" [value]="whatsapp()" (input)="digitarWhatsapp($event)" />
                  </label>
                  <label class="pub-aceite">
                    <input type="checkbox" [checked]="aceite()" (change)="aceite.set($any($event.target).checked)" />
                    <span>Concordo em usar meu nome e WhatsApp para este agendamento e para receber avisos sobre ele. Quem cuida desses dados é {{ s.nome }}.</span>
                  </label>
                </main>
                <div class="pub-dock"><div class="pub-wrap"><button type="button" class="pub-btn" [disabled]="!podeConfirmar() || enviando()" (click)="confirmar()">{{ enviando() ? 'Marcando…' : 'Confirmar horário' }}</button></div></div>
              }
              @case ('pronto') {
                @if (feito(); as f) {
                  <main class="pub-main">
                    <h2 class="pub-q">Horário marcado</h2>
                    <div class="pub-quando">
                      <span class="pub-quando__dia">{{ diaDe(f.inicio) }}</span>
                      <span class="pub-quando__hora">{{ horaDe(f.inicio) }}</span>
                      <span class="pub-quando__detalhe">{{ f.servico.nome }} com {{ f.profissional.nome }}<br />{{ duracao(f.duracaoMin) }} · {{ reais(f.precoCentavos) }}</span>
                    </div>
                    <p class="pub-aviso">Guarde o link abaixo. É por ele que você vê, remarca ou cancela seu horário, até {{ prazoTexto(f) }}.</p>
                    <div class="pub-acoes">
                      <a class="pub-btn" [routerLink]="['/agendamento', f.token]"><hh-icon nome="link" /> Ver meu horário</a>
                      <button type="button" class="pub-btn pub-btn--suave" (click)="copiarLink(f)"><hh-icon nome="copy" /> {{ copiado() ? 'Link copiado' : 'Copiar link' }}</button>
                      <button type="button" class="pub-btn pub-btn--suave" (click)="adicionarAoCalendario(f)"><hh-icon nome="calendar" /> Adicionar ao calendário</button>
                    </div>
                  </main>
                }
              }
            }
          }
          <footer class="pub-rodape">Agendamento pelo Hora H</footer>
        }
      </div>
    </div>
  `,
})
export class PublicoPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly titulo = inject(Title);

  readonly slug = input.required<string>();
  /** Passos ficam na URL (?etapa=): o botão voltar do aparelho anda um passo, não sai da página. */
  readonly etapa = input<string>();
  /** Vem do link "marcar outro horário" de um agendamento cancelado. */
  readonly profissionalPedido = input<string | undefined>(undefined, { alias: 'profissional' });
  readonly servicoPedido = input<string | undefined>(undefined, { alias: 'servico' });

  protected readonly carregando = signal(true);
  protected readonly naoEncontrado = signal(false);
  protected readonly erroGeral = signal('');
  protected readonly erro = signal('');
  protected readonly salao = signal<SalaoPublicoDto | null>(null);

  /** Onde começa quando a URL não diz: pula o que já está decidido (um profissional só, ou link de "marcar outro"). */
  private readonly etapaInicial = signal<Etapa>('quem');
  protected readonly profId = signal('');
  protected readonly servicoId = signal('');
  protected readonly slot = signal<SlotDto | null>(null);
  protected readonly dias = signal<DiaDisponivelDto[]>([]);
  protected readonly carregandoDias = signal(false);
  protected readonly nome = signal('');
  protected readonly whatsapp = signal('');
  protected readonly aceite = signal(false);
  protected readonly enviando = signal(false);
  protected readonly feito = signal<AgendamentoCriadoPublicoDto | null>(null);
  protected readonly copiado = signal(false);

  protected readonly profissional = computed<ProfissionalPublicoDto | undefined>(() => this.salao()?.profissionais.find((p) => p.id === this.profId()));
  protected readonly servicoEscolhido = computed(() => this.profissional()?.servicos.find((s) => s.servicoId === this.servicoId()));
  protected readonly fuso = computed(() => this.salao()?.fusoHorario ?? 'America/Sao_Paulo');
  protected readonly whatsappOk = computed(() => whatsappValido(this.whatsapp()));
  protected readonly podeConfirmar = computed(() => this.nome().trim().length >= 2 && this.whatsappOk() && this.aceite());

  /** Etapa mostrada: a pedida na URL, desde que o que ela exige já tenha sido escolhido. */
  protected readonly etapaAtual = computed<Etapa>(() => {
    const pedida = ETAPAS.includes(this.etapa() as Etapa) ? (this.etapa() as Etapa) : this.etapaInicial();
    if (pedida === 'pronto') return this.feito() ? 'pronto' : 'quem';
    if (pedida !== 'quem' && !this.profId()) return 'quem';
    if ((pedida === 'quando' || pedida === 'dados') && !this.servicoId()) return 'servico';
    if (pedida === 'dados' && !this.slot()) return 'quando';
    return pedida;
  });
  protected readonly voltarPara = computed<Etapa | null>(() => {
    const unica = (this.salao()?.profissionais.length ?? 0) === 1;
    switch (this.etapaAtual()) {
      case 'servico': return unica ? null : 'quem';
      case 'quando': return 'servico';
      case 'dados': return 'quando';
      default: return null;
    }
  });
  protected readonly reais = formatarReais;
  protected readonly duracao = formatarDuracao;
  protected readonly detalheEscolha = computed(() => {
    const sv = this.servicoEscolhido();
    return sv ? `com ${this.profissional()?.nome} · ${formatarReais(sv.precoCentavos)}` : '';
  });
  protected readonly quando = computed(() => {
    const s = this.slot();
    if (!s) return '';
    const dia = diaLongo(dataDoInstante(s.inicio, this.fuso()));
    return `${dia[0].toUpperCase()}${dia.slice(1)}, ${s.hora}`;
  });
  protected readonly observacaoFuso = computed(() => `Horários de ${nomeDoFuso(this.fuso())}.`);

  /** Estável para o seletor (um input de função nova a cada render refaria a busca). */
  protected readonly buscarHorarios = (data: string): Promise<SlotDto[]> =>
    this.api.get<SlotDto[]>(`/publico/${this.slug()}/horarios`, { profissionalId: this.profId(), servicoId: this.servicoId(), data });

  constructor() {
    queueMicrotask(() => void this.carregarSalao());
    // Ao chegar na etapa "quando", busca os dias livres do profissional e serviço escolhidos.
    effect(() => {
      if (this.etapaAtual() === 'quando') void this.carregarDias();
    });
  }

  protected async carregarSalao(): Promise<void> {
    this.carregando.set(true);
    this.erroGeral.set('');
    this.naoEncontrado.set(false);
    try {
      const s = await this.api.get<SalaoPublicoDto>(`/publico/${this.slug()}`);
      this.salao.set(s);
      this.titulo.setTitle(`Agende no ${s.nome}`);
      const pedidoProf = s.profissionais.find((p) => p.id === this.profissionalPedido());
      const pre = pedidoProf ?? (s.profissionais.length === 1 ? s.profissionais[0] : undefined);
      if (pre) {
        this.profId.set(pre.id);
        const sv = pre.servicos.find((x) => x.servicoId === this.servicoPedido());
        if (sv) this.servicoId.set(sv.servicoId);
        this.etapaInicial.set(sv ? 'quando' : 'servico');
      }
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.naoEncontrado.set(true);
      else this.erroGeral.set(mensagemDeErro(e, 'Não foi possível abrir a página agora. Tente de novo.'));
    } finally {
      this.carregando.set(false);
    }
  }

  protected ir(etapa: Etapa, substituir = false): Promise<boolean> {
    return this.router.navigate([], { queryParams: { etapa, profissional: null, servico: null }, queryParamsHandling: 'merge', replaceUrl: substituir });
  }

  protected resumoServicos(p: ProfissionalPublicoDto): string {
    const menor = Math.min(...p.servicos.map((s) => s.precoCentavos));
    return `${p.servicos.length === 1 ? '1 serviço' : `${p.servicos.length} serviços`} · a partir de ${formatarReais(menor)}`;
  }

  protected escolherProfissional(p: ProfissionalPublicoDto): void {
    if (p.id !== this.profId()) this.servicoId.set('');
    this.profId.set(p.id);
    this.slot.set(null);
    void this.ir('servico');
  }

  protected escolherServico(id: string): void {
    if (id !== this.servicoId()) this.slot.set(null);
    this.servicoId.set(id);
    void this.ir('quando');
  }

  protected escolherHorario(slot: SlotDto): void {
    this.slot.set(slot);
    this.erro.set('');
    void this.ir('dados');
  }

  private async carregarDias(): Promise<void> {
    this.carregandoDias.set(true);
    this.erro.set('');
    try {
      this.dias.set(await this.api.get<DiaDisponivelDto[]>(`/publico/${this.slug()}/dias`, { profissionalId: this.profId(), servicoId: this.servicoId() }));
    } catch (e) {
      this.dias.set([]);
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregandoDias.set(false);
    }
  }

  protected digitarWhatsapp(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    campo.value = mascaraWhatsapp(campo.value);
    this.whatsapp.set(campo.value);
  }

  protected async confirmar(): Promise<void> {
    const slot = this.slot();
    if (!slot || !this.podeConfirmar()) return;
    this.enviando.set(true);
    this.erro.set('');
    try {
      const f = await this.api.post<AgendamentoCriadoPublicoDto>(`/publico/${this.slug()}/agendamentos`, {
        profissionalId: this.profId(), servicoId: this.servicoId(), inicio: slot.inicio,
        nome: this.nome().trim(), whatsapp: this.whatsapp(), consentimento: true,
      });
      this.feito.set(f);
      await this.ir('pronto', true);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      if (e instanceof HttpErrorResponse && e.status === 409) {
        // Horário tomado por outra pessoa (ou teto de agendamentos): volta para escolher de novo.
        this.slot.set(null);
        await this.ir('quando', true);
      }
    } finally {
      this.enviando.set(false);
    }
  }

  protected diaDe(iso: string): string {
    return diaLongo(dataDoInstante(iso, this.fuso()));
  }
  protected horaDe(iso: string): string {
    return horaDoInstante(iso, this.fuso());
  }
  protected prazoTexto(f: AgendamentoCriadoPublicoDto): string {
    return `${this.diaDe(f.limiteAlteracao)} às ${this.horaDe(f.limiteAlteracao)}`;
  }

  protected async copiarLink(f: AgendamentoCriadoPublicoDto): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${location.origin}/agendamento/${f.token}`);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 3000);
    } catch {
      this.erro.set('Não foi possível copiar. Abra "Ver meu horário" e guarde o endereço da página.');
    }
  }

  protected adicionarAoCalendario(f: AgendamentoCriadoPublicoDto): void {
    baixarIcs(
      montarIcs({
        id: f.token.slice(0, 16), inicio: f.inicio, fim: f.fim,
        titulo: `${f.servico.nome} - ${f.salao.nome}`,
        descricao: `Com ${f.profissional.nome}. Para ver, remarcar ou cancelar: ${location.origin}/agendamento/${f.token}`,
      }),
    );
  }
}
