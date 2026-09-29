import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ProgressService } from '../../../core/services/progress.service';
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
import { TooltipDisplayComponent } from '../../../shared/components/tooltip-display/tooltip-display.component';
import { StudentLesson, StudentLessonBlock, StudentLessonService, StudentAnswerResult } from '../../../core/services/student-lesson.service';

@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [
    CommonModule,
    ActivityModalComponent,
    FlashcardModalComponent,
    MatchingModalComponent,
    ListenRepeatModalComponent,
    TooltipDisplayComponent
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
  private progressService = inject(ProgressService);
  private questionService = inject(QuestionService);
  private vocabularyService = inject(VocabularyService);
  private repetitionActivityService = inject(RepetitionActivityService);
  private navigationService = inject(NavigationService);
  private toastService = inject(ToastService);
  private studentLessonService = inject(StudentLessonService);

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

  // TPRS lesson assigned to this student/story. The API keeps the revision stable.
  studentLesson = signal<StudentLesson | null>(null);
  lessonLoading = signal(false);
  lessonError = signal('');
  activeLessonBlocks = computed(() => (this.studentLesson()?.blocks || [])
    .filter(block => block.active && block.phase !== 'later' && !['flashcards', 'matching', 'listen_repeat'].includes(block.type))
    .slice().sort((a, b) => a.position - b.position));
  reinforcementBlocks = computed(() => (this.studentLesson()?.blocks || [])
    .filter(block => block.active && block.phase === 'after' && ['flashcards', 'matching', 'listen_repeat'].includes(block.type))
    .slice().sort((a, b) => a.position - b.position));
  hasOptionalReinforcements = computed(() => this.reinforcementBlocks().length > 0);
  currentLessonBlock = computed(() => {
    const blocks = this.activeLessonBlocks();
    const lastBlockKey = this.studentLesson()?.progress.lastBlockKey;
    return blocks.find(block => block.blockKey === lastBlockKey) ||
      (this.reinforcementBlocks().some(block => block.blockKey === lastBlockKey) ? blocks[blocks.length - 1] : null) || null;
  });
  currentLessonBlockIndex = computed(() => this.activeLessonBlocks().findIndex(block => block.blockKey === this.currentLessonBlock()?.blockKey));
  answerText = signal('');
  answerResult = signal<StudentAnswerResult | null>(null);
  reinforcementOpen = signal<string | null>(null);
  activeReinforcementBlock = signal<StudentLessonBlock | null>(null);
  narrativeCompleted = computed(() => Boolean(this.studentLesson()?.progress.narrativeCompleted));

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
        (enrollment.lessonProgress || []).forEach(p => {
          if (p.narrativeCompleted) completed.add(p.storyId);
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
      storiesCount: unit?.stories?.length || 0,
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
      enrollment,
      this.completedStories()
    ).filter(item => item.type === 'story');

    // TPRS completion lives in LessonProgress, not the legacy Enrollment progress.
    // Merge its locally known completion into navigation without writing a legacy record.
    const completedIds = new Set([...this.completedStories()]);
    let previousStoryCompleted = true;
    for (const item of items) {
      if (item.type === 'story') {
        item.completed = item.completed || completedIds.has(item.story!.id);
        item.canAccess = previousStoryCompleted;
        previousStoryCompleted = item.completed;
      } else if (item.storyId) {
        item.canAccess = completedIds.has(item.storyId) || (progress || []).some(record => record.storyId === item.storyId && record.completed);
      }
    }

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
      this.loadStudentLesson(item.story!.id);
    } else if (item.type === 'activity') {
      this.studentLesson.set(null);
      // Open activity modal automatically
      this.openActivityModal(item);
    }
  }

  private loadStudentLesson(storyId: number): void {
    this.lessonLoading.set(true);
    this.lessonError.set('');
    this.answerResult.set(null);
    this.studentLessonService.getStory(storyId).subscribe({
      next: lesson => {
        this.studentLesson.set(lesson);
        this.lessonLoading.set(false);
        if (lesson.progress.narrativeCompleted) this.markLessonStoryCompleteLocally(lesson.storyId);
        const blocks = lesson.blocks.filter(block => block.active && block.phase !== 'later').sort((a, b) => a.position - b.position);
        if (!blocks.length) {
          this.lessonError.set('Esta revisión no contiene bloques disponibles.');
          return;
        }
        if (!lesson.progress.lastBlockKey) this.persistCurrentBlock(blocks[0]);
      },
      error: error => {
        console.error('Error loading assigned lesson:', error);
        this.lessonError.set(error?.error?.error || 'No se pudo cargar la lección publicada. Intenta nuevamente.');
        this.lessonLoading.set(false);
      }
    });
  }

  retryLoadLesson(): void {
    const storyId = this.currentItem()?.story?.id;
    if (storyId) this.loadStudentLesson(storyId);
  }

  private persistCurrentBlock(block: StudentLessonBlock): void {
    const lesson = this.studentLesson();
    if (!lesson) return;
    this.audioElement?.pause();
    this.audioElement = null;
    this.isPlaying.set(false);
    this.studentLessonService.setCurrentBlock(lesson.progress.id, block.blockKey).subscribe({
      next: progress => {
        this.studentLesson.update(current => current ? { ...current, progress: { ...current.progress, lastBlockKey: progress.lastBlockKey, narrativeCompleted: progress.narrativeCompleted } } : current);
        this.answerText.set('');
        this.answerResult.set(null);
      },
      error: error => {
        this.lessonError.set(error?.error?.error || 'No se pudo guardar tu avance. Vuelve a intentar.');
      }
    });
  }

  goToLessonBlock(offset: number): void {
    const index = this.currentLessonBlockIndex() + offset;
    const block = this.activeLessonBlocks()[index];
    if (block) this.persistCurrentBlock(block);
  }

  submitLessonAnswer(): void {
    const lesson = this.studentLesson();
    const block = this.currentLessonBlock();
    const answer = this.answerText().trim();
    if (!lesson || !block?.questionId || !answer) return;
    this.lessonError.set('');
    this.studentLessonService.answer(lesson.progress.id, block.blockKey, block.questionId, answer).subscribe({
      next: result => {
        this.answerResult.set(result);
        this.studentLesson.update(current => current ? { ...current, progress: {
          ...current.progress,
          answers: [...current.progress.answers, { blockKey: result.blockKey, questionId: result.questionId, studentAnswer: answer, isCorrect: result.isCorrect, attempt: result.attempt }]
        } } : current);
      },
      error: error => this.lessonError.set(error?.error?.error || 'No se pudo comprobar la respuesta. Intenta nuevamente.')
    });
  }

  completeNarrative(): void {
    const lesson = this.studentLesson();
    if (!lesson) return;
    this.studentLessonService.completeNarrative(lesson.progress.id).subscribe({
      next: () => {
        this.studentLesson.update(current => current ? { ...current, progress: { ...current.progress, narrativeCompleted: true } } : current);
        this.markLessonStoryCompleteLocally(lesson.storyId);
        this.toastService.success('Lectura completada. Los refuerzos son opcionales.');
      },
      error: error => this.lessonError.set(error?.error?.error || 'Completa primero los bloques narrativos.')
    });
  }

  toggleReinforcement(block: StudentLessonBlock): void {
    this.reinforcementOpen.set(this.reinforcementOpen() === block.blockKey ? null : block.blockKey);
  }

  openReinforcement(block: StudentLessonBlock): void {
    const unit = this.currentUnit();
    const storyId = this.studentLesson()?.storyId;
    if (!unit || !storyId) return;
    this.activeReinforcementBlock.set(block);
    if (block.type === 'flashcards') this.showFlashcardsActivity(unit.id);
    else if (block.type === 'matching') this.showMatchingActivity(unit.id);
    else if (block.type === 'listen_repeat') this.showListenRepeatActivity(storyId);
  }

  onReinforcementModalCompleted(): void {
    const block = this.activeReinforcementBlock();
    if (block) this.markReinforcementComplete(block);
  }

  markReinforcementComplete(block: StudentLessonBlock): void {
    const lesson = this.studentLesson();
    if (!lesson) return;
    this.studentLessonService.completeReinforcement(lesson.progress.id, block.blockKey).subscribe({
      next: () => {
        this.studentLesson.update(current => current ? { ...current, progress: {
          ...current.progress,
          reinforcements: [...current.progress.reinforcements.filter(item => item.blockKey !== block.blockKey), { blockKey: block.blockKey, completed: true }]
        } } : current);
        this.closeAllModals();
        this.toastService.success('Refuerzo completado para esta historia.');
      },
      error: error => this.lessonError.set(error?.error?.error || 'No se pudo guardar el refuerzo.')
    });
  }

  isReinforcementComplete(blockKey: string): boolean {
    return Boolean(this.studentLesson()?.progress.reinforcements.some(item => item.blockKey === blockKey && item.completed));
  }

  setAnswer(value: string): void { this.answerText.set(value); }

  lessonAudioUrl(): string | null {
    const story = this.studentLesson()?.story;
    return this.currentSpeed() === 'slow' ? story?.audioSlowUrl || null : story?.audioNormalUrl || null;
  }

  switchLessonAudioSpeed(speed: 'slow' | 'normal'): void {
    const wasPlaying = this.isPlaying();
    if (this.audioElement) { this.audioElement.pause(); this.audioElement = null; }
    this.currentSpeed.set(speed);
    this.isPlaying.set(false);
    if (wasPlaying) setTimeout(() => this.toggleLessonAudio(), 100);
  }

  private markLessonStoryCompleteLocally(storyId: number): void {
    const completed = new Set(this.completedStories());
    completed.add(storyId);
    this.completedStories.set(completed);
    this.buildNavigationItems();
  }

  toggleLessonAudio(blockAudioUrl?: string | null): void {
    const url = blockAudioUrl || this.lessonAudioUrl();
    if (!url) { this.toastService.warning('Audio no disponible para esta historia'); return; }
    if (!this.audioElement || this.audioElement.src !== new URL(url, document.baseURI).href) {
      this.audioElement?.pause();
      this.audioElement = new Audio(url);
      this.audioElement.addEventListener('ended', () => this.isPlaying.set(false));
      this.audioElement.addEventListener('error', () => { this.lessonError.set('No se pudo cargar el audio.'); this.isPlaying.set(false); });
    }
    if (this.isPlaying()) { this.audioElement.pause(); this.isPlaying.set(false); }
    else { this.audioElement.play().then(() => this.isPlaying.set(true)).catch(() => this.lessonError.set('No se pudo iniciar el audio.')); }
  }

  openActivityModal(item: NavigationItem): void {
    if (!item.storyId || !item.activityType) return;

    switch (item.activityType) {
      case 'questions':
        this.showQuestionsActivity(item.storyId);
        break;
      case 'flashcards':
        this.showFlashcardsActivity(item.unitId!); // Flashcards still at unit level
        break;
      case 'matching':
        this.showMatchingActivity(item.unitId!); // Matching still at unit level
        break;
      case 'listen_repeat':
        this.showListenRepeatActivity(item.storyId);
        break;
    }
  }

  // Activity methods - Questions now work at STORY level
  showQuestionsActivity(storyId: number): void {
    const unit = this.currentUnit();
    if (!unit || !unit.stories) return;

    // Find the specific story
    const story = unit.stories.find(s => s.id === storyId);
    if (!story) {
      this.toastService.error('Historia no encontrada');
      return;
    }

    // Get questions only from THIS story
    const questions = story.questions || [];

    if (questions.length > 0) {
      // Find or create progress record for THIS story
      const progressRecord = this.progressRecords().find(p => p.storyId === storyId);

      if (progressRecord) {
        // Progress record exists, use it
        this.currentProgressId.set(progressRecord.id);
        this.currentStoryQuestions.set(questions);
        this.showActivityModal.set(true);
      } else {
        // No progress record, create one
        const enrollment = this.currentEnrollment();
        if (!enrollment) {
          this.toastService.error('Error: No se encontró la inscripción');
          return;
        }

        this.progressService.markStoryCompleted(enrollment.id, storyId).subscribe({
          next: (newProgress) => {
            this.currentProgressId.set(newProgress.id);
            this.progressRecords.update(records => [...records, newProgress]);
            this.currentStoryQuestions.set(questions);
            this.showActivityModal.set(true);
          },
          error: (error) => {
            console.error('Error creating progress record:', error);
            this.toastService.error('Error al crear el registro de progreso');
          }
        });
      }
    } else {
      this.toastService.info('No hay preguntas disponibles para esta historia');
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

  showListenRepeatActivity(storyId: number): void {
    const unit = this.currentUnit();
    if (!unit || !unit.stories) return;

    // Find the specific story
    const story = unit.stories.find(s => s.id === storyId);
    if (!story) {
      this.toastService.error('Historia no encontrada');
      return;
    }

    // Check if this story has repetition activities
    if (story.repetitionActivities && story.repetitionActivities.length > 0) {
      this.listenRepeatStoryId.set(story.id);
      this.showListenRepeatModal.set(true);
    } else {
      this.toastService.info('No hay actividades de escuchar y repetir disponibles para esta historia');
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

    // Mark granular progress if we have a progressId
    const progressId = this.currentProgressId();
    if (progressId && activityType === 'questions') {
      this.progressService.markQuestionsCompleted(progressId).subscribe({
        next: () => {
          console.log('Granular progress updated: questionsCompleted =', true);
        },
        error: (error) => {
          console.error('Error updating granular progress:', error);
          // Continue even if granular tracking fails
        }
      });
    }

    // Complete unit-level activity tracking
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
    this.activeReinforcementBlock.set(null);
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
