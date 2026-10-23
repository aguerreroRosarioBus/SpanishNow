import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CourseService } from '../../../core/services/course.service';
import { UnitService } from '../../../core/services/unit.service';
import { StoryService } from '../../../core/services/story.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Question, Story, Unit } from '../../../core/models/course.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationParams } from '../../../core/i18n/i18n.types';

/** Diálogo abierto en la pantalla (solo uno a la vez; los tooltips de pregunta anidan dentro de «questions»). */
export type ManageModal =
  | { kind: 'course-edit' }
  | { kind: 'unit-create' }
  | { kind: 'unit-edit'; unit: Unit }
  | { kind: 'story-create'; unitId: number }
  | { kind: 'story-edit'; story: Story; unitId: number }
  | { kind: 'questions'; story: Story }
  | { kind: 'vocabulary'; unit: Unit }
  | { kind: 'repetitions'; story: Story }
  | { kind: 'story-tooltips'; story: Story }
  | { kind: 'materials'; unit: Unit | null }
  | { kind: 'quiz'; unit: Unit }
  | { kind: 'composer'; story: Story; unit: Unit };

/** Los textos del diálogo son claves I18N (con parámetros): se traducen al pintar y siguen el idioma activo. */
export interface ConfirmData {
  titleKey: string;
  messageKey: string;
  confirmKey: string;
  params: TranslationParams;
  type: 'danger' | 'warning';
  onConfirm: () => void;
}

/** Estado compartido de la gestión del curso: datos, diálogo activo y confirmaciones. */
@Injectable()
export class CourseManageStore {
  private courseService = inject(CourseService);
  private unitService = inject(UnitService);
  private storyService = inject(StoryService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  courseId = signal(0);
  course = signal<Course | null>(null);
  units = signal<Unit[]>([]);
  isLoading = signal(false);
  /** Clave I18N del error de carga ('' = sin error). */
  errorMessage = signal('');
  expandedUnits = signal<Set<number>>(new Set());
  /** Historia resaltada al llegar desde el link de un email (`?story=`). */
  highlightStoryId = signal<number | null>(null);

  modal = signal<ManageModal | null>(null);
  confirmData = signal<ConfirmData | null>(null);
  showConfirmDialog = signal(false);
  /** El compositor no usa el backdrop de Bootstrap; los demás diálogos y el confirm sí. */
  hasBackdrop = computed(() => {
    const modal = this.modal();
    return (!!modal && modal.kind !== 'composer') || this.showConfirmDialog();
  });

  load(courseId?: number): void {
    if (courseId !== undefined) this.courseId.set(courseId);
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.courseService.getCourse(this.courseId()).subscribe({
      next: course => {
        this.course.set(course);
        this.units.set(course.units || []);
        this.expandAllUnits();
        this.isLoading.set(false);
      },
      error: error => {
        console.error('Error loading course:', error);
        this.errorMessage.set('teacherManage.page.loadError');
        this.isLoading.set(false);
      }
    });
  }

  // ===== Diálogos y confirmación =====

  open(modal: ManageModal): void {
    // Abrir el compositor crea el borrador de la lección: desde ahí el texto de la historia lo genera la lección.
    if (modal.kind === 'composer' && !modal.story.hasLessonPlan) {
      this.patchStory(modal.story.id, s => ({ ...s, hasLessonPlan: true }));
      modal = { ...modal, story: { ...modal.story, hasLessonPlan: true } };
    }
    this.modal.set(modal);
  }
  close(): void { this.modal.set(null); }

  /** Pide confirmación; título, mensaje y botón son claves I18N y `params` los valores del mensaje. */
  confirm(titleKey: string, messageKey: string, confirmKey: string, onConfirm: () => void, type: 'danger' | 'warning' = 'danger', params: TranslationParams = {}): void {
    this.confirmData.set({ titleKey, messageKey, confirmKey, params, type, onConfirm });
    this.showConfirmDialog.set(true);
  }

  acceptConfirm(): void {
    this.confirmData()?.onConfirm();
    this.cancelConfirm();
  }

  cancelConfirm(): void {
    this.showConfirmDialog.set(false);
    this.confirmData.set(null);
  }

  // ===== Acordeón de unidades =====

  toggleUnit(unitId: number): void {
    this.expandedUnits.update(set => {
      const next = new Set(set);
      if (!next.delete(unitId)) next.add(unitId);
      return next;
    });
  }
  isUnitExpanded(unitId: number): boolean { return this.expandedUnits().has(unitId); }
  expandAllUnits(): void { this.expandedUnits.set(new Set(this.units().map(u => u.id))); }
  collapseAllUnits(): void { this.expandedUnits.set(new Set()); }

  // ===== Mutaciones locales =====

  addUnit(unit: Unit): void {
    this.units.update(list => [...list, unit]);
    // La unidad nueva se muestra abierta: lo siguiente que se hace es agregarle historias
    this.expandedUnits.update(set => new Set(set).add(unit.id));
  }
  patchUnit(updated: Unit): void {
    this.units.update(list => list.map(u => u.id === updated.id ? { ...u, ...updated } : u));
  }
  addStory(unitId: number, story: Story): void {
    this.units.update(list => list.map(u => u.id === unitId ? { ...u, stories: [...(u.stories || []), story] } : u));
  }
  patchStory(storyId: number, change: (story: Story) => Story): void {
    this.units.update(list => list.map(u => ({ ...u, stories: (u.stories || []).map(s => s.id === storyId ? change(s) : s) })));
  }
  setStoryText(storyId: number, text: string): void { this.patchStory(storyId, s => ({ ...s, text })); }
  setStoryQuestions(storyId: number, questions: Question[]): void {
    this.patchStory(storyId, s => ({ ...s, questions }));
  }

  // ===== Borrados con confirmación =====

  deleteUnit(unitId: number): void {
    const title = this.units().find(u => u.id === unitId)?.title;
    this.confirm('teacherManage.store.deleteUnitTitle', title ? 'teacherManage.store.deleteUnitMessage' : 'teacherManage.store.deleteUnitUntitled', 'teacherManage.store.deleteUnitConfirm', () => {
      this.unitService.deleteUnit(unitId).subscribe({
        next: () => {
          this.units.update(list => list.filter(u => u.id !== unitId));
          this.toast.success(this.i18n.t('teacherManage.store.unitDeleted'));
        },
        error: error => {
          console.error('Error deleting unit:', error);
          this.toast.error(this.i18n.t('teacherManage.store.unitDeleteError'));
        }
      });
    }, 'danger', { title: title ?? '' });
  }

  deleteStory(unitId: number, storyId: number): void {
    const title = this.units().find(u => u.id === unitId)?.stories?.find(s => s.id === storyId)?.title;
    this.confirm('teacherManage.store.deleteStoryTitle', title ? 'teacherManage.store.deleteStoryMessage' : 'teacherManage.store.deleteStoryUntitled', 'teacherManage.store.deleteStoryConfirm', () => {
      this.storyService.deleteStory(storyId).subscribe({
        next: () => {
          this.units.update(list => list.map(u => u.id === unitId ? { ...u, stories: (u.stories || []).filter(s => s.id !== storyId) } : u));
          this.toast.success(this.i18n.t('teacherManage.store.storyDeleted'));
        },
        error: error => {
          console.error('Error deleting story:', error);
          this.toast.error(this.i18n.t('teacherManage.store.storyDeleteError'));
        }
      });
    }, 'danger', { title: title ?? '' });
  }

  // ===== Reordenamiento (drag & drop) =====

  moveUnit(dragged: Unit, target: Unit): void {
    if (dragged.id === target.id) return;
    const units = [...this.units()];
    const targetIndex = units.findIndex(u => u.id === target.id);
    const [removed] = units.splice(units.findIndex(u => u.id === dragged.id), 1);
    units.splice(targetIndex, 0, removed);
    const ordered = units.map((u, index) => ({ ...u, order: index }));
    this.units.set(ordered);
    Promise.all(ordered.map(u => firstValueFrom(this.unitService.updateUnit(u.id, { order: u.order }))))
      .catch(error => {
        console.error('Error reordering units:', error);
        this.toast.error(this.i18n.t('teacherManage.store.reorderUnitsError'));
        this.load();
      });
  }

  moveStory(unitId: number, dragged: Story, target: Story): void {
    if (dragged.id === target.id) return;
    const unit = this.units().find(u => u.id === unitId);
    if (!unit?.stories) return;
    const stories = [...unit.stories];
    const targetIndex = stories.findIndex(s => s.id === target.id);
    const [removed] = stories.splice(stories.findIndex(s => s.id === dragged.id), 1);
    stories.splice(targetIndex, 0, removed);
    const ordered = stories.map((s, index) => ({ ...s, order: index }));
    this.units.update(list => list.map(u => u.id === unitId ? { ...u, stories: ordered } : u));
    Promise.all(ordered.map(s => firstValueFrom(this.storyService.updateStoryOrder(s.id, s.order))))
      .catch(error => {
        console.error('Error reordering stories:', error);
        this.toast.error(this.i18n.t('teacherManage.store.reorderStoriesError'));
        this.load();
      });
  }
}
