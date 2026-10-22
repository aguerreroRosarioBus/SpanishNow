import { Routes } from '@angular/router';
import { authGuard, teacherGuard, studentGuard, adminGuard } from './core/guards/auth.guard';
import { liveAuthGuard } from './core/guards/live-auth.guard';
import { legalManageGuard } from './features/legal/legal-manage.guard';

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
  {
    path: 'auth/forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
  },

  // Rutas públicas de venta (sin guard, en inglés)
  {
    path: 'courses',
    loadComponent: () => import('./features/public/courses/public-courses.component').then(m => m.PublicCoursesComponent)
  },
  {
    path: 'courses/:slug',
    loadComponent: () => import('./features/public/course-sales/course-sales.component').then(m => m.CourseSalesComponent)
  },
  {
    path: 'affiliate/:token',
    loadComponent: () => import('./features/public/affiliate-dashboard/affiliate-dashboard.component').then(m => m.AffiliateDashboardComponent)
  },
  {
    path: 'certificates/:code',
    loadComponent: () => import('./features/public/certificate-verify/certificate-verify.component').then(m => m.CertificateVerifyComponent)
  },
  {
    path: 'checkout/success',
    loadComponent: () => import('./features/public/checkout-success/checkout-success.component').then(m => m.CheckoutSuccessComponent)
  },

  {
    path: 'checkout/thanks',
    loadComponent: () => import('./features/public/checkout-thanks/checkout-thanks.component').then(m => m.CheckoutThanksComponent)
  },

  {
    path: 'live', canActivate: [liveAuthGuard],
    loadComponent: () => import('./features/live-classes/live-classes.component').then(m => m.LiveClassesComponent)
  },
  {
    path: 'live/join/:code', canActivate: [liveAuthGuard],
    loadComponent: () => import('./features/live-classes/live-join.component').then(m => m.LiveJoinComponent)
  },
  {
    path: 'live/:id', canActivate: [liveAuthGuard],
    canDeactivate: [(component: { canLeave(): boolean }) => component.canLeave()],
    loadComponent: () => import('./features/live-classes/live-room.component').then(m => m.LiveRoomComponent)
  },
  // Rutas de profesor
  {
    path: 'teacher/dashboard',
    loadComponent: () => import('./features/teacher/dashboard/teacher-dashboard.component').then(m => m.TeacherDashboardComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/course/:id/manage',
    loadComponent: () => import('./features/teacher/course-manage/course-manage').then(m => m.CourseManageComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/sales',
    loadComponent: () => import('./features/teacher/sales/teacher-sales.component').then(m => m.TeacherSalesComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/orders',
    loadComponent: () => import('./features/teacher/orders/teacher-orders.component').then(m => m.TeacherOrdersComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/coupons',
    loadComponent: () => import('./features/teacher/coupons/teacher-coupons.component').then(m => m.TeacherCouponsComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/affiliates',
    loadComponent: () => import('./features/teacher/affiliates/teacher-affiliates.component').then(m => m.TeacherAffiliatesComponent),
    canActivate: [teacherGuard]
  },
  {
    path: 'teacher/comments',
    loadComponent: () => import('./features/teacher/comments/teacher-comments.component').then(m => m.TeacherCommentsComponent),
    canActivate: [teacherGuard]
  },

  // Rutas de alumno
  {
    path: 'student/dashboard',
    loadComponent: () => import('./features/student/dashboard/student-dashboard.component').then(m => m.StudentDashboardComponent),
    canActivate: [studentGuard]
  },
  {
    path: 'student/course/:courseId/play',
    loadComponent: () => import('./features/student/story-player/story-player.component').then(m => m.StoryPlayerComponent),
    canActivate: [studentGuard]
  },

  // Rutas de actividades de vocabulario
  {
    path: 'student/flashcard/:unitId',
    loadComponent: () => import('./features/student/flashcard/flashcard.component').then(m => m.FlashcardComponent),
    canActivate: [studentGuard]
  },
  {
    path: 'student/matching/:unitId',
    loadComponent: () => import('./features/student/matching/matching.component').then(m => m.MatchingComponent),
    canActivate: [studentGuard]
  },
  {
    path: 'student/listen-repeat/:storyId',
    loadComponent: () => import('./features/student/listen-repeat/listen-repeat.component').then(m => m.ListenRepeatComponent),
    canActivate: [studentGuard]
  },

  // Rutas de seguimiento y configuración (estudiantes)
  {
    path: 'student/progress',
    loadComponent: () => import('./features/student/progress/progress.component').then(m => m.ProgressComponent),
    canActivate: [studentGuard]
  },
  {
    path: 'student/purchases',
    loadComponent: () => import('./features/student/purchases/purchases.component').then(m => m.PurchasesComponent),
    canActivate: [studentGuard]
  },
  {
    path: 'teachers',
    loadComponent: () => import('./features/student/teachers/teachers.component').then(m => m.TeachersComponent),
    canActivate: [authGuard]
  },

  // W02: páginas legales públicas (?version= para versiones publicadas anteriores)
  {
    path: 'legal/:documentKey',
    loadComponent: () => import('./features/legal/legal-page/legal-page.component').then(m => m.LegalPageComponent)
  },

  // Chat privado docente–alumno (W04)
  {
    path: 'messages',
    loadComponent: () => import('./features/chat/inbox/chat-inbox.component').then(m => m.ChatInboxComponent),
    canActivate: [authGuard]
  },
  {
    path: 'messages/:id',
    loadComponent: () => import('./features/chat/conversation/chat-conversation.component').then(m => m.ChatConversationComponent),
    canActivate: [authGuard]
  },

  // Rutas de información pública
  {
    path: 'contact',
    loadComponent: () => import('./features/info/contact/contact.component').then(m => m.ContactComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./features/info/about/about.component').then(m => m.AboutComponent)
  },

  // Administración (usuarios, permisos y cuentas de prueba)
  {
    path: 'admin/users',
    loadComponent: () => import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent),
    canActivate: [adminGuard]
  },

  // W02: editor legal con permiso explícito legal.manage
  {
    path: 'admin/legal',
    loadComponent: () => import('./features/legal/admin-legal/admin-legal.component').then(m => m.AdminLegalComponent),
    canActivate: [legalManageGuard]
  },
  // W02: expectativas de venta del curso (solo el docente dueño; el servidor lo verifica)
  {
    path: 'teacher/course/:id/expectations',
    loadComponent: () => import('./features/legal/expectations-editor/expectations-editor.component').then(m => m.ExpectationsEditorComponent),
    canActivate: [teacherGuard]
  },

  // Ruta de configuración (compartida)
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },

  // Ruta 404 - página no encontrada
  {
    path: '**',
    redirectTo: 'auth/login'
  }
];
