import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LessonNavigationStore } from '../lesson-navigation.store';

/** Panel lateral: curso, navegación entre unidades y lista de historias. */
@Component({
  selector: 'app-player-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-sidebar.component.html',
  styleUrl: './player-sidebar.component.scss'
})
export class PlayerSidebarComponent {
  nav = inject(LessonNavigationStore);
  back = output<void>();
}
