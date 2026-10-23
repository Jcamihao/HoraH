import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dataBRDoInstante, diasAte } from '../core/datas';
import { EstabelecimentoStore } from '../core/estabelecimento.store';

/**
 * Faixa no topo do painel do dono quando a assinatura pede atenção. Não aparece no teste com folga nem em dia:
 * aviso que aparece sempre vira ruído e deixa de ser lido.
 */
@Component({
  selector: 'hh-assinatura-aviso',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (aviso(); as a) {
      <div class="avisobar" [class]="'avisobar avisobar--' + a.tom" role="status">
        <p>{{ a.texto }}</p>
        <a [routerLink]="['/painel/assinatura']">{{ a.acao }}</a>
      </div>
    }
  `,
})
export class AssinaturaAvisoComponent {
  private readonly salao = inject(EstabelecimentoStore).dados;

  protected readonly aviso = computed(() => {
    const e = this.salao();
    const a = e?.assinatura;
    if (!e || !a) return null;
    const fuso = e.fusoHorario;
    switch (a.status) {
      case 'TESTE': {
        const dias = a.testeFimEm ? diasAte(a.testeFimEm) : 99;
        if (dias > 2) return null;
        return { tom: 'info', texto: dias <= 0 ? 'Último dia do teste grátis.' : `O teste grátis acaba em ${dias === 1 ? '1 dia' : `${dias} dias`}.`, acao: 'Assinar' };
      }
      case 'TOLERANCIA':
        return {
          tom: 'espera',
          texto: `Falta regularizar a assinatura. Até ${a.toleranciaFimEm ? dataBRDoInstante(new Date(new Date(a.toleranciaFimEm).getTime() - 1000).toISOString(), fuso) : 'o prazo'} tudo funciona; depois, novos clientes não conseguem marcar.`,
          acao: 'Regularizar',
        };
      case 'BLOQUEADA':
        return { tom: 'ruim', texto: 'Novos agendamentos estão bloqueados. Seus dados e agendamentos continuam guardados.', acao: 'Pagar e liberar' };
      case 'CANCELADA':
        return { tom: 'ruim', texto: 'Assinatura cancelada: novos agendamentos estão bloqueados.', acao: 'Assinar de novo' };
      default:
        return null;
    }
  });
}
