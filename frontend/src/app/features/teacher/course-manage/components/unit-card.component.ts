import { Component, computed, inject, input } from '@angular/core';
import { NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem } from '@ng-bootstrap/ng-bootstrap';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { formatAvailableDate } from '../../../../shared/utils/release-date';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Story, Unit } from '../../../../core/models/course.model';
import { CourseManageStore } from '../course-manage.store';
import { CourseContentStore } from '../course-content.store';
import { StoryCardComponent } from './story-card.component';

// Estado de arrastre compartido entre tarjetas (una unidad arrastrada a la vez).
let draggedUnit: Unit | null = null;

/** Tarjeta de una unidad: cabecera con acciones, descripción y sus historias. */
@Component({
  selector: 'app-unit-card',
  standalone: true,
  imports: [NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, IconComponent, TranslatePipe, StoryCardComponent],
  templateUrl: './unit-card.component.html',
  styleUrl: './unit-card.component.scss'
})
export class UnitCardComponent {
  store = inject(CourseManageStore);
  content = inject(CourseContentStore);
  private i18n = inject(I18nService);
  unit = input.required<Unit>();
  /** Número visible de la unidad (posición en el curso) */
  number = input.required<number>();

  title = computed(() => unitDisplayTitle(this.unit().title));
  open = computed(() => this.store.isUnitExpanded(this.unit().id));
  storyCount = computed(() => this.unit().stories?.length ?? 0);
  publishedCount = computed(() => (this.unit().stories ?? []).filter(s => s.lessonStatus === 'published').length);
  /** PDFs de la unidad y de todas sus historias. */
  pdfCount = computed(() => this.content.unitMaterialCount(this.unit().id)
    + (this.unit().stories ?? []).reduce((sum, s) => sum + this.content.storyMaterialCount(s.id), 0));
  /** Resumen corto de la liberación por fechas (vacío si la unidad está abierta desde el primer día). */
  dripLabel = computed(() => {
    const { releaseAfterDays: days, releaseAt } = this.unit();
    const day = days ? this.i18n.t('teacherDashboard.unit.dripDay', { days }) : '';
    const date = formatAvailableDate(releaseAt, this.i18n.intlLocale(), 'short');
    const from = date ? this.i18n.t('teacherDashboard.unit.dripFrom', { date }) : '';
    return day && from ? this.i18n.t('teacherDashboard.unit.dripJoin', { first: day, second: from }) : day || from;
  });
  quiz = computed(() => this.content.quiz(this.unit().id));
  private draggedStory: Story | null = null;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onUnitDragStart(event: DragEvent): void {
    draggedUnit = this.unit();
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onUnitDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (draggedUnit) this.store.moveUnit(draggedUnit, this.unit());
    draggedUnit = null;
  }

  onStoryDragStart(event: DragEvent, story: Story): void {
    this.draggedStory = story;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onStoryDrop(event: DragEvent, target: Story): void {
    event.preventDefault();
    event.stopPropagation();
    // Solo se reordena dentro de la misma unidad (el arrastre de otra unidad no llega aquí).
    if (this.draggedStory) this.store.moveStory(this.unit().id, this.draggedStory, target);
    this.draggedStory = null;
  }
}
