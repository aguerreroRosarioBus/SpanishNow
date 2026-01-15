import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Unit, Story, Question, Progress, Enrollment } from '../../../core/models/course.model';
import { NavigationItem } from './navigation-item.model';
import { NavigationService } from './navigation.service';
import { ActivityModalComponent } from '../activity-modal/activity-modal.component';
import { FlashcardModalComponent } from '../flashcard-modal/flashcard-modal.component';
import { MatchingModalComponent } from '../matching-modal/matching-modal.component';
import { ListenRepeatModalComponent } from '../listen-repeat-modal/listen-repeat-modal.component';

@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [
    CommonModule,
    ActivityModalComponent,
    FlashcardModalComponent,
    MatchingModalComponent,
    ListenRepeatModalComponent
  ],
  providers: [NavigationService],
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
  private navigationService = inject(NavigationService);
  private toastService = inject(ToastService);

  currentUser = this.authService.currentUser;

  courseId!: number;
  course = signal<Course | null>(null);
  currentUnit = signal<Unit | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  currentEnrollment = signal<Enrollment | null>(null);
  completedStories = signal<Set<number>>(new Set());
  progressRecords = signal<Progress[]>([]);

  // Navigation state
  navigationItems = signal<NavigationItem[]>([]);
  currentItemIndex = signal<number>(0);
  currentItem = computed(() => {
    const items = this.navigationItems();
    const index = this.currentItemIndex();
    return items[index] || null;
  });

  // Navigation computed properties
  canGoPrevious = computed(() => this.currentItemIndex() > 0);
  canGoNext = computed(() => this.currentItemIndex() < this.navigationItems().length - 1);

  // Audio player
  isPlaying = signal<boolean>(false);
  currentSpeed = signal<'slow' | 'normal'>('slow');
  audioElement: HTMLAudioElement | null = null;

  // Modal visibility
  showActivityModal = signal<boolean>(false);
  currentStoryQuestions = signal<Question[]>([]);
  currentProgressId = signal<number | null>(null);
  showFlashcardModal = signal<boolean>(false);
  showMatchingModal = signal<boolean>(false);
  showListenRepeatModal = signal<boolean>(false);
  listenRepeatStoryId = signal<number | undefined>(undefined);

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.route.params.subscribe(params => {
      this.courseId = +params['courseId'];
      this.loadEnrollmentAndCourse();
    });
  }

  loadEnrollmentAndCourse(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.enrollmentService.getMyCourses().subscribe({
      next: (enrollments) => {
        const enrollment = enrollments.find(e => e.courseId === this.courseId);
        if (!enrollment) {
          this.errorMessage.set('No estás inscrito en este curso');
          this.isLoading.set(false);
          return;
        }

        this.currentEnrollment.set(enrollment);

        // Extract progress
        const completed = new Set<number>();
        (enrollment.progress || []).forEach(p => {
          if (p.completed) {
            completed.add(p.storyId);
          }
        });
        this.completedStories.set(completed);
        this.progressRecords.set(enrollment.progress || []);

        // Load course
        this.loadCourse();
      },
      error: (error) => {
        console.error('Error loading enrollment:', error);
        this.errorMessage.set('Error al cargar la inscripción');
        this.isLoading.set(false);
      }
    });
  }

  loadCourse(): void {
    this.courseService.getCourse(this.courseId).subscribe({
      next: (course) => {
        this.course.set(course);

        // Select first unit and build navigation
        if (course.units && course.units.length > 0) {
          this.selectUnit(course.units[0]);
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

  selectUnit(unit: Unit): void {
    this.currentUnit.set(unit);
    this.buildNavigationItems();

    // Auto-select first accessible item
    const items = this.navigationItems();
    const firstAccessible = items.findIndex(item => item.canAccess);
    if (firstAccessible >= 0) {
      this.currentItemIndex.set(firstAccessible);
      this.loadCurrentItem();
    }
  }

  buildNavigationItems(): void {
    const unit = this.currentUnit();
    const enrollment = this.currentEnrollment();
    const progress = this.progressRecords();

    console.log('[StoryPlayer] Building navigation items:', {
      unit: unit?.id,
      hasActivityConfigs: !!unit?.activityConfigs,
      activityConfigsCount: unit?.activityConfigs?.length || 0,
      enrollment: enrollment?.id,
      progressCount: progress?.length || 0
    });

    if (!unit || !enrollment) {
      this.navigationItems.set([]);
      return;
    }

    const items = this.navigationService.buildNavigationItems(
      unit,
      progress,
      enrollment
    );

    console.log('[StoryPlayer] Built navigation items:', items);
    this.navigationItems.set(items);
  }

  // Navigation methods
  goToPrevious(): void {
    if (this.canGoPrevious()) {
      this.currentItemIndex.update(i => i - 1);
      this.loadCurrentItem();
    }
  }

  goToNext(): void {
    if (this.canGoNext()) {
      this.currentItemIndex.update(i => i + 1);
      this.loadCurrentItem();
    }
  }

  selectItem(item: NavigationItem): void {
    if (!item.canAccess) {
      this.toastService.warning('Este contenido aún no está disponible');
      return;
    }

    const index = this.navigationItems().findIndex(i => i.id === item.id);
    if (index >= 0) {
      this.currentItemIndex.set(index);
      this.loadCurrentItem();
    }
  }

  loadCurrentItem(): void {
    const item = this.currentItem();
    if (!item) return;

    // Stop any playing audio
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
      this.isPlaying.set(false);
    }

    if (item.type === 'story') {
      // Story already loaded in item.story
    } else if (item.type === 'activity') {
      // Open activity modal automatically
      this.openActivityModal(item);
    }
  }

  openActivityModal(item: NavigationItem): void {
    if (!item.unitId || !item.activityType) return;

    switch (item.activityType) {
      case 'questions':
        this.showQuestionsActivity(item.unitId);
        break;
      case 'flashcards':
        this.showFlashcardsActivity(item.unitId);
        break;
      case 'matching':
        this.showMatchingActivity(item.unitId);
        break;
      case 'listen_repeat':
        this.showListenRepeatActivity(item.unitId);
        break;
    }
  }

  // Activity methods - now work at UNIT level
  showQuestionsActivity(unitId: number): void {
    const unit = this.currentUnit();
    console.log('[showQuestionsActivity] Unit:', unit);
    console.log('[showQuestionsActivity] Stories:', unit?.stories);

    if (!unit || !unit.stories) return;

    // Collect ALL questions from ALL stories in the unit
    const allQuestions: Question[] = [];
    unit.stories.forEach(story => {
      console.log('[showQuestionsActivity] Story:', story.title, 'Questions:', story.questions);
      if (story.questions) {
        allQuestions.push(...story.questions);
      }
    });

    console.log('[showQuestionsActivity] Total questions:', allQuestions.length, allQuestions);

    if (allQuestions.length > 0) {
      // Find a progressId from any story in the unit (use first story's progress)
      const firstStory = unit.stories[0];
      const progressRecord = this.progressRecords().find(p => p.storyId === firstStory.id);

      console.log('[showQuestionsActivity] First story:', firstStory.id, 'Progress:', progressRecord);

      if (progressRecord) {
        this.currentProgressId.set(progressRecord.id);
      } else {
        console.warn('[showQuestionsActivity] No progress record found for story', firstStory.id);
        this.currentProgressId.set(null);
      }

      this.currentStoryQuestions.set(allQuestions);
      this.showActivityModal.set(true);
    } else {
      this.toastService.info('No hay preguntas disponibles para esta unidad');
    }
  }

  showFlashcardsActivity(unitId: number): void {
    console.log('[showFlashcardsActivity] Called with unitId:', unitId);
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: (vocabulary) => {
        console.log('[showFlashcardsActivity] Vocabulary received:', vocabulary);
        if (vocabulary && vocabulary.length > 0) {
          console.log('[showFlashcardsActivity] Setting showFlashcardModal to true');
          this.showFlashcardModal.set(true);
        } else {
          console.log('[showFlashcardsActivity] No vocabulary found');
          this.toastService.info('No hay flashcards disponibles para esta unidad');
        }
      },
      error: (error) => {
        console.error('[showFlashcardsActivity] Error loading flashcards:', error);
        this.toastService.error('Error al cargar las flashcards');
      }
    });
  }

  showMatchingActivity(unitId: number): void {
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: (vocabulary) => {
        if (vocabulary && vocabulary.length > 0) {
          this.showMatchingModal.set(true);
        } else {
          this.toastService.info('No hay actividad de emparejamiento disponible');
        }
      },
      error: (error) => {
        console.error('Error loading matching:', error);
        this.toastService.error('Error al cargar la actividad');
      }
    });
  }

  showListenRepeatActivity(unitId: number): void {
    const unit = this.currentUnit();
    if (!unit || !unit.stories) return;

    // Get first story with repetition activities
    // TODO: In the future, combine ALL repetition activities from unit
    const storyWithActivities = unit.stories.find(s =>
      s.repetitionActivities && s.repetitionActivities.length > 0
    );

    if (storyWithActivities) {
      this.listenRepeatStoryId.set(storyWithActivities.id);
      this.showListenRepeatModal.set(true);
    } else {
      this.toastService.info('No hay actividades de escuchar y repetir disponibles');
    }
  }

  // Story completion
  markStoryAsCompleted(): void {
    const item = this.currentItem();
    const enrollment = this.currentEnrollment();

    if (!item || item.type !== 'story' || !item.story || !enrollment) return;

    if (item.completed) {
      this.toastService.info('Esta historia ya está completada');
      return;
    }

    this.enrollmentService.markStoryCompleted(enrollment.id, item.story.id).subscribe({
      next: (progress) => {
        // Update completed stories
        const completed = new Set(this.completedStories());
        completed.add(item.story!.id);
        this.completedStories.set(completed);

        // Update progress records
        const records = [...this.progressRecords()];
        const existingIndex = records.findIndex(p => p.storyId === item.story!.id);
        if (existingIndex >= 0) {
          records[existingIndex] = progress;
        } else {
          records.push(progress);
        }
        this.progressRecords.set(records);

        // Rebuild navigation (to update completed status)
        this.buildNavigationItems();

        this.toastService.success('¡Historia completada!');

        // Auto-advance to next item if available
        if (this.canGoNext()) {
          setTimeout(() => this.goToNext(), 500);
        }
      },
      error: (error) => {
        console.error('Error marking story as completed:', error);
        this.toastService.error('Error al marcar la historia como completada');
      }
    });
  }

  // Activity completion handlers
  onActivityCompleted(activityType: string): void {
    const enrollment = this.currentEnrollment();
    if (!enrollment) return;

    this.enrollmentService.completeUnitActivity(enrollment.id, activityType).subscribe({
      next: (updatedEnrollment) => {
        // Update local enrollment
        this.currentEnrollment.set(updatedEnrollment);

        // Rebuild navigation to update completion status
        this.buildNavigationItems();

        // Close modal
        this.closeAllModals();

        this.toastService.success('¡Actividad completada!');

        // Auto-advance if there's a next item
        if (this.canGoNext()) {
          setTimeout(() => this.goToNext(), 500);
        }
      },
      error: (error) => {
        console.error('Error completing activity:', error);
        this.toastService.error('Error al completar la actividad');
      }
    });
  }

  repeatActivity(item: NavigationItem): void {
    if (item.type !== 'activity' || !item.activityType) return;

    const enrollment = this.currentEnrollment();
    if (!enrollment) return;

    this.enrollmentService.resetUnitActivity(enrollment.id, item.activityType).subscribe({
      next: (updatedEnrollment) => {
        this.currentEnrollment.set(updatedEnrollment);
        this.buildNavigationItems();
        this.toastService.info('Actividad reiniciada. ¡Puedes hacerla de nuevo!');

        // Open the activity
        this.openActivityModal(item);
      },
      error: (error) => {
        console.error('Error resetting activity:', error);
        this.toastService.error('Error al reiniciar la actividad');
      }
    });
  }

  closeAllModals(): void {
    this.showActivityModal.set(false);
    this.showFlashcardModal.set(false);
    this.showMatchingModal.set(false);
    this.showListenRepeatModal.set(false);
  }

  // Audio player
  togglePlayPause(): void {
    const item = this.currentItem();
    if (!item || item.type !== 'story' || !item.story) return;

    const audioUrl = this.currentSpeed() === 'slow'
      ? item.story.audioSlowUrl
      : item.story.audioNormalUrl;

    if (!audioUrl) {
      this.toastService.warning('Audio no disponible para esta historia');
      return;
    }

    if (!this.audioElement) {
      this.audioElement = new Audio(audioUrl);
      this.audioElement.addEventListener('ended', () => this.isPlaying.set(false));
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

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    this.currentSpeed.set(speed);
    this.isPlaying.set(false);

    if (wasPlaying) {
      setTimeout(() => this.togglePlayPause(), 100);
    }
  }

  // Unit navigation
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
      this.selectUnit(course.units[currentIndex - 1]);
    }
  }

  goToNextUnit(): void {
    const course = this.course();
    const currentUnit = this.currentUnit();
    if (!course || !course.units || !currentUnit) return;

    const currentIndex = course.units.findIndex(u => u.id === currentUnit.id);
    if (currentIndex < course.units.length - 1) {
      this.selectUnit(course.units[currentIndex + 1]);
    }
  }

  // Helper methods
  getCompletedItemsCount(): number {
    return this.navigationItems().filter(item => item.completed).length;
  }

  getActivityIcon(activityType: string): string {
    return this.navigationService.getActivityIcon(activityType);
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
