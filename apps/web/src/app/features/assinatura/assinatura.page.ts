import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { planoDaFaixa, type AssinaturaDetalheDto, type CobrancaDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataBR, dataBRDoInstante } from '../../core/datas';
import { cpfCnpjValido, mascaraCpfCnpj } from '../../core/documento';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { formatarReais } from '../../core/money';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  TESTE: { rotulo: 'Teste grátis', classe: '' },
  ATIVA: { rotulo: 'Em dia', classe: 'badge--ok' },
  TOLERANCIA: { rotulo: 'Pagamento atrasado', classe: 'badge--wait' },
  BLOQUEADA: { rotulo: 'Bloqueada', classe: 'badge--bad' },
  CANCELADA: { rotulo: 'Cancelada', classe: 'badge--bad' },
};

const COBRANCA: Record<string, { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: 'A pagar', classe: 'badge--wait' },
  PAGA: { rotulo: 'Paga', classe: 'badge--ok' },
  VENCIDA: { rotulo: 'Vencida', classe: 'badge--bad' },
  ESTORNADA: { rotulo: 'Estornada', classe: '' },
  CANCELADA: { rotulo: 'Cancelada', classe: '' },
};

@Component({
  selector: 'app-assinatura',
  imports: [IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/configuracoes" rotulo="Ajustes" titulo="Assinatura" />
    <main class="page page--tabbed">
      <h1 class="large-title">Assinatura</h1>
      <p class="large-sub">{{ subtitulo() }}</p>
      @if (aviso()) { <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso() }}</p> }
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (d(); as a) {
        @if (!a.cobrancaConfigurada) {
          <p class="banner" style="margin-top: 16px">A cobrança ainda não está configurada neste ambiente. Seu teste e a agenda funcionam normalmente.</p>
        }

        <p class="group__header">Seu plano</p>
        <div class="group">
          <div class="row"><span class="row__main"><span class="row__title">Plano</span></span><span class="row__detail">{{ plano().rotulo }}</span></div>
          <div class="row"><span class="row__main"><span class="row__title">Valor</span></span><span class="row__detail">{{ reais(a.valorCentavos) }} por mês</span></div>
          <div class="row"><span class="row__main"><span class="row__title">Profissionais ativos</span></span><span class="row__detail">{{ a.profissionaisAtivos }}</span></div>
        </div>
        <p class="group__footer">O valor acompanha o número de profissionais ativos: 1 por R$ 29,90, de 2 a 5 por R$ 59,90, 6 ou mais por R$ 99,90. Mudanças valem a partir da próxima cobrança.</p>

        <p class="group__header">Situação</p>
        <div class="group">
          <div class="row">
            <span class="row__main"><span class="row__title">Assinatura</span></span>
            <span [class]="'badge ' + situacao().classe">{{ situacao().rotulo }}</span>
          </div>
          @if (a.status === 'TESTE' && a.testeFimEm) {
            <div class="row"><span class="row__main"><span class="row__title">Teste até</span></span><span class="row__detail">{{ dia(a.testeFimEm) }}</span></div>
          }
          @if (a.status === 'TOLERANCIA' && a.toleranciaFimEm) {
            <div class="row"><span class="row__main"><span class="row__title">Pague até</span><span class="row__sub">Depois disso, novos agendamentos são bloqueados.</span></span><span class="row__detail">{{ ultimoDia(a.toleranciaFimEm) }}</span></div>
          }
          @if (a.proximaCobrancaEm && a.contratada) {
            <div class="row"><span class="row__main"><span class="row__title">Próxima cobrança</span></span><span class="row__detail">{{ dataBR(a.proximaCobrancaEm) }}</span></div>
          }
          @if (a.cancelaEm) {
            <div class="row"><span class="row__main"><span class="row__title">Acesso até</span><span class="row__sub">Assinatura cancelada: não haverá nova cobrança.</span></span><span class="row__detail">{{ dia(a.cancelaEm) }}</span></div>
          }
        </div>
        @if (a.acesso === 'RESTRITO') {
          <p class="group__footer">Com a assinatura bloqueada seus clientes não conseguem marcar horário e o painel fica só para consulta. Seus dados e agendamentos continuam guardados. Pagando, tudo volta na hora.</p>
        }

        @if (a.pagamentoUrl) {
          <a class="btn btn--filled btn--block" style="margin-top: 16px" [href]="a.pagamentoUrl" target="_blank" rel="noopener noreferrer"><hh-icon nome="link" /> Pagar agora (Pix, cartão ou boleto)</a>
          <p class="group__footer">Abre a página segura do Asaas, onde você escolhe a forma de pagamento. Depois de pagar, volte aqui e toque em atualizar.</p>
        }

        @if (!a.contratada) {
          <p class="group__header">{{ a.cancelaEm ? 'Assinar de novo' : 'Assinar' }}</p>
          <div class="group">
            <div class="row row--field" [class.is-invalid]="documento().length > 0 && !documentoOk()">
              <label for="doc">CPF ou CNPJ</label>
              <input id="doc" class="input" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" [value]="documento()" (input)="digitarDocumento($event)" />
            </div>
          </div>
          <p class="group__footer">É de quem paga a assinatura. Vai direto para o Asaas, que emite a cobrança; o Hora H não guarda esse número.</p>
          <button type="button" class="btn btn--filled btn--block" style="margin-top: 12px" [disabled]="!documentoOk() || trabalhando() || !a.cobrancaConfigurada" (click)="assinar()">
            {{ a.status === 'TESTE' ? 'Assinar (cobra só no fim do teste)' : 'Assinar e gerar a cobrança' }}
          </button>
          @if (a.status === 'TESTE') {
            <p class="group__footer">Nenhum valor é cobrado agora: a primeira cobrança vence no último dia do teste e você escolhe Pix, cartão ou boleto na hora de pagar.</p>
          }
        } @else {
          <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="trabalhando()" (click)="atualizar()"><hh-icon nome="clock" /> Já paguei: atualizar situação</button>
        }

        @if (a.cobrancas.length) {
          <p class="group__header">Cobranças</p>
          <div class="group">
            @for (c of a.cobrancas; track c.id) {
              <div class="row">
                <span class="row__main"><span class="row__title">{{ dataBR(c.vencimento) }}</span><span class="row__sub">{{ reais(c.valorCentavos) }}@if (c.pagaEm) { · paga em {{ dia(c.pagaEm) }} }</span></span>
                <span [class]="'badge ' + cobranca(c).classe">{{ cobranca(c).rotulo }}</span>
              </div>
            }
          </div>
        }

        @if (a.contratada) {
          <div class="danger-zone">
            <button type="button" class="btn btn--bad btn--block" [disabled]="trabalhando()" (click)="cancelar()">{{ confirmandoCancelar() ? 'Toque de novo para cancelar' : 'Cancelar assinatura' }}</button>
            <p class="hint" style="margin-top: 8px">Não haverá nova cobrança. O que você já pagou vale até o fim do período e seus dados continuam guardados.</p>
          </div>
        }
      }
    </main>
  `,
})
export class AssinaturaPage {
  private readonly api = inject(Api);
  private readonly salaoStore = inject(EstabelecimentoStore);

  protected readonly d = signal<AssinaturaDetalheDto | null>(null);
  protected readonly carregando = signal(true);
  protected readonly trabalhando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly documento = signal('');
  protected readonly confirmandoCancelar = signal(false);

  protected readonly documentoOk = computed(() => cpfCnpjValido(this.documento()));
  protected readonly plano = computed(() => planoDaFaixa(this.d()?.faixa ?? 1));
  protected readonly situacao = computed(() => SITUACAO[this.d()?.status ?? 'TESTE']);
  protected readonly subtitulo = computed(() => this.salaoStore.dados()?.nome ?? '');
  private readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');
  protected readonly reais = formatarReais;
  protected readonly dataBR = dataBR;

  constructor() {
    void this.carregar();
  }

  protected dia(iso: string): string {
    return dataBRDoInstante(iso, this.fuso());
  }
  /** O fim da tolerância é o começo do dia seguinte; o último dia liberado é um segundo antes. */
  protected ultimoDia(iso: string): string {
    return dataBRDoInstante(new Date(new Date(iso).getTime() - 1000).toISOString(), this.fuso());
  }
  protected cobranca(c: CobrancaDto): { rotulo: string; classe: string } {
    return COBRANCA[c.status];
  }

  protected digitarDocumento(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    campo.value = mascaraCpfCnpj(campo.value);
    this.documento.set(campo.value);
  }

  private async aplicar(d: AssinaturaDetalheDto): Promise<void> {
    this.d.set(d);
    await this.salaoStore.carregar(true); // as faixas e os avisos do painel seguem a situação nova
  }

  private async carregar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      this.d.set(await this.api.get<AssinaturaDetalheDto>('/assinatura'));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  private async executar(sucesso: string, fn: () => Promise<AssinaturaDetalheDto>): Promise<void> {
    this.trabalhando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      await this.aplicar(await fn());
      this.aviso.set(sucesso);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.trabalhando.set(false);
    }
  }

  protected assinar(): Promise<void> {
    return this.executar('Assinatura criada. Use o botão para pagar quando quiser.', () =>
      this.api.post<AssinaturaDetalheDto>('/assinatura/assinar', { cpfCnpj: this.documento() }),
    );
  }

  protected atualizar(): Promise<void> {
    return this.executar('Situação atualizada.', () => this.api.post<AssinaturaDetalheDto>('/assinatura/sincronizar'));
  }

  protected async cancelar(): Promise<void> {
    if (!this.confirmandoCancelar()) {
      this.confirmandoCancelar.set(true);
      setTimeout(() => this.confirmandoCancelar.set(false), 5000);
      return;
    }
    this.confirmandoCancelar.set(false);
    await this.executar('Assinatura cancelada.', () => this.api.post<AssinaturaDetalheDto>('/assinatura/cancelar'));
  }
}
