import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import type { EstabelecimentoDto, FaixaHorario, ProfissionalDto, ServicoDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { DURACOES, SemanaCampos, faixasParaSemana, formatarDuracao, semanaPadrao, semanaParaFaixas } from '../../core/horarios';
import { HorarioEditorComponent } from '../../shared/horario-editor.component';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';
import { PrecoCampoComponent } from '../../shared/preco-campo.component';

const ETAPAS = [
  { id: 'salao', nome: 'Salão', titulo: 'Seu salão', sub: 'Confira o nome e o fuso horário.' },
  { id: 'horario', nome: 'Horário', titulo: 'Horário do salão', sub: 'Quando o salão abre. Cada profissional parte deste horário.' },
  { id: 'profissionais', nome: 'Profissionais', titulo: 'Profissionais', sub: 'Quem atende no seu salão.' },
  { id: 'servicos', nome: 'Serviços', titulo: 'Serviços', sub: 'O que você oferece e quanto tempo leva.' },
  { id: 'precos', nome: 'Preços', titulo: 'Preços', sub: 'Quanto cada profissional cobra por serviço.' },
  { id: 'whatsapp', nome: 'WhatsApp', titulo: 'WhatsApp', sub: 'Lembretes e confirmações pelo seu número.' },
] as const;

const FUSOS = [
  ['America/Sao_Paulo', 'Brasília (São Paulo, Rio, BH)'],
  ['America/Manaus', 'Manaus'],
  ['America/Cuiaba', 'Cuiabá'],
  ['America/Campo_Grande', 'Campo Grande'],
  ['America/Belem', 'Belém'],
  ['America/Fortaleza', 'Fortaleza'],
  ['America/Recife', 'Recife'],
  ['America/Bahia', 'Salvador'],
  ['America/Porto_Velho', 'Porto Velho'],
  ['America/Rio_Branco', 'Rio Branco'],
  ['America/Noronha', 'Fernando de Noronha'],
] as const;

interface Item {
  faz: boolean;
  centavos: number | null;
}
type Rascunho = Record<string, Record<string, Item>>;

@Component({
  selector: 'app-cadastro',
  imports: [ReactiveFormsModule, HorarioEditorComponent, IconComponent, NavbarComponent, PrecoCampoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar [voltar]="indice() > 0 ? ['/painel/cadastro', etapas[indice() - 1].id] : null" [rotulo]="indice() > 0 ? etapas[indice() - 1].nome : ''" [titulo]="etapa().titulo">
      Passo {{ indice() + 1 }} de {{ etapas.length }}
    </hh-navbar>

    <main class="page page--dock">
      <div class="progress" role="progressbar" [attr.aria-valuenow]="indice() + 1" aria-valuemin="1" [attr.aria-valuemax]="etapas.length" [attr.aria-label]="'Passo ' + (indice() + 1) + ' de ' + etapas.length + ': ' + etapa().nome">
        <i [style.width.%]="((indice() + 1) / etapas.length) * 100"></i>
      </div>
      <h1 class="large-title" style="margin-top: 16px">{{ etapa().titulo }}</h1>
      <p class="large-sub">{{ etapa().sub }}</p>

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else {
        <div class="block" style="margin-top: 24px">
          @switch (etapa().id) {
            @case ('salao') {
              <form [formGroup]="formSalao" class="stack" novalidate>
                <div class="group">
                  <div class="row row--field" [class.is-invalid]="formSalao.controls.nome.invalid && formSalao.controls.nome.touched">
                    <label for="nome-salao">Nome</label>
                    <input id="nome-salao" class="input" formControlName="nome" autocomplete="organization" />
                  </div>
                  <div class="row row--field">
                    <label for="fuso">Fuso horário</label>
                    <select id="fuso" class="input" formControlName="fusoHorario">
                      @for (f of fusos; track f[0]) { <option [value]="f[0]">{{ f[1] }}</option> }
                    </select>
                  </div>
                </div>
                <p class="group__footer" style="margin-top: -8px">Seu link de agendamento: horah.com.br/{{ salao()?.slug }}</p>
              </form>
            }
            @case ('horario') {
              <hh-horario-editor [(semana)]="semana" />
            }
            @case ('profissionais') {
              @if (profissionais().length) {
                <div class="group">
                  @for (p of profissionais(); track p.id) {
                    <div class="row"><span class="row__main"><span class="row__title">{{ p.nome }}</span></span>@if (p.temUsuario && p.id === auth.usuario()?.profissionalId) { <span class="badge">Você</span> }</div>
                  }
                </div>
              }
              <form [formGroup]="formProf" class="stack" style="margin-top: 24px" (ngSubmit)="adicionarProfissional()" novalidate>
                <div class="group">
                  <div class="row row--field">
                    <label for="nome-prof">Nome</label>
                    <input id="nome-prof" class="input" formControlName="nome" placeholder="Ex.: Ana Souza" autocomplete="off" />
                  </div>
                  @if (!auth.usuario()?.profissionalId) {
                    <div class="row">
                      <span class="row__main"><span class="row__title">Eu também atendo</span><span class="row__sub">Você terá agenda própria.</span></span>
                      <button type="button" class="switch" role="switch" aria-label="Eu também atendo" [attr.aria-checked]="formProf.controls.euTambem.value" (click)="formProf.controls.euTambem.setValue(!formProf.controls.euTambem.value)"></button>
                    </div>
                  }
                </div>
                <button type="submit" class="btn btn--block" [disabled]="salvando() || !formProf.controls.nome.value.trim()"><hh-icon nome="plus" /> Adicionar profissional</button>
              </form>
              <p class="group__footer">Depois você convida cada profissional por link, em Equipe.</p>
            }
            @case ('servicos') {
              @if (servicos().length) {
                <div class="group">
                  @for (s of servicos(); track s.id) {
                    <div class="row"><span class="row__main"><span class="row__title">{{ s.nome }}</span></span><span class="row__detail">{{ duracao(s.duracaoMin) }}</span></div>
                  }
                </div>
              }
              <form [formGroup]="formServ" class="stack" style="margin-top: 24px" (ngSubmit)="adicionarServico()" novalidate>
                <div class="group">
                  <div class="row row--field">
                    <label for="nome-serv">Serviço</label>
                    <input id="nome-serv" class="input" formControlName="nome" placeholder="Ex.: Corte feminino" autocomplete="off" />
                  </div>
                  <div class="row row--field">
                    <label for="dur-serv">Duração</label>
                    <select id="dur-serv" class="input" formControlName="duracaoMin">
                      @for (d of duracoes; track d) { <option [ngValue]="d">{{ duracao(d) }}</option> }
                    </select>
                  </div>
                </div>
                <button type="submit" class="btn btn--block" [disabled]="salvando() || formServ.controls.nome.value.trim().length < 2"><hh-icon nome="plus" /> Adicionar serviço</button>
              </form>
            }
            @case ('precos') {
              @if (!profissionaisAtivos().length || !servicosAtivos().length) {
                <p class="banner">Cadastre pelo menos um profissional e um serviço antes de definir os preços.</p>
              } @else {
                <div class="seg" role="tablist" aria-label="Profissional">
                  @for (p of profissionaisAtivos(); track p.id) {
                    <button type="button" role="tab" [attr.aria-selected]="p.id === selId()" (click)="profSelecionadoId.set(p.id)">{{ p.nome }}</button>
                  }
                </div>
                @if (profSelecionado(); as p) {
                  <p class="group__header">Serviços de {{ p.nome }}</p>
                  <div class="group">
                    @for (s of servicosAtivos(); track s.id) {
                      @let it = item(p.id, s.id);
                      <div class="row">
                        <button type="button" class="switch" role="switch" [attr.aria-label]="p.nome + ' faz ' + s.nome" [attr.aria-checked]="it.faz" (click)="alternarFaz(p.id, s.id)"></button>
                        <span class="row__main"><span class="row__title">{{ s.nome }}</span><span class="row__sub">{{ duracao(s.duracaoMin) }}</span></span>
                        @if (it.faz) {
                          <hh-preco-campo [centavos]="it.centavos" [pendente]="it.centavos === null" [rotulo]="'Preço de ' + s.nome + ' para ' + p.nome" (mudou)="definirPreco(p.id, s.id, $event)" />
                        } @else {
                          <span class="row__detail">Não faz</span>
                        }
                      </div>
                    }
                  </div>
                  @if (faltamPrecos(p.id) > 0) { <p class="group__footer error">Falta o preço de {{ faltamPrecos(p.id) }} serviço(s).</p> }
                  <p class="group__footer">O preço pode ser diferente para cada profissional.</p>
                }
              }
            }
            @case ('whatsapp') {
              <div class="stack">
                <p class="banner">A conexão com o WhatsApp do salão chega na próxima etapa do Hora H. Você já pode concluir o cadastro e conectar depois, em Ajustes.</p>
                @if (faltando().length) { <p class="banner banner--bad" role="alert">Ainda falta: {{ faltando().join(', ') }}.</p> }
              </div>
            }
          }
        </div>
        @if (erro()) { <p class="banner banner--bad" role="alert" style="margin-top: 16px">{{ erro() }}</p> }
      }
    </main>

    <div class="dock">
      <div class="dock__inner">
        <button type="button" class="btn btn--filled btn--block" [disabled]="carregando() || salvando()" (click)="continuar()">
          {{ salvando() ? 'Salvando…' : indice() === etapas.length - 1 ? 'Concluir cadastro' : 'Salvar e continuar' }}
        </button>
      </div>
    </div>
  `,
})
export class CadastroPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthStore);
  private readonly salaoStore = inject(EstabelecimentoStore);

  readonly etapaParam = input<string | undefined>(undefined, { alias: 'etapa' });

  protected readonly etapas = ETAPAS;
  protected readonly fusos = FUSOS;
  protected readonly duracoes = DURACOES;
  protected readonly duracao = formatarDuracao;

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');

  protected readonly salao = signal<EstabelecimentoDto | null>(null);
  protected readonly semana = signal<SemanaCampos>(semanaPadrao());
  protected readonly profissionais = signal<ProfissionalDto[]>([]);
  protected readonly servicos = signal<ServicoDto[]>([]);
  protected readonly rascunho = signal<Rascunho>({});
  protected readonly profSelecionadoId = signal<string | null>(null);
  private readonly horarioSalvo = signal(false);

  protected readonly indice = computed(() => {
    const i = ETAPAS.findIndex((e) => e.id === this.etapaParam());
    return i >= 0 ? i : 0;
  });
  protected readonly etapa = computed(() => ETAPAS[this.indice()]);
  protected readonly profissionaisAtivos = computed(() => this.profissionais().filter((p) => p.ativo));
  protected readonly servicosAtivos = computed(() => this.servicos().filter((s) => s.ativo));
  protected readonly profSelecionado = computed(() => {
    const ativos = this.profissionaisAtivos();
    return ativos.find((p) => p.id === this.profSelecionadoId()) ?? ativos[0] ?? null;
  });
  protected readonly selId = computed(() => this.profSelecionado()?.id ?? null);
  protected readonly faltando = computed(() => {
    const f: string[] = [];
    if (!this.horarioSalvo() && !this.semanaTemDia()) f.push('o horário de funcionamento');
    if (!this.profissionaisAtivos().length) f.push('pelo menos um profissional');
    if (!this.servicosAtivos().length) f.push('pelo menos um serviço');
    const tem = Object.values(this.rascunho()).some((m) => Object.values(m).some((i) => i.faz && i.centavos !== null));
    if (this.profissionaisAtivos().length && this.servicosAtivos().length && !tem) f.push('os preços dos serviços');
    return f;
  });

  protected readonly formSalao = this.fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    fusoHorario: ['America/Sao_Paulo'],
  });
  protected readonly formProf = this.fb.nonNullable.group({ nome: [''], euTambem: [false] });
  protected readonly formServ = this.fb.nonNullable.group({ nome: [''], duracaoMin: [30] });

  constructor() {
    void this.carregar();
    // Sem etapa na URL, abre na primeira que ainda está incompleta.
    effect(() => {
      if (this.carregando() || this.etapaParam()) return;
      untracked(() => void this.router.navigate(['/painel/cadastro', this.primeiraIncompleta()], { replaceUrl: true }));
    });
  }

  private semanaTemDia(): boolean {
    return Object.values(this.semana()).some((f) => f.length > 0);
  }

  private async carregar(): Promise<void> {
    try {
      const [salao, horarios, profs, servs] = await Promise.all([
        this.api.get<EstabelecimentoDto>('/estabelecimento'),
        this.api.get<FaixaHorario[]>('/estabelecimento/horarios'),
        this.api.get<ProfissionalDto[]>('/profissionais'),
        this.api.get<ServicoDto[]>('/servicos'),
      ]);
      this.salao.set(salao);
      this.formSalao.patchValue({ nome: salao.nome, fusoHorario: salao.fusoHorario });
      this.horarioSalvo.set(horarios.length > 0);
      if (horarios.length) this.semana.set(faixasParaSemana(horarios));
      this.profissionais.set(profs);
      this.servicos.set(servs);
      this.reconstruirRascunho();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  private primeiraIncompleta(): string {
    if (!this.horarioSalvo()) return 'salao';
    if (!this.profissionaisAtivos().length) return 'profissionais';
    if (!this.servicosAtivos().length) return 'servicos';
    return this.faltando().includes('os preços dos serviços') ? 'precos' : 'whatsapp';
  }

  private reconstruirRascunho(): void {
    const r: Rascunho = {};
    for (const p of this.profissionais()) {
      r[p.id] = {};
      for (const s of p.servicos) r[p.id][s.servicoId] = { faz: true, centavos: s.precoCentavos };
    }
    this.rascunho.set(r);
  }

  protected item(profId: string, servId: string): Item {
    return this.rascunho()[profId]?.[servId] ?? { faz: false, centavos: null };
  }

  protected alternarFaz(profId: string, servId: string): void {
    const atual = this.item(profId, servId);
    this.atualizarItem(profId, servId, { ...atual, faz: !atual.faz });
  }

  protected definirPreco(profId: string, servId: string, centavos: number | null): void {
    this.atualizarItem(profId, servId, { ...this.item(profId, servId), centavos });
  }

  private atualizarItem(profId: string, servId: string, item: Item): void {
    this.erro.set('');
    const r = this.rascunho();
    this.rascunho.set({ ...r, [profId]: { ...(r[profId] ?? {}), [servId]: item } });
  }

  protected faltamPrecos(profId: string): number {
    return Object.values(this.rascunho()[profId] ?? {}).filter((i) => i.faz && i.centavos === null).length;
  }

  protected async adicionarProfissional(): Promise<void> {
    const v = this.formProf.getRawValue();
    if (!v.nome.trim()) return;
    await this.executar(async () => {
      const novo = await this.api.post<ProfissionalDto>('/profissionais', { nome: v.nome.trim(), vincularAoDono: v.euTambem || undefined });
      if (v.euTambem) this.auth.definirProfissional(novo.id);
      this.profissionais.update((l) => [...l, novo]);
      this.formProf.reset({ nome: '', euTambem: false });
    });
  }

  protected async adicionarServico(): Promise<void> {
    const v = this.formServ.getRawValue();
    if (v.nome.trim().length < 2) return;
    await this.executar(async () => {
      const novo = await this.api.post<ServicoDto>('/servicos', { nome: v.nome.trim(), duracaoMin: v.duracaoMin });
      this.servicos.update((l) => [...l, novo]);
      this.formServ.reset({ nome: '', duracaoMin: v.duracaoMin });
    });
  }

  protected async continuar(): Promise<void> {
    this.erro.set('');
    const id = this.etapa().id;
    await this.executar(async () => {
      switch (id) {
        case 'salao': {
          this.formSalao.markAllAsTouched();
          if (this.formSalao.invalid) throw new Error('Digite o nome do salão.');
          const v = this.formSalao.getRawValue();
          this.salao.set(await this.api.patch<EstabelecimentoDto>('/estabelecimento', { nome: v.nome.trim(), fusoHorario: v.fusoHorario }));
          break;
        }
        case 'horario': {
          const r = semanaParaFaixas(this.semana());
          if ('erro' in r) throw new Error(r.erro);
          if (!r.faixas.length) throw new Error('Abra pelo menos um dia da semana.');
          await this.api.put('/estabelecimento/horarios', { faixas: r.faixas });
          this.horarioSalvo.set(true);
          break;
        }
        case 'profissionais':
          if (!this.profissionaisAtivos().length) throw new Error('Adicione pelo menos um profissional.');
          break;
        case 'servicos':
          if (!this.servicosAtivos().length) throw new Error('Adicione pelo menos um serviço.');
          break;
        case 'precos':
          await this.salvarPrecos();
          break;
        case 'whatsapp': {
          const e = await this.api.post<EstabelecimentoDto>('/estabelecimento/onboarding/concluir');
          this.salaoStore.definir(e);
          await this.router.navigateByUrl('/painel');
          return;
        }
      }
      const proxima = ETAPAS[this.indice() + 1];
      if (proxima) await this.router.navigate(['/painel/cadastro', proxima.id]);
    });
  }

  private async salvarPrecos(): Promise<void> {
    const r = this.rascunho();
    for (const p of this.profissionaisAtivos()) {
      const itens = Object.entries(r[p.id] ?? {}).filter(([, i]) => i.faz);
      if (itens.some(([, i]) => i.centavos === null)) {
        throw new Error(`Defina o preço de todos os serviços de ${p.nome}, ou desligue os que ela não faz.`);
      }
    }
    if (!this.profissionaisAtivos().some((p) => Object.values(r[p.id] ?? {}).some((i) => i.faz))) {
      throw new Error('Marque pelo menos um serviço e defina o preço.');
    }
    const atualizados: ProfissionalDto[] = [];
    for (const p of this.profissionais()) {
      if (!p.ativo) {
        atualizados.push(p);
        continue;
      }
      const servicos = Object.entries(r[p.id] ?? {})
        .filter(([, i]) => i.faz && i.centavos !== null)
        .map(([servicoId, i]) => ({ servicoId, precoCentavos: i.centavos as number }));
      atualizados.push(await this.api.put<ProfissionalDto>(`/profissionais/${p.id}/servicos`, { servicos }));
    }
    this.profissionais.set(atualizados);
    this.reconstruirRascunho();
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    this.salvando.set(true);
    this.erro.set('');
    try {
      await acao();
    } catch (e) {
      this.erro.set(e instanceof HttpErrorResponse || !(e instanceof Error) ? mensagemDeErro(e) : e.message);
    } finally {
      this.salvando.set(false);
    }
  }
}
