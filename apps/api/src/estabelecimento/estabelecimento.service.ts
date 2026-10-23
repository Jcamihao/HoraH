import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Assinatura } from '@prisma/client';
import { Papel, validarFaixas, validarSlug, type EstabelecimentoDto, type FaixaHorario, type StatusAssinatura } from '@hora-h/shared';
import { UsuarioAutenticado } from '../common/decorators';
import { TenantContext } from '../common/tenant-context';
import { calcularAcesso } from '../assinatura/acesso';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { AtualizarEstabelecimentoDto } from './dto';

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class EstabelecimentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private get tenantId(): string {
    const id = this.tenant.atual();
    if (!id) throw new Error('Sem tenant no contexto.');
    return id;
  }

  async obter(usuario: UsuarioAutenticado): Promise<EstabelecimentoDto> {
    const e = await this.prisma.db.estabelecimento.findUnique({
      where: { id: this.tenantId },
      include: { assinatura: true },
    });
    if (!e) throw new NotFoundException('Estabelecimento não encontrado.');
    return {
      id: e.id,
      nome: e.nome,
      slug: e.slug,
      fusoHorario: e.fusoHorario,
      antecedenciaMinMin: e.antecedenciaMinMin,
      prazoCancelamentoMin: e.prazoCancelamentoMin,
      onboardingConcluido: e.onboardingConcluidoEm !== null,
      emailAgendamentos: e.emailAgendamentos,
      assinatura:
        usuario.papel === Papel.DONO && e.assinatura ? this.resumoAssinatura(e.assinatura) : null,
    };
  }

  private resumoAssinatura(a: Assinatura): NonNullable<EstabelecimentoDto['assinatura']> {
    const estado = calcularAcesso(a, new Date());
    return {
      status: estado.status as StatusAssinatura,
      acesso: estado.acesso,
      testeFimEm: a.testeFimEm?.toISOString() ?? null,
      toleranciaFimEm: estado.toleranciaFimEm?.toISOString() ?? null,
    };
  }

  async atualizar(usuario: UsuarioAutenticado, dto: AtualizarEstabelecimentoDto): Promise<EstabelecimentoDto> {
    if (dto.slug !== undefined) {
      const erro = validarSlug(dto.slug);
      if (erro) throw new BadRequestException(erro === 'reservado' ? 'Este endereço é reservado. Escolha outro.' : 'Endereço inválido.');
    }
    if (dto.fusoHorario !== undefined && !fusoValido(dto.fusoHorario)) {
      throw new BadRequestException('Fuso horário inválido.');
    }
    try {
      await this.prisma.db.estabelecimento.update({ where: { id: this.tenantId }, data: { ...dto } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Este endereço já está em uso.');
      }
      throw e;
    }
    return this.obter(usuario);
  }

  async horarios(): Promise<FaixaHorario[]> {
    const faixas = await this.prisma.db.horarioFuncionamento.findMany({ orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] });
    return faixas.map(({ diaSemana, inicioMin, fimMin }) => ({ diaSemana, inicioMin, fimMin }));
  }

  async definirHorarios(faixas: FaixaHorario[]): Promise<FaixaHorario[]> {
    const erro = validarFaixas(faixas);
    if (erro) throw new BadRequestException(erro);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.horarioFuncionamento.deleteMany({});
      await tx.horarioFuncionamento.createMany({
        data: faixas.map((f) => comTenant({ diaSemana: f.diaSemana, inicioMin: f.inicioMin, fimMin: f.fimMin })),
      });
    });
    return this.horarios();
  }

  /** Só conclui o passo a passo quando o salão já tem o mínimo para receber agendamentos. */
  async concluirOnboarding(usuario: UsuarioAutenticado): Promise<EstabelecimentoDto> {
    const [horarios, profissionais, servicos, vinculos] = await Promise.all([
      this.prisma.db.horarioFuncionamento.count(),
      this.prisma.db.profissional.count({ where: { ativo: true } }),
      this.prisma.db.servico.count({ where: { ativo: true } }),
      this.prisma.db.profissionalServico.count({ where: { profissional: { ativo: true }, servico: { ativo: true } } }),
    ]);
    const faltando: string[] = [];
    if (!horarios) faltando.push('o horário de funcionamento');
    if (!profissionais) faltando.push('pelo menos um profissional');
    if (!servicos) faltando.push('pelo menos um serviço');
    if (profissionais && servicos && !vinculos) faltando.push('os serviços (com preço) de cada profissional');
    if (faltando.length) throw new BadRequestException(`Ainda falta cadastrar: ${faltando.join(', ')}.`);

    await this.prisma.db.estabelecimento.updateMany({
      where: { id: this.tenantId, onboardingConcluidoEm: null },
      data: { onboardingConcluidoEm: new Date() },
    });
    return this.obter(usuario);
  }
}
