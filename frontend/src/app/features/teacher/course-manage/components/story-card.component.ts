import { Component, ElementRef, computed, effect, inject, input } from '@angular/core';
import { NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem } from '@ng-bootstrap/ng-bootstrap';
import { Story, Unit } from '../../../../core/models/course.model';
import { CourseManageStore } from '../course-manage.store';
import { CourseContentStore } from '../course-content.store';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { PluralPipe } from '../../../../shared/pipes/plural.pipe';

/** Fila de una historia dentro de una unidad: estado, preguntas y acciones (editar y menú «⋯»). */
@Component({
  selector: 'app-story-card',
  standalone: true,
  imports: [NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, IconComponent, PluralPipe],
  templateUrl: './story-card.component.html',
  styleUrl: './story-card.component.scss'
})
export class StoryCardComponent {
  store = inject(CourseManageStore);
  private content = inject(CourseContentStore);
  story = input.required<Story>();
  unit = input.required<Unit>();
  /** Posición visible de la historia en la unidad */
  number = input.required<number>();

  questionsCount = computed(() => this.story().questions?.length || 0);
  commentCount = computed(() => this.story().commentCount ?? 0);
  hasVideo = computed(() => !!this.story().videoUrl);
  pdfCount = computed(() => this.content.storyMaterialCount(this.story().id));
  published = computed(() => this.story().lessonStatus === 'published');

  highlighted = computed(() => this.store.highlightStoryId() === this.story().id);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Llegada desde el email de un comentario: se baja hasta la historia (sus unidades ya están abiertas)
    effect(() => {
      if (this.highlighted()) setTimeout(() => this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' }));
    });
  }

  compose(): void {
    this.store.open({ kind: 'composer', story: this.story(), unit: this.unit() });
  }
}
