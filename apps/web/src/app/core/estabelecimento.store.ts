import { Injectable, computed, inject, signal } from '@angular/core';
import type { EstabelecimentoDto } from '@hora-h/shared';
import { Api } from './api';

/** O salão do usuário logado, carregado uma vez e atualizado quando alguém edita. */
@Injectable({ providedIn: 'root' })
export class EstabelecimentoStore {
  private readonly api = inject(Api);

  readonly dados = signal<EstabelecimentoDto | null>(null);
  readonly cadastroConcluido = computed(() => this.dados()?.onboardingConcluido ?? false);

  async carregar(forcar = false): Promise<EstabelecimentoDto> {
    const atual = this.dados();
    if (atual && !forcar) return atual;
    const e = await this.api.get<EstabelecimentoDto>('/estabelecimento');
    this.dados.set(e);
    return e;
  }

  definir(e: EstabelecimentoDto): void {
    this.dados.set(e);
  }

  limpar(): void {
    this.dados.set(null);
  }
}
