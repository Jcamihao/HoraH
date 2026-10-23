import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * `prisma.semTenant` e SQL cru ignoram o filtro de tenant. Cada arquivo que os usa precisa estar
 * nesta lista de propósito: adicionar uso novo exige mexer aqui, ou seja, passar por revisão.
 */
const PERMITIDOS_SEM_TENANT = [
  'auth/auth.service.ts',      // cadastro, login e convite acontecem antes de existir tenant
  'auth/sessao.service.ts',    // refresh tokens são consultados antes do tenant
  'common/jwt-auth.guard.ts',  // é quem descobre o tenant a partir do usuário do token
  'publico/tenant-publico.guards.ts', // página pública: o tenant vem do slug ou do token do agendamento
  'health/health.controller.ts',
  'prisma/prisma.service.ts',  // define o cliente
];
const PERMITIDOS_SQL_CRU = ['health/health.controller.ts'];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith('.ts') && !caminho.endsWith('.spec.ts') ? [caminho] : [];
  });
}

describe('auditoria de acesso sem tenant', () => {
  const raiz = __dirname;
  const fontes = arquivos(raiz).map((f) => ({
    rel: relative(raiz, f).split(sep).join('/'),
    texto: readFileSync(f, 'utf8'),
  }));

  it('semTenant só aparece em arquivos autorizados', () => {
    const usam = fontes.filter((f) => f.texto.includes('semTenant')).map((f) => f.rel).sort();
    expect(usam).toEqual([...PERMITIDOS_SEM_TENANT].sort());
  });

  it('SQL cru ($queryRaw/$executeRaw) só aparece em arquivos autorizados', () => {
    const usam = fontes.filter((f) => /\$(queryRaw|executeRaw)/.test(f.texto)).map((f) => f.rel).sort();
    expect(usam).toEqual([...PERMITIDOS_SQL_CRU].sort());
  });
});
