import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StatusAgendamento, type BloqueioCriadoDto, type BloqueioDto } from '@hora-h/shared';
import type { UsuarioAutenticado } from '../common/decorators';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { AgendaService, paraBloqueioDto } from './agenda.service';
import type { ConsultaBloqueiosDto, CriarBloqueioDto } from './dto';
import { escopoDoProfissional } from './escopo';
import { localParaInstante } from './tempo';

const MAX_DURACAO_MS = 366 * 86_400_000;

@Injectable()
export class BloqueiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
  ) {}

  async listar(usuario: UsuarioAutenticado, q: ConsultaBloqueiosDto): Promise<BloqueioDto[]> {
    const profissionalId = escopoDoProfissional(usuario, q.profissionalId);
    const salao = await this.agenda.salao();
    const janela = this.agenda.janelaDeDatas(salao, q.de, q.ate);
    const lista = await this.prisma.db.bloqueio.findMany({
      where: { ...(profissionalId ? { profissionalId } : {}), inicio: { lt: janela.fim }, fim: { gt: janela.inicio } },
      orderBy: { inicio: 'asc' },
    });
    return lista.map(paraBloqueioDto);
  }

  async criar(usuario: UsuarioAutenticado, dto: CriarBloqueioDto): Promise<BloqueioCriadoDto> {
    escopoDoProfissional(usuario, dto.profissionalId);
    const salao = await this.agenda.salao();
    const inicio = localParaInstante(salao.fusoHorario, dto.inicio);
    const fim = localParaInstante(salao.fusoHorario, dto.fim);
    if (!inicio || !fim) throw new BadRequestException('Data ou hora inválida.');
    if (fim <= inicio) throw new BadRequestException('O fim deve ser depois do início.');
    if (fim.getTime() - inicio.getTime() > MAX_DURACAO_MS) throw new BadRequestException('O bloqueio pode durar no máximo 1 ano.');

    const profissional = await this.prisma.db.profissional.findUnique({ where: { id: dto.profissionalId } });
    if (!profissional) throw new NotFoundException('Profissional não encontrado.');

    const criado = await this.prisma.db.bloqueio.create({
      data: comTenant({ profissionalId: dto.profissionalId, inicio, fim, motivo: dto.motivo ?? null }),
    });
    // Não cancelamos ninguém por conta própria: só avisamos quantos já estavam marcados nesse intervalo.
    const agendamentosAfetados = await this.prisma.db.agendamento.count({
      where: {
        profissionalId: dto.profissionalId,
        status: { not: StatusAgendamento.CANCELADO },
        inicio: { lt: fim },
        fim: { gt: inicio },
      },
    });
    return { ...paraBloqueioDto(criado), agendamentosAfetados };
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const profissionalId = escopoDoProfissional(usuario);
    const existe = await this.prisma.db.bloqueio.findFirst({
      where: { id, ...(profissionalId ? { profissionalId } : {}) },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Bloqueio não encontrado.');
    await this.prisma.db.bloqueio.delete({ where: { id } });
  }
}
