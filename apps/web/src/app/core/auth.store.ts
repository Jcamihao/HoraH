import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Papel, type SessaoResposta, type UsuarioLogado } from '@hora-h/shared';

/**
 * Sessão no navegador. O access token vive só na memória (some ao recarregar a página);
 * o refresh token fica num cookie httpOnly que o JavaScript não consegue ler.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private token: string | null = null;
  private renovando: Promise<boolean> | null = null;

  readonly usuario = signal<UsuarioLogado | null>(null);
  /** Falso até a tentativa de restaurar a sessão terminar (evita piscar a tela de login). */
  readonly pronto = signal(false);
  readonly logado = computed(() => this.usuario() !== null);
  readonly ehDono = computed(() => this.usuario()?.papel === Papel.DONO);

  accessToken(): string | null {
    return this.token;
  }

  async restaurar(): Promise<void> {
    // Só pergunta ao servidor se este navegador já teve sessão; evita um 401 inútil para quem acabou de chegar.
    if (this.teveSessao()) await this.renovar();
    this.pronto.set(true);
  }

  async entrar(email: string, senha: string): Promise<void> {
    this.aplicar(await firstValueFrom(this.http.post<SessaoResposta>('/api/auth/login', { email, senha })));
  }

  async cadastrar(corpo: {
    nome: string;
    email: string;
    senha: string;
    nomeEstabelecimento: string;
    slug: string;
  }): Promise<void> {
    this.aplicar(await firstValueFrom(this.http.post<SessaoResposta>('/api/auth/cadastro', corpo)));
  }

  async aceitarConvite(token: string, email: string, senha: string): Promise<void> {
    const url = `/api/auth/convite/${encodeURIComponent(token)}/aceitar`;
    this.aplicar(await firstValueFrom(this.http.post<SessaoResposta>(url, { email, senha })));
  }

  /** Troca o cookie de refresh por um access token novo. Chamadas simultâneas dividem a mesma requisição. */
  renovar(): Promise<boolean> {
    this.renovando ??= firstValueFrom(this.http.post<SessaoResposta>('/api/auth/refresh', {}))
      .then((r) => {
        this.aplicar(r);
        return true;
      })
      .catch(() => {
        this.limpar();
        return false;
      })
      .finally(() => {
        this.renovando = null;
      });
    return this.renovando;
  }

  async sair(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Sem rede, saímos do mesmo jeito: o token em memória é descartado abaixo.
    }
    this.limpar();
    await this.router.navigateByUrl('/entrar');
  }

  /** O dono que se cadastra como profissional ganha agenda própria: a sessão passa a saber disso. */
  definirProfissional(id: string): void {
    const u = this.usuario();
    if (u) this.usuario.set({ ...u, profissionalId: id });
  }

  /** Chamado pelo interceptor quando nem a renovação salvou a sessão. */
  expirou(): void {
    this.limpar();
    void this.router.navigate(['/entrar'], { queryParams: { motivo: 'expirou' } });
  }

  private aplicar(r: SessaoResposta): void {
    this.token = r.accessToken;
    this.usuario.set(r.usuario);
    this.marcarSessao(true);
  }

  private limpar(): void {
    this.token = null;
    this.usuario.set(null);
    this.marcarSessao(false);
  }

  // Marcador sem segredo: só diz "já entrei aqui". O refresh token continua num cookie httpOnly.
  private teveSessao(): boolean {
    try {
      return localStorage.getItem('hh_sessao') === '1';
    } catch {
      return true;
    }
  }

  private marcarSessao(ligada: boolean): void {
    try {
      if (ligada) localStorage.setItem('hh_sessao', '1');
      else localStorage.removeItem('hh_sessao');
    } catch {
      // Sem armazenamento (aba privada): a sessão continua valendo enquanto a página estiver aberta.
    }
  }
}
