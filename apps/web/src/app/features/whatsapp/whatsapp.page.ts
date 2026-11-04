import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { ConexaoWhatsappDto, QrWhatsappDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataBRDoInstante } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { mascaraWhatsapp, whatsappValido } from '../../core/whatsapp';
import { NavbarComponent } from '../../shared/navbar.component';

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  CONECTADA: { rotulo: 'Conectado', classe: 'badge--ok' },
  AGUARDANDO_QR: { rotulo: 'Aguardando leitura', classe: 'badge--wait' },
  DESCONECTADA: { rotulo: 'Desconectado', classe: 'badge--bad' },
};

@Component({
  selector: 'app-whatsapp',
  imports: [NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/configuracoes" rotulo="Ajustes" titulo="WhatsApp" />
    <main class="page page--wide page--tabbed">
      <h1 class="large-title">WhatsApp</h1>
      <p class="large-sub">Confirmação, lembrete e agendamento pelo número do salão.</p>
      @if (aviso()) { <p class="banner banner--ok" style="margin-top: 16px" role="status">{{ aviso() }}</p> }
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="stack" style="margin-top: 24px" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (d(); as c) {
        @if (!c.configurado) {
          <p class="banner" style="margin-top: 16px">O WhatsApp ainda não está configurado neste ambiente. O resto do Hora H funciona normalmente.</p>
        }

        <div class="wa">
          <section class="card wa__situacao">
            <div class="row">
              <span class="row__main"><span class="row__title">Situação</span></span>
              <span [class]="'badge ' + situacao().classe">{{ situacao().rotulo }}</span>
            </div>
            @if (c.status === 'CONECTADA' && c.conectadoEm) {
              <div class="row"><span class="row__main"><span class="row__title">Conectado desde</span></span><span class="row__detail">{{ dia(c.conectadoEm) }}</span></div>
            }
            @if (c.status !== 'CONECTADA' && c.ultimaQuedaEm) {
              <div class="row"><span class="row__main"><span class="row__title">Última queda</span></span><span class="row__detail">{{ dia(c.ultimaQuedaEm) }}</span></div>
            }
            <div class="row">
              <span class="row__main"><span class="row__title">Mensagens esperando</span>@if (c.naFila > 0) { <span class="row__sub">Saem sozinhas quando o número estiver conectado.</span> }</span>
              <span class="row__detail">{{ c.naFila }}</span>
            </div>
          </section>

          <section class="card wa__recebe">
            <p class="kicker">O que o cliente recebe</p>
            <ol class="passos">
              <li><span class="passos__n">1</span>Confirmação ao marcar.</li>
              <li><span class="passos__n">2</span>Lembrete 24 horas antes (entre 8h e 20h).</li>
              <li><span class="passos__n">3</span>Agendar, remarcar e cancelar pelo número.</li>
            </ol>
            <p class="nota">Use um número só do negócio, não o seu pessoal: o WhatsApp pode bloquear números que mandam muitas mensagens.</p>
          </section>

          @if (c.status === 'AGUARDANDO_QR') {
            <section class="cartao-escuro wa__qr">
              <h2>Leia o QR code</h2>
              <div class="qr-caixa">
                @if (qr()) { <img [src]="qr()" alt="QR code para conectar o WhatsApp" width="220" height="220" /> } @else { <span class="row__sub">Gerando o QR code…</span> }
              </div>
              <ol class="instrucoes">
                <li>Abra o WhatsApp no celular do salão.</li>
                <li>Toque em <strong>Aparelhos conectados</strong>.</li>
                <li>Toque em <strong>Conectar um aparelho</strong> e aponte para o código.</li>
              </ol>
              <button type="button" class="btn btn--block" [disabled]="trabalhando() || !c.configurado" (click)="conectar()">Gerar novo QR code</button>
              <div class="cartao-escuro__sep">
                <p class="cartao-escuro__t">Sem outro aparelho para ler o QR?</p>
                <div class="row row--field" [class.is-invalid]="telefone().length > 0 && !telefoneOk()">
                  <label for="tel">WhatsApp do salão</label>
                  <input id="tel" class="input" type="tel" inputmode="tel" placeholder="(11) 99999-8888" [value]="telefone()" (input)="digitarTelefone($event)" />
                </div>
                <button type="button" class="btn btn--filled btn--block" style="margin-top: 12px" [disabled]="!telefoneOk() || trabalhando()" (click)="parear()">Gerar código de conexão</button>
                @if (codigo()) {
                  <p class="cartao-escuro__codigo" data-testid="codigo-pareamento">{{ codigo() }}</p>
                  <p class="row__sub">No WhatsApp: Aparelhos conectados, Conectar um aparelho, Conectar com número de telefone, e digite este código.</p>
                }
              </div>
            </section>
          }

          @if (c.status !== 'AGUARDANDO_QR') {
            <div class="stack wa__acoes">
              @if (c.status !== 'CONECTADA') {
                <button type="button" class="btn btn--filled btn--block" [disabled]="trabalhando() || !c.configurado" (click)="conectar()">Conectar WhatsApp</button>
              } @else {
                <button type="button" class="btn btn--bad btn--block" [disabled]="trabalhando()" (click)="desconectar()">{{ confirmando() ? 'Toque de novo para desconectar' : 'Desconectar' }}</button>
                @if (confirmando()) { <p class="hint">Sem conexão, lembretes e o agendamento pelo WhatsApp param. Os horários já marcados continuam guardados.</p> }
              }
            </div>
          }
        </div>
      }
    </main>
  `,
})
export class WhatsappPage {
  private readonly api = inject(Api);
  private readonly salaoStore = inject(EstabelecimentoStore);

  protected readonly d = signal<ConexaoWhatsappDto | null>(null);
  protected readonly qr = signal('');
  protected readonly carregando = signal(true);
  protected readonly trabalhando = signal(false);
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly telefone = signal('');
  protected readonly codigo = signal('');
  protected readonly confirmando = signal(false);

  protected readonly telefoneOk = computed(() => whatsappValido(this.telefone()));
  protected readonly situacao = computed(() => SITUACAO[this.d()?.status ?? 'DESCONECTADA']);
  private readonly fuso = computed(() => this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo');
  private temporizador?: ReturnType<typeof setInterval>;

  constructor() {
    void this.carregar();
    inject(DestroyRef).onDestroy(() => this.pararDeConferir());
  }

  protected dia(iso: string): string {
    return dataBRDoInstante(iso, this.fuso());
  }

  protected digitarTelefone(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    campo.value = mascaraWhatsapp(campo.value);
    this.telefone.set(campo.value);
  }

  private async carregar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      this.aplicar(await this.api.get<ConexaoWhatsappDto>('/whatsapp'));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  private aplicar(d: ConexaoWhatsappDto): void {
    const antes = this.d()?.status;
    this.d.set(d);
    if (d.status === 'AGUARDANDO_QR') this.comecarAConferir();
    else this.pararDeConferir();
    if (antes === 'AGUARDANDO_QR' && d.status === 'CONECTADA') {
      this.qr.set('');
      this.codigo.set('');
      this.aviso.set('WhatsApp conectado.');
    }
  }

  /** Enquanto espera a leitura do QR: confere a cada poucos segundos (o QR também se renova sozinho). */
  private comecarAConferir(): void {
    if (this.temporizador) return;
    void this.conferir();
    this.temporizador = setInterval(() => void this.conferir(), 3000);
  }

  private pararDeConferir(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
  }

  private async conferir(): Promise<void> {
    try {
      const r = await this.api.get<QrWhatsappDto>('/whatsapp/qr');
      this.qr.set(r.qrImagem ?? '');
      if (r.status !== this.d()?.status) this.aplicar(await this.api.get<ConexaoWhatsappDto>('/whatsapp'));
    } catch {
      // uma falha de rede não derruba a tela: tenta de novo na próxima volta
    }
  }

  protected async conectar(): Promise<void> {
    await this.executar(async () => this.aplicar(await this.api.post<ConexaoWhatsappDto>('/whatsapp/conectar')));
  }

  protected async parear(): Promise<void> {
    await this.executar(async () => {
      this.codigo.set((await this.api.post<{ codigo: string }>('/whatsapp/parear', { telefone: this.telefone() })).codigo);
    });
  }

  protected async desconectar(): Promise<void> {
    if (!this.confirmando()) {
      this.confirmando.set(true);
      setTimeout(() => this.confirmando.set(false), 5000);
      return;
    }
    this.confirmando.set(false);
    await this.executar(async () => {
      this.aplicar(await this.api.post<ConexaoWhatsappDto>('/whatsapp/desconectar'));
      this.aviso.set('WhatsApp desconectado.');
    });
  }

  private async executar(fn: () => Promise<void>): Promise<void> {
    this.trabalhando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      await fn();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.trabalhando.set(false);
    }
  }
}
