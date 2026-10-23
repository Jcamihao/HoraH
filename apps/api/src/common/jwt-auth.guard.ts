import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Papel } from '@hora-h/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLICO_KEY } from './decorators';
import { TenantContext } from './tenant-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const cabecalho: string | undefined = req.headers['authorization'];
    if (!cabecalho?.startsWith('Bearer ')) throw new UnauthorizedException('Sessão ausente.');

    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(cabecalho.slice(7), { algorithms: ['HS256'] });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    // Papel e tenant vêm do banco, não do token: desativar um usuário vale na hora.
    const usuario = await this.prisma.semTenant.usuario.findUnique({
      where: { id: sub },
      select: {
        id: true, nome: true, email: true, papel: true, ativo: true, estabelecimentoId: true,
        profissional: { select: { id: true } },
      },
    });
    if (!usuario || !usuario.ativo) throw new UnauthorizedException('Sessão inválida ou expirada.');

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel as Papel,
      estabelecimentoId: usuario.estabelecimentoId,
      profissionalId: usuario.profissional?.id ?? null,
    };
    this.tenant.definir(usuario.estabelecimentoId);
    return true;
  }
}
