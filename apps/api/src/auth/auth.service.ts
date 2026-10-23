import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { validarSlug, type ConvitePreviaDto } from '@hora-h/shared';
import { Papel } from '@hora-h/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AceitarConviteDto, CadastroDto, LoginDto } from './dto';
import { hashToken, SessaoEmitida, SessaoService } from './sessao.service';

const MENSAGEM_SLUG: Record<string, string> = {
  tamanho: 'O endereço deve ter entre 3 e 40 caracteres.',
  formato: 'Use só letras minúsculas, números e hífen (sem hífen no começo, no fim ou duplo).',
  reservado: 'Este endereço é reservado. Escolha outro.',
};

function violacaoEm(e: unknown, campo: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.['target']).includes(campo);
}

@Injectable()
export class AuthService {
  /** Hash descartável: login de e-mail inexistente gasta o mesmo tempo que um existente. */
  private hashFalso?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessao: SessaoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async cadastrarDono(dto: CadastroDto): Promise<SessaoEmitida> {
    const erroSlug = validarSlug(dto.slug);
    if (erroSlug) throw new BadRequestException(MENSAGEM_SLUG[erroSlug]);

    const testeFimEm = new Date(Date.now() + this.config.get('TRIAL_DAYS', { infer: true }) * 86_400_000);
    try {
      const estabelecimento = await this.prisma.semTenant.estabelecimento.create({
        data: {
          nome: dto.nomeEstabelecimento,
          slug: dto.slug,
          assinatura: { create: { status: 'TESTE', testeFimEm } },
          usuarios: {
            create: {
              nome: dto.nome,
              email: dto.email,
              senhaHash: await argon2.hash(dto.senha),
              papel: Papel.DONO,
            },
          },
        },
        include: { usuarios: true },
      });
      const dono = estabelecimento.usuarios[0];
      return this.sessao.emitir({ ...dono, profissionalId: null });
    } catch (e) {
      if (violacaoEm(e, 'slug')) throw new ConflictException('Este endereço já está em uso.');
      if (violacaoEm(e, 'email')) throw new ConflictException('Este e-mail já está cadastrado.');
      throw e;
    }
  }

  async entrar(dto: LoginDto): Promise<SessaoEmitida> {
    const usuario = await this.prisma.semTenant.usuario.findUnique({
      where: { email: dto.email },
      include: { profissional: { select: { id: true } } },
    });
    const hash = usuario?.senhaHash ?? (await this.obterHashFalso());
    const confere = await argon2.verify(hash, dto.senha).catch(() => false);
    if (!usuario || !confere || !usuario.ativo) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
    return this.sessao.emitir({ ...usuario, profissionalId: usuario.profissional?.id ?? null });
  }

  async slugDisponivel(slug: string): Promise<{ disponivel: boolean; motivo?: string }> {
    const erro = validarSlug(slug);
    if (erro) return { disponivel: false, motivo: erro };
    const existe = await this.prisma.semTenant.estabelecimento.findUnique({ where: { slug }, select: { id: true } });
    return existe ? { disponivel: false, motivo: 'em_uso' } : { disponivel: true };
  }

  async previaConvite(token: string): Promise<ConvitePreviaDto> {
    const convite = await this.buscarConviteValido(token);
    return { estabelecimento: convite.estabelecimento.nome, profissional: convite.profissional.nome };
  }

  async aceitarConvite(token: string, dto: AceitarConviteDto): Promise<SessaoEmitida> {
    const convite = await this.buscarConviteValido(token);
    const senhaHash = await argon2.hash(dto.senha);

    try {
      const usuario = await this.prisma.semTenant.$transaction(async (tx) => {
        // Reivindicação atômica do convite: dois cliques simultâneos não criam dois usuários.
        const { count } = await tx.convite.updateMany({
          where: { id: convite.id, usadoEm: null, revogadoEm: null },
          data: { usadoEm: new Date() },
        });
        if (count !== 1) throw new NotFoundException('Convite inválido ou expirado.');

        const criado = await tx.usuario.create({
          data: {
            estabelecimentoId: convite.estabelecimentoId,
            nome: convite.profissional.nome,
            email: dto.email,
            senhaHash,
            papel: Papel.PROFISSIONAL,
          },
        });
        await tx.profissional.update({
          where: { id: convite.profissionalId },
          data: { usuarioId: criado.id },
        });
        return criado;
      });
      return this.sessao.emitir({ ...usuario, profissionalId: convite.profissionalId });
    } catch (e) {
      if (violacaoEm(e, 'email')) throw new ConflictException('Este e-mail já está cadastrado.');
      throw e;
    }
  }

  private async buscarConviteValido(token: string) {
    const convite = await this.prisma.semTenant.convite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        profissional: { select: { nome: true, ativo: true, usuarioId: true } },
        estabelecimento: { select: { nome: true } },
      },
    });
    const valido =
      convite &&
      !convite.usadoEm &&
      !convite.revogadoEm &&
      convite.expiraEm.getTime() > Date.now() &&
      convite.profissional.ativo &&
      !convite.profissional.usuarioId;
    // Mesma resposta para qualquer motivo: não revela se o token existiu.
    if (!valido) throw new NotFoundException('Convite inválido ou expirado.');
    return convite;
  }

  private obterHashFalso(): Promise<string> {
    this.hashFalso ??= argon2.hash('senha-descartavel-para-igualar-tempo');
    return this.hashFalso;
  }
}
