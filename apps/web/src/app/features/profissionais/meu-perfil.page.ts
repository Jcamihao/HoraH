import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { ProfissionalDto } from '@hora-h/shared';
import { Api } from '../../core/api';
import { AuthStore } from '../../core/auth.store';
import { EstabelecimentoStore } from '../../core/estabelecimento.store';
import { mensagemDeErro } from '../../core/errors';
import { DIAS, formatarDuracao } from '../../core/horarios';
import { formatarReais } from '../../core/money';
import { minutosParaHHmm } from '@hora-h/shared';
import { NavbarComponent } from '../../shared/navbar.component';

@Component({
  selector: 'app-meu-perfil',
  imports: [NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hh-navbar titulo="Meu perfil" />
    <main class="page page--tabbed">
      <h1 class="large-title">{{ prof()?.nome ?? 'Meu perfil' }}</h1>
      <p class="large-sub">{{ salao()?.nome }}</p>
      @if (erro()) { <p class="banner banner--bad" style="margin-top: 16px" role="alert">{{ erro() }}</p> }

      @if (carregando()) {
        <div class="skeleton" style="margin-top: 24px" aria-busy="true"></div>
      } @else if (prof(); as p) {
        <p class="group__header">Serviços e preços</p>
        @if (p.servicos.length) {
          <div class="group">
            @for (s of p.servicos; track s.servicoId) {
              <div class="row">
                <span class="row__main"><span class="row__title">{{ s.nome }}</span><span class="row__sub">{{ duracao(s.duracaoMin) }}</span></span>
                <span class="row__detail">{{ reais(s.precoCentavos) }}</span>
              </div>
            }
          </div>
        } @else {
          <p class="banner">Seus serviços ainda não foram definidos. Fale com quem cuida do salão.</p>
        }

        <p class="group__header">Horário de trabalho</p>
        <div class="group">
          @for (d of dias; track d.id) {
            <div class="row">
              <span class="row__main"><span class="row__title">{{ d.longo }}</span></span>
              <span class="row__detail">{{ horario(p, d.id) }}</span>
            </div>
          }
        </div>
        <p class="group__footer">Para mudar preços ou horários, fale com quem cuida do salão.</p>
      }

      <div class="danger-zone">
        <button type="button" class="btn btn--block" (click)="auth.sair()">Sair</button>
      </div>
    </main>
  `,
})
export class MeuPerfilPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthStore);
  private readonly store = inject(EstabelecimentoStore);

  protected readonly salao = this.store.dados;
  protected readonly prof = signal<ProfissionalDto | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly dias = DIAS;
  protected readonly reais = formatarReais;
  protected readonly duracao = formatarDuracao;

  constructor() {
    void this.carregar();
  }

  protected horario(p: ProfissionalDto, dia: number): string {
    const faixas = p.horarios.filter((h) => h.diaSemana === dia);
    return faixas.length ? faixas.map((f) => `${minutosParaHHmm(f.inicioMin)} às ${minutosParaHHmm(f.fimMin)}`).join(' · ') : 'Folga';
  }

  private async carregar(): Promise<void> {
    try {
      await this.store.carregar();
      const p = await this.api.get<ProfissionalDto>('/profissionais/eu');
      this.prof.set(p);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }
}

