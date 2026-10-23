import { Injectable } from '@nestjs/common';
import {
  HORIZONTE_PUBLICO_DIAS, OrigemAgendamento,
  type AgendamentoCriadoPublicoDto, type DiaDisponivelDto, type MeuAgendamentoDto, type SalaoPublicoDto, type SlotDto,
} from '@hora-h/shared';
import { AgendaService, paraMeuAgendamentoDto } from '../agenda/agenda.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ReservaPublicaDto } from '../agenda/dto';

@Injectable()
export class PublicoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaService,
  ) {}

  /** Só aparece quem pode ser agendado: profissional ativo com pelo menos um serviço ativo (e o preço dele). */
  async salao(): Promise<SalaoPublicoDto> {
    const salao = await this.agenda.salao();
    const profissionais = await this.prisma.db.profissional.findMany({
      where: { ativo: true, servicos: { some: { servico: { ativo: true } } } },
      include: {
        servicos: { where: { servico: { ativo: true } }, include: { servico: { select: { nome: true, duracaoMin: true } } } },
      },
      orderBy: { nome: 'asc' },
    });
    return {
      nome: salao.nome,
      slug: salao.slug,
      fusoHorario: salao.fusoHorario,
      horizonteDias: HORIZONTE_PUBLICO_DIAS,
      aceitaAgendamentos: await this.agenda.agendaAberta(),
      profissionais: profissionais.map((p) => ({
        id: p.id,
        nome: p.nome,
        servicos: p.servicos
          .map((s) => ({ servicoId: s.servicoId, nome: s.servico.nome, duracaoMin: s.servico.duracaoMin, precoCentavos: s.precoCentavos }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      })),
    };
  }

  async dias(profissionalId: string, servicoId: string): Promise<DiaDisponivelDto[]> {
    await this.agenda.exigirAgendaAberta();
    const [salao, servico] = await Promise.all([this.agenda.salao(), this.agenda.servicoDoProfissional(profissionalId, servicoId)]);
    return this.agenda.diasDisponiveis(salao, { profissionalId, duracaoMin: servico.duracaoMin, regime: 'PUBLICO' });
  }

  async horarios(profissionalId: string, servicoId: string, data: string): Promise<SlotDto[]> {
    await this.agenda.exigirAgendaAberta();
    const [salao, servico] = await Promise.all([this.agenda.salao(), this.agenda.servicoDoProfissional(profissionalId, servicoId)]);
    return this.agenda.horarios(salao, { profissionalId, duracaoMin: servico.duracaoMin, regime: 'PUBLICO' }, data);
  }

  async reservar(dto: ReservaPublicaDto): Promise<AgendamentoCriadoPublicoDto> {
    const criado = await this.agenda.reservar({
      profissionalId: dto.profissionalId,
      servicoId: dto.servicoId,
      inicio: new Date(dto.inicio),
      nome: dto.nome,
      whatsapp: dto.whatsapp,
      origem: OrigemAgendamento.LINK,
    });
    return { ...paraMeuAgendamentoDto(criado, await this.agenda.salao(), new Date()), token: criado.token };
  }

  // -------------------------------------------------- página do link único (cancelar/remarcar)

  async meuAgendamento(id: string): Promise<MeuAgendamentoDto> {
    const [a, salao] = await Promise.all([this.agenda.obterAgendamento(id), this.agenda.salao()]);
    return paraMeuAgendamentoDto(a, salao, new Date());
  }

  async cancelar(id: string): Promise<MeuAgendamentoDto> {
    const a = await this.agenda.cancelarPeloCliente(id);
    return paraMeuAgendamentoDto(a, await this.agenda.salao(), new Date());
  }

  async remarcar(id: string, inicio: Date): Promise<MeuAgendamentoDto> {
    const a = await this.agenda.remarcarPeloCliente(id, inicio);
    return paraMeuAgendamentoDto(a, await this.agenda.salao(), new Date());
  }

  async diasParaRemarcar(id: string): Promise<DiaDisponivelDto[]> {
    const { salao, atual } = await this.paraRemarcar(id);
    return this.agenda.diasDisponiveis(salao, {
      profissionalId: atual.profissionalId, duracaoMin: atual.duracaoMin, regime: 'PUBLICO', ignorarAgendamentoId: atual.id,
    });
  }

  async horariosParaRemarcar(id: string, data: string): Promise<SlotDto[]> {
    const { salao, atual } = await this.paraRemarcar(id);
    return this.agenda.horarios(
      salao,
      { profissionalId: atual.profissionalId, duracaoMin: atual.duracaoMin, regime: 'PUBLICO', ignorarAgendamentoId: atual.id },
      data,
    );
  }

  private async paraRemarcar(id: string) {
    const [salao, atual] = await Promise.all([this.agenda.salao(), this.agenda.obterAgendamento(id)]);
    this.agenda.exigirPodeAlterar(atual, salao, new Date());
    return { salao, atual };
  }
}
