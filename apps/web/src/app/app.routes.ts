import { Routes } from '@angular/router';
import { cadastroConcluido, cadastroPendente, exigirLogin, inicioPorPapel, soDono, soVisitante } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'entrar',
    canActivate: [soVisitante],
    title: 'Entrar | Hora H',
    loadComponent: () => import('./features/auth/entrar.page').then((m) => m.EntrarPage),
  },
  {
    path: 'cadastrar',
    canActivate: [soVisitante],
    title: 'Criar conta | Hora H',
    loadComponent: () => import('./features/auth/cadastrar.page').then((m) => m.CadastrarPage),
  },
  {
    path: 'convite/:token',
    title: 'Convite | Hora H',
    loadComponent: () => import('./features/auth/convite.page').then((m) => m.ConvitePage),
  },
  {
    path: 'painel',
    canActivate: [exigirLogin],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [inicioPorPapel, cadastroConcluido],
        title: 'Início | Hora H',
        loadComponent: () => import('./features/inicio/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'cadastro',
        canActivate: [soDono, cadastroPendente],
        title: 'Cadastro do salão | Hora H',
        loadComponent: () => import('./features/onboarding/cadastro.page').then((m) => m.CadastroPage),
      },
      {
        path: 'cadastro/:etapa',
        canActivate: [soDono, cadastroPendente],
        title: 'Cadastro do salão | Hora H',
        loadComponent: () => import('./features/onboarding/cadastro.page').then((m) => m.CadastroPage),
      },
      {
        path: 'agenda',
        canActivate: [cadastroConcluido],
        title: 'Agenda | Hora H',
        loadComponent: () => import('./features/agenda/agenda.page').then((m) => m.AgendaPage),
      },
      {
        path: 'agenda/novo',
        canActivate: [cadastroConcluido],
        title: 'Novo agendamento | Hora H',
        loadComponent: () => import('./features/agenda/agendamento-novo.page').then((m) => m.AgendamentoNovoPage),
      },
      {
        path: 'agenda/bloquear',
        canActivate: [cadastroConcluido],
        title: 'Bloquear horário | Hora H',
        loadComponent: () => import('./features/agenda/bloqueio.page').then((m) => m.BloqueioPage),
      },
      {
        path: 'agenda/:id',
        canActivate: [cadastroConcluido],
        title: 'Agendamento | Hora H',
        loadComponent: () => import('./features/agenda/agendamento.page').then((m) => m.AgendamentoPage),
      },
      {
        path: 'profissionais',
        canActivate: [soDono, cadastroConcluido],
        title: 'Profissionais | Hora H',
        loadComponent: () => import('./features/profissionais/profissionais.page').then((m) => m.ProfissionaisPage),
      },
      {
        path: 'profissionais/:id',
        canActivate: [soDono, cadastroConcluido],
        title: 'Profissional | Hora H',
        loadComponent: () => import('./features/profissionais/profissional.page').then((m) => m.ProfissionalPage),
      },
      {
        path: 'servicos',
        canActivate: [soDono, cadastroConcluido],
        title: 'Serviços | Hora H',
        loadComponent: () => import('./features/servicos/servicos.page').then((m) => m.ServicosPage),
      },
      {
        path: 'configuracoes',
        canActivate: [soDono, cadastroConcluido],
        title: 'Ajustes | Hora H',
        loadComponent: () => import('./features/configuracoes/configuracoes.page').then((m) => m.ConfiguracoesPage),
      },
      {
        path: 'meu-perfil',
        title: 'Meu perfil | Hora H',
        loadComponent: () => import('./features/profissionais/meu-perfil.page').then((m) => m.MeuPerfilPage),
      },
    ],
  },
  {
    path: 'agendamento/:token',
    title: 'Seu horário | Hora H',
    loadComponent: () => import('./features/publico/meu-agendamento.page').then((m) => m.MeuAgendamentoPage),
  },
  // Página pública do salão. Fica depois de todas as rotas fixas: `entrar`, `painel` etc. são slugs reservados.
  {
    path: ':slug',
    title: 'Agendar | Hora H',
    loadComponent: () => import('./features/publico/publico.page').then((m) => m.PublicoPage),
  },
  { path: '**', redirectTo: 'painel' },
];
