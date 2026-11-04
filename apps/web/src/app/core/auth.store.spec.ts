import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from './auth.store';

describe('AuthStore.renovar', () => {
  let auth: AuthStore;
  let ctl: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('hh_sessao', '1');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthStore);
    ctl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctl.verify());

  it('sem rede mantém o marcador de sessão, para retomar quando a internet voltar', async () => {
    const r = auth.renovar();
    ctl.expectOne('/api/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    expect(await r).toBeFalse();
    expect(localStorage.getItem('hh_sessao')).toBe('1');
    expect(auth.logado()).toBeFalse();
  });

  it('504 do service worker offline também mantém o marcador', async () => {
    const r = auth.renovar();
    ctl.expectOne('/api/auth/refresh').flush({}, { status: 504, statusText: 'Gateway Timeout' });
    expect(await r).toBeFalse();
    expect(localStorage.getItem('hh_sessao')).toBe('1');
  });

  it('sessão vencida (401) esquece o marcador', async () => {
    const r = auth.renovar();
    ctl.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await r).toBeFalse();
    expect(localStorage.getItem('hh_sessao')).toBeNull();
  });
});
