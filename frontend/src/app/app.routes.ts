import { Routes } from '@angular/router';

/**
 * Configuración de rutas de la aplicación
 *
 * Cada ruta define:
 * - path: la URL (ej: 'auth/login')
 * - loadComponent: importación lazy (carga solo cuando se necesita)
 * - canActivate: guards que protegen la ruta (opcional)
 */
export const routes: Routes = [
  // Ruta raíz - redirige a login por ahora
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },

  // Rutas de autenticación
  {
    path: 'auth/login',
    // Lazy loading: solo carga el componente cuando se accede a esta ruta
    // Esto mejora el rendimiento inicial de la app
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent)
  },

  // Rutas de profesor
  {
    path: 'teacher/dashboard',
    loadComponent: () => import('./features/teacher/dashboard/teacher-dashboard.component').then(m => m.TeacherDashboardComponent)
    // TODO: Agregar teacherGuard cuando esté listo
  },
  {
    path: 'teacher/course/:id/manage',
    loadComponent: () => import('./features/teacher/course-manage/course-manage').then(m => m.CourseManageComponent)
    // TODO: Agregar teacherGuard cuando esté listo
  },

  // Rutas de alumno
  {
    path: 'student/dashboard',
    loadComponent: () => import('./features/student/dashboard/student-dashboard.component').then(m => m.StudentDashboardComponent)
    // TODO: Agregar studentGuard cuando esté listo
  },
  {
    path: 'student/course/:courseId/play',
    loadComponent: () => import('./features/student/story-player/story-player.component').then(m => m.StoryPlayerComponent)
    // TODO: Agregar studentGuard cuando esté listo
  },

  // Ruta 404 - página no encontrada
  {
    path: '**',
    redirectTo: 'auth/login'
  }
];
