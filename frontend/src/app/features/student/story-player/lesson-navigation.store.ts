import { Injectable, computed, inject, signal } from '@angular/core';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Enrollment, QuizProgress, Unit } from '../../../core/models/course.model';
import { NextCourseOffer } from '../../../core/models/sales.model';
import { NavigationItem } from './navigation-item.model';
import { availableOnLabel, contentLockedFrom } from '../../../shared/utils/release-date';

/** Estado de navegación del reproductor: curso, unidad, historias del menú y regla de acceso. */
@Injectable()
export class LessonNavigationStore {
  private courseService = inject(CourseService);
  private enrollmentService = inject(EnrollmentService);
  private toastService = inject(ToastService);

  course = signal<Course | null>(null);
  currentUnit = signal<Unit | null>(null);
  enrollment = signal<Enrollment | null>(null);
  isLoading = signal(false);
  errorMessage = signal('');
  completedStories = signal<Set<number>>(new Set());
  /** Mejor resultado de quiz por unidad (viene del progreso y se actualiza al enviar un intento). */
  quizResults = signal<Record<number, { bestScore: number | null; passed: boolean }>>({});
  introSeen = signal(false);
  /** Historia pedida por `?story=` (links de los emails): se abre y se baja a sus comentarios. */
  focusCommentsStoryId = signal<number | null>(null);
  private requestedStoryId: number | null = null;
  /** Curso siguiente de la serie (viene del progreso de la inscripción). */
  nextCourse = signal<NextCourseOffer | null>(null);
  /** Curso terminado: todas las historias leídas y los quizzes de las unidades aprobados. */
  courseFinished = computed(() => {
    const { done, total } = this.courseProgress();
    if (total === 0 || done < total) return false;
    const results = this.quizResults();
    return (this.course()?.units ?? []).every(u => !u.quiz || !!results[u.id]?.passed);
  });

  items = signal<NavigationItem[]>([]);
  currentIndex = signal(0);
  /** Ítem abierto. Un ítem bloqueado por fecha no se abre: el reproductor muestra la pantalla de «Disponible el …». */
  currentItem = computed(() => {
    const item = this.items()[this.currentIndex()] ?? null;
    return item?.locked ? null : item;
  });
  /** La unidad abierta todavía no se liberó (contenido por fechas). */
  currentUnitLocked = computed(() => !!this.currentUnit()?.locked);
  currentUnitAvailableText = computed(() => availableOnLabel(this.currentUnit()?.availableAt));
  currentStoryId = computed(() => this.currentItem()?.story?.id ?? null);
  completedCount = computed(() => this.items().filter(item => item.kind === 'story' && item.completed).length);
  /** Historias de la unidad abierta (sin bienvenida ni quiz). */
  storyItems = computed(() => this.items().filter(item => item.kind === 'story'));
  /** Avance de todo el curso (no solo de la unidad abierta) */
  courseProgress = computed(() => {
    const done = this.completedStories();
    const stories = (this.course()?.units ?? []).flatMap(u => u.stories ?? []);
    return { done: stories.filter(s => done.has(s.id)).length, total: stories.length };
  });

  // Las flechas siguen la misma regla de acceso que el menú lateral (ver navigateTo).
  previousItem = computed(() => this.items()[this.currentIndex() - 1] ?? null);
  nextItem = computed(() => this.items()[this.currentIndex() + 1] ?? null);
  canGoPrevious = computed(() => !!this.previousItem()?.canAccess);
  canGoNext = computed(() => !!this.nextItem()?.canAccess);
  nextBlockedReason = computed(() => {
    const next = this.nextItem();
    if (!next || next.canAccess) return '';
    return next.kind === 'quiz'
      ? 'Completa todas las historias de la unidad para desbloquear el quiz.'
      : 'Completa esta lectura para desbloquear la siguiente historia.';
  });

  private unitIndex = computed(() => {
    const unit = this.currentUnit();
    return unit ? (this.course()?.units ?? []).findIndex(u => u.id === unit.id) : -1;
  });
  /** Posición de la unidad abierta (1-based) y cantidad de unidades, para «UNIDAD 1 DE 3» */
  unitNumber = computed(() => this.unitIndex() + 1);
  unitCount = computed(() => this.course()?.units?.length ?? 0);
  canGoPreviousUnit = computed(() => this.unitIndex() > 0);
  canGoNextUnit = computed(() => {
    const index = this.unitIndex();
    return index >= 0 && index < (this.course()?.units?.length ?? 0) - 1;
  });

  /** Qué sigue al terminar la lección: otra historia, la próxima unidad o volver a los cursos. */
  afterLesson = computed<'story' | 'quiz' | 'unit' | 'courses'>(() => {
    const next = this.nextItem();
    if (next?.canAccess) return next.kind === 'quiz' ? 'quiz' : 'story';
    return this.canGoNextUnit() ? 'unit' : 'courses';
  });

  load(courseId: number, requestedStoryId: number | null = null): void {
    this.requestedStoryId = requestedStoryId;
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.enrollmentService.getMyCourses().subscribe({
      next: enrollments => {
        const enrollment = enrollments.find(e => e.courseId === courseId);
        if (!enrollment) {
          this.errorMessage.set('No estás inscrito en este curso');
          this.isLoading.set(false);
          return;
        }
        this.enrollment.set(enrollment);
        this.completedStories.set(new Set(
          (enrollment.lessonProgress || []).filter(p => p.narrativeCompleted).map(p => p.storyId)
        ));
        this.loadQuizProgress(enrollment.id);
        this.loadCourse(courseId);
      },
      error: error => {
        console.error('Error loading enrollment:', error);
        this.errorMessage.set('Error al cargar la inscripción');
        this.isLoading.set(false);
      }
    });
  }

  /** Resultados de quiz: si falla, los quizzes quedan como pendientes (no bloquea el curso). */
  private loadQuizProgress(enrollmentId: number): void {
    this.enrollmentService.getProgressSummary(enrollmentId).subscribe({
      next: ({ quizzes, next }) => {
        this.nextCourse.set(next);
        this.setQuizProgress(quizzes);
      },
      error: error => console.error('Error loading quiz progress:', error)
    });
  }

  setQuizProgress(quizzes: QuizProgress[]): void {
    const map: Record<number, { bestScore: number | null; passed: boolean }> = {};
    for (const q of quizzes) map[q.unitId] = { bestScore: q.bestScore, passed: q.passed };
    this.quizResults.set(map);
    this.buildItems();
  }

  /** Guarda el mejor resultado tras un intento y actualiza el menú. */
  setQuizResult(unitId: number, result: { bestScore: number; passed: boolean }): void {
    this.quizResults.update(current => ({ ...current, [unitId]: { bestScore: result.bestScore, passed: result.passed } }));
    this.buildItems();
  }

  private loadCourse(courseId: number): void {
    this.courseService.getCourse(courseId).subscribe({
      next: loaded => {
        // El alumno solo ve historias con lección publicada: las de borrador no se pueden abrir
        // y no deben contar para el avance ni bloquear el quiz de la unidad.
        const course = {
          ...loaded,
          units: (loaded.units ?? []).map(unit => ({
            ...unit,
            stories: (unit.stories ?? []).filter(story => story.lessonStatus !== 'draft')
          }))
        };
        this.course.set(course);
        if (course.units && course.units.length > 0) {
          this.selectUnit(course.units.find(u => !u.locked) ?? course.units[0]);
          this.openRequestedStory(course.units);
        }
        this.isLoading.set(false);
      },
      error: error => {
        console.error('Error loading course:', error);
        this.errorMessage.set('Error al cargar el curso');
        this.isLoading.set(false);
      }
    });
  }

  selectUnit(unit: Unit): void {
    this.currentUnit.set(unit);
    this.buildItems();
    const items = this.items();
    // La bienvenida es el punto de partida solo mientras no hay avance: después se retoma desde las historias.
    const skipIntro = items[0]?.kind === 'intro' && (this.introSeen() || this.completedStories().size > 0);
    const first = items.findIndex((item, i) => item.canAccess && !(skipIntro && i === 0));
    if (first >= 0) this.currentIndex.set(first);
  }

  /** Abre la historia de `?story=` si es accesible; si no, queda el comportamiento habitual. */
  private openRequestedStory(units: Unit[]): void {
    const storyId = this.requestedStoryId;
    this.requestedStoryId = null;
    if (storyId === null) return;
    const unit = units.find(u => (u.stories ?? []).some(s => s.id === storyId));
    if (!unit || unit.locked) return;
    const previous = { unit: this.currentUnit(), index: this.currentIndex() };
    this.selectUnit(unit);
    const index = this.items().findIndex(i => i.kind === 'story' && i.story?.id === storyId && i.canAccess);
    if (index < 0) {
      if (previous.unit) { this.selectUnit(previous.unit); this.currentIndex.set(previous.index); }
      return;
    }
    this.currentIndex.set(index);
    this.focusCommentsStoryId.set(storyId);
  }

  goToPreviousUnit(): void { this.moveUnit(-1); }
  goToNextUnit(): void { this.moveUnit(1); }

  private moveUnit(offset: number): void {
    const units = this.course()?.units;
    const target = units?.[this.unitIndex() + offset];
    if (target) this.selectUnit(target);
  }

  /** Cada historia exige completar la lectura de la anterior. */
  private buildItems(): void {
    const unit = this.currentUnit();
    if (!unit) { this.items.set([]); return; }
    const completed = this.completedStories();
    let previousCompleted = true;
    const stories = [...(unit.stories || [])].sort((a, b) => a.order - b.order);
    const items: NavigationItem[] = [];

    // Video de bienvenida: primer ítem de la primera unidad, siempre accesible y sin bloquear lo que sigue.
    const introVideo = this.course()?.introVideoUrl;
    if (introVideo && this.unitIndex() === 0) {
      items.push({ id: 'intro', kind: 'intro', title: 'Bienvenida', order: -1, story: null, unit, completed: this.introSeen(), canAccess: true });
    }

    const lockedUnit = !!unit.locked;
    const availableAt = unit.availableAt ?? null;

    for (const story of stories) {
      const item: NavigationItem = {
        id: `story-${story.id}`,
        kind: 'story',
        title: story.title,
        order: story.order,
        story,
        unit,
        completed: completed.has(story.id),
        // Una historia ya completada nunca queda bloqueada, aunque la anterior no figure completada
        canAccess: !lockedUnit && (previousCompleted || completed.has(story.id)),
        locked: lockedUnit,
        availableAt
      };
      previousCompleted = item.completed;
      items.push(item);
    }

    // Quiz publicado: al final de la unidad, se habilita al completar todas sus historias.
    if (unit.quiz) {
      items.push({
        id: `quiz-${unit.id}`,
        kind: 'quiz',
        title: unit.quiz.title || 'Quiz de la unidad',
        order: Number.MAX_SAFE_INTEGER,
        story: null,
        unit,
        completed: !!this.quizResults()[unit.id]?.passed,
        canAccess: !lockedUnit && stories.every(story => completed.has(story.id)),
        locked: lockedUnit,
        availableAt
      });
    }
    this.items.set(items);
  }

  /** Marca vista la bienvenida (no hay endpoint: es solo del reproductor). */
  markIntroSeen(): void {
    if (this.introSeen()) return;
    this.introSeen.set(true);
    this.buildItems();
  }

  markStoryCompleted(storyId: number): void {
    this.completedStories.update(set => new Set(set).add(storyId));
    this.buildItems();
  }

  goToPrevious(): void {
    const item = this.previousItem();
    if (item) this.navigateTo(item);
  }

  goToNext(): void {
    const item = this.nextItem();
    if (item) this.navigateTo(item);
  }

  selectItem(item: NavigationItem): void {
    if (item.locked) {
      // Se abre la pantalla que explica cuándo se libera
      const index = this.items().findIndex(i => i.id === item.id);
      if (index >= 0) this.currentIndex.set(index);
      return;
    }
    if (!this.navigateTo(item)) this.toastService.warning('Este contenido aún no está disponible');
  }

  /**
   * Si el servidor respondió 403 `content_locked`, marca la unidad abierta como bloqueada (con su fecha).
   * Devuelve true cuando era ese error, para que quien llama no muestre un error genérico.
   */
  handleLocked(error: unknown): boolean {
    const locked = contentLockedFrom(error);
    if (!locked) return false;
    const unitId = this.currentUnit()?.id;
    if (unitId !== undefined) this.markUnitLocked(unitId, locked.availableAt);
    return true;
  }

  markUnitLocked(unitId: number, availableAt: string | null): void {
    const patch = (u: Unit): Unit => u.id === unitId ? { ...u, locked: true, availableAt: availableAt ?? u.availableAt ?? null } : u;
    this.course.update(c => c ? { ...c, units: (c.units ?? []).map(patch) } : c);
    const current = this.currentUnit();
    if (current?.id === unitId) {
      this.currentUnit.set(patch(current));
      this.buildItems();
    }
  }

  /** Única regla de navegación (menú lateral y flechas): solo se entra a ítems con canAccess. */
  private navigateTo(item: NavigationItem): boolean {
    if (!item.canAccess) return false;
    const index = this.items().findIndex(i => i.id === item.id);
    if (index < 0) return false;
    this.currentIndex.set(index);
    return true;
  }
}
