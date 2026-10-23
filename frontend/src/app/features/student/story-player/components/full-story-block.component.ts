import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component, computed, inject } from '@angular/core';
import { LessonAudioControlsComponent } from './lesson-audio-controls.component';
import { TooltipDisplayComponent } from '../../../../shared/components/tooltip-display/tooltip-display.component';
import { DisplayTooltip } from '../../../../core/services/tooltip.service';
import { LessonSessionStore } from '../lesson-session.store';
import { LessonIllustrationComponent } from './lesson-illustration.component';

/** Lectura completa de la historia con audio lento/normal y tooltips. */
@Component({
  selector: 'app-full-story-block',
  standalone: true,
  imports: [TranslatePipe, LessonAudioControlsComponent, TooltipDisplayComponent, LessonIllustrationComponent],
  templateUrl: './full-story-block.component.html',
  styleUrl: './full-story-block.component.scss'
})
export class FullStoryBlockComponent {
  i18n = inject(I18nService);
  session = inject(LessonSessionStore);

  /**
   * Lectura ilustrada: solo si algún keyframe activo tiene imagen. Cada párrafo es un keyframe (con su ilustración y
   * sus tooltips); sin imágenes se conserva el texto completo de la historia como siempre.
   */
  paragraphs = computed(() => {
    const frames = (this.session.lesson()?.blocks || [])
      .filter(b => b.type === 'keyframe' && b.active && b.phase === 'during' && (b.text || '').trim())
      .slice().sort((a, b) => a.position - b.position);
    if (!frames.some(b => b.imageUrl)) return null;
    return frames.map(b => ({
      key: b.blockKey, text: b.text || '', imageUrl: b.imageUrl || null,
      alt: b.imageAlt || b.text || this.i18n.t('player.illustration'),
      tooltips: (b.tooltips || []).map(t => ({ ...t })) as DisplayTooltip[]
    }));
  });
}
