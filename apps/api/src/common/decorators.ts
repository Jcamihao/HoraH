import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Papel } from '@hora-h/shared';

export const PUBLICO_KEY = 'publico';
export const PAPEIS_KEY = 'papeis';
export const PERMITE_RESTRITO_KEY = 'permiteRestrito';

/** Rota aberta, sem login. Tudo que não tem este decorator exige token. */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/**
 * Rota que continua funcionando com a assinatura vencida e bloqueada (modo restrito): é por elas que o dono
 * regulariza o pagamento e que o atendimento já marcado se resolve. Todo o resto que escreve fica bloqueado.
 */
export const PermiteRestrito = () => SetMetadata(PERMITE_RESTRITO_KEY, true);

/**
 * Papéis aceitos na rota. Sem este decorator a rota é só do DONO (padrão restritivo:
 * esquecer de decorar nunca abre acesso a profissional).
 */
export const Papeis = (...papeis: Papel[]) => SetMetadata(PAPEIS_KEY, papeis);

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  estabelecimentoId: string;
  profissionalId: string | null;
}

export const UsuarioAtual = createParamDecorator((_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
  return ctx.switchToHttp().getRequest().usuario;
});
