import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Story, Unit } from '../../../../core/models/course.model';
import { CourseManageStore } from '../course-manage.store';
import { StoryCardComponent } from './story-card.component';

// Estado de arrastre compartido entre tarjetas (una unidad arrastrada a la vez).
let draggedUnit: Unit | null = null;

/** Tarjeta de una unidad: cabecera con acciones, descripción y sus historias. */
@Component({
  selector: 'app-unit-card',
  standalone: true,
  imports: [CommonModule, StoryCardComponent],
  templateUrl: './unit-card.component.html',
  styleUrl: './unit-card.component.scss'
})
export class UnitCardComponent {
  store = inject(CourseManageStore);
  unit = input.required<Unit>();

  trackById = (_: number, item: { id: number }) => item.id;
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
