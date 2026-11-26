import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { environment } from '../../../../environments/environment';

interface Teacher {
  id: number;
  name: string;
  /** Solo llega al propio docente o a quien administra usuarios (A-07); un alumno nunca lo recibe. */
  email?: string;
  coursesCount: number;
}

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [EmptyStateComponent, TranslatePipe, IconComponent],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private http = inject(HttpClient);
  private chat = inject(ChatService);
  private auth = inject(AuthService);
  private router = inject(Router);

  teachers = signal<Teacher[]>([]);
  isLoading = signal<boolean>(false);
  private failure = signal<unknown>(null);
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'student.teachersError') : null);

  /** Docentes a los que el alumno puede escribir por la mensajería interna (los que reciben consultas). */
  private messageable = signal<ReadonlySet<number>>(new Set());
  startingId = signal<number | null>(null);
  private startFailure = signal<unknown>(null);
  startError = computed(() => this.startFailure() ? this.i18n.errorMessage(this.startFailure(), 'teachers.writeError') : null);

  ngOnInit(): void {
    this.loadTeachers();
    if (this.auth.isStudent()) {
      this.chat.availableTeachers().subscribe({
        next: list => this.messageable.set(new Set(list.map(teacher => teacher.id))),
        error: () => this.messageable.set(new Set())
      });
    }
  }

  canWrite(teacher: Teacher): boolean {
    return this.auth.isStudent() && this.messageable().has(teacher.id);
  }

  /** Abre (o reutiliza) la consulta con ese docente y lleva al alumno a la conversación. */
  write(teacher: Teacher): void {
    if (this.startingId() !== null) return;
    this.startingId.set(teacher.id);
    this.startFailure.set(null);
    this.chat.start(teacher.id).subscribe({
      next: conversation => { this.startingId.set(null); void this.router.navigate(['/messages', conversation.id]); },
      error: error => { this.startFailure.set(error); this.startingId.set(null); }
    });
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
