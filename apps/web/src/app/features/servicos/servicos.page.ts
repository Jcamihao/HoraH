import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { ServicoDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { mensagemDeErro } from '../../core/errors';
import { DURACOES, formatarDuracao } from '../../core/horarios';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-servicos',
  imports: [ReactiveFormsModule, IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Serviços" />
    <main class="page page--tabbed">
      <h1 class="large-title">Serviços</h1>
      <p class="large-sub">O que o salão oferece e quanto tempo cada serviço leva. O preço é de cada profissional.</p>

      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (!lista().length) {
        <div class="empty"><h2>Nenhum serviço ainda</h2><p>Adicione o primeiro abaixo.</p></div>
      } @else {
        <div class="group" style="margin-top: 24px">
          @for (s of lista(); track s.id) {
            @if (editandoId() === s.id) {
              <form class="row" style="flex-direction: column; align-items: stretch" [formGroup]="formEdicao" (ngSubmit)="salvarEdicao(s.id)">
                <div class="row row--field" style="padding-inline: 0">
                  <label [for]="'ed-nome-' + s.id">Nome</label>
                  <input [id]="'ed-nome-' + s.id" class="input" formControlName="nome" autocomplete="off" />
                </div>
                <div class="row row--field" style="padding-inline: 0">
                  <label [for]="'ed-dur-' + s.id">Duração</label>
                  <select [id]="'ed-dur-' + s.id" class="input" formControlName="duracaoMin">
                    @for (d of opcoes(formEdicao.controls.duracaoMin.value); track d) { <option [ngValue]="d">{{ duracao(d) }}</option> }
                  </select>
                </div>
                <div class="cluster">
                  <button type="submit" class="btn btn--filled btn--small" [disabled]="salvando()">Salvar</button>
                  <button type="button" class="btn btn--plain btn--small" (click)="editandoId.set(null)">Cancelar</button>
                </div>
              </form>
            } @else {
              <div class="row">
                <button type="button" class="row__main" style="text-align: left" (click)="editar(s)" [attr.aria-label]="'Editar ' + s.nome">
                  <span class="row__title" [style.color]="s.ativo ? null : 'var(--ink-2)'">{{ s.nome }}</span>
                  <span class="row__sub">{{ duracao(s.duracaoMin) }}@if (!s.ativo) { · Inativo }</span>
                </button>
                <button type="button" class="switch" role="switch" [attr.aria-label]="s.nome + ': ' + (s.ativo ? 'ativo' : 'inativo')" [attr.aria-checked]="s.ativo" (click)="alternar(s)"></button>
              </div>
            }
          }
        </div>
        <p class="group__footer">Toque no nome para editar. O interruptor tira o serviço de circulação sem apagar o histórico.</p>
      }

      <p class="group__header">Novo serviço</p>
      <form [formGroup]="form" (ngSubmit)="adicionar()" class="stack" novalidate>
        <div class="group">
          <div class="row row--field">
            <label for="nome-novo">Serviço</label>
            <input id="nome-novo" class="input" formControlName="nome" placeholder="Ex.: Corte feminino" autocomplete="off" />
          </div>
          <div class="row row--field">
            <label for="dur-novo">Duração</label>
            <select id="dur-novo" class="input" formControlName="duracaoMin">
              @for (d of duracoes; track d) { <option [ngValue]="d">{{ duracao(d) }}</option> }
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn--block" [disabled]="salvando() || form.controls.nome.value.trim().length < 2"><hh-icon nome="plus" /> Adicionar</button>
      </form>
    </main>
  `,
})
export class ServicosPage {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly lista = signal<ServicoDto[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly editandoId = signal<string | null>(null);
  protected readonly duracoes = DURACOES;
  protected readonly duracao = formatarDuracao;
  protected readonly form = this.fb.group({ nome: [''], duracaoMin: [30] });
  protected readonly formEdicao = this.fb.group({ nome: [''], duracaoMin: [30] });

  constructor() {
    void this.carregar();
  }

  protected opcoes(atual: number): number[] {
    return DURACOES.includes(atual) ? DURACOES : [...DURACOES, atual].sort((a, b) => a - b);
  }

  private async carregar(): Promise<void> {
    try {
      this.lista.set(await this.api.get<ServicoDto[]>('/servicos', { incluirInativos: 'true' }));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected editar(s: ServicoDto): void {
    this.formEdicao.reset({ nome: s.nome, duracaoMin: s.duracaoMin });
    this.editandoId.set(s.id);
  }

  protected async adicionar(): Promise<void> {
    const v = this.form.getRawValue();
    if (v.nome.trim().length < 2) return;
    await this.executar(async () => {
      const novo = await this.api.post<ServicoDto>('/servicos', { nome: v.nome.trim(), duracaoMin: v.duracaoMin });
      this.lista.update((l) => [...l, novo]);
      this.form.reset({ nome: '', duracaoMin: v.duracaoMin });
    });
  }

  protected async salvarEdicao(id: string): Promise<void> {
    const v = this.formEdicao.getRawValue();
    if (v.nome.trim().length < 2) {
      this.erro.set('O nome precisa ter pelo menos 2 letras.');
      return;
    }
    await this.executar(async () => {
      const novo = await this.api.patch<ServicoDto>(`/servicos/${id}`, { nome: v.nome.trim(), duracaoMin: v.duracaoMin });
      this.lista.update((l) => l.map((s) => (s.id === id ? novo : s)));
      this.editandoId.set(null);
    });
  }

  protected async alternar(s: ServicoDto): Promise<void> {
    await this.executar(async () => {
      const novo = await this.api.patch<ServicoDto>(`/servicos/${s.id}`, { ativo: !s.ativo });
      this.lista.update((l) => l.map((x) => (x.id === s.id ? novo : x)));
    });
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    this.salvando.set(true);
    this.erro.set('');
    try {
      await acao();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
