import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { ConexaoWhatsappDto, QrWhatsappDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { dataBRDoInstante } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { mascaraWhatsapp, whatsappValido } from '../../core/whatsapp';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  CONECTADA: { rotulo: 'Conectado', classe: 'badge--ok' },
  AGUARDANDO_QR: { rotulo: 'Aguardando leitura', classe: 'badge--wait' },
  DESCONECTADA: { rotulo: 'Desconectado', classe: 'badge--bad' },
};

@Component({
  selector: 'app-whatsapp',
  imports: [IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/configuracoes" rotulo="Ajustes" titulo="WhatsApp" />
    <main class="page page--tabbed">
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

        <p class="group__header">Situação</p>
        <div class="group">
          <div class="row">
            <span class="row__main"><span class="row__title">Número do salão</span></span>
            <span [class]="'badge ' + situacao().classe">{{ situacao().rotulo }}</span>
          </div>
          @if (c.status === 'CONECTADA' && c.conectadoEm) {
            <div class="row"><span class="row__main"><span class="row__title">Conectado desde</span></span><span class="row__detail">{{ dia(c.conectadoEm) }}</span></div>
          }
          @if (c.status !== 'CONECTADA' && c.ultimaQuedaEm) {
            <div class="row"><span class="row__main"><span class="row__title">Última queda</span></span><span class="row__detail">{{ dia(c.ultimaQuedaEm) }}</span></div>
          }
          @if (c.naFila > 0) {
            <div class="row"><span class="row__main"><span class="row__title">Mensagens esperando</span><span class="row__sub">Saem sozinhas quando o número estiver conectado.</span></span><span class="row__detail">{{ c.naFila }}</span></div>
          }
        </div>

        @if (c.status === 'CONECTADA') {
          <p class="group__footer">Seus clientes recebem a confirmação ao marcar, o lembrete 24 horas antes (entre 8h e 20h) e podem marcar, remarcar e cancelar conversando com o número.</p>
        } @else {
          <p class="group__footer">Use um número só do negócio, não o seu pessoal: o WhatsApp pode bloquear números que mandam muitas mensagens, e o Hora H manda poucas e espaçadas para reduzir esse risco.</p>
        }

        @if (c.status === 'AGUARDANDO_QR') {
          <p class="group__header">Leia o QR code</p>
          <div class="group">
            <div class="row" style="justify-content: center; padding: 20px">
              @if (qr()) { <img [src]="qr()" alt="QR code para conectar o WhatsApp" width="260" height="260" /> } @else { <span class="row__sub">Gerando o QR code…</span> }
            </div>
          </div>
          <p class="group__footer">No celular do número do salão: WhatsApp, Aparelhos conectados, Conectar um aparelho, e aponte para o código. Ele se renova sozinho; esta tela avisa quando conectar.</p>

          <p class="group__header">Sem outro aparelho para ler o QR?</p>
          <div class="group">
            <div class="row row--field" [class.is-invalid]="telefone().length > 0 && !telefoneOk()">
              <label for="tel">WhatsApp do salão</label>
              <input id="tel" class="input" type="tel" inputmode="tel" placeholder="(11) 99999-8888" [value]="telefone()" (input)="digitarTelefone($event)" />
            </div>
          </div>
          <button type="button" class="btn btn--block" style="margin-top: 12px" [disabled]="!telefoneOk() || trabalhando()" (click)="parear()">Gerar código de conexão</button>
          @if (codigo()) {
            <div class="group" style="margin-top: 12px"><div class="row"><span class="row__main"><span class="row__title" style="font-size: 1.5rem; letter-spacing: 0.1em" data-testid="codigo-pareamento">{{ codigo() }}</span><span class="row__sub">No WhatsApp: Aparelhos conectados, Conectar um aparelho, Conectar com número de telefone, e digite este código.</span></span></div></div>
          }
        }

        <div class="stack" style="margin-top: 24px">
          @if (c.status !== 'CONECTADA') {
            <button type="button" class="btn btn--filled btn--block" [disabled]="trabalhando() || !c.configurado" (click)="conectar()"><hh-icon nome="whatsapp" /> {{ c.status === 'AGUARDANDO_QR' ? 'Gerar novo QR code' : 'Conectar WhatsApp' }}</button>
          } @else {
            <button type="button" class="btn btn--bad btn--block" [disabled]="trabalhando()" (click)="desconectar()">{{ confirmando() ? 'Toque de novo para desconectar' : 'Desconectar' }}</button>
            @if (confirmando()) { <p class="hint">Sem conexão, lembretes e o agendamento pelo WhatsApp param. Os horários já marcados continuam guardados.</p> }
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
