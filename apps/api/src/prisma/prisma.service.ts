import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/tenant-context';

/**
 * Coluna que prende cada modelo a um estabelecimento. Estabelecimento é o próprio tenant (`id`).
 * RefreshToken fica de fora de propósito: é consultado ANTES de existir tenant (renovação de sessão).
 * AsaasEvento também: o webhook chega sem login e é gravado antes de descobrir de qual salão é.
 */
const CAMPO_TENANT: Record<string, string> = {
  Estabelecimento: 'id',
  Usuario: 'estabelecimentoId',
  Profissional: 'estabelecimentoId',
  Servico: 'estabelecimentoId',
  ProfissionalServico: 'estabelecimentoId',
  HorarioFuncionamento: 'estabelecimentoId',
  HorarioTrabalho: 'estabelecimentoId',
  Convite: 'estabelecimentoId',
  Assinatura: 'estabelecimentoId',
  Cliente: 'estabelecimentoId',
  Agendamento: 'estabelecimentoId',
  Bloqueio: 'estabelecimentoId',
  Cobranca: 'estabelecimentoId',
  AvisoEmail: 'estabelecimentoId',
  ConexaoWhatsapp: 'estabelecimentoId',
  MensagemLog: 'estabelecimentoId',
  Notificacao: 'estabelecimentoId',
  ConversaBot: 'estabelecimentoId',
};

const LEITURA_E_ALTERACAO_EM_MASSA = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'updateMany', 'updateManyAndReturn', 'deleteMany',
]);
const POR_CHAVE_UNICA = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

function exigirTenantIgual(args: any, campo: string, tenantId: string): void {
  const atual = args?.[campo];
  if (atual !== undefined && atual !== tenantId) {
    throw new Error(`Tentativa de usar ${campo} de outro tenant.`);
  }
}

/** Reescreve os argumentos da consulta para ficarem presos ao tenant. Exportada para teste unitário. */
export function escoparArgumentos(model: string, operation: string, args: any, tenantId: string): any {
  const campo = CAMPO_TENANT[model];
  if (!campo) {
    throw new Error(`Modelo ${model} não é escopado por tenant; use prisma.semTenant explicitamente.`);
  }
  const a = { ...(args ?? {}) };

  if (LEITURA_E_ALTERACAO_EM_MASSA.has(operation)) {
    a.where = { AND: [a.where ?? {}, { [campo]: tenantId }] };
    if (a.data) exigirTenantIgual(a.data, campo, tenantId);
    return a;
  }
  if (POR_CHAVE_UNICA.has(operation)) {
    exigirTenantIgual(a.where, campo, tenantId);
    a.where = { ...a.where, [campo]: tenantId };
    if (a.data) exigirTenantIgual(a.data, campo, tenantId);
    return a;
  }
  if (operation === 'create') {
    if (campo === 'id') throw new Error('Criar Estabelecimento exige prisma.semTenant.');
    exigirTenantIgual(a.data, campo, tenantId);
    a.data = { ...a.data, [campo]: tenantId };
    return a;
  }
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    if (campo === 'id') throw new Error('Criar Estabelecimento exige prisma.semTenant.');
    const lista = Array.isArray(a.data) ? a.data : [a.data];
    a.data = lista.map((d: any) => {
      exigirTenantIgual(d, campo, tenantId);
      return { ...d, [campo]: tenantId };
    });
    return a;
  }
  if (operation === 'upsert') {
    exigirTenantIgual(a.where, campo, tenantId);
    exigirTenantIgual(a.create, campo, tenantId);
    exigirTenantIgual(a.update, campo, tenantId);
    a.where = { ...a.where, [campo]: tenantId };
    if (campo !== 'id') a.create = { ...a.create, [campo]: tenantId };
    return a;
  }
  throw new Error(`Operação ${operation} não suportada no cliente escopado.`);
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /**
   * Cliente SEM filtro de tenant. Só para o que acontece antes de haver tenant (login, cadastro,
   * renovação de sessão, convite) ou fora de requisição. Todo uso é auditado por teste
   * (test de allowlist em `semtenant-allowlist.spec.ts`).
   */
  readonly semTenant = new PrismaClient();

  /** Cliente PRESO ao tenant da requisição. Sem tenant no contexto, lança erro (falha fechada). */
  readonly db: PrismaClient;

  constructor(private readonly tenant: TenantContext) {
    const ctx = this.tenant;
    this.db = this.semTenant.$extends({
      name: 'tenant-scope',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = ctx.atual();
            if (!tenantId) {
              throw new Error(`Consulta a ${model}.${operation} sem tenant no contexto.`);
            }
            return query(escoparArgumentos(model, operation, args, tenantId) as Prisma.Args<any, any>);
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    await this.semTenant.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.semTenant.$disconnect();
  }
}

/**
 * Os `create` do cliente escopado não precisam (nem devem) informar o tenant: a extensão preenche.
 * O tipo gerado pelo Prisma exige o campo, então este helper só ajusta o tipo.
 */
export function comTenant<T extends object>(dados: T): T & { estabelecimentoId: string } {
  return dados as T & { estabelecimentoId: string };
}
