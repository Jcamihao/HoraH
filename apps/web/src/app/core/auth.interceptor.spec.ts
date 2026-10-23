import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

const SESSAO = (token: string) => ({
  accessToken: token,
  expiraEmSeg: 900,
  usuario: { id: 'u1', nome: 'Maria', email: 'm@x.com', papel: 'DONO', estabelecimentoId: 'e1', profissionalId: null },
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctl: HttpTestingController;
  let auth: AuthStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([{ path: 'entrar', children: [] }]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);
  });

  afterEach(() => ctl.verify());

  async function entrar(): Promise<void> {
    const p = auth.entrar('m@x.com', 'senha-forte-123');
    ctl.expectOne('/api/auth/login').flush(SESSAO('token-1'));
    await p;
  }

  it('anexa o token nas chamadas da API, mas não nas de /api/auth', async () => {
    await entrar();
    http.get('/api/profissionais').subscribe();
    expect(ctl.expectOne('/api/profissionais').request.headers.get('Authorization')).toBe('Bearer token-1');
    http.post('/api/auth/logout', {}).subscribe();
    expect(ctl.expectOne('/api/auth/logout').request.headers.has('Authorization')).toBeFalse();
  });

  it('num 401 renova a sessão uma vez e repete o pedido com o token novo', async () => {
    await entrar();
    let resposta: unknown;
    http.get('/api/servicos').subscribe((r) => (resposta = r));
    ctl.expectOne('/api/servicos').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    ctl.expectOne('/api/auth/refresh').flush(SESSAO('token-2'));
    await new Promise((r) => setTimeout(r));
    const repetido = ctl.expectOne('/api/servicos');
    expect(repetido.request.headers.get('Authorization')).toBe('Bearer token-2');
    repetido.flush([{ id: 's1' }]);
    expect(resposta).toEqual([{ id: 's1' }]);
  });

  it('vários 401 juntos dividem uma única renovação', async () => {
    await entrar();
    http.get('/api/a').subscribe();
    http.get('/api/b').subscribe();
    ctl.expectOne('/api/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctl.expectOne('/api/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    ctl.expectOne('/api/auth/refresh').flush(SESSAO('token-3'));
    await new Promise((r) => setTimeout(r));
    ctl.expectOne('/api/a').flush({});
    ctl.expectOne('/api/b').flush({});
  });

  it('se a renovação falha, a sessão acaba e o erro chega a quem pediu', async () => {
    await entrar();
    let status = 0;
    http.get('/api/servicos').subscribe({ error: (e) => (status = e.status) });
    ctl.expectOne('/api/servicos').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    ctl.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r));
    expect(status).toBe(401);
    expect(auth.logado()).toBeFalse();
  });

  it('só pergunta ao servidor se já houve sessão neste navegador', async () => {
    await auth.restaurar();
    ctl.expectNone('/api/auth/refresh');
    expect(auth.pronto()).toBeTrue();
  });
});
