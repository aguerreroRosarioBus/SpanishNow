import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipDisplayComponent } from '../../../../shared/components/tooltip-display/tooltip-display.component';
import { LessonSessionStore } from '../lesson-session.store';

/** Lectura completa de la historia con audio lento/normal y tooltips. */
@Component({
  selector: 'app-full-story-block',
  standalone: true,
  imports: [CommonModule, TooltipDisplayComponent],
  templateUrl: './full-story-block.component.html',
  styleUrl: './full-story-block.component.scss'
})
export class FullStoryBlockComponent {
  session = inject(LessonSessionStore);
}
