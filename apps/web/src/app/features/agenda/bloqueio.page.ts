import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Papel, type BloqueioCriadoDto, type ProfissionalDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AgendaEstado } from '../../core/agenda';
import { AuthStore } from '../../core/auth.store';
import { hojeNoFuso, somarDias } from '../../core/datas';
import { mensagemDeErro } from '../../core/errors';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { IconComponent } from '../../shared/icon.component';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-bloqueio',
  imports: [IconComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar voltar="/painel/agenda" rotulo="Agenda" titulo="Bloquear horário" />
    <main class="page page--dock">
      <h1 class="large-title">Bloquear horário</h1>
      <p class="large-sub">Folga, almoço extra, consulta. O cliente não vê esses horários para marcar.</p>
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      } @else {
        <p class="group__header">Quem</p>
        <div class="group">
          @if (equipe().length > 1) {
            <div class="row row--field">
              <label for="prof">Profissional</label>
              <select id="prof" class="input" [value]="profId()" (change)="profId.set($any($event.target).value)">
                @for (p of equipe(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
              </select>
            </div>
          } @else {
            <div class="row"><span class="row__main"><span class="row__title">Profissional</span></span><span class="row__detail">{{ equipe()[0]?.nome }}</span></div>
          }
        </div>

        <p class="group__header">Quando</p>
        <div class="group">
          <div class="row">
            <span class="row__main"><span class="row__title">Dia inteiro</span></span>
            <button type="button" class="switch" role="switch" aria-label="Dia inteiro" [attr.aria-checked]="diaInteiro()" (click)="diaInteiro.set(!diaInteiro())"></button>
          </div>
          <div class="row row--field">
            <label for="de">De</label>
            <input id="de" class="input" type="date" [value]="de()" [min]="hoje()" (change)="mudarDe($any($event.target).value)" />
            @if (!diaInteiro()) { <input class="input input--time" type="time" aria-label="Hora de início" step="900" [value]="horaDe()" (change)="horaDe.set($any($event.target).value)" /> }
          </div>
          <div class="row row--field">
            <label for="ate">Até</label>
            <input id="ate" class="input" type="date" [value]="ate()" [min]="de()" (change)="ate.set($any($event.target).value)" />
            @if (!diaInteiro()) { <input class="input input--time" type="time" aria-label="Hora de fim" step="900" [value]="horaAte()" (change)="horaAte.set($any($event.target).value)" /> }
          </div>
        </div>

        <p class="group__header">Motivo (opcional)</p>
        <div class="group">
          <div class="row row--field">
            <label for="motivo">Motivo</label>
            <input id="motivo" class="input" maxlength="120" placeholder="Ex.: Consulta médica" autocomplete="off" [value]="motivo()" (input)="motivo.set($any($event.target).value)" />
          </div>
        </div>
        <p class="group__footer">Quem já tem horário marcado nesse período continua marcado. Você escolhe o que fazer com cada um na agenda.</p>
      }
    </main>
    <div class="dock">
      <div class="dock__inner">
        <button type="button" class="btn btn--filled btn--block" [disabled]="!valido() || salvando()" (click)="salvar()"><hh-icon nome="check" /> Bloquear</button>
      </div>
    </div>
  `,
})
export class BloqueioPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly salaoStore = inject(EstabelecimentoStore);
  private readonly estado = inject(AgendaEstado);

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal('');
  protected readonly equipe = signal<ProfissionalDto[]>([]);
  protected readonly profId = signal('');
  protected readonly diaInteiro = signal(true);
  protected readonly de = signal('');
  protected readonly ate = signal('');
  protected readonly horaDe = signal('12:00');
  protected readonly horaAte = signal('13:00');
  protected readonly motivo = signal('');

  protected readonly hoje = computed(() => hojeNoFuso(this.salaoStore.dados()?.fusoHorario ?? 'America/Sao_Paulo'));
  protected readonly valido = computed(() => {
    if (!this.profId() || !this.de() || !this.ate()) return false;
    if (this.ate() < this.de()) return false;
    if (this.diaInteiro()) return true;
    if (!this.horaDe() || !this.horaAte()) return false;
    return `${this.ate()}T${this.horaAte()}` > `${this.de()}T${this.horaDe()}`;
  });

  constructor() {
    void this.iniciar();
  }

  private async iniciar(): Promise<void> {
    try {
      await this.salaoStore.carregar();
      const lista = this.auth.usuario()?.papel === Papel.PROFISSIONAL
        ? [await this.api.get<ProfissionalDto>('/profissionais/eu')]
        : await this.api.get<ProfissionalDto[]>('/profissionais');
      const ativos = lista.filter((p) => p.ativo);
      this.equipe.set(ativos);
      this.profId.set((ativos.find((p) => p.id === this.estado.profissionalId()) ?? ativos[0])?.id ?? '');
      const dia = this.estado.data() && this.estado.data()! >= this.hoje() ? this.estado.data()! : this.hoje();
      this.de.set(dia);
      this.ate.set(dia);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected mudarDe(valor: string): void {
    this.de.set(valor);
    if (this.ate() < valor) this.ate.set(valor);
  }

  protected async salvar(): Promise<void> {
    if (!this.valido()) return;
    this.salvando.set(true);
    this.erro.set('');
    const inteiro = this.diaInteiro();
    try {
      const criado = await this.api.post<BloqueioCriadoDto>('/bloqueios', {
        profissionalId: this.profId(),
        inicio: inteiro ? `${this.de()}T00:00` : `${this.de()}T${this.horaDe()}`,
        fim: inteiro ? `${somarDias(this.ate(), 1)}T00:00` : `${this.ate()}T${this.horaAte()}`,
        ...(this.motivo().trim() ? { motivo: this.motivo().trim() } : {}),
      });
      const afetados = criado.agendamentosAfetados;
      this.estado.aviso.set(
        afetados === 0
          ? 'Horário bloqueado.'
          : `Horário bloqueado. ${afetados === 1 ? '1 agendamento já marcado nesse período continua marcado' : `${afetados} agendamentos já marcados nesse período continuam marcados`}: veja na agenda.`,
      );
      this.estado.modo.set('dia');
      this.estado.data.set(this.de());
      await this.router.navigate(['/painel/agenda']);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
