import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Papel, SessaoResposta, UsuarioLogado } from '@hora-h/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Se um refresh token já usado reaparece depois disso, é roubo: a família inteira cai. */
const JANELA_REUSO_MS = 10_000;

export interface SessaoEmitida {
  resposta: SessaoResposta;
  refreshToken: string;
  refreshExpiraEm: Date;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function novoTokenOpaco(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class SessaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Abre uma sessão nova (login, cadastro, convite) ou continua uma família (renovação). */
  async emitir(
    usuario: { id: string; nome: string; email: string; papel: string; estabelecimentoId: string; profissionalId: string | null },
    familia: string = randomUUID(),
  ): Promise<SessaoEmitida> {
    const ttl = this.config.get('JWT_ACCESS_TTL_SEC', { infer: true });
    const accessToken = await this.jwt.signAsync({ sub: usuario.id }, { expiresIn: ttl, algorithm: 'HS256' });

    const refreshToken = novoTokenOpaco();
    const refreshExpiraEm = new Date(Date.now() + this.config.get('REFRESH_TTL_DAYS', { infer: true }) * 86_400_000);
    await this.prisma.semTenant.refreshToken.create({
      data: { usuarioId: usuario.id, tokenHash: hashToken(refreshToken), familia, expiraEm: refreshExpiraEm },
    });

    const logado: UsuarioLogado = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel as Papel,
      estabelecimentoId: usuario.estabelecimentoId,
      profissionalId: usuario.profissionalId,
    };
    return { resposta: { accessToken, expiraEmSeg: ttl, usuario: logado }, refreshToken, refreshExpiraEm };
  }

  /** Troca o refresh token por um novo par (rotação). Cada refresh token vale uma única vez. */
  async renovar(refreshToken: string | undefined): Promise<SessaoEmitida> {
    const invalido = new UnauthorizedException('Sessão inválida ou expirada.');
    if (!refreshToken) throw invalido;

    const atual = await this.prisma.semTenant.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { usuario: { include: { profissional: { select: { id: true } } } } },
    });
    if (!atual) throw invalido;

    if (atual.revogadoEm) {
      if (Date.now() - atual.revogadoEm.getTime() > JANELA_REUSO_MS) {
        await this.prisma.semTenant.refreshToken.updateMany({
          where: { familia: atual.familia, revogadoEm: null },
          data: { revogadoEm: new Date() },
        });
      }
      throw invalido;
    }
    if (atual.expiraEm.getTime() <= Date.now() || !atual.usuario.ativo) throw invalido;

    // Reivindicação atômica: se duas renovações chegarem juntas, só uma passa.
    const { count } = await this.prisma.semTenant.refreshToken.updateMany({
      where: { id: atual.id, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    if (count !== 1) throw invalido;

    return this.emitir(
      { ...atual.usuario, profissionalId: atual.usuario.profissional?.id ?? null },
      atual.familia,
    );
  }

  async revogar(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const token = await this.prisma.semTenant.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!token) return;
    await this.prisma.semTenant.refreshToken.updateMany({
      where: { familia: token.familia, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }
}
