import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs';
import { slugificar, validarSlug } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';

type SlugEstado = 'neutro' | 'checando' | 'livre' | 'em_uso' | 'invalido';

const TEXTO_SLUG: Record<string, string> = {
  tamanho: 'Use de 3 a 40 caracteres.',
  formato: 'Use só letras minúsculas, números e hífen.',
  reservado: 'Este endereço é reservado. Escolha outro.',
};

@Component({
  selector: 'app-cadastrar',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page" style="padding-top: 56px">
      <h1 class="large-title">Criar conta</h1>
      <p class="large-sub">7 dias grátis. Não pede cartão.</p>

      <form class="stack" style="margin-top: 24px" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
        <div class="group">
          <div class="row row--field" [class.is-invalid]="invalido('nome')">
            <label for="nome">Seu nome</label>
            <input id="nome" class="input" autocomplete="name" formControlName="nome" [attr.aria-invalid]="invalido('nome')" />
          </div>
          <div class="row row--field" [class.is-invalid]="invalido('nomeEstabelecimento')">
            <label for="nomeEstabelecimento">Nome do salão</label>
            <input id="nomeEstabelecimento" class="input" autocomplete="organization" formControlName="nomeEstabelecimento" [attr.aria-invalid]="invalido('nomeEstabelecimento')" />
          </div>
          <div class="row row--field" [class.is-invalid]="slugEstado() === 'em_uso' || slugEstado() === 'invalido'">
            <label for="slug">Endereço</label>
            <input id="slug" class="input" autocapitalize="none" autocorrect="off" spellcheck="false" formControlName="slug" (input)="marcarSlugEditado()" aria-describedby="slug-ajuda" [attr.aria-invalid]="slugEstado() === 'em_uso' || slugEstado() === 'invalido'" />
          </div>
        </div>
        <p id="slug-ajuda" class="group__footer" style="margin-top: -8px" aria-live="polite" [class.error]="slugEstado() === 'em_uso' || slugEstado() === 'invalido'">
          @switch (slugEstado()) {
            @case ('checando') { Conferindo se está livre… }
            @case ('livre') { Livre: horah.com.br/{{ form.controls.slug.value }} }
            @case ('em_uso') { Já tem um salão com esse endereço. Tente outro. }
            @case ('invalido') { {{ slugMensagem() }} }
            @default { Seus clientes vão agendar em horah.com.br/{{ form.controls.slug.value || 'seu-salao' }} }
          }
        </p>
        <div class="group">
          <div class="row row--field" [class.is-invalid]="invalido('email')">
            <label for="email">E-mail</label>
            <input id="email" class="input" type="email" autocomplete="username" inputmode="email" autocapitalize="none" formControlName="email" [attr.aria-invalid]="invalido('email')" />
          </div>
          <div class="row row--field" [class.is-invalid]="invalido('senha')">
            <label for="senha">Senha</label>
            <input id="senha" class="input" type="password" autocomplete="new-password" formControlName="senha" aria-describedby="senha-ajuda" [attr.aria-invalid]="invalido('senha')" />
          </div>
        </div>
        <p id="senha-ajuda" class="group__footer" style="margin-top: -8px" [class.error]="invalido('senha')">Pelo menos 8 caracteres.</p>
        @if (erro()) { <p class="banner banner--bad" role="alert">{{ erro() }}</p> }
        <button class="btn btn--filled btn--block" type="submit" [disabled]="enviando()">
          {{ enviando() ? 'Criando…' : 'Criar conta e começar' }}
        </button>
        <p class="soft small" style="text-align: center">Já tem conta? <a routerLink="/entrar">Entrar</a></p>
      </form>
    </main>
  `,
})
export class CadastrarPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly enviando = signal(false);
  protected readonly erro = signal('');
  protected readonly slugEstado = signal<SlugEstado>('neutro');
  protected readonly slugMensagem = signal('');
  private slugEditado = false;

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    nomeEstabelecimento: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    // Sugere o endereço a partir do nome do salão, até a pessoa mexer nele.
    this.form.controls.nomeEstabelecimento.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe((nome) => {
      if (!this.slugEditado) this.form.controls.slug.setValue(slugificar(nome));
    });
    this.form.controls.slug.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroy),
        distinctUntilChanged(),
        filter((s) => {
          const erro = s ? validarSlug(s) : null;
          if (!s) {
            this.slugEstado.set('neutro');
            return false;
          }
          if (erro) {
            this.slugEstado.set('invalido');
            this.slugMensagem.set(TEXTO_SLUG[erro]);
            return false;
          }
          this.slugEstado.set('checando');
          return true;
        }),
        debounceTime(350),
      )
      .subscribe((s) => void this.conferirSlug(s));
  }

  protected marcarSlugEditado(): void {
    this.slugEditado = true;
  }

  protected invalido(campo: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  private async conferirSlug(slug: string): Promise<void> {
    try {
      const r = await this.api.get<{ disponivel: boolean; motivo?: string }>('/auth/slug-disponivel', { slug });
      if (this.form.controls.slug.value !== slug) return;
      this.slugEstado.set(r.disponivel ? 'livre' : 'em_uso');
    } catch {
      this.slugEstado.set('neutro');
    }
  }

  protected async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.slugEstado() === 'em_uso' || this.slugEstado() === 'invalido') return;
    this.enviando.set(true);
    this.erro.set('');
    try {
      const v = this.form.getRawValue();
      await this.auth.cadastrar({
        nome: v.nome.trim(),
        email: v.email.trim().toLowerCase(),
        senha: v.senha,
        nomeEstabelecimento: v.nomeEstabelecimento.trim(),
        slug: v.slug,
      });
      await this.router.navigateByUrl('/painel/cadastro');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
