import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LessonSessionStore } from '../lesson-session.store';
import { LessonBlockComponent } from './lesson-block.component';
import { FullStoryBlockComponent } from './full-story-block.component';
import { ReinforcementsComponent } from './reinforcements.component';

/** Tarjeta de la lección: cabecera, indicador de bloques, bloque actual, controles y refuerzos. */
@Component({
  selector: 'app-lesson-view',
  standalone: true,
  imports: [CommonModule, LessonBlockComponent, FullStoryBlockComponent, ReinforcementsComponent],
  templateUrl: './lesson-view.component.html'
})
export class LessonViewComponent {
  session = inject(LessonSessionStore);

  blockLabel(type: string): string {
    return type === 'expression' ? 'Expresión' : type === 'keyframe' ? 'Historia' : type === 'question' ? 'Pregunta' : type === 'full_story' ? 'Lectura completa' : 'Refuerzo';
  }
}
