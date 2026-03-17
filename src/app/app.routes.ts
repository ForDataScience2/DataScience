import { Routes } from '@angular/router';

import { Home } from './pages/home/home';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';

import { Dashboard } from './pages/dashboard/dashboard';
import { Principal } from './pages/dashboard/principal/principal';
import { Subjects } from './pages/dashboard/subjects/subjects';

import { NotAuthenticatedGuard } from './auth/guards/not-authenticated.guard';
import { IsAuthenticatedGuard } from './auth/guards/is-authenticated.guard';
import { DashBoardGeneral } from './pages/dash-board-general/dash-board-general';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  { path: 'home', component: Home },
  { path: 'dash-board', component: DashBoardGeneral },
  { path: 'login', component: Login, canMatch: [NotAuthenticatedGuard] },
  { path: 'register', component: Register, canMatch: [NotAuthenticatedGuard] },

  {
    path: 'dashboard',
    component: Dashboard,
    canMatch: [IsAuthenticatedGuard],
    children: [
      { path: '', component: Principal },
      { path: 'subjects', component: Subjects },
      {
        path: 'profile',
        loadComponent: () => import('./pages/dashboard/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'subjects/:subjectId/content',
        loadComponent: () =>
          import('./pages/dashboard/subjects/subject-content/subject-content').then(
            (m) => m.SubjectContentComponent,
          ),
      },
      {
        path: 'guias',
        loadComponent: () =>
          import('./pages/dashboard/study-guides/study-guides').then((m) => m.StudyGuides),
      },
      {
        path: 'examenes',
        loadComponent: () => import('./pages/dashboard/exams/exams').then((m) => m.Exams),
      },
      { path: '**', redirectTo: '' },
    ],
  },

  {
    path: 'ai/generate',
    loadComponent: () => import('./pages/ai/generate/generate').then((m) => m.Generate),
  },

  { path: '**', redirectTo: 'home' },
];
