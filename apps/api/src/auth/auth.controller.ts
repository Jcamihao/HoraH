import {
  BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Papel, type SessaoResposta, type UsuarioLogado } from '@hora-h/shared';
import { Papeis, Publico, UsuarioAtual, UsuarioAutenticado } from '../common/decorators';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { AceitarConviteDto, CadastroDto, LoginDto } from './dto';
import { SessaoEmitida, SessaoService } from './sessao.service';

export const COOKIE_REFRESH = 'hh_refresh';
const UMA_HORA = 3_600_000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessao: SessaoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Publico()
  @Throttle({ default: { limit: 5, ttl: UMA_HORA } })
  @Post('cadastro')
  async cadastro(@Body() dto: CadastroDto, @Res({ passthrough: true }) res: Response): Promise<SessaoResposta> {
    return this.responder(res, await this.auth.cadastrarDono(dto));
  }

  /** O nome do método importa: o throttler `login` (e-mail + IP) só liga nesta rota. */
  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessaoResposta> {
    return this.responder(res, await this.auth.entrar(dto));
  }

  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessaoResposta> {
    try {
      return this.responder(res, await this.sessao.renovar(req.cookies?.[COOKIE_REFRESH]));
    } catch (e) {
      this.limparCookie(res);
      throw e;
    }
  }

  @Publico()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessao.revogar(req.cookies?.[COOKIE_REFRESH]);
    this.limparCookie(res);
  }

  @Papeis(Papel.DONO, Papel.PROFISSIONAL)
  @Get('me')
  me(@UsuarioAtual() u: UsuarioAutenticado): UsuarioLogado {
    return u;
  }

  @Publico()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('slug-disponivel')
  slugDisponivel(@Query('slug') slug?: string) {
    if (typeof slug !== 'string' || slug.length > 80) throw new BadRequestException('Informe o slug.');
    return this.auth.slugDisponivel(slug.trim().toLowerCase());
  }

  @Publico()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('convite/:token')
  previaConvite(@Param('token') token: string) {
    return this.auth.previaConvite(token);
  }

  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('convite/:token/aceitar')
  async aceitarConvite(
    @Param('token') token: string,
    @Body() dto: AceitarConviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessaoResposta> {
    return this.responder(res, await this.auth.aceitarConvite(token, dto));
  }

  private responder(res: Response, sessao: SessaoEmitida): SessaoResposta {
    res.cookie(COOKIE_REFRESH, sessao.refreshToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/api/auth',
      expires: sessao.refreshExpiraEm,
    });
    res.setHeader('Cache-Control', 'no-store');
    return sessao.resposta;
  }

  private limparCookie(res: Response): void {
    res.clearCookie(COOKIE_REFRESH, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/api/auth',
    });
  }
}
