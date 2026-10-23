import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMITE_RESTRITO_KEY, PUBLICO_KEY } from '../common/decorators';
import { TenantContext } from '../common/tenant-context';
import { AssinaturaService } from './assinatura.service';

export const CODIGO_ASSINATURA_RESTRITA = 'ASSINATURA_RESTRITA';
export const MENSAGEM_RESTRITA =
  'A assinatura do salão está pendente. Você pode consultar tudo, mas não criar nem alterar até regularizar o pagamento.';

/**
 * Modo restrito do painel (spec seção 10): com a assinatura bloqueada, só consulta. Leituras passam sempre;
 * escritas só nas rotas marcadas com @PermiteRestrito. 402 (pagamento necessário) para o front poder levar
 * o dono à tela de assinatura.
 */
@Injectable()
export class AcessoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
    private readonly assinatura: AssinaturaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, alvos)) return true;
    const metodo = String(context.switchToHttp().getRequest().method).toUpperCase();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return true;
    if (this.reflector.getAllAndOverride<boolean>(PERMITE_RESTRITO_KEY, alvos)) return true;
    if (!this.tenant.atual()) return true; // sem tenant não há assinatura; a autenticação já cuidou do 401
    const estado = await this.assinatura.acesso();
    if (estado.acesso === 'LIBERADO') return true;
    throw new HttpException({ statusCode: 402, code: CODIGO_ASSINATURA_RESTRITA, message: MENSAGEM_RESTRITA, error: 'Payment Required' }, HttpStatus.PAYMENT_REQUIRED);
  }
}
