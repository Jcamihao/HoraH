import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Papel } from '@hora-h/shared';
import { AuthStore } from './auth.store';
import { EstabelecimentoStore } from './estabelecimento.store';

export const exigirLogin: CanActivateFn = (_rota, estado) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.logado() ? true : router.createUrlTree(['/entrar'], { queryParams: { voltar: estado.url } });
};

/** O profissional não tem tela de início: a casa dele é a própria agenda. */
export const inicioPorPapel: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.usuario()?.papel === Papel.PROFISSIONAL ? inject(Router).createUrlTree(['/painel/agenda']) : true;
};

export const soVisitante: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.logado() ? inject(Router).createUrlTree(['/painel']) : true;
};

export const soDono: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.usuario()?.papel === Papel.DONO ? true : inject(Router).createUrlTree(['/painel']);
};

/** O dono só usa o painel completo depois de terminar o passo a passo. */
export const cadastroConcluido: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (auth.usuario()?.papel !== Papel.DONO) return true;
  try {
    const e = await inject(EstabelecimentoStore).carregar();
    return e.onboardingConcluido ? true : router.createUrlTree(['/painel/cadastro']);
  } catch {
    return true;
  }
};

export const cadastroPendente: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const e = await inject(EstabelecimentoStore).carregar();
    return e.onboardingConcluido ? router.createUrlTree(['/painel']) : true;
  } catch {
    return true;
  }
};
