import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { QuizAttemptResult, StudentQuiz } from '../../../../core/models/content.model';
import { QuizService } from '../../../../core/services/quiz.service';
import { NextCourseCardComponent } from '../../../../shared/components/next-course-card/next-course-card.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { LessonNavigationStore } from '../lesson-navigation.store';
import {
  DraftAnswers, correctCount, emptyAnswers, resultFor, setAnswer, toSubmission, unansweredCount
} from '../quiz-attempt.logic';

/** Pantalla del quiz de la unidad: responder, ver el resultado con explicaciones y reintentar. */
@Component({
  selector: 'app-quiz-view',
  standalone: true,
  imports: [IconComponent, NextCourseCardComponent],
  templateUrl: './quiz-view.component.html',
  styleUrls: ['./lesson-view.component.scss', './quiz-view.component.scss']
})
export class QuizViewComponent {
  nav = inject(LessonNavigationStore);
  private api = inject(QuizService);
  private router = inject(Router);

  quiz = signal<StudentQuiz | null>(null);
  answers = signal<DraftAnswers>([]);
  result = signal<QuizAttemptResult | null>(null);
  loading = signal(false);
  submitting = signal(false);
  error = signal('');
  submitError = signal('');
  showMissing = signal(false);

  unitId = computed(() => this.nav.currentItem()?.unit?.id ?? null);
  unitTitle = computed(() => unitDisplayTitle(this.nav.currentUnit()?.title));
  pending = computed(() => unansweredCount(this.answers()));
  correct = computed(() => correctCount(this.result()?.results ?? []));
  nextLabel = computed(() => this.nav.canGoNextUnit() ? 'Siguiente unidad' : 'Volver a mis cursos');
  /** Resultado más reciente si hay uno; si no, el mejor intento previo. */
  best = computed(() => this.result()?.bestScore ?? this.quiz()?.bestAttempt?.score ?? null);

  constructor() {
    effect(() => {
      const unitId = this.unitId();
      if (unitId !== null) untracked(() => this.load(unitId));
    });
  }

  private load(unitId: number): void {
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.showMissing.set(false);
    this.api.getForStudent(unitId).subscribe({
      next: quiz => {
        this.quiz.set(quiz);
        this.answers.set(emptyAnswers(quiz.questions));
        this.loading.set(false);
      },
      error: error => {
        this.quiz.set(null);
        this.error.set(error?.status === 404 ? 'Este quiz ya no está disponible.' : 'No se pudo cargar el quiz. Intenta nuevamente.');
        this.loading.set(false);
      }
    });
  }

  retryLoad(): void { const id = this.unitId(); if (id !== null) this.load(id); }

  choose(questionIndex: number, optionIndex: number): void {
    this.answers.update(a => setAnswer(a, questionIndex, optionIndex));
  }

  letter(i: number): string { return String.fromCharCode(65 + i); }
  resultOf(questionId: number) { return resultFor(this.result()?.results ?? [], questionId); }

  submit(): void {
    const unitId = this.unitId();
    const submission = toSubmission(this.answers());
    if (unitId === null) return;
    if (!submission) { this.showMissing.set(true); return; }
    this.submitting.set(true);
    this.submitError.set('');
    this.api.submitAttempt(unitId, submission).subscribe({
      next: result => {
        this.result.set(result);
        this.submitting.set(false);
        this.nav.setQuizResult(unitId, { bestScore: result.bestScore, passed: result.passed || !!this.nav.quizResults()[unitId]?.passed });
        window.scrollTo({ top: 0 });
      },
      error: error => {
        this.submitting.set(false);
        this.submitError.set(error?.error?.error || 'No se pudo enviar tus respuestas. Intenta nuevamente.');
      }
    });
  }

  retry(): void {
    const quiz = this.quiz();
    if (!quiz) return;
    this.result.set(null);
    this.showMissing.set(false);
    this.answers.set(emptyAnswers(quiz.questions));
    window.scrollTo({ top: 0 });
  }

  afterQuiz(): void {
    if (this.nav.canGoNextUnit()) this.nav.goToNextUnit();
    else this.router.navigate(['/student/dashboard']);
  }
}
