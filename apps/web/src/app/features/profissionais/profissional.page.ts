import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ConviteCriadoDto, FaixaHorario, ProfissionalDto, ServicoDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { mensagemDeErro } from '../../core/errors';
import { SemanaCampos, faixasParaSemana, formatarDuracao, semanaParaFaixas } from '../../core/horarios';
import { HorarioEditorComponent } from '../../shared/horario-editor.component';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';
import { PrecoCampoComponent } from '../../shared/preco-campo.component';

interface Item {
  faz: boolean;
  centavos: number | null;
}

@Component({
  selector: 'app-profissional',
  imports: [HorarioEditorComponent, IconComponent, NavbarComponent, PrecoCampoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/profissionais" rotulo="Equipe" [titulo]="prof()?.nome ?? ''" />
    <main class="page page--tabbed">
      @if (carregando()) {
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      } @else if (prof(); as p) {
        <h1 class="large-title">{{ p.nome }}</h1>
        <p class="large-sub">
          @if (!p.ativo) { Inativo } @else if (p.temUsuario) { Tem acesso ao Hora H } @else { Ainda sem acesso ao Hora H }
        </p>
        @if (aviso()) { <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso() }}</p> }
        @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

        <p class="group__header">Nome</p>
        <div class="group">
          <div class="row row--field">
            <label for="nome">Nome</label>
            <input id="nome" class="input" [value]="nome()" (input)="nome.set($any($event.target).value)" autocomplete="off" />
          </div>
        </div>
        <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="salvando() || nome().trim().length < 2 || nome().trim() === p.nome" (click)="salvarNome()">Salvar nome</button>

        <p class="group__header">Serviços e preços</p>
        @if (!servicos().length) {
          <p class="banner">Cadastre serviços em Serviços para definir os preços.</p>
        } @else {
          <div class="group">
            @for (s of servicos(); track s.id) {
              @let it = item(s.id);
              <div class="row">
                <button type="button" class="switch" role="switch" [attr.aria-label]="p.nome + ' faz ' + s.nome" [attr.aria-checked]="it.faz" (click)="alternar(s.id)"></button>
                <span class="row__main"><span class="row__title">{{ s.nome }}</span><span class="row__sub">{{ duracao(s.duracaoMin) }}</span></span>
                @if (it.faz) {
                  <hh-preco-campo [centavos]="it.centavos" [pendente]="it.centavos === null" [rotulo]="'Preço de ' + s.nome" (mudou)="preco(s.id, $event)" />
                } @else {
                  <span class="row__detail">Não faz</span>
                }
              </div>
            }
          </div>
          <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="salvando()" (click)="salvarServicos()">Salvar serviços e preços</button>
        }

        <p class="group__header">Horário de trabalho</p>
        <hh-horario-editor [(semana)]="semana" />
        <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="salvando()" (click)="salvarHorarios()">Salvar horário</button>

        @if (p.ativo) {
          <p class="group__header">Acesso</p>
          @if (p.temUsuario) {
            <div class="group"><div class="row"><span class="row__main"><span class="row__title">Já tem acesso</span><span class="row__sub">Entra com o e-mail e a senha que criou.</span></span></div></div>
          } @else {
            <div class="group">
              <div class="row"><span class="row__main"><span class="row__title">Convidar por link</span><span class="row__sub">Você envia o link por WhatsApp ou e-mail; a pessoa define a própria senha. Vale por 7 dias.</span></span></div>
            </div>
            <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="salvando()" (click)="gerarConvite()"><hh-icon nome="link" /> Gerar link de convite</button>
            @if (convite(); as c) {
              <div class="group" style="margin-top: 12px">
                <div class="row"><span class="row__main"><span class="row__title" style="font-size: 0.9375rem; word-break: break-all" data-testid="link-convite">{{ c.link }}</span></span></div>
              </div>
              <button type="button" class="btn btn--plain" (click)="copiar(c.link)"><hh-icon nome="copy" /> {{ copiado() ? 'Copiado' : 'Copiar link' }}</button>
            }
          }
        }

        <div class="danger-zone">
          @if (p.ativo) {
            @if (!confirmando()) {
              <button type="button" class="btn btn--block" (click)="confirmando.set(true)">Desativar profissional</button>
              <p class="group__footer">Quem está desativado deixa de poder entrar e some das opções de agendamento. Dá para reativar depois.</p>
            } @else {
              <p class="banner banner--bad" role="alertdialog" aria-label="Confirmar desativação">Desativar {{ p.nome }}? O acesso dela ao Hora H é cortado na hora.</p>
              <div class="cluster" style="margin-top: 12px">
                <button type="button" class="btn btn--bad" [disabled]="salvando()" (click)="alterarAtivo(false)">Sim, desativar</button>
                <button type="button" class="btn btn--plain" (click)="confirmando.set(false)">Cancelar</button>
              </div>
            }
          } @else {
            <button type="button" class="btn btn--block" [disabled]="salvando()" (click)="alterarAtivo(true)">Reativar profissional</button>
          }
        </div>
      } @else {
        <div class="empty"><h2>Profissional não encontrado</h2><button type="button" class="btn" (click)="voltar()">Voltar para a equipe</button></div>
      }
    </main>
  `,
})
export class ProfissionalPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly duracao = formatarDuracao;

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly confirmando = signal(false);
  protected readonly copiado = signal(false);
  protected readonly convite = signal<ConviteCriadoDto | null>(null);

  protected readonly prof = signal<ProfissionalDto | null>(null);
  protected readonly servicos = signal<ServicoDto[]>([]);
  protected readonly nome = signal('');
  protected readonly semana = signal<SemanaCampos>(faixasParaSemana([]));
  protected readonly rascunho = signal<Record<string, Item>>({});
  protected readonly titulo = computed(() => this.prof()?.nome ?? '');

  constructor() {
    queueMicrotask(() => void this.carregar());
  }

  private async carregar(): Promise<void> {
    try {
      const [p, s] = await Promise.all([
        this.api.get<ProfissionalDto>(`/profissionais/${this.id()}`),
        this.api.get<ServicoDto[]>('/servicos'),
      ]);
      this.servicos.set(s);
      this.aplicar(p);
    } catch {
      this.prof.set(null);
    } finally {
      this.carregando.set(false);
    }
  }

  private aplicar(p: ProfissionalDto): void {
    this.prof.set(p);
    this.nome.set(p.nome);
    this.semana.set(faixasParaSemana(p.horarios as FaixaHorario[]));
    const r: Record<string, Item> = {};
    for (const s of p.servicos) r[s.servicoId] = { faz: true, centavos: s.precoCentavos };
    this.rascunho.set(r);
  }

  protected item(servId: string): Item {
    return this.rascunho()[servId] ?? { faz: false, centavos: null };
  }

  protected alternar(servId: string): void {
    const it = this.item(servId);
    this.rascunho.set({ ...this.rascunho(), [servId]: { ...it, faz: !it.faz } });
  }

  protected preco(servId: string, centavos: number | null): void {
    this.rascunho.set({ ...this.rascunho(), [servId]: { ...this.item(servId), centavos } });
  }

  protected voltar(): void {
    void this.router.navigate(['/painel/profissionais']);
  }

  protected salvarNome(): Promise<void> {
    return this.executar('Nome salvo.', async () => this.aplicar(await this.api.patch<ProfissionalDto>(`/profissionais/${this.id()}`, { nome: this.nome().trim() })));
  }

  protected salvarServicos(): Promise<void> {
    const itens = Object.entries(this.rascunho()).filter(([, i]) => i.faz);
    if (itens.some(([, i]) => i.centavos === null)) {
      this.aviso.set('');
      this.erro.set('Defina o preço de todos os serviços marcados, ou desligue os que não faz.');
      return Promise.resolve();
    }
    const servicos = itens.map(([servicoId, i]) => ({ servicoId, precoCentavos: i.centavos as number }));
    return this.executar('Serviços e preços salvos.', async () => this.aplicar(await this.api.put<ProfissionalDto>(`/profissionais/${this.id()}/servicos`, { servicos })));
  }

  protected salvarHorarios(): Promise<void> {
    const r = semanaParaFaixas(this.semana());
    if ('erro' in r) {
      this.aviso.set('');
      this.erro.set(r.erro);
      return Promise.resolve();
    }
    return this.executar('Horário salvo.', async () => this.aplicar(await this.api.put<ProfissionalDto>(`/profissionais/${this.id()}/horarios`, { faixas: r.faixas })));
  }

  protected alterarAtivo(ativo: boolean): Promise<void> {
    this.confirmando.set(false);
    return this.executar(ativo ? 'Profissional reativado.' : 'Profissional desativado.', async () => this.aplicar(await this.api.patch<ProfissionalDto>(`/profissionais/${this.id()}`, { ativo })));
  }

  protected gerarConvite(): Promise<void> {
    return this.executar('Link gerado. Envie para a pessoa; ele vale por 7 dias.', async () => {
      this.convite.set(await this.api.post<ConviteCriadoDto>(`/profissionais/${this.id()}/convite`));
      this.copiado.set(false);
    });
  }

  protected async copiar(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copiado.set(true);
    } catch {
      this.erro.set('Não deu para copiar sozinho. Segure o link e copie.');
    }
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
}
