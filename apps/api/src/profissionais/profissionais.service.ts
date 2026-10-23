import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Papel, validarFaixas, type ConviteCriadoDto, type FaixaHorario, type ProfissionalDto } from '@hora-h/shared';
import { UsuarioAutenticado } from '../common/decorators';
import type { Env } from '../config/env';
import { AssinaturaService } from '../assinatura/assinatura.service';
import { hashToken, novoTokenOpaco } from '../auth/sessao.service';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { AtualizarProfissionalDto, CriarProfissionalDto, ServicoDoProfissionalDto } from './dto';

const VALIDADE_CONVITE_MS = 7 * 86_400_000;

const INCLUIR = {
  servicos: { include: { servico: { select: { nome: true, duracaoMin: true, ativo: true } } } },
  horarios: { orderBy: [{ diaSemana: 'asc' as const }, { inicioMin: 'asc' as const }] },
} satisfies Prisma.ProfissionalInclude;

type ProfissionalCompleto = Prisma.ProfissionalGetPayload<{ include: typeof INCLUIR }>;

function paraDto(p: ProfissionalCompleto): ProfissionalDto {
  return {
    id: p.id,
    nome: p.nome,
    ativo: p.ativo,
    temUsuario: p.usuarioId !== null,
    servicos: p.servicos.map((s) => ({
      servicoId: s.servicoId,
      nome: s.servico.nome,
      duracaoMin: s.servico.duracaoMin,
      precoCentavos: s.precoCentavos,
      ativo: s.servico.ativo,
    })),
    horarios: p.horarios.map(({ diaSemana, inicioMin, fimMin }) => ({ diaSemana, inicioMin, fimMin })),
  };
}

@Injectable()
export class ProfissionaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly assinatura: AssinaturaService,
  ) {}

  async listar(): Promise<ProfissionalDto[]> {
    const lista = await this.prisma.db.profissional.findMany({
      include: INCLUIR,
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return lista.map(paraDto);
  }

  async obter(id: string): Promise<ProfissionalDto> {
    return paraDto(await this.carregar(id));
  }

  /** O profissional logado vê só o próprio cadastro. */
  async eu(usuario: UsuarioAutenticado): Promise<ProfissionalDto> {
    if (!usuario.profissionalId) throw new NotFoundException('Você não tem cadastro de profissional.');
    return this.obter(usuario.profissionalId);
  }

  async criar(usuario: UsuarioAutenticado, dto: CriarProfissionalDto): Promise<ProfissionalDto> {
    if (dto.vincularAoDono && usuario.profissionalId) {
      throw new ConflictException('Você já está cadastrado como profissional.');
    }
    await this.assinatura.exigirConfirmacaoDeFaixa((await this.prisma.db.profissional.count({ where: { ativo: true } })) + 1, !!dto.confirmarFaixa);
    try {
      const id = await this.prisma.db.$transaction(async (tx) => {
        const criado = await tx.profissional.create({
          data: comTenant({ nome: dto.nome, usuarioId: dto.vincularAoDono ? usuario.id : null }),
        });
        // Pré-preenche o horário de trabalho com o do salão; o dono ajusta o que for diferente.
        const doSalao = await tx.horarioFuncionamento.findMany();
        if (doSalao.length) {
          await tx.horarioTrabalho.createMany({
            data: doSalao.map((h) =>
              comTenant({ profissionalId: criado.id, diaSemana: h.diaSemana, inicioMin: h.inicioMin, fimMin: h.fimMin }),
            ),
          });
        }
        return criado.id;
      });
      await this.assinatura.aoMudarProfissionais();
      return this.obter(id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Você já está cadastrado como profissional.');
      }
      throw e;
    }
  }

  async atualizar(id: string, { confirmarFaixa, ...dto }: AtualizarProfissionalDto): Promise<ProfissionalDto> {
    const atual = await this.carregar(id);
    const mudaAtivo = dto.ativo !== undefined && dto.ativo !== atual.ativo;
    if (mudaAtivo && dto.ativo) {
      await this.assinatura.exigirConfirmacaoDeFaixa((await this.prisma.db.profissional.count({ where: { ativo: true } })) + 1, !!confirmarFaixa);
    }
    await this.prisma.db.$transaction(async (tx) => {
      await tx.profissional.update({ where: { id }, data: { ...dto } });
      // Profissional desativado não consegue mais entrar. O dono nunca é travado por aqui.
      if (dto.ativo !== undefined && atual.usuarioId) {
        await tx.usuario.updateMany({
          where: { id: atual.usuarioId, papel: Papel.PROFISSIONAL },
          data: { ativo: dto.ativo },
        });
      }
    });
    if (mudaAtivo) await this.assinatura.aoMudarProfissionais();
    return this.obter(id);
  }

  async definirHorarios(id: string, faixas: FaixaHorario[]): Promise<ProfissionalDto> {
    const erro = validarFaixas(faixas);
    if (erro) throw new BadRequestException(erro);
    await this.carregar(id);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.horarioTrabalho.deleteMany({ where: { profissionalId: id } });
      await tx.horarioTrabalho.createMany({
        data: faixas.map((f) =>
          comTenant({ profissionalId: id, diaSemana: f.diaSemana, inicioMin: f.inicioMin, fimMin: f.fimMin }),
        ),
      });
    });
    return this.obter(id);
  }

  async definirServicos(id: string, itens: ServicoDoProfissionalDto[]): Promise<ProfissionalDto> {
    await this.carregar(id);
    const ids = itens.map((i) => i.servicoId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Serviço repetido na lista.');
    const validos = await this.prisma.db.servico.count({ where: { id: { in: ids }, ativo: true } });
    if (validos !== ids.length) throw new BadRequestException('Algum serviço não existe ou está inativo.');

    await this.prisma.db.$transaction(async (tx) => {
      await tx.profissionalServico.deleteMany({ where: { profissionalId: id } });
      await tx.profissionalServico.createMany({
        data: itens.map((i) => comTenant({ profissionalId: id, servicoId: i.servicoId, precoCentavos: i.precoCentavos })),
      });
    });
    return this.obter(id);
  }

  /** Gera o link de convite. Só um convite fica ativo por profissional: o novo invalida o anterior. */
  async criarConvite(id: string): Promise<ConviteCriadoDto> {
    const profissional = await this.carregar(id);
    if (!profissional.ativo) throw new BadRequestException('Reative o profissional antes de convidar.');
    if (profissional.usuarioId) throw new ConflictException('Este profissional já tem acesso.');

    const token = novoTokenOpaco();
    const expiraEm = new Date(Date.now() + VALIDADE_CONVITE_MS);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.convite.updateMany({
        where: { profissionalId: id, usadoEm: null, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
      await tx.convite.create({ data: comTenant({ profissionalId: id, tokenHash: hashToken(token), expiraEm }) });
    });
    return {
      token,
      link: `${this.config.get('APP_BASE_URL', { infer: true })}/convite/${token}`,
      expiraEm: expiraEm.toISOString(),
    };
  }

  private async carregar(id: string): Promise<ProfissionalCompleto> {
    const p = await this.prisma.db.profissional.findUnique({ where: { id }, include: INCLUIR });
    if (!p) throw new NotFoundException('Profissional não encontrado.');
    return p;
  }
}
