import { Component, inject } from '@angular/core';
import { CourseManageStore } from '../course-manage.store';
import { UnitCardComponent } from './unit-card.component';

/** Lista de unidades del curso con controles de expandir/colapsar. */
@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [UnitCardComponent],
  templateUrl: './unit-list.component.html',
  styles: [`
    .list-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-top: 4px; border-top: 1px solid var(--color-border); }
    .list-bar__title { margin: 12px 0 0; font: 600 0.9375rem var(--font-heading); }
    .list-bar__actions { display: flex; gap: 2px; margin-top: 12px; }
    .unit-stack { display: flex; flex-direction: column; gap: 12px; }
  `]
})
export class UnitListComponent {
  store = inject(CourseManageStore);
}
