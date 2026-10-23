import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Papel } from '@hora-h/shared';
import { PAPEIS_KEY, PUBLICO_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, alvos)) return true;

    const permitidos = this.reflector.getAllAndOverride<Papel[]>(PAPEIS_KEY, alvos) ?? [Papel.DONO];
    const usuario = context.switchToHttp().getRequest().usuario;
    if (!usuario || !permitidos.includes(usuario.papel)) {
      throw new ForbiddenException('Você não tem permissão para esta ação.');
    }
    return true;
  }
}
