import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ProfissionalDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';
import { resumoSemana } from '../../core/horarios';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-profissionais',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Equipe" />
    <main class="page page--tabbed">
      <h1 class="large-title">Equipe</h1>
      <p class="large-sub">Quem atende no salão, os horários e os preços de cada um.</p>

      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (!lista().length) {
        <div class="empty">
          <h2>Nenhum profissional ainda</h2>
          <p>Adicione quem atende no salão para definir horários e preços.</p>
        </div>
      } @else {
        <div class="group" style="margin-top: 24px">
          @for (p of lista(); track p.id) {
            <a class="row row--link" [routerLink]="['/painel/profissionais', p.id]">
              <span class="row__main">
                <span class="row__title">{{ p.nome }}</span>
                <span class="row__sub">{{ resumo(p) }}</span>
              </span>
              @if (!p.ativo) { <span class="badge">Inativo</span> }
              @else if (!p.servicos.length) { <span class="badge badge--bad">Sem serviços</span> }
              @else if (p.id === eu()?.profissionalId) { <span class="badge">Você</span> }
              @else if (!p.temUsuario) { <span class="badge badge--wait">Sem acesso</span> }
            </a>
          }
        </div>
      }

      <p class="group__header">Novo profissional</p>
      <form [formGroup]="form" (ngSubmit)="adicionar()" class="stack" novalidate>
        <div class="group">
          <div class="row row--field">
            <label for="nome-novo">Nome</label>
            <input id="nome-novo" class="input" formControlName="nome" placeholder="Ex.: Ana Souza" autocomplete="off" />
          </div>
          @if (!eu()?.profissionalId) {
            <div class="row">
              <span class="row__main"><span class="row__title">Eu também atendo</span></span>
              <button type="button" class="switch" role="switch" aria-label="Eu também atendo" [attr.aria-checked]="form.controls.euTambem.value" (click)="form.controls.euTambem.setValue(!form.controls.euTambem.value)"></button>
            </div>
          }
        </div>
        <button type="submit" class="btn btn--block" [disabled]="salvando() || form.controls.nome.value.trim().length < 2"><hh-icon nome="plus" /> Adicionar</button>
      </form>
    </main>
  `,
})
export class ProfissionaisPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly eu = this.auth.usuario;
  protected readonly lista = signal<ProfissionalDto[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly form = this.fb.group({ nome: [''], euTambem: [false] });

  constructor() {
    void this.carregar();
  }

  protected resumo(p: ProfissionalDto): string {
    return resumoSemana(p.horarios);
  }

  private async carregar(): Promise<void> {
    try {
      this.lista.set(await this.api.get<ProfissionalDto[]>('/profissionais'));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async adicionar(): Promise<void> {
    const v = this.form.getRawValue();
    if (v.nome.trim().length < 2) return;
    this.salvando.set(true);
    this.erro.set('');
    try {
      const novo = await this.api.post<ProfissionalDto>('/profissionais', { nome: v.nome.trim(), vincularAoDono: v.euTambem || undefined });
      if (v.euTambem) this.auth.definirProfissional(novo.id);
      await this.router.navigate(['/painel/profissionais', novo.id]);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
