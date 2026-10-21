import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { Enrollment, StoryProgress } from '../../../core/models/course.model';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { unitDisplayTitle } from '../../../shared/utils/unit-title';

export interface CourseProgress {
  enrollment: Enrollment;
  stories: StoryProgress[];
  failed: boolean;
}

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule, RouterLink, PluralPipe],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss'
})
export class ProgressComponent implements OnInit {
  private enrollmentService = inject(EnrollmentService);

  courses = signal<CourseProgress[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProgress();
  }

  loadProgress(): void {
    this.isLoading.set(true);
    this.enrollmentService.getMyCourses().pipe(
      switchMap(enrollments => enrollments.length === 0 ? of([]) : forkJoin(
        enrollments.map(enrollment => this.enrollmentService.getProgress(enrollment.id).pipe(
          catchError(error => {
            console.error('Error loading course progress:', error);
            return of(null);
          })
        ))
      ).pipe(
        switchMap(results => of(enrollments.map((enrollment, i): CourseProgress =>
          ({ enrollment, stories: results[i] ?? [], failed: results[i] === null }))))
      ))
    ).subscribe({
      next: courses => {
        this.courses.set(courses);
        this.isLoading.set(false);
      },
      error: error => {
        console.error('Error loading progress:', error);
        this.isLoading.set(false);
      }
    });
  }

  unitTitle(title: string): string { return unitDisplayTitle(title); }

  completedCount(course: CourseProgress): number {
    return course.stories.filter(s => s.narrativeCompleted).length;
  }

  percentage(course: CourseProgress): number {
    const total = course.stories.length;
    return total === 0 ? 0 : Math.round((this.completedCount(course) / total) * 100);
  }
}
