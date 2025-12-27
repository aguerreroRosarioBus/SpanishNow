import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { Course, Unit, Story } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './story-player.component.html',
  styleUrl: './story-player.component.scss'
})
export class StoryPlayerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private enrollmentService = inject(EnrollmentService);

  currentUser = this.authService.currentUser;

  courseId!: number;
  course = signal<Course | null>(null);
  currentStory = signal<Story | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Control del reproductor de audio
  isPlaying = signal<boolean>(false);
  currentSpeed = signal<'slow' | 'normal'>('slow');
  audioElement: HTMLAudioElement | null = null;

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    // Obtener el ID del curso de la URL
    this.route.params.subscribe(params => {
      this.courseId = +params['courseId'];
      this.loadCourse();
    });
  }

  loadCourse(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.courseService.getCourse(this.courseId).subscribe({
      next: (course) => {
        this.course.set(course);

        // Seleccionar la primera historia de la primera unidad por defecto
        if (course.units && course.units.length > 0 && course.units[0].stories && course.units[0].stories.length > 0) {
          this.selectStory(course.units[0].stories[0]);
        }

        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading course:', error);
        this.errorMessage.set('Error al cargar el curso');
        this.isLoading.set(false);
      }
    });
  }

  selectStory(story: Story): void {
    // Detener audio anterior si existe
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    this.currentStory.set(story);
    this.isPlaying.set(false);
  }

  togglePlayPause(): void {
    const story = this.currentStory();
    if (!story) return;

    const audioUrl = this.currentSpeed() === 'slow' ? story.audioSlowUrl : story.audioNormalUrl;

    if (!audioUrl) {
      alert('Audio no disponible para esta historia');
      return;
    }

    if (!this.audioElement) {
      // Crear nuevo elemento de audio
      this.audioElement = new Audio(audioUrl);

      this.audioElement.addEventListener('ended', () => {
        this.isPlaying.set(false);
      });

      this.audioElement.addEventListener('error', () => {
        alert('Error al cargar el audio');
        this.isPlaying.set(false);
      });
    }

    if (this.isPlaying()) {
      this.audioElement.pause();
      this.isPlaying.set(false);
    } else {
      this.audioElement.play();
      this.isPlaying.set(true);
    }
  }

  switchSpeed(speed: 'slow' | 'normal'): void {
    const wasPlaying = this.isPlaying();

    // Detener audio actual
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    this.currentSpeed.set(speed);
    this.isPlaying.set(false);

    // Si estaba reproduciendo, iniciar con la nueva velocidad
    if (wasPlaying) {
      setTimeout(() => this.togglePlayPause(), 100);
    }
  }

  markAsCompleted(): void {
    const story = this.currentStory();
    if (!story) return;

    // Aquí necesitamos el enrollmentId
    // Por ahora solo mostramos confirmación
    if (confirm('¿Marcar esta historia como completada?')) {
      // TODO: Implementar la lógica real con el enrollmentId
      alert('Historia marcada como completada (funcionalidad en desarrollo)');
    }
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }

  ngOnDestroy(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }
}
