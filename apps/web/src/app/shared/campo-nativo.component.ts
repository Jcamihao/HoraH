import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { diaCurto } from '../core/datas';
import { IconComponent } from './icon.component';

/** "2026-11-05" -> "Qui, 5 nov". O texto é nosso (sempre na fonte do app, sempre em português). */
export function rotuloDaData(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'Escolher dia';
  const texto = diaCurto(data); // "qui, 5 nov"
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Campo de dia: mostra "Qui, 5 nov" e, por cima, o seletor nativo transparente (abre o calendário do aparelho).
 * O seletor nativo desenhava o texto com a fonte do navegador e no formato do sistema; assim o texto é sempre o do design.
 */
@Component({
  selector: 'hh-campo-data',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="campo-nativo">
      <span class="campo-nativo__txt">{{ texto() }}</span>
      <hh-icon nome="calendar" />
      <input class="campo-nativo__input" type="date" [id]="inputId()" [value]="valor()" [attr.min]="min() || null" [attr.aria-label]="rotulo() || null" (click)="abrir($event)" (change)="mudou.emit($any($event.target).value)" />
    </span>
  `,
})
export class CampoDataComponent {
  readonly valor = input('');
  readonly min = input('');
  readonly inputId = input('');
  readonly rotulo = input('');
  readonly mudou = output<string>();
  protected readonly texto = computed(() => rotuloDaData(this.valor()));

  protected abrir(e: Event): void {
    abrirSeletor(e);
  }
}

/** Campo de hora em 24h ("14:00"), com o mesmo recurso do campo de dia. `chip` deixa o visual de pastilha cinza. */
@Component({
  selector: 'hh-campo-hora',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="campo-nativo campo-nativo--hora" [class.campo-nativo--chip]="chip()">
      <span class="campo-nativo__txt">{{ valor() || '--:--' }}</span>
      <input class="campo-nativo__input" type="time" [attr.step]="passo()" [value]="valor()" [attr.aria-label]="rotulo() || null" (click)="abrir($event)" (change)="mudou.emit($any($event.target).value)" />
    </span>
  `,
})
export class CampoHoraComponent {
  readonly valor = input('');
  readonly rotulo = input('');
  readonly passo = input(900);
  readonly chip = input(false);
  readonly mudou = output<string>();

  protected abrir(e: Event): void {
    abrirSeletor(e);
  }
}

/** Abre o seletor do aparelho ao tocar em qualquer ponto do campo (o navegador só abre pelo ícone nativo). */
function abrirSeletor(e: Event): void {
  try {
    (e.target as HTMLInputElement).showPicker?.();
  } catch {
    // Já aberto ou navegador sem showPicker: o campo continua editável normalmente.
  }
}
