import { ForbiddenException } from '@nestjs/common';
import { Papel } from '@hora-h/shared';
import type { UsuarioAutenticado } from '../common/decorators';

/**
 * Qual profissional o usuário pode enxergar/mexer: `null` = todos (dono); profissional = só ele mesmo.
 * Quem pede outro profissional recebe 403, em vez de ser silenciosamente redirecionado.
 */
export function escopoDoProfissional(usuario: UsuarioAutenticado, pedido?: string): string | null {
  if (usuario.papel === Papel.DONO) return pedido ?? null;
  if (!usuario.profissionalId) throw new ForbiddenException('Você não tem agenda de profissional.');
  if (pedido && pedido !== usuario.profissionalId) {
    throw new ForbiddenException('Você só acessa a sua própria agenda.');
  }
  return usuario.profissionalId;
}
