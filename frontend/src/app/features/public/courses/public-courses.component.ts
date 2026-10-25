import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { PublicCourse } from '../../../core/models/sales.model';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';

/** Catálogo público de cursos publicados (sin login, EN/ES). */
@Component({
  selector: 'app-public-courses',
  standalone: true,
  imports: [TranslatePipe, RouterLink, CourseCardComponent],
  templateUrl: './public-courses.component.html'
})
export class PublicCoursesComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private catalog = inject(PublicCatalogService);
  private auth = inject(AuthService);

  readonly levels=['A1','A2','B1','B2','C1','C2'];
  level=signal('');
  courses = signal<PublicCourse[]>([]);
  visibleCourses=computed(()=>this.courses().filter(c=>!this.level()||c.level===this.level()).slice().sort((a,b)=>this.levels.indexOf(a.level)-this.levels.indexOf(b.level)));

  isLoading = signal(true);
  private failure = signal<unknown>(null);
  errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'catalog.loadError') : '');
  currentUser = this.auth.currentUser;

  ngOnInit(): void {
    this.catalog.getCourses().subscribe({
      next: courses => {
        this.courses.set(courses);
        this.isLoading.set(false);
      },
      error: error => {
        this.failure.set(error);
        this.isLoading.set(false);
      }
    });
  }

  price(course: PublicCourse): string {
    return course.price > 0 ? this.i18n.formatMoney(course.price, course.currency) : this.i18n.t('catalog.free');
  }

  dashboardLink(): string {
    return this.currentUser()?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
  }
}
