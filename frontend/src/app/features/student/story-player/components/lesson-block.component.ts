import { Component, computed, inject, input } from '@angular/core';
import { StudentLessonBlock } from '../../../../core/services/student-lesson.service';
import { DisplayTooltip } from '../../../../core/services/tooltip.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { TooltipDisplayComponent } from '../../../../shared/components/tooltip-display/tooltip-display.component';
import { LessonSessionStore } from '../lesson-session.store';
import { LessonIllustrationComponent } from './lesson-illustration.component';

/** Bloque narrativo actual: expresión, keyframe (con audio y tooltips) o pregunta. */
@Component({
  selector: 'app-lesson-block',
  standalone: true,
  imports: [IconComponent, TooltipDisplayComponent, LessonIllustrationComponent],
  templateUrl: './lesson-block.component.html',
  styleUrl: './lesson-block.component.scss'
})
export class LessonBlockComponent {
  session = inject(LessonSessionStore);
  block = input.required<StudentLessonBlock>();

  // Referencia estable por bloque (el input del componente de tooltips se compara por referencia).
  private tooltipCache = new WeakMap<StudentLessonBlock, DisplayTooltip[]>();
  tooltips = computed(() => {
    const block = this.block();
    let list = this.tooltipCache.get(block);
    if (!list) { list = (block.tooltips || []).map(t => ({ ...t })); this.tooltipCache.set(block, list); }
    return list;
  });
}
