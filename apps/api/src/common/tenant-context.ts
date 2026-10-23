import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId?: string;
}

const armazenamento = new AsyncLocalStorage<TenantStore>();

/**
 * Guarda de qual estabelecimento (tenant) é a requisição em andamento.
 * O middleware abre o contexto; o guard de autenticação preenche o tenant.
 * Sem tenant definido, o PrismaService recusa consultas escopadas (falha fechada).
 */
@Injectable()
export class TenantContext {
  /** Abre um contexto vazio (usado pelo middleware, uma vez por requisição). */
  abrir<T>(fn: () => T): T {
    return armazenamento.run({}, fn);
  }

  definir(tenantId: string): void {
    const store = armazenamento.getStore();
    if (!store) throw new Error('Contexto de tenant não foi aberto para esta execução.');
    store.tenantId = tenantId;
  }

  atual(): string | undefined {
    return armazenamento.getStore()?.tenantId;
  }

  /** Executa `fn` como se fosse uma requisição do tenant informado (página pública, jobs, testes). */
  executarComo<T>(tenantId: string, fn: () => T): T {
    return armazenamento.run({ tenantId }, fn);
  }
}
