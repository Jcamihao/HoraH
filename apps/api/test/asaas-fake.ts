import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const CHAVE_FAKE = 'chave-fake-do-asaas';

export interface PagamentoFake {
  id: string;
  subscription: string;
  customer: string;
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl: string;
  paymentDate: string | null;
}

export interface AssinaturaFake {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: string;
  status: string;
  deleted: boolean;
  externalReference: string;
  billingType: string;
}

export interface Chamada {
  metodo: string;
  caminho: string;
  corpo: any;
}

/**
 * Asaas de mentira, em memória, com o mesmo formato de resposta da API real (campos e códigos de que o
 * cliente depende). Serve para testar o fluxo inteiro sem rede. Os campos foram conferidos na documentação
 * e no spike do Lumen; ainda falta confirmar contra o sandbox de verdade quando houver chave.
 */
export class AsaasFake {
  clientes = new Map<string, { id: string; name: string; cpfCnpj: string; email: string; externalReference: string }>();
  assinaturas = new Map<string, AssinaturaFake>();
  pagamentos = new Map<string, PagamentoFake>();
  chamadas: Chamada[] = [];
  /** Quantas próximas chamadas devem falhar com 500 (para testar repetição e recuperação). */
  falhas = 0;
  private seq = 0;
  private servidor!: Server;
  url = '';

  async iniciar(porta = 0): Promise<this> {
    this.servidor = createServer((req, res) => void this.tratar(req, res));
    await new Promise<void>((ok) => this.servidor.listen(porta, '127.0.0.1', ok));
    this.url = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}/v3`;
    return this;
  }

  async parar(): Promise<void> {
    this.servidor.closeAllConnections?.();
    await new Promise<void>((ok) => this.servidor.close(() => ok()));
  }

  chamadasDe(metodo: string, trecho: string): Chamada[] {
    return this.chamadas.filter((c) => c.metodo === metodo && c.caminho.includes(trecho));
  }

  /** Gera a cobrança do próximo mês de uma assinatura, como o Asaas faz sozinho. */
  gerarCobranca(assinaturaId: string, vencimento: string): PagamentoFake {
    const a = this.assinaturas.get(assinaturaId)!;
    const id = `pay_${++this.seq}`;
    const p: PagamentoFake = {
      id, subscription: a.id, customer: a.customer, value: a.value, dueDate: vencimento, status: 'PENDING',
      invoiceUrl: `https://sandbox.asaas.com/i/${id}`, paymentDate: null,
    };
    this.pagamentos.set(id, p);
    return p;
  }

  private async corpoDe(req: IncomingMessage): Promise<any> {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    const texto = Buffer.concat(partes).toString('utf8');
    return texto ? JSON.parse(texto) : undefined;
  }

  private async tratar(req: IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    const enviar = (status: number, corpo: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };
    const erro = (status: number, descricao: string) => enviar(status, { errors: [{ code: 'invalid_action', description: descricao }] });
    const corpo = await this.corpoDe(req);
    const metodo = req.method ?? 'GET';
    const caminho = (req.url ?? '').replace(/^\/v3/, '');
    this.chamadas.push({ metodo, caminho, corpo });

    if (req.headers['access_token'] !== CHAVE_FAKE) return erro(401, 'A chave de API informada não é válida.');
    if (!req.headers['user-agent']) return erro(400, 'User-Agent obrigatório.');
    if (this.falhas > 0) {
      this.falhas -= 1;
      return enviar(500, { errors: [{ description: 'Erro interno simulado.' }] });
    }
    const [rota, consulta = ''] = caminho.split('?');
    const filtros = new URLSearchParams(consulta);

    if (metodo === 'POST' && rota === '/customers') {
      if (!corpo?.name || !corpo?.cpfCnpj) return erro(400, 'Informe o CPF ou CNPJ do cliente.');
      const id = `cus_${++this.seq}`;
      this.clientes.set(id, { id, name: corpo.name, cpfCnpj: corpo.cpfCnpj, email: corpo.email, externalReference: corpo.externalReference });
      return enviar(200, { object: 'customer', id, name: corpo.name });
    }
    if (metodo === 'POST' && rota === '/subscriptions') {
      if (!this.clientes.has(corpo?.customer)) return erro(400, 'Cliente inválido.');
      if (!corpo.value || corpo.value <= 0) return erro(400, 'Valor inválido.');
      if (corpo.nextDueDate < new Date().toISOString().slice(0, 10)) return erro(400, 'A data de vencimento não pode ser anterior a hoje.');
      const id = `sub_${++this.seq}`;
      const a: AssinaturaFake = {
        id, customer: corpo.customer, value: corpo.value, nextDueDate: corpo.nextDueDate, cycle: corpo.cycle, status: 'ACTIVE',
        deleted: false, externalReference: corpo.externalReference, billingType: corpo.billingType,
      };
      this.assinaturas.set(id, a);
      this.gerarCobranca(id, a.nextDueDate);
      return enviar(200, { object: 'subscription', ...a });
    }
    if (metodo === 'GET' && rota === '/subscriptions') {
      const ref = filtros.get('externalReference');
      const data = [...this.assinaturas.values()].filter((a) => !ref || a.externalReference === ref);
      return enviar(200, { object: 'list', data, hasMore: false, totalCount: data.length });
    }
    const m = /^\/subscriptions\/([^/]+)(\/payments)?$/.exec(rota);
    if (m) {
      const a = this.assinaturas.get(m[1]);
      if (!a) return erro(404, 'Assinatura não encontrada.');
      if (m[2] && metodo === 'GET') {
        const data = [...this.pagamentos.values()].filter((p) => p.subscription === a.id);
        return enviar(200, { object: 'list', data, hasMore: false, totalCount: data.length });
      }
      if (metodo === 'GET') return enviar(200, { object: 'subscription', ...a });
      if (metodo === 'PUT') {
        if (corpo?.value) a.value = corpo.value;
        return enviar(200, { object: 'subscription', ...a });
      }
      if (metodo === 'DELETE') {
        a.deleted = true;
        a.status = 'INACTIVE';
        return enviar(200, { deleted: true, id: a.id });
      }
    }
    return erro(404, `Rota desconhecida no fake: ${metodo} ${caminho}`);
  }
}
