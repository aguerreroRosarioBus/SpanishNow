import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Story, Unit } from '../../../../core/models/course.model';
import { CourseManageStore } from '../course-manage.store';

/** Historia dentro de una unidad: resumen plegable y accesos a composición, texto, preguntas, tooltips y audios. */
@Component({
  selector: 'app-story-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './story-card.component.html'
})
export class StoryCardComponent {
  store = inject(CourseManageStore);
  story = input.required<Story>();
  unit = input.required<Unit>();

  expanded = signal(false);

  toggle(): void { this.expanded.update(open => !open); }

  questionsCount(): number { return this.story().questions?.length || 0; }
  // Los tooltips no vienen en la historia; se muestra 0 hasta contar con ese dato.
  tooltipsCount(): number { return 0; }
  audiosCount(): number { return this.story().repetitionActivities?.length || 0; }
}
