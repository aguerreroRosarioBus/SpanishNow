import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { PublicCourse } from '../../../core/models/sales.model';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';
import { formatPrice } from '../../../shared/utils/money';

/** Catálogo público de cursos publicados (sin login, en inglés). */
@Component({
  selector: 'app-public-courses',
  standalone: true,
  imports: [RouterLink, CourseCardComponent],
  templateUrl: './public-courses.component.html'
})
export class PublicCoursesComponent implements OnInit {
  private catalog = inject(PublicCatalogService);
  private auth = inject(AuthService);

  courses = signal<PublicCourse[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');
  currentUser = this.auth.currentUser;

  ngOnInit(): void {
    this.catalog.getCourses().subscribe({
      next: courses => {
        this.courses.set(courses);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('We could not load the courses. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  price(course: PublicCourse): string {
    return course.price > 0 ? formatPrice(course.price, course.currency) : 'Free';
  }

  dashboardLink(): string {
    return this.currentUser()?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
  }
}
