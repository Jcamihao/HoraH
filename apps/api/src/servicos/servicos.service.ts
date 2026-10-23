import { Injectable, NotFoundException } from '@nestjs/common';
import type { Servico } from '@prisma/client';
import type { ServicoDto } from '@hora-h/shared';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { AtualizarServicoDto, CriarServicoDto } from './dto';

const paraDto = (s: Servico): ServicoDto => ({ id: s.id, nome: s.nome, duracaoMin: s.duracaoMin, ativo: s.ativo });

@Injectable()
export class ServicosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(incluirInativos: boolean): Promise<ServicoDto[]> {
    const servicos = await this.prisma.db.servico.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return servicos.map(paraDto);
  }

  async criar(dto: CriarServicoDto): Promise<ServicoDto> {
    return paraDto(await this.prisma.db.servico.create({ data: comTenant({ nome: dto.nome, duracaoMin: dto.duracaoMin }) }));
  }

  async atualizar(id: string, dto: AtualizarServicoDto): Promise<ServicoDto> {
    const { count } = await this.prisma.db.servico.updateMany({ where: { id }, data: { ...dto } });
    if (count === 0) throw new NotFoundException('Serviço não encontrado.');
    return paraDto(await this.prisma.db.servico.findUniqueOrThrow({ where: { id } }));
  }
}
