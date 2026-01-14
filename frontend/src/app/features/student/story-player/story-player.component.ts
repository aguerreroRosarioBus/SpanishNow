import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { ActivityConfigService, ActivityConfig } from '../../../core/services/activity-config.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Unit, Story, Question, Progress } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';
import { ActivityModalComponent } from '../activity-modal/activity-modal.component';
import { FlashcardModalComponent } from '../flashcard-modal/flashcard-modal.component';
import { MatchingModalComponent } from '../matching-modal/matching-modal.component';
import { ListenRepeatModalComponent } from '../listen-repeat-modal/listen-repeat-modal.component';

@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    ActivityModalComponent,
    FlashcardModalComponent,
    MatchingModalComponent,
    ListenRepeatModalComponent
  ],
  templateUrl: './story-player.component.html',
  styleUrl: './story-player.component.scss'
})
export class StoryPlayerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private enrollmentService = inject(EnrollmentService);
  private questionService = inject(QuestionService);
  private vocabularyService = inject(VocabularyService);
  private repetitionActivityService = inject(RepetitionActivityService);
  private activityConfigService = inject(ActivityConfigService);
  private toastService = inject(ToastService);

  currentUser = this.authService.currentUser;

  courseId!: number;
  course = signal<Course | null>(null);
  currentUnit = signal<Unit | null>(null);
  currentStory = signal<Story | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  enrollmentId = signal<number | null>(null);
  completedStories = signal<Set<number>>(new Set());
  progressRecords = signal<Map<number, Progress>>(new Map());

  // Control del reproductor de audio
  isPlaying = signal<boolean>(false);
  currentSpeed = signal<'slow' | 'normal'>('slow');
  audioElement: HTMLAudioElement | null = null;

  // Activity modal state
  showActivityModal = signal<boolean>(false);
  currentStoryQuestions = signal<Question[]>([]);
  currentProgressId = signal<number | null>(null);

  // Sequential activity orchestrator
  activityConfigs = signal<ActivityConfig[]>([]);
  currentActivityIndex = signal<number>(0);
  currentActivityType = signal<string | null>(null);
  showContinueDialog = signal<boolean>(false);

  // Modal visibility signals
  showFlashcardModal = signal<boolean>(false);
  showMatchingModal = signal<boolean>(false);
  showListenRepeatModal = signal<boolean>(false);

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    // Obtener el ID del curso de la URL
    this.route.params.subscribe(params => {
      this.courseId = +params['courseId'];
      this.loadEnrollmentAndCourse();
    });
  }

  loadEnrollmentAndCourse(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    // Primero obtener el enrollment
    this.enrollmentService.getMyCourses().subscribe({
      next: (enrollments) => {
        const enrollment = enrollments.find(e => e.courseId === this.courseId);
        if (!enrollment) {
          this.errorMessage.set('No estás inscrito en este curso');
          this.isLoading.set(false);
          return;
        }

        this.enrollmentId.set(enrollment.id);

        // Cargar progreso
        this.loadProgress(enrollment.id);

        // Luego cargar el curso
        this.loadCourse();
      },
      error: (error) => {
        console.error('Error loading enrollment:', error);
        this.errorMessage.set('Error al cargar la inscripción');
        this.isLoading.set(false);
      }
    });
  }

  loadProgress(enrollmentId: number): void {
    this.enrollmentService.getProgress(enrollmentId).subscribe({
      next: (progress) => {
        const completed = new Set<number>();
        const records = new Map<number, Progress>();

        progress.forEach(p => {
          records.set(p.storyId, p);
          if (p.completed) {
            completed.add(p.storyId);
          }
        });

        this.completedStories.set(completed);
        this.progressRecords.set(records);
      },
      error: (error) => {
        console.error('Error loading progress:', error);
      }
    });
  }

  loadCourse(): void {
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

    // Actualizar la unidad actual basándose en la historia seleccionada
    const unit = this.getUnitByStory(story);
    if (unit) {
      this.currentUnit.set(unit);
    }
  }

  getUnitByStory(story: Story): Unit | null {
    const course = this.course();
    if (!course || !course.units) return null;

    return course.units.find(u =>
      u.stories?.some(s => s.id === story.id)
    ) || null;
  }

  // Navigation between units
  canGoPreviousUnit(): boolean {
    const course = this.course();
    const currentUnit = this.currentUnit();
    if (!course || !course.units || !currentUnit) return false;

    const currentIndex = course.units.findIndex(u => u.id === currentUnit.id);
    return currentIndex > 0;
  }

  canGoNextUnit(): boolean {
    const course = this.course();
    const currentUnit = this.currentUnit();
    if (!course || !course.units || !currentUnit) return false;

    const currentIndex = course.units.findIndex(u => u.id === currentUnit.id);
    return currentIndex < course.units.length - 1;
  }

  goToPreviousUnit(): void {
    const course = this.course();
    const currentUnit = this.currentUnit();
    if (!course || !course.units || !currentUnit) return;

    const currentIndex = course.units.findIndex(u => u.id === currentUnit.id);
    if (currentIndex > 0) {
      const previousUnit = course.units[currentIndex - 1];
      this.currentUnit.set(previousUnit);

      // Seleccionar la primera historia de la unidad anterior
      if (previousUnit.stories && previousUnit.stories.length > 0) {
        this.selectStory(previousUnit.stories[0]);
      }
    }
  }

  goToNextUnit(): void {
    const course = this.course();
    const currentUnit = this.currentUnit();
    if (!course || !course.units || !currentUnit) return;

    const currentIndex = course.units.findIndex(u => u.id === currentUnit.id);
    if (currentIndex < course.units.length - 1) {
      const nextUnit = course.units[currentIndex + 1];
      this.currentUnit.set(nextUnit);

      // Seleccionar la primera historia de la siguiente unidad
      if (nextUnit.stories && nextUnit.stories.length > 0) {
        this.selectStory(nextUnit.stories[0]);
      }
    }
  }

  togglePlayPause(): void {
    const story = this.currentStory();
    if (!story) return;

    const audioUrl = this.currentSpeed() === 'slow' ? story.audioSlowUrl : story.audioNormalUrl;

    if (!audioUrl) {
      this.toastService.warning('Audio no disponible para esta historia');
      return;
    }

    if (!this.audioElement) {
      // Crear nuevo elemento de audio
      this.audioElement = new Audio(audioUrl);

      this.audioElement.addEventListener('ended', () => {
        this.isPlaying.set(false);
      });

      this.audioElement.addEventListener('error', () => {
        this.toastService.error('Error al cargar el audio');
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
    const enrollmentId = this.enrollmentId();

    if (!story || !enrollmentId) return;

    // Verificar si ya está completada
    if (this.isStoryCompleted(story.id)) {
      this.toastService.info('Esta historia ya está marcada como completada');
      return;
    }

    if (confirm('¿Has terminado de escuchar la historia?')) {
      this.enrollmentService.markStoryCompleted(enrollmentId, story.id).subscribe({
        next: (progress) => {
          // Agregar a la lista de completadas
          const completed = new Set(this.completedStories());
          completed.add(story.id);
          this.completedStories.set(completed);

          // Set progress ID and start sequential activities
          this.currentProgressId.set(progress.id);
          this.loadActivityConfigsAndStart(story.id);
        },
        error: (error) => {
          console.error('Error marking story as completed:', error);
          this.toastService.error('Error al marcar la historia como completada');
        }
      });
    }
  }

  loadQuestionsForStory(storyId: number): void {
    this.questionService.getQuestionsByStory(storyId).subscribe({
      next: (questions) => {
        if (questions.length > 0) {
          this.currentStoryQuestions.set(questions);
          this.showActivityModal.set(true);
        } else {
          this.toastService.success('¡Historia completada! No hay actividades para esta historia.');
        }
      },
      error: (error) => {
        console.error('Error loading questions:', error);
        this.toastService.error('Error al cargar las actividades');
      }
    });
  }

  onActivitiesCompleted(success: boolean): void {
    if (success) {
      this.toastService.success('¡Excelente! Has completado todas las actividades correctamente.');
      this.showActivityModal.set(false);
      this.currentStoryQuestions.set([]);
      this.currentProgressId.set(null);
    }
  }

  onActivityModalClose(): void {
    this.showActivityModal.set(false);
    this.currentStoryQuestions.set([]);
    this.currentProgressId.set(null);
  }

  isStoryCompleted(storyId: number): boolean {
    return this.completedStories().has(storyId);
  }

  // ===== HELPER METHODS FOR PROGRESS VISUALIZATION =====

  getProgressForStory(storyId: number): Progress | undefined {
    return this.progressRecords().get(storyId);
  }

  isStoryFullyCompleted(storyId: number): boolean {
    const progress = this.getProgressForStory(storyId);
    return (progress?.completed && progress?.activitiesCompleted) || false;
  }

  getUnitProgress(unit: Unit): number {
    const totalStories = unit.stories?.length || 0;
    if (totalStories === 0) return 0;

    const completedCount = unit.stories?.filter(s =>
      this.completedStories().has(s.id)
    ).length || 0;

    return Math.round((completedCount / totalStories) * 100);
  }

  getUnitCompletionText(unit: Unit): string {
    const completed = unit.stories?.filter(s =>
      this.completedStories().has(s.id)
    ).length || 0;
    const total = unit.stories?.length || 0;
    return `${completed}/${total}`;
  }

  getCurrentStoryProgress(): {
    storyCompleted: boolean;
    activitiesCompleted: boolean;
    percentage: number;
    steps: { label: string; completed: boolean }[];
  } {
    const story = this.currentStory();
    if (!story) {
      return {
        storyCompleted: false,
        activitiesCompleted: false,
        percentage: 0,
        steps: []
      };
    }

    const storyCompleted = this.isStoryCompleted(story.id);
    const progress = this.getProgressForStory(story.id);
    const activitiesCompleted = progress?.activitiesCompleted || false;

    const steps = [
      { label: 'Historia escuchada', completed: storyCompleted },
      { label: 'Actividades completadas', completed: activitiesCompleted }
    ];

    const completedSteps = steps.filter(s => s.completed).length;
    const percentage = Math.round((completedSteps / steps.length) * 100);

    return { storyCompleted, activitiesCompleted, percentage, steps };
  }

  getCurrentUnit(): Unit | null {
    const story = this.currentStory();
    if (!story) return null;

    const course = this.course();
    if (!course || !course.units) return null;

    return course.units.find(u =>
      u.stories?.some(s => s.id === story.id)
    ) || null;
  }

  // ===== SEQUENTIAL ACTIVITY ORCHESTRATOR =====

  loadActivityConfigsAndStart(storyId: number): void {
    this.activityConfigService.getConfigsByStory(storyId).subscribe({
      next: (configs) => {
        // Filter only enabled activities and sort by order
        const enabled = configs.filter(c => c.isEnabled).sort((a, b) => a.order - b.order);
        this.activityConfigs.set(enabled);
        this.currentActivityIndex.set(0);

        // Start first activity
        if (enabled.length > 0) {
          this.showActivity(enabled[0].activityType);
        }
      },
      error: (error) => console.error('Error loading activity configs:', error)
    });
  }

  showActivity(activityType: string): void {
    this.currentActivityType.set(activityType);

    switch (activityType) {
      case 'questions':
        this.loadQuestionsForStory(this.currentStory()!.id);
        this.showActivityModal.set(true);
        break;
      case 'flashcards':
        this.checkAndShowFlashcards();
        break;
      case 'matching':
        this.checkAndShowMatching();
        break;
      case 'listen_repeat':
        this.checkAndShowListenRepeat();
        break;
    }
  }

  checkAndShowFlashcards(): void {
    const unitId = this.getCurrentUnit()?.id;
    if (!unitId) {
      this.skipCurrentActivity();
      return;
    }

    // Check if vocabulary exists for this unit
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: (vocabulary) => {
        if (vocabulary && vocabulary.length > 0) {
          this.showFlashcardModal.set(true);
        } else {
          console.log('No flashcards available, skipping...');
          this.skipCurrentActivity();
        }
      },
      error: (error) => {
        console.error('Error checking flashcards:', error);
        this.skipCurrentActivity();
      }
    });
  }

  checkAndShowMatching(): void {
    const unitId = this.getCurrentUnit()?.id;
    if (!unitId) {
      this.skipCurrentActivity();
      return;
    }

    // Check if vocabulary exists for matching
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: (vocabulary) => {
        if (vocabulary && vocabulary.length > 0) {
          this.showMatchingModal.set(true);
        } else {
          console.log('No matching activity available, skipping...');
          this.skipCurrentActivity();
        }
      },
      error: (error) => {
        console.error('Error checking matching:', error);
        this.skipCurrentActivity();
      }
    });
  }

  checkAndShowListenRepeat(): void {
    const storyId = this.currentStory()?.id;
    if (!storyId) {
      this.skipCurrentActivity();
      return;
    }

    // Check if repetition activities exist
    this.repetitionActivityService.getActivitiesByStory(storyId).subscribe({
      next: (activities) => {
        if (activities && activities.length > 0) {
          this.showListenRepeatModal.set(true);
        } else {
          console.log('No listen & repeat activities available, skipping...');
          this.skipCurrentActivity();
        }
      },
      error: (error) => {
        console.error('Error checking listen & repeat:', error);
        this.skipCurrentActivity();
      }
    });
  }

  skipCurrentActivity(): void {
    // Automatically skip to next activity
    const nextIndex = this.currentActivityIndex() + 1;
    const configs = this.activityConfigs();

    if (nextIndex < configs.length) {
      // More activities pending, skip to next
      this.currentActivityIndex.set(nextIndex);
      this.showActivity(configs[nextIndex].activityType);
    } else {
      // All activities completed (or skipped)
      this.onAllActivitiesCompleted();
    }
  }

  onActivityCompleted(activityType: string): void {
    // Close current modal
    this.closeAllModals();

    // Increment index
    const nextIndex = this.currentActivityIndex() + 1;
    const configs = this.activityConfigs();

    if (nextIndex < configs.length) {
      // More activities pending, show continue dialog
      this.showContinueDialog.set(true);
    } else {
      // All activities completed
      this.onAllActivitiesCompleted();
    }
  }

  closeAllModals(): void {
    console.log('Closing all modals');
    this.showActivityModal.set(false);
    this.showFlashcardModal.set(false);
    this.showMatchingModal.set(false);
    this.showListenRepeatModal.set(false);
    this.showContinueDialog.set(false);

    // Reset orchestrator state when manually closing
    this.activityConfigs.set([]);
    this.currentActivityIndex.set(0);
    this.currentActivityType.set(null);
  }

  continueToNextActivity(): void {
    this.showContinueDialog.set(false);
    const nextIndex = this.currentActivityIndex() + 1;
    this.currentActivityIndex.set(nextIndex);

    const nextActivity = this.activityConfigs()[nextIndex];
    this.showActivity(nextActivity.activityType);
  }

  skipNextActivity(): void {
    this.showContinueDialog.set(false);
    // Student can resume later
  }

  resumeActivities(story: Story): void {
    // Resume activities from where student left off
    const progressId = this.getProgressForStory(story.id)?.id;
    if (!progressId) {
      this.toastService.error('No se encontró progreso para esta historia');
      return;
    }

    this.currentProgressId.set(progressId);
    this.loadActivityConfigsAndStart(story.id);
  }

  hasPendingActivities(storyId: number): boolean {
    const progress = this.getProgressForStory(storyId);
    return progress?.completed === true && progress?.activitiesCompleted === false;
  }

  getPendingActivitiesCount(storyId: number): number {
    // This would require checking which activities are actually pending
    // For now, return a simple indicator
    return this.hasPendingActivities(storyId) ? 1 : 0;
  }

  onAllActivitiesCompleted(): void {
    // Update progress.activitiesCompleted
    const progressId = this.currentProgressId();
    if (!progressId) return;

    // TODO: Call endpoint to update activitiesCompleted
    console.log('All activities completed for progress:', progressId);

    // Reload progress
    const enrollmentId = this.enrollmentId();
    if (enrollmentId) {
      this.loadProgress(enrollmentId);
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
