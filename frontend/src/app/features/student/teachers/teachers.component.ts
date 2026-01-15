import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent {
  // Placeholder - en el futuro se puede cargar desde el backend
  teachers = [
    {
      name: 'Placeholder Teacher',
      email: 'teacher@spanishnow.com',
      coursesCount: 0
    }
  ];
}
