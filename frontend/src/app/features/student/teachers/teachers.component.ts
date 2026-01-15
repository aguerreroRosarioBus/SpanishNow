import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Teacher {
  id: number;
  name: string;
  email: string;
  coursesCount: number;
}

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent implements OnInit {
  private http = inject(HttpClient);

  teachers = signal<Teacher[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.http.get<Teacher[]>(`${environment.apiUrl}/users/teachers`).subscribe({
      next: (teachers) => {
        this.teachers.set(teachers);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading teachers:', error);
        this.error.set('Error al cargar los profesores');
        this.isLoading.set(false);
      }
    });
  }
}
