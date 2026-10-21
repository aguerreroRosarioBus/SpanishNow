import { Injectable, computed, inject, signal } from '@angular/core';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Enrollment, Unit } from '../../../core/models/course.model';
import { NavigationItem } from './navigation-item.model';

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

  items = signal<NavigationItem[]>([]);
  currentIndex = signal(0);
  currentItem = computed(() => this.items()[this.currentIndex()] ?? null);
  currentStoryId = computed(() => this.currentItem()?.story.id ?? null);
  completedCount = computed(() => this.items().filter(item => item.completed).length);

  // Las flechas siguen la misma regla de acceso que el menú lateral (ver navigateTo).
  previousItem = computed(() => this.items()[this.currentIndex() - 1] ?? null);
  nextItem = computed(() => this.items()[this.currentIndex() + 1] ?? null);
  canGoPrevious = computed(() => !!this.previousItem()?.canAccess);
  canGoNext = computed(() => !!this.nextItem()?.canAccess);
  nextBlockedReason = computed(() => {
    const next = this.nextItem();
    return next && !next.canAccess ? 'Completa esta lectura para desbloquear la siguiente historia.' : '';
  });

  private unitIndex = computed(() => {
    const unit = this.currentUnit();
    return unit ? (this.course()?.units ?? []).findIndex(u => u.id === unit.id) : -1;
  });
  canGoPreviousUnit = computed(() => this.unitIndex() > 0);
  canGoNextUnit = computed(() => {
    const index = this.unitIndex();
    return index >= 0 && index < (this.course()?.units?.length ?? 0) - 1;
  });

  load(courseId: number): void {
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
        this.loadCourse(courseId);
      },
      error: error => {
        console.error('Error loading enrollment:', error);
        this.errorMessage.set('Error al cargar la inscripción');
        this.isLoading.set(false);
      }
    });
  }

  private loadCourse(courseId: number): void {
    this.courseService.getCourse(courseId).subscribe({
      next: course => {
        this.course.set(course);
        if (course.units && course.units.length > 0) this.selectUnit(course.units[0]);
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
    const firstAccessible = this.items().findIndex(item => item.canAccess);
    if (firstAccessible >= 0) this.currentIndex.set(firstAccessible);
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
    const items = [...(unit.stories || [])].sort((a, b) => a.order - b.order).map(story => {
      const item: NavigationItem = {
        id: `story-${story.id}`,
        title: story.title,
        order: story.order,
        story,
        completed: completed.has(story.id),
        canAccess: previousCompleted
      };
      previousCompleted = item.completed;
      return item;
    });
    this.items.set(items);
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
    if (!this.navigateTo(item)) this.toastService.warning('Este contenido aún no está disponible');
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
