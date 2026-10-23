import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { SLUG_REGEX } from '@hora-h/shared';
import { TenantContext } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';

/** 32 bytes em base64url = 43 caracteres (ver novoTokenOpaco). Lixo nem chega ao banco. */
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Rotas públicas não têm login, então o salão vem do que o visitante já sabe: o slug da URL.
 * Estes guards são os ÚNICOS pontos da área pública que usam `semTenant` (conta na allowlist):
 * descobrem o tenant e o fixam no contexto; todo o resto roda no cliente escopado.
 *
 * Slug e token desconhecidos respondem igual (404 genérico) para não ajudar quem tenta adivinhar.
 */
@Injectable()
export class TenantPorSlugGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const slug = String(context.switchToHttp().getRequest().params['slug'] ?? '');
    const salao = SLUG_REGEX.test(slug)
      ? await this.prisma.semTenant.estabelecimento.findUnique({ where: { slug }, select: { id: true } })
      : null;
    if (!salao) throw new NotFoundException('Página não encontrada.');
    this.tenant.definir(salao.id);
    return true;
  }
}

@Injectable()
export class TenantPorTokenGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const token = String(req.params['token'] ?? '');
    const agendamento = TOKEN_REGEX.test(token)
      ? await this.prisma.semTenant.agendamento.findUnique({ where: { token }, select: { id: true, estabelecimentoId: true } })
      : null;
    if (!agendamento) throw new NotFoundException('Página não encontrada.');

    // O link é uma credencial: nada de guardar a resposta em cache compartilhado.
    http.getResponse().setHeader('Cache-Control', 'no-store');
    req.agendamentoId = agendamento.id;
    this.tenant.definir(agendamento.estabelecimentoId);
    return true;
  }
}
