import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { DIAS, FaixaCampo, SemanaCampos } from '../core/horarios';
import { IconComponent } from './icon.component';

/** Editor da semana: cada dia liga e desliga, e aceita mais de um horário (ex.: antes e depois do almoço). */
@Component({
  selector: 'hh-horario-editor',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .faixa { display: flex; align-items: center; gap: 8px; }
    .faixa .input { flex: 1 1 0; min-width: 0; }
    .faixa span { color: var(--ink-2); }
    .faixa .btn { margin-left: auto; min-width: 44px; padding: 0; }
    .dia { align-items: flex-start; flex-direction: column; gap: 8px; }
    .dia__cab { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 32px; }
    .dia__cab strong { flex: 1; font-weight: 400; }
  `,
  template: `
    <div class="stack">
      <div class="group">
        @for (dia of dias; track dia.id) {
          @let faixas = semana()[dia.id];
          <div class="row dia">
            <div class="dia__cab">
              <strong>{{ dia.longo }}</strong>
              @if (!faixas.length) { <span class="soft small">Fechado</span> }
              <button
                type="button"
                class="switch"
                role="switch"
                [attr.aria-checked]="faixas.length > 0"
                [attr.aria-label]="dia.longo + ': ' + (faixas.length ? 'aberto' : 'fechado')"
                (click)="alternar(dia.id)"
              ></button>
            </div>
            @for (f of faixas; track $index; let i = $index) {
              <div class="faixa">
                <input type="time" class="input input--time" [value]="f.inicio" [attr.aria-label]="dia.longo + ', horário ' + (i + 1) + ', início'" (input)="mudar(dia.id, i, 'inicio', $event)" />
                <span aria-hidden="true">às</span>
                <input type="time" class="input input--time" [value]="f.fim" [attr.aria-label]="dia.longo + ', horário ' + (i + 1) + ', fim'" (input)="mudar(dia.id, i, 'fim', $event)" />
                <button type="button" class="btn btn--plain" [attr.aria-label]="'Remover horário ' + (i + 1) + ' de ' + dia.longo" (click)="remover(dia.id, i)">
                  <hh-icon nome="x" />
                </button>
              </div>
            }
            @if (faixas.length > 0 && faixas.length < 3) {
              <button type="button" class="btn btn--plain btn--small" (click)="adicionar(dia.id)"><hh-icon nome="plus" /> Outro horário no dia</button>
            }
          </div>
        }
      </div>
      <button type="button" class="btn btn--plain" style="align-self: flex-start" (click)="repetirPrimeiro()" [disabled]="!temAberto()">
        Repetir o primeiro dia nos outros dias abertos
      </button>
    </div>
  `,
})
export class HorarioEditorComponent {
  readonly semana = model.required<SemanaCampos>();
  protected readonly dias = DIAS;
  protected readonly temAberto = computed(() => DIAS.some((d) => this.semana()[d.id].length > 0));

  protected alternar(dia: number): void {
    const s = this.semana();
    this.semana.set({ ...s, [dia]: s[dia].length ? [] : [{ inicio: '09:00', fim: '18:00' }] });
  }

  protected adicionar(dia: number): void {
    const s = this.semana();
    const ultima = s[dia][s[dia].length - 1];
    const inicio = ultima ? ultima.fim : '09:00';
    this.semana.set({ ...s, [dia]: [...s[dia], { inicio, fim: inicio < '17:00' ? '18:00' : '20:00' }] });
  }

  protected remover(dia: number, indice: number): void {
    const s = this.semana();
    this.semana.set({ ...s, [dia]: s[dia].filter((_, i) => i !== indice) });
  }

  protected mudar(dia: number, indice: number, campo: keyof FaixaCampo, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    const s = this.semana();
    this.semana.set({ ...s, [dia]: s[dia].map((f, i) => (i === indice ? { ...f, [campo]: valor } : f)) });
  }

  protected repetirPrimeiro(): void {
    const s = this.semana();
    const origem = DIAS.find((d) => s[d.id].length > 0);
    if (!origem) return;
    const copia = s[origem.id];
    const novo = { ...s };
    for (const d of DIAS) if (s[d.id].length > 0) novo[d.id] = copia.map((f) => ({ ...f }));
    this.semana.set(novo);
  }
}
