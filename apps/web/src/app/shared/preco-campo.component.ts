import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { lerReais, reaisParaCampo } from '../core/money';

/** Campo de preço em reais. Emite centavos (ou null se vazio/ inválido) ao sair do campo. */
@Component({
  selector: 'hh-preco-campo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="input-money" [class.is-pendente]="pendente()">
      <span class="soft" aria-hidden="true">R$</span>
      <input
        class="input"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [placeholder]="pendente() ? 'Definir' : '0,00'"
        [attr.aria-label]="rotulo()"
        [attr.aria-invalid]="invalido()"
        [value]="texto()"
        (input)="aoDigitar($event)"
        (blur)="aoSair()"
      />
    </span>
  `,
})
export class PrecoCampoComponent {
  readonly centavos = input<number | null>(null);
  readonly rotulo = input('Preço em reais');
  /** Serviço marcado mas sem preço: o campo pede para definir. */
  readonly pendente = input(false);
  readonly mudou = output<number | null>();

  protected readonly invalido = signal(false);
  private readonly digitado = signal<string | null>(null);
  protected readonly texto = computed(() => {
    const d = this.digitado();
    if (d !== null) return d;
    const c = this.centavos();
    return c === null ? '' : reaisParaCampo(c);
  });

  protected aoDigitar(e: Event): void {
    this.digitado.set((e.target as HTMLInputElement).value);
    this.invalido.set(false);
  }

  protected aoSair(): void {
    const d = this.digitado();
    if (d === null) return;
    const bruto = d.trim();
    if (!bruto) {
      this.digitado.set(null);
      this.mudou.emit(null);
      return;
    }
    const valor = lerReais(bruto);
    if (valor === null || valor > 10_000_000) {
      this.invalido.set(true);
      return;
    }
    this.digitado.set(null);
    this.mudou.emit(valor);
  }
}
