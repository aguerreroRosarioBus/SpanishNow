import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CourseManageStore } from '../course-manage.store';
import { UnitCardComponent } from './unit-card.component';

/** Lista de unidades del curso con controles de expandir/colapsar. */
@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [CommonModule, UnitCardComponent],
  templateUrl: './unit-list.component.html'
})
export class UnitListComponent {
  store = inject(CourseManageStore);
  trackById = (_: number, item: { id: number }) => item.id;
}
