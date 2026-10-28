import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { slugificar, validarSlug, type EstabelecimentoDto, type FaixaHorario } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { SemanaCampos, faixasParaSemana, semanaParaFaixas } from '../../core/horarios';
import { HorarioEditorComponent } from '../../shared/horario-editor.component';
import { NavbarComponent } from '../../shared/navbar.component';

const FUSOS: [string, string][] = [
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
];

const ANTECEDENCIAS: [number, string][] = [[0, 'Sem antecedência'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [1440, '1 dia']];
const PRAZOS: [number, string][] = [[0, 'Até a hora'], [60, '1 hora antes'], [120, '2 horas antes'], [240, '4 horas antes'], [720, '12 horas antes'], [1440, '1 dia antes']];

@Component({
  selector: 'app-configuracoes',
  imports: [ReactiveFormsModule, RouterLink, HorarioEditorComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Ajustes" />
    <main class="page page--tabbed">
      <h1 class="large-title">Ajustes</h1>
      <p class="large-sub">Dados do salão, regras da agenda e horário de funcionamento.</p>
      @if (aviso()) { <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso() }}</p> }
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="salvarSalao()" novalidate>
          <p class="group__header">Salão</p>
          <div class="group">
            <div class="row row--field" [class.is-invalid]="form.controls.nome.invalid && form.controls.nome.touched">
              <label for="nome">Nome</label>
              <input id="nome" class="input" formControlName="nome" autocomplete="organization" />
            </div>
            <div class="row row--field" [class.is-invalid]="slugErro()">
              <label for="slug">Endereço</label>
              <input id="slug" class="input" formControlName="slug" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="slug-ajuda" />
            </div>
          </div>
          <p id="slug-ajuda" class="group__footer" [class.error]="slugErro()">
            @if (slugErro()) { {{ slugErro() }} } @else { Seu link: horah.com.br/{{ form.controls.slug.value }}. Se mudar, o link antigo deixa de funcionar. }
          </p>

          <p class="group__header">Regras da agenda</p>
          <div class="group">
            <div class="row row--field">
              <label for="fuso">Fuso horário</label>
              <select id="fuso" class="input" formControlName="fusoHorario">
                @for (f of fusos; track f[0]) { <option [value]="f[0]">{{ f[1] }}</option> }
              </select>
            </div>
            <div class="row row--field">
              <label for="ant">Antecedência mínima</label>
              <select id="ant" class="input" formControlName="antecedenciaMinMin">
                @for (a of antecedencias; track a[0]) { <option [ngValue]="a[0]">{{ a[1] }}</option> }
              </select>
            </div>
            <div class="row row--field">
              <label for="prazo">Cliente cancela</label>
              <select id="prazo" class="input" formControlName="prazoCancelamentoMin">
                @for (a of prazos; track a[0]) { <option [ngValue]="a[0]">{{ a[1] }}</option> }
              </select>
            </div>
          </div>
          <p class="group__footer">A antecedência é o tempo mínimo entre a marcação e o horário. O cancelamento vale só para o cliente; o cancelamento automático por falta de confirmação ignora esse prazo.</p>
          <button type="submit" class="btn btn--block" style="margin-top: 16px" [disabled]="salvando()">Salvar salão e regras</button>
        </form>

        <p class="group__header">Horário de funcionamento</p>
        <hh-horario-editor [(semana)]="semana" />
        <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="salvando()" (click)="salvarHorario()">Salvar horário</button>

        <p class="group__header">Avisos</p>
        <div class="group">
          <div class="row">
            <span class="row__main"><span class="row__title">E-mail de novo agendamento</span><span class="row__sub">Receba um e-mail quando alguém marcar ou cancelar pelo link.</span></span>
            <button type="button" class="switch" role="switch" aria-label="E-mail de novo agendamento" [attr.aria-checked]="avisoEmail()" (click)="alternarAvisoEmail()"></button>
          </div>
        </div>

        <p class="group__header">Canais</p>
        <div class="group">
          <a class="row row--link" routerLink="/painel/whatsapp">
            <span class="row__main"><span class="row__title">WhatsApp</span><span class="row__sub">Confirmação, lembrete e agendamento pelo número do salão.</span></span>
          </a>
          <a class="row row--link" routerLink="/painel/notificacoes">
            <span class="row__main"><span class="row__title">Notificações</span><span class="row__sub">Novos agendamentos, cancelamentos e avisos.</span></span>
          </a>
        </div>

        <p class="group__header">Plano</p>
        <div class="group">
          <a class="row row--link" routerLink="/painel/assinatura">
            <span class="row__main"><span class="row__title">Assinatura</span><span class="row__sub">Plano, cobranças e forma de pagamento.</span></span>
            <span class="row__detail">{{ situacaoPlano() }}</span>
          </a>
        </div>

        <p class="group__header">Conta</p>
        <div class="group">
          <div class="row"><span class="row__main"><span class="row__title">{{ auth.usuario()?.nome }}</span><span class="row__sub">{{ auth.usuario()?.email }}</span></span></div>
        </div>
        <div class="danger-zone"><button type="button" class="btn btn--block" (click)="auth.sair()">Sair</button></div>
      }
    </main>
  `,
})
export class ConfiguracoesPage {
  private readonly api = inject(Api);
  private readonly store = inject(EstabelecimentoStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly auth = inject(AuthStore);

  protected readonly fusos = FUSOS;
  protected readonly antecedencias = ANTECEDENCIAS;
  protected readonly prazos = PRAZOS;
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly slugErro = signal('');
  protected readonly semana = signal<SemanaCampos>(faixasParaSemana([]));
  protected readonly avisoEmail = signal(true);
  protected readonly situacaoPlano = computed(() => {
    const a = this.store.dados()?.assinatura;
    return a ? ({ TESTE: 'Teste grátis', ATIVA: 'Em dia', TOLERANCIA: 'Atrasada', BLOQUEADA: 'Bloqueada', CANCELADA: 'Cancelada' }[a.status] ?? '') : '';
  });

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', [Validators.required]],
    fusoHorario: ['America/Sao_Paulo'],
    antecedenciaMinMin: [60],
    prazoCancelamentoMin: [120],
  });

  constructor() {
    void this.carregar();
    this.form.controls.slug.valueChanges.subscribe((s) => {
      const erro = s ? validarSlug(s) : 'tamanho';
      this.slugErro.set(erro ? 'Use de 3 a 40 letras minúsculas, números ou hífen, sem espaços.' : '');
    });
  }

  private async carregar(): Promise<void> {
    try {
      const [e, h] = await Promise.all([this.store.carregar(true), this.api.get<FaixaHorario[]>('/estabelecimento/horarios')]);
      this.avisoEmail.set(e.emailAgendamentos);
      this.form.patchValue({
        nome: e.nome,
        slug: e.slug,
        fusoHorario: e.fusoHorario,
        antecedenciaMinMin: e.antecedenciaMinMin,
        prazoCancelamentoMin: e.prazoCancelamentoMin,
      });
      this.semana.set(faixasParaSemana(h));
    } catch (err) {
      this.erro.set(mensagemDeErro(err));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async salvarSalao(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.slugErro()) return;
    const v = this.form.getRawValue();
    await this.executar('Salão e regras salvos.', async () => {
      const e = await this.api.patch<EstabelecimentoDto>('/estabelecimento', { ...v, nome: v.nome.trim(), slug: slugificar(v.slug) === v.slug ? v.slug : v.slug.trim().toLowerCase() });
      this.store.definir(e);
    });
  }

  protected async salvarHorario(): Promise<void> {
    const r = semanaParaFaixas(this.semana());
    if ('erro' in r) {
      this.aviso.set('');
      this.erro.set(r.erro);
      return;
    }
    if (!r.faixas.length) {
      this.aviso.set('');
      this.erro.set('Abra pelo menos um dia da semana.');
      return;
    }
    await this.executar('Horário salvo.', async () => {
      this.semana.set(faixasParaSemana(await this.api.put<FaixaHorario[]>('/estabelecimento/horarios', { faixas: r.faixas })));
    });
  }

  private async executar(sucesso: string, acao: () => Promise<void>): Promise<void> {
    this.salvando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      await acao();
      this.aviso.set(sucesso);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  protected async alternarAvisoEmail(): Promise<void> {
    const novo = !this.avisoEmail();
    this.avisoEmail.set(novo);
    this.erro.set('');
    try {
      this.store.definir(await this.api.patch<EstabelecimentoDto>('/estabelecimento', { emailAgendamentos: novo }));
    } catch (e) {
      this.avisoEmail.set(!novo);
      this.erro.set(mensagemDeErro(e));
    }
  }
}
