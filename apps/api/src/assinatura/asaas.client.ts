import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export interface AsaasPagamento {
  id: string;
  status: string;
  /** Em reais, como o Asaas devolve. */
  value: number;
  /** "YYYY-MM-DD" */
  dueDate: string;
  invoiceUrl: string | null;
  subscription: string | null;
  paymentDate: string | null;
}

export interface AsaasAssinatura {
  id: string;
  status: string;
  nextDueDate: string;
  deleted: boolean;
}

export class AsaasErro extends Error {
  constructor(
    message: string,
    readonly statusHttp?: number,
  ) {
    super(message);
    this.name = 'AsaasErro';
  }
}

const TENTATIVAS = 3;
const ESPERA_MS = 250;

/**
 * Cliente mínimo do Asaas: só o que o Hora H usa. Repete (com espera) apenas chamadas que não criam nada
 * (GET, PUT, DELETE) e só quando a falha é de rede ou 5xx; criar cliente/assinatura nunca repete sozinho,
 * porque repetir poderia gerar duas assinaturas.
 */
@Injectable()
export class AsaasClient {
  private readonly logger = new Logger(AsaasClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  configurado(): boolean {
    return this.config.get('ASAAS_API_KEY', { infer: true }) !== '';
  }

  async criarCliente(d: { nome: string; email: string; cpfCnpj: string; referencia: string }): Promise<{ id: string }> {
    const r = await this.chamar<{ id: string }>('POST', '/customers', {
      name: d.nome, email: d.email, cpfCnpj: d.cpfCnpj, externalReference: d.referencia,
    });
    return { id: r.id };
  }

  async criarAssinatura(d: {
    clienteId: string; valorCentavos: number; primeiroVencimento: string; descricao: string; referencia: string;
  }): Promise<AsaasAssinatura> {
    // billingType UNDEFINED: quem paga escolhe Pix, cartão ou boleto na página da cobrança.
    const r = await this.chamar<RawAssinatura>('POST', '/subscriptions', {
      customer: d.clienteId,
      billingType: 'UNDEFINED',
      value: d.valorCentavos / 100,
      nextDueDate: d.primeiroVencimento,
      cycle: 'MONTHLY',
      description: d.descricao,
      externalReference: d.referencia,
    });
    return mapearAssinatura(r);
  }

  /** O novo valor vale para as próximas cobranças; a que já foi gerada não muda. */
  async atualizarValor(id: string, valorCentavos: number): Promise<void> {
    await this.chamar('PUT', `/subscriptions/${id}`, { value: valorCentavos / 100, updatePendingPayments: false });
  }

  /** Procura uma assinatura ainda ativa deste salão (recupera o caso em que o Asaas criou mas o banco não gravou). */
  async buscarAssinaturaPorReferencia(referencia: string): Promise<AsaasAssinatura | null> {
    const r = await this.chamar<{ data: RawAssinatura[] }>('GET', `/subscriptions?externalReference=${encodeURIComponent(referencia)}&limit=10`);
    const viva = (r.data ?? []).map(mapearAssinatura).find((a) => !a.deleted && a.status !== 'INACTIVE');
    return viva ?? null;
  }

  async cancelarAssinatura(id: string): Promise<void> {
    await this.chamar('DELETE', `/subscriptions/${id}`);
  }

  async obterAssinatura(id: string): Promise<AsaasAssinatura> {
    return mapearAssinatura(await this.chamar<RawAssinatura>('GET', `/subscriptions/${id}`));
  }

  async listarPagamentos(assinaturaId: string): Promise<AsaasPagamento[]> {
    const r = await this.chamar<{ data: RawPagamento[] }>('GET', `/subscriptions/${assinaturaId}/payments?limit=50`);
    return (r.data ?? []).map(mapearPagamento);
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (!this.configurado()) throw new ServiceUnavailableException('A cobrança ainda não está configurada neste ambiente.');
    const base = this.config.get('ASAAS_BASE_URL', { infer: true });
    const repete = metodo !== 'POST';
    let ultimo: unknown;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        const res = await fetch(`${base}${caminho}`, {
          method: metodo,
          headers: {
            'content-type': 'application/json',
            access_token: this.config.get('ASAAS_API_KEY', { infer: true }),
            'user-agent': 'HoraH',
          },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          signal: AbortSignal.timeout(15_000),
        });
        const texto = await res.text();
        if (res.ok) return (texto ? JSON.parse(texto) : {}) as T;
        const erro = new AsaasErro(descricaoDoErro(texto) || `Asaas respondeu ${res.status}`, res.status);
        if (res.status < 500) throw erro; // erro de dado: repetir não resolve
        ultimo = erro;
      } catch (e) {
        if (e instanceof AsaasErro && (e.statusHttp ?? 0) < 500) throw e;
        ultimo = e instanceof AsaasErro ? e : new AsaasErro(`Falha de rede falando com o Asaas: ${(e as Error).message}`);
      }
      if (!repete || tentativa === TENTATIVAS) break;
      this.logger.warn(`Asaas ${metodo} ${caminho} falhou (tentativa ${tentativa}); repetindo.`);
      await new Promise((r) => setTimeout(r, ESPERA_MS * tentativa));
    }
    throw ultimo as AsaasErro;
  }
}

interface RawAssinatura { id: string; status?: string; nextDueDate: string; deleted?: boolean }
interface RawPagamento {
  id: string; status: string; value: number; dueDate: string; invoiceUrl?: string | null;
  subscription?: string | null; paymentDate?: string | null;
}

function mapearAssinatura(r: RawAssinatura): AsaasAssinatura {
  return { id: r.id, status: r.status ?? 'ACTIVE', nextDueDate: r.nextDueDate, deleted: Boolean(r.deleted) };
}

export function mapearPagamento(r: RawPagamento): AsaasPagamento {
  return {
    id: r.id, status: r.status, value: r.value, dueDate: r.dueDate,
    invoiceUrl: r.invoiceUrl ?? null, subscription: r.subscription ?? null, paymentDate: r.paymentDate ?? null,
  };
}

/** O Asaas responde `{ errors: [{ code, description }] }`. */
function descricaoDoErro(texto: string): string {
  try {
    const j = JSON.parse(texto);
    return (j.errors ?? []).map((e: { description?: string }) => e.description).filter(Boolean).join(' ');
  } catch {
    return '';
  }
}
