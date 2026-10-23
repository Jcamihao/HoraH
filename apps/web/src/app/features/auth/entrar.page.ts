import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';

@Component({
  selector: 'app-entrar',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page" style="padding-top: 72px">
      <h1 class="large-title">Entrar</h1>
      <p class="large-sub">Hora H · a agenda do seu salão, no celular.</p>

      <form class="stack" style="margin-top: 24px" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
        @if (motivo() === 'expirou') {
          <p class="banner" role="status">Sua sessão acabou. Entre de novo para continuar.</p>
        }
        <div class="group">
          <div class="row row--field" [class.is-invalid]="invalido('email')">
            <label for="email">E-mail</label>
            <input id="email" class="input" type="email" autocomplete="username" inputmode="email" autocapitalize="none" formControlName="email" [attr.aria-invalid]="invalido('email')" aria-describedby="email-erro" />
          </div>
          <div class="row row--field" [class.is-invalid]="invalido('senha')">
            <label for="senha">Senha</label>
            <input id="senha" class="input" type="password" autocomplete="current-password" formControlName="senha" [attr.aria-invalid]="invalido('senha')" aria-describedby="senha-erro" />
          </div>
        </div>
        @if (invalido('email')) { <p id="email-erro" class="error" role="alert">Digite um e-mail válido, como maria&#64;exemplo.com.</p> }
        @if (invalido('senha')) { <p id="senha-erro" class="error" role="alert">Digite a sua senha.</p> }
        @if (erro()) { <p class="banner banner--bad" role="alert">{{ erro() }}</p> }
        <button class="btn btn--filled btn--block" type="submit" [disabled]="enviando()">
          {{ enviando() ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="soft small" style="text-align: center">
          Ainda não tem conta? <a routerLink="/cadastrar">Criar conta, 7 dias grátis</a>
        </p>
      </form>
    </main>
  `,
})
export class EntrarPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly voltar = input<string>();
  readonly motivo = input<string>();

  protected readonly enviando = signal(false);
  protected readonly erro = signal('');
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected invalido(campo: 'email' | 'senha'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.enviando.set(true);
    this.erro.set('');
    try {
      const { email, senha } = this.form.getRawValue();
      await this.auth.entrar(email.trim().toLowerCase(), senha);
      const destino = this.voltar();
      await this.router.navigateByUrl(destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/painel');
    } catch (e) {
      this.erro.set(mensagemDeErro(e, 'Não foi possível entrar. Confira e-mail e senha.'));
    } finally {
      this.enviando.set(false);
    }
  }
}
