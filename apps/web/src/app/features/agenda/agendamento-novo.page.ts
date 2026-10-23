import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Papel, type AgendamentoDto, type ProfissionalDto, type SlotDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AgendaEstado } from '../../core/agenda';
import { AuthStore } from '../../core/auth.store';
import { hojeNoFuso, somarDias } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { formatarDuracao } from '../../core/horarios';
import { formatarReais } from '../../core/money';
import { mascaraWhatsapp, whatsappValido } from '../../core/whatsapp';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-agendamento-novo',
  imports: [IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/agenda" rotulo="Agenda" titulo="Novo agendamento" />
    <main class="page page--dock">
      <h1 class="large-title">Novo agendamento</h1>
      <p class="large-sub">Para quem ligou, chegou ou chamou em outro canal.</p>
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      } @else if (!profissionais().length) {
        <div class="empty"><h2>Nenhum profissional com serviços</h2><p>Cadastre o serviço e o preço de pelo menos um profissional para marcar horários.</p></div>
      } @else {
        <p class="group__header">Atendimento</p>
        <div class="group">
          @if (profissionais().length > 1) {
            <div class="row row--field">
              <label for="prof">Profissional</label>
              <select id="prof" class="input" [value]="profId()" (change)="escolherProfissional($any($event.target).value)">
                @for (p of profissionais(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
              </select>
            </div>
          }
          <div class="row row--field">
            <label for="serv">Serviço</label>
            <select id="serv" class="input" [value]="servicoId()" (change)="servicoId.set($any($event.target).value); inicio.set('')">
              @for (s of servicos(); track s.servicoId) { <option [value]="s.servicoId">{{ s.nome }} · {{ duracao(s.duracaoMin) }} · {{ reais(s.precoCentavos) }}</option> }
            </select>
          </div>
          <div class="row row--field">
            <label for="dia">Dia</label>
            <input id="dia" class="input" type="date" [value]="data()" [min]="hoje()" (change)="data.set($any($event.target).value); inicio.set('')" />
          </div>
        </div>

        <p class="group__header">Horário</p>
        <div class="group">
          @if (buscando()) {
            <div class="row"><span class="row__sub" style="margin: 0">Buscando horários livres…</span></div>
          } @else if (!horarios().length) {
            <div class="row"><span class="row__main"><span class="row__title">Sem horários livres neste dia</span><span class="row__sub">Tente outro dia, ou confira o horário de trabalho e os bloqueios.</span></span></div>
          } @else {
            <div class="chips" role="group" aria-label="Horários livres">
              @for (h of horarios(); track h.inicio) {
                <button type="button" class="chip" [attr.aria-pressed]="inicio() === h.inicio" (click)="inicio.set(h.inicio)">{{ h.hora }}</button>
              }
            </div>
          }
        </div>

        <p class="group__header">Cliente</p>
        <div class="group">
          <div class="row row--field">
            <label for="nome">Nome</label>
            <input id="nome" class="input" autocomplete="off" autocapitalize="words" placeholder="Nome do cliente" [value]="nome()" (input)="nome.set($any($event.target).value)" />
          </div>
          <div class="row row--field" [class.is-invalid]="whatsapp().length > 0 && !whatsappOk()">
            <label for="whats">WhatsApp</label>
            <input id="whats" class="input" type="tel" inputmode="tel" autocomplete="off" placeholder="(11) 99999-8888" [value]="whatsapp()" (input)="digitarWhatsapp($event)" />
          </div>
        </div>
        <p class="group__footer">O número é obrigatório e precisa ser de celular, com DDD: é por ele que o cliente recebe os avisos.</p>
      }
    </main>
    @if (profissionais().length) {
      <div class="dock">
        <div class="dock__inner">
          <button type="button" class="btn btn--filled btn--block" [disabled]="!pronto() || salvando()" (click)="salvar()"><hh-icon nome="check" /> Agendar</button>
        </div>
      </div>
    }
  `,
})
export class AgendamentoNovoPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly salaoStore = inject(EstabelecimentoStore);
  private readonly estado = inject(AgendaEstado);

  protected readonly carregando = signal(true);
  protected readonly buscando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly profissionais = signal<ProfissionalDto[]>([]);
  protected readonly profId = signal('');
  protected readonly servicoId = signal('');
  protected readonly data = signal('');
  protected readonly horarios = signal<SlotDto[]>([]);
  protected readonly inicio = signal('');
  protected readonly nome = signal('');
  protected readonly whatsapp = signal('');

  protected readonly hoje = computed(() => hojeNoFuso(this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo'));
  protected readonly servicos = computed(() => {
    const p = this.profissionais().find((x) => x.id === this.profId());
    return (p?.servicos ?? []).filter((s) => s.ativo);
  });
  protected readonly whatsappOk = computed(() => whatsappValido(this.whatsapp()));
  protected readonly pronto = computed(() => !!this.inicio() && this.nome().trim().length >= 2 && this.whatsappOk());

  protected readonly reais = formatarReais;
  protected readonly duracao = formatarDuracao;

  private pedido = 0;

  constructor() {
    void this.iniciar();
    effect(() => {
      const [prof, serv, dia] = [this.profId(), this.servicoId(), this.data()];
      if (prof && serv && dia) void this.buscarHorarios(prof, serv, dia);
    });
  }

  private async iniciar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      const todos = this.auth.usuario()?.papel === Papel.PROFISSIONAL
        ? [await this.api.get<ProfissionalDto>('/profissionais/eu')]
        : await this.api.get<ProfissionalDto[]>('/profissionais');
      const aptos = todos.filter((p) => p.ativo && p.servicos.some((s) => s.ativo));
      this.profissionais.set(aptos);
      const doFiltro = aptos.find((p) => p.id === this.estado.profissionalId());
      this.escolherProfissional((doFiltro ?? aptos[0])?.id ?? '');
      // Abre no dia que o usuário estava olhando na agenda.
      this.data.set(this.estado.data() ?? this.hoje());
      if (this.data() < this.hoje()) this.data.set(this.hoje());
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected escolherProfissional(id: string): void {
    this.profId.set(id);
    this.servicoId.set(this.servicos()[0]?.servicoId ?? '');
    this.inicio.set('');
  }

  protected digitarWhatsapp(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    campo.value = mascaraWhatsapp(campo.value);
    this.whatsapp.set(campo.value);
  }

  private async buscarHorarios(profissionalId: string, servicoId: string, data: string): Promise<void> {
    const meu = ++this.pedido;
    this.buscando.set(true);
    try {
      const lista = await this.api.get<SlotDto[]>('/agenda/horarios', { profissionalId, servicoId, data });
      if (meu !== this.pedido) return;
      this.horarios.set(lista);
      if (!lista.some((h) => h.inicio === this.inicio())) this.inicio.set('');
    } catch (e) {
      if (meu === this.pedido) { this.horarios.set([]); this.erro.set(mensagemDeErro(e)); }
    } finally {
      if (meu === this.pedido) this.buscando.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    if (!this.pronto()) return;
    this.salvando.set(true);
    this.erro.set('');
    try {
      const criado = await this.api.post<AgendamentoDto>('/agenda/agendamentos', {
        profissionalId: this.profId(), servicoId: this.servicoId(), inicio: this.inicio(), nome: this.nome().trim(), whatsapp: this.whatsapp(),
      });
      // A agenda abre no dia do novo agendamento, para o dono ver que entrou.
      this.estado.modo.set('dia');
      this.estado.data.set(this.data());
      await this.router.navigate(['/painel/agenda', criado.id]);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      // Outro agendamento pode ter ocupado o horário: atualiza a lista.
      void this.buscarHorarios(this.profId(), this.servicoId(), this.data());
    } finally {
      this.salvando.set(false);
    }
  }
}
