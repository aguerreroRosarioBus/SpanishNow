import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { CheckoutSession } from '../../../core/models/sales.model';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30000;

/** Pantalla posterior al pago: espera (máx. ~30 s) a que el pago quede confirmado. */
@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './checkout-success.component.html',
  styleUrl: './checkout-success.component.scss'
})
export class CheckoutSuccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private catalog = inject(PublicCatalogService);
  private enrollments = inject(EnrollmentService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  state = signal<'waiting' | 'paid' | 'timeout' | 'error'>('waiting');
  session = signal<CheckoutSession | null>(null);
  /** Destino del botón para quien ya tiene sesión. */
  courseLink = signal<string[]>(['/student/dashboard']);
  currentUser = this.auth.currentUser;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = Date.now();

  ngOnInit(): void {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (!sessionId) {
      this.state.set('error');
      return;
    }
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    this.poll(sessionId);
  }

  private poll(sessionId: string): void {
    this.catalog.getCheckoutSession(sessionId).subscribe({
      next: session => {
        this.session.set(session);
        if (session.status === 'paid') {
          this.state.set('paid');
          this.resolveCourseLink(session.course.slug);
        } else {
          this.scheduleNext(sessionId);
        }
      },
      error: error => {
        if (error?.status === 404) this.state.set('error');
        else this.scheduleNext(sessionId);
      }
    });
  }

  private scheduleNext(sessionId: string): void {
    if (Date.now() - this.startedAt >= POLL_MAX_MS) {
      this.state.set('timeout');
      return;
    }
    this.timer = setTimeout(() => this.poll(sessionId), POLL_INTERVAL_MS);
  }

  /** Si hay un alumno logueado, lleva directo al reproductor del curso comprado (si lo encuentra). */
  private resolveCourseLink(slug: string): void {
    if (!this.auth.isAuthenticated() || !this.auth.isStudent()) return;
    this.enrollments.getMyCourses().subscribe({
      next: list => {
        const match = list.find(e => e.course?.slug === slug);
        if (match) this.courseLink.set(['/student/course', String(match.courseId), 'play']);
      },
      error: () => { /* queda el dashboard */ }
    });
  }
}
