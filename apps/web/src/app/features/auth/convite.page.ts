import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ConvitePreviaDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';

@Component({
  selector: 'app-convite',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page" style="padding-top: 72px">
      @if (previa(); as p) {
        <h1 class="large-title">Oi, {{ primeiroNome(p.profissional) }}</h1>
        <p class="large-sub">{{ p.estabelecimento }} convidou você para a agenda. Crie sua senha para entrar.</p>

        <form class="stack" style="margin-top: 24px" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
          <div class="group">
            <div class="row row--field" [class.is-invalid]="invalidoCampo('email')">
              <label for="email">E-mail</label>
              <input id="email" class="input" type="email" autocomplete="username" inputmode="email" autocapitalize="none" formControlName="email" [attr.aria-invalid]="invalidoCampo('email')" />
            </div>
            <div class="row row--field" [class.is-invalid]="invalidoCampo('senha')">
              <label for="senha">Senha</label>
              <input id="senha" class="input" type="password" autocomplete="new-password" formControlName="senha" aria-describedby="senha-ajuda" [attr.aria-invalid]="invalidoCampo('senha')" />
            </div>
          </div>
          <p id="senha-ajuda" class="group__footer" style="margin-top: -8px" [class.error]="invalidoCampo('senha')">Pelo menos 8 caracteres.</p>
          @if (erro()) { <p class="banner banner--bad" role="alert">{{ erro() }}</p> }
          <button class="btn btn--filled btn--block" type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Entrando…' : 'Entrar na agenda' }}
          </button>
        </form>
      } @else if (invalido()) {
        <h1 class="large-title">Convite inválido</h1>
        <p class="banner" style="margin-top: 24px" role="alert">
          Este convite não vale mais: pode ter vencido ou já ter sido usado. Peça um link novo para quem cuida do salão.
        </p>
        <a class="btn btn--block" style="margin-top: 16px" routerLink="/entrar">Já tenho conta: entrar</a>
      } @else {
        <h1 class="large-title">Convite</h1>
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      }
    </main>
  `,
})
export class ConvitePage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly token = input.required<string>();
  protected readonly previa = signal<ConvitePreviaDto | null>(null);
  protected readonly invalido = signal(false);
  protected readonly enviando = signal(false);
  protected readonly erro = signal('');
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    queueMicrotask(() => void this.carregar());
  }

  private async carregar(): Promise<void> {
    try {
      this.previa.set(await this.api.get<ConvitePreviaDto>(`/auth/convite/${encodeURIComponent(this.token())}`));
    } catch {
      this.invalido.set(true);
    }
  }

  protected primeiroNome(nome: string): string {
    return nome.trim().split(/\s+/)[0];
  }

  protected invalidoCampo(campo: 'email' | 'senha'): boolean {
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
      await this.auth.aceitarConvite(this.token(), email.trim().toLowerCase(), senha);
      await this.router.navigateByUrl('/painel/meu-perfil');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
