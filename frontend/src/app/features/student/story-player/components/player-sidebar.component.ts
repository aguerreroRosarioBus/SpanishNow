import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { LessonNavigationStore } from '../lesson-navigation.store';

/** Índice del curso: progreso, unidad abierta con sus flechas y lista de historias con su estado. */
@Component({
  selector: 'app-player-sidebar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './player-sidebar.component.html',
  styleUrl: './player-sidebar.component.scss'
})
export class PlayerSidebarComponent {
  nav = inject(LessonNavigationStore);

  currentId = computed(() => this.nav.currentItem()?.id ?? null);
  unitTitle = computed(() => unitDisplayTitle(this.nav.currentUnit()?.title) || 'Unidad');
  progressPercent = computed(() => {
    const { done, total } = this.nav.courseProgress();
    return total ? Math.round((done / total) * 100) : 0;
  });
}
