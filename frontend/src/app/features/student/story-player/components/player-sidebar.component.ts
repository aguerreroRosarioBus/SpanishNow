import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { LessonNavigationStore } from '../lesson-navigation.store';

/** Índice del curso: progreso, unidad abierta con sus flechas y lista de historias con su estado. */
@Component({
  selector: 'app-player-sidebar',
  standalone: true,
  imports: [TranslatePipe, RouterLink, IconComponent],
  templateUrl: './player-sidebar.component.html',
  styleUrl: './player-sidebar.component.scss'
})
export class PlayerSidebarComponent {
  i18n = inject(I18nService);
  nav = inject(LessonNavigationStore);

  currentId = computed(() => this.nav.currentItem()?.id ?? null);
  unitTitle = computed(() => unitDisplayTitle(this.nav.currentUnit()?.title) || this.i18n.t('player.unitFallback'));
  progressPercent = computed(() => {
    const { done, total } = this.nav.courseProgress();
    return total ? Math.round((done / total) * 100) : 0;
  });
}
