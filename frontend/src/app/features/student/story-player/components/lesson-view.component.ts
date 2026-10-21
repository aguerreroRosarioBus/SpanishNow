import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { LessonNavigationStore } from '../lesson-navigation.store';
import { LessonSessionStore } from '../lesson-session.store';
import { LessonBlockComponent } from './lesson-block.component';
import { FullStoryBlockComponent } from './full-story-block.component';
import { ReinforcementsComponent } from './reinforcements.component';

const BLOCK_LABELS: Record<string, string> = {
  expression: 'Expresión',
  keyframe: 'Historia',
  question: 'Pregunta',
  full_story: 'Lectura completa'
};

/** Tarjeta de la lección: título, barra de pasos, paso actual y el único par Anterior/Continuar. */
@Component({
  selector: 'app-lesson-view',
  standalone: true,
  imports: [IconComponent, LessonBlockComponent, FullStoryBlockComponent, ReinforcementsComponent],
  templateUrl: './lesson-view.component.html',
  styleUrl: './lesson-view.component.scss'
})
export class LessonViewComponent {
  session = inject(LessonSessionStore);
  nav = inject(LessonNavigationStore);
  private router = inject(Router);

  blockLabel(type: string): string {
    return BLOCK_LABELS[type] ?? 'Refuerzo';
  }

  unitTitle = computed(() => unitDisplayTitle(this.nav.currentUnit()?.title));
  isLast = computed(() => this.session.currentBlockIndex() === this.session.activeBlocks().length - 1);
  percent = computed(() => {
    if (this.session.narrativeCompleted()) return 100;
    const total = this.session.activeBlocks().length;
    return total ? Math.round((Math.max(0, this.session.currentBlockIndex()) / total) * 100) : 0;
  });
  /** Etiqueta del botón principal según el punto de la lección. */
  nextLabel = computed(() => {
    if (!this.isLast()) return 'Continuar';
    if (!this.session.narrativeCompleted()) return 'Completar lectura';
    const after = this.nav.afterLesson();
    return after === 'story' ? 'Siguiente historia' : after === 'unit' ? 'Siguiente unidad' : 'Volver a mis cursos';
  });

  next(): void {
    if (!this.isLast()) { this.session.goToBlock(1); return; }
    if (!this.session.narrativeCompleted()) { this.session.completeNarrative(); return; }
    const after = this.nav.afterLesson();
    if (after === 'story') this.nav.goToNext();
    else if (after === 'unit') this.nav.goToNextUnit();
    else this.router.navigate(['/student/dashboard']);
  }
}
