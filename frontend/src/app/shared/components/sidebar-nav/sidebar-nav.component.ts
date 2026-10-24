import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { CommentBadgeService } from '../../../core/services/comment-badge.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { FeaturesService } from '../../../core/services/features.service';
import { IconComponent } from '../icon/icon.component';

interface NavItem {
  label: string;
  description?: string;
  icon: string;
  link: string;
  query?: Record<string, string>;
  /** Rutas hijas que también marcan este ítem como activo (p. ej. el reproductor cuelga de «Mis cursos») */
  alsoActiveUnder?: string;
  /** Si es true, solo se marca activo cuando coinciden también los parámetros de la URL */
  exactQuery?: boolean;
  /** Muestra un contador (comentarios sin responder). */
  badge?: 'comments' | 'chat';
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar-nav',
  standalone: true,
  imports: [TranslatePipe, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar-nav.component.html',
  styleUrl: './sidebar-nav.component.scss'
})
export class SidebarNavComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private commentBadge = inject(CommentBadgeService);
  unansweredComments = this.commentBadge.unanswered;
  private chatBadge = inject(ChatBadgeService);
  private features = inject(FeaturesService);
  private badgeLoaded = false;
  currentUser = this.authService.currentUser;
  private url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url }
  );

  constructor() {
    // El badge de comentarios sin responder se actualiza al navegar (con un intervalo mínimo entre consultas)
    effect(() => {
      this.url();
      const teacher = this.currentUser()?.role === 'teacher';
      untracked(() => {
        if (!teacher) { this.commentBadge.reset(); return; }
        // La primera consulta de cada sesión ignora el intervalo mínimo
        this.commentBadge.refresh(!this.badgeLoaded);
        this.badgeLoaded = true;
      });
    });
    // Chat (W04): ítem «Mensajes» con no leídos, solo con FEATURE_CHAT encendido en el backend
    this.features.load();
    effect(() => {
      const signedIn = !!this.currentUser();
      untracked(() => (signedIn ? this.chatBadge.start() : this.chatBadge.stop()));
    });
  }

  /** Cantidad a mostrar en el ítem (0 = sin badge). */
  badgeCount(item: NavItem): number {
    if (item.badge === 'chat') return this.chatBadge.unread();
    return item.badge === 'comments' ? this.unansweredComments() : 0;
  }

  /** Clave plural del texto accesible del contador. */
  badgeKey(item: NavItem): string { return item.badge === 'chat' ? 'chat.navUnread' : 'nav.unanswered'; }

  /** Ítem del chat (W04), al final del primer grupo. */
  private withChat(groups: NavGroup[]): NavGroup[] {
    if (groups.length) {
      const teacher = this.currentUser()?.role === 'teacher';
      groups = [{ ...groups[0], items: [...groups[0].items, {
        label: teacher ? 'packages.purchase.navTeacher' : 'packages.purchase.navStudent',
        description: teacher ? 'tutorial.nav.purchases' : undefined,
        icon: 'wallet',
        link: teacher ? '/teacher/class-purchases' : '/class-packages'
      }] }, ...groups.slice(1)];
    }
    if (this.features.enabled('class_packages') && this.currentUser()?.role === 'teacher' && groups.length) {
      groups = [{ ...groups[0], items: [...groups[0].items, { label: 'packages.nav', description: 'tutorial.nav.catalog', icon: 'package', link: '/teacher/class-packages' }, {label:'packages.group.nav',description:'tutorial.nav.groups',icon:'users',link:'/teacher/class-cohorts'}] }, ...groups.slice(1)];
    }
    if (this.features.enabled('google_calendar') && this.currentUser()?.role === 'teacher' && groups.length) {
      groups = [{ ...groups[0], items: [...groups[0].items, { label: 'calendar.nav', icon: 'plug', link: '/teacher/integrations' }] }, ...groups.slice(1)];
    }
    // El acceso de lectura permanece disponible al apagar nuevas propuestas.
    if (groups.length) groups = [{ ...groups[0], items: [...groups[0].items, { label: 'schedule.nav', icon: 'calendar', link: '/schedule' }] }, ...groups.slice(1)];
    if (!this.features.enabled('chat') || !groups.length) return groups;
    const chat: NavItem = { label: 'chat.nav', icon: 'messages-square', link: '/messages', badge: 'chat' };
    return [{ ...groups[0], items: [...groups[0].items, chat] }, ...groups.slice(1)];
  }

  isUnder(item: NavItem): boolean {
    return !!item.alsoActiveUnder && this.url().startsWith(item.alsoActiveUnder);
  }

  /** Plegada a 64px (solo íconos) */
  collapsed = input(false);
  /** Plegado automático (reproductor): no se puede expandir a mano */
  forced = input(false);
  collapseToggle = output<void>();

  groups = computed<NavGroup[]>(() => {
    const groups = this.withChat(this.baseGroups());
    if (!(this.currentUser()?.permissions?.length)) return groups;
    // «Administración» va antes de «Cuenta», que siempre es el último grupo
    const admin: NavGroup = { title: 'nav.admin', items: [{ label: 'nav.users', icon: 'id-card', link: '/admin/users' }] };
    if(['class_payments.review','class_credits.adjust','class_packages.manage_all','class_teachers.manage'].some(p=>this.authService.hasPermission(p))) admin.items.push({label:'packages.admin.nav',icon:'credit-card',link:'/admin/class-commerce'});
    if (this.authService.hasPermission('legal.manage')) admin.items.push({ label: 'legal.nav', icon: 'file-text', link: '/admin/legal' });
    return [...groups.slice(0, -1), admin, groups[groups.length - 1]];
  });

  private baseGroups = computed<NavGroup[]>(() => {
    if (this.currentUser()?.role === 'student') {
      return [
        {
          title: 'nav.learning',
          items: [
            { label: 'nav.myCourses', icon: 'book-open', link: '/student/dashboard', exactQuery: true, alsoActiveUnder: '/student/course/' },
            { label: 'nav.exploreCourses', icon: 'compass', link: '/student/dashboard', query: { view: 'catalog' }, exactQuery: true },
            { label: 'nav.progress', icon: 'bar-chart', link: '/student/progress' },
            { label: 'nav.liveClasses', icon: 'video', link: '/live' },
            { label: 'nav.teachers', icon: 'users', link: '/teachers' }
          ]
        },
        { title: 'nav.account', items: [{ label: 'nav.purchases', icon: 'receipt', link: '/student/purchases' }, { label: 'nav.settings', icon: 'settings', link: '/settings' }] }
      ];
    }
    return [
      {
        title: 'nav.teaching',
        items: [
          { label: 'nav.myCourses', icon: 'book-open', link: '/teacher/dashboard', alsoActiveUnder: '/teacher/course/' },
          { label: 'nav.liveClasses', icon: 'video', link: '/live' },
          { label: 'nav.comments', icon: 'message-square', link: '/teacher/comments', badge: 'comments' }
        ]
      },
      {
        title: 'nav.business',
        items: [
          { label: 'nav.sales', icon: 'chart-line', link: '/teacher/sales' },
          { label: 'nav.orders', icon: 'receipt', link: '/teacher/orders' },
          { label: 'nav.coupons', icon: 'tag', link: '/teacher/coupons' },
          { label: 'nav.affiliates', icon: 'share', link: '/teacher/affiliates' }
        ]
      },
      { title: 'nav.account', items: [{ label: 'nav.settings', icon: 'settings', link: '/settings' }] }
    ];
  });
}
