import { escoparArgumentos } from './prisma.service';

const T = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

describe('escoparArgumentos (filtro automático de tenant)', () => {
  it('findMany: encadeia o tenant ao where existente sem perdê-lo', () => {
    const r = escoparArgumentos('Servico', 'findMany', { where: { ativo: true } }, T);
    expect(r.where).toEqual({ AND: [{ ativo: true }, { estabelecimentoId: T }] });
  });

  it('findMany sem where: ainda filtra por tenant', () => {
    expect(escoparArgumentos('Profissional', 'findMany', undefined, T).where).toEqual({
      AND: [{}, { estabelecimentoId: T }],
    });
  });

  it.each(['updateMany', 'deleteMany', 'count'])('%s em massa sempre leva o tenant', (op) => {
    expect(escoparArgumentos('Servico', op, { where: { nome: 'x' }, data: {} }, T).where.AND).toContainEqual({
      estabelecimentoId: T,
    });
  });

  it('findUnique/update/delete: acrescenta o tenant à chave única', () => {
    for (const op of ['findUnique', 'findUniqueOrThrow', 'update', 'delete']) {
      expect(escoparArgumentos('Profissional', op, { where: { id: 'abc' }, data: {} }, T).where).toEqual({
        id: 'abc',
        estabelecimentoId: T,
      });
    }
  });

  it('create: preenche o tenant', () => {
    expect(escoparArgumentos('Servico', 'create', { data: { nome: 'Corte', duracaoMin: 30 } }, T).data).toEqual({
      nome: 'Corte',
      duracaoMin: 30,
      estabelecimentoId: T,
    });
  });

  it('createMany: preenche o tenant em todas as linhas', () => {
    const r = escoparArgumentos('HorarioTrabalho', 'createMany', { data: [{ a: 1 }, { a: 2 }] }, T);
    expect(r.data).toEqual([
      { a: 1, estabelecimentoId: T },
      { a: 2, estabelecimentoId: T },
    ]);
  });

  it('upsert: prende where e create ao tenant', () => {
    const r = escoparArgumentos('Assinatura', 'upsert', { where: { id: 'x' }, create: { status: 'TESTE' }, update: {} }, T);
    expect(r.where).toEqual({ id: 'x', estabelecimentoId: T });
    expect(r.create).toEqual({ status: 'TESTE', estabelecimentoId: T });
  });

  it('recusa quem tenta informar o tenant de outro salão (where, data ou create)', () => {
    expect(() => escoparArgumentos('Servico', 'create', { data: { estabelecimentoId: OUTRO } }, T)).toThrow(/outro tenant/);
    expect(() => escoparArgumentos('Servico', 'update', { where: { id: 'a', estabelecimentoId: OUTRO }, data: {} }, T)).toThrow(/outro tenant/);
    expect(() => escoparArgumentos('Servico', 'updateMany', { where: {}, data: { estabelecimentoId: OUTRO } }, T)).toThrow(/outro tenant/);
    expect(() => escoparArgumentos('Servico', 'createMany', { data: [{ estabelecimentoId: OUTRO }] }, T)).toThrow(/outro tenant/);
  });

  it('Estabelecimento é o próprio tenant: filtra por id e proíbe criação', () => {
    expect(escoparArgumentos('Estabelecimento', 'update', { where: { id: T }, data: { nome: 'x' } }, T).where).toEqual({ id: T });
    expect(() => escoparArgumentos('Estabelecimento', 'findUnique', { where: { id: OUTRO } }, T)).toThrow(/outro tenant/);
    expect(() => escoparArgumentos('Estabelecimento', 'create', { data: {} }, T)).toThrow(/semTenant/);
  });

  it('modelo sem coluna de tenant (RefreshToken) é recusado no cliente escopado', () => {
    expect(() => escoparArgumentos('RefreshToken', 'findMany', {}, T)).toThrow(/semTenant/);
  });

  it('operação desconhecida falha fechada', () => {
    expect(() => escoparArgumentos('Servico', 'algoNovo', {}, T)).toThrow(/não suportada/);
  });
});
