import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IconComponent } from '../../../shared/components/icon/icon.component';
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
  imports: [TranslatePipe, IconComponent],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private http = inject(HttpClient);

  teachers = signal<Teacher[]>([]);
  isLoading = signal<boolean>(false);
  private failure = signal<unknown>(null);
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'student.teachersError') : null);

  ngOnInit(): void {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.isLoading.set(true);
    this.failure.set(null);

    this.http.get<Teacher[]>(`${environment.apiUrl}/users/teachers`).subscribe({
      next: (teachers) => {
        this.teachers.set(teachers);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading teachers:', error);
        this.failure.set(error);
        this.isLoading.set(false);
      }
    });
  }
}
