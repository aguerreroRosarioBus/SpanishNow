import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { Enrollment, Progress } from '../../../core/models/course.model';

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss'
})
export class ProgressComponent implements OnInit {
  private enrollmentService = inject(EnrollmentService);

  myCourses = signal<Enrollment[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProgress();
  }

  loadProgress(): void {
    this.isLoading.set(true);
    this.enrollmentService.getMyCourses().subscribe({
      next: (enrollments) => {
        this.myCourses.set(enrollments);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading progress:', error);
        this.isLoading.set(false);
      }
    });
  }

  getProgressPercentage(enrollment: Enrollment): number {
    if (!enrollment.course?.units || enrollment.course.units.length === 0) {
      return 0;
    }

    const totalStories = enrollment.course.units.reduce(
      (sum, unit) => sum + (unit.stories?.length || 0),
      0
    );

    if (totalStories === 0) return 0;

    const completedStories = enrollment.progress?.filter(p => p.completed).length || 0;
    return Math.round((completedStories / totalStories) * 100);
  }

  getCompletedCount(enrollment: Enrollment): number {
    return enrollment.progress?.filter(p => p.completed).length || 0;
  }
}
