import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { DiaDisponivelDto, SlotDto } from '@hora-h/shared';
import { agruparPorPeriodo, montarMeses } from '../../core/publico';
import { IconComponent } from '../../shared/icon.component';

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Escolher o dia num calendário e o horário em seguida. Usado para marcar e para remarcar. */
@Component({
  selector: 'hh-seletor-horario',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!meses().length) {
      <p class="pub-aviso">Não há dias livres nos próximos meses.</p>
    } @else {
      @let mes = meses()[indice()];
      <div class="pub-cal">
        <div class="pub-cal__topo">
          <span class="pub-cal__mes" aria-live="polite">{{ mes.rotulo }}</span>
          <span class="pub-cal__setas">
            <button type="button" class="pub-seta" aria-label="Mês anterior" [disabled]="indice() === 0" (click)="indice.set(indice() - 1)"><hh-icon nome="chevron-left" /></button>
            <button type="button" class="pub-seta" aria-label="Próximo mês" [disabled]="indice() === meses().length - 1" (click)="indice.set(indice() + 1)"><hh-icon nome="chevron-right" /></button>
          </span>
        </div>
        <div class="pub-cal__grade" role="grid" [attr.aria-label]="'Dias de ' + mes.rotulo">
          @for (s of semana; track s) { <span class="pub-cal__sem" role="columnheader">{{ s }}</span> }
          @for (semanaDoMes of mes.semanas; track $index) {
            @for (c of semanaDoMes; track $index) {
              @if (c) {
                <button type="button" class="pub-dia" [class.is-livre]="c.livre" [disabled]="!c.livre" [attr.aria-pressed]="c.data === dia()"
                  [attr.aria-label]="c.dia + ' de ' + mes.rotulo + (c.livre ? '' : ', sem horários')" (click)="escolherDia(c.data)">{{ c.dia }}</button>
              } @else {
                <span class="pub-dia is-vazio" aria-hidden="true"></span>
              }
            }
          }
        </div>
      </div>

      @if (dia()) {
        @if (buscando()) {
          <p class="pub-aviso" aria-busy="true">Buscando horários…</p>
        } @else if (!grupos().length) {
          <p class="pub-aviso">Os horários deste dia acabaram de ser ocupados. Escolha outro dia.</p>
        } @else {
          @for (g of grupos(); track g.periodo) {
            <h3 class="pub-periodo">{{ g.periodo }}</h3>
            <div class="pub-horarios" role="group" [attr.aria-label]="'Horários da ' + g.periodo.toLowerCase()">
              @for (h of g.horarios; track h.inicio) {
                <button type="button" class="pub-horario" [attr.aria-pressed]="h.inicio === selecionado()" (click)="escolher.emit(h)">{{ h.hora }}</button>
              }
            </div>
          }
          @if (observacao()) { <p class="pub-rodape" style="padding-block: 0">{{ observacao() }}</p> }
        }
      }
    }
  `,
})
export class SeletorHorarioComponent {
  readonly dias = input.required<DiaDisponivelDto[]>();
  /** Instante (ISO) do horário já escolhido, para marcar na lista. */
  readonly selecionado = input('');
  readonly buscar = input.required<(data: string) => Promise<SlotDto[]>>();
  readonly observacao = input('');
  readonly escolher = output<SlotDto>();

  protected readonly semana = SEMANA;
  protected readonly meses = computed(() => montarMeses(this.dias()));
  protected readonly indice = signal(0);
  protected readonly dia = signal('');
  protected readonly horarios = signal<SlotDto[]>([]);
  protected readonly buscando = signal(false);
  protected readonly grupos = computed(() => agruparPorPeriodo(this.horarios()));
  private pedido = 0;

  constructor() {
    // Abre no mês do primeiro dia livre.
    effect(() => {
      const meses = this.meses();
      const primeiroLivre = this.dias().find((d) => d.livre)?.data.slice(0, 7);
      const i = meses.findIndex((m) => m.chave === primeiroLivre);
      this.indice.set(i < 0 ? 0 : i);
      this.dia.set('');
      this.horarios.set([]);
    });
  }

  protected async escolherDia(data: string): Promise<void> {
    this.dia.set(data);
    const meu = ++this.pedido;
    this.buscando.set(true);
    try {
      const lista = await this.buscar()(data);
      if (meu === this.pedido) this.horarios.set(lista);
    } catch {
      if (meu === this.pedido) this.horarios.set([]);
    } finally {
      if (meu === this.pedido) this.buscando.set(false);
    }
  }
}
