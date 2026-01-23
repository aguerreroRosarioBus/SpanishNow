import { Component, Input, Output, EventEmitter, signal, effect, inject, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Question, QuestionSubmission, QuestionResult } from '../../../core/models/course.model';
import { QuestionResponseService } from '../../../core/services/question-response.service';

@Component({
  selector: 'app-activity-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-modal.component.html',
  styleUrl: './activity-modal.component.scss'
})
export class ActivityModalComponent {
  private questionResponseService = inject(QuestionResponseService);

  @Input() questions: Question[] = [];
  @Input() progressId: number | null = null;
  @Input() show!: WritableSignal<boolean>;
  @Output() completed = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();

  currentQuestionIndex = signal<number>(0);
  userAnswers = signal<Map<number, string>>(new Map());
  submitted = signal<boolean>(false);
  results = signal<QuestionResult[]>([]);
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string>('');

  constructor() {
    // Reset state when modal opens
    effect(() => {
      if (this.show()) {
        this.resetState();
      }
    });
  }

  resetState(): void {
    this.currentQuestionIndex.set(0);
    this.userAnswers.set(new Map());
    this.submitted.set(false);
    this.results.set([]);
    this.isSubmitting.set(false);
    this.errorMessage.set('');
  }

  get currentQuestion(): Question | null {
    return this.questions[this.currentQuestionIndex()] || null;
  }

  get totalQuestions(): number {
    return this.questions.length;
  }

  get isFirstQuestion(): boolean {
    return this.currentQuestionIndex() === 0;
  }

  get isLastQuestion(): boolean {
    return this.currentQuestionIndex() === this.totalQuestions - 1;
  }

  get allQuestionsAnswered(): boolean {
    return this.userAnswers().size === this.totalQuestions;
  }

  get currentAnswer(): string | undefined {
    const question = this.currentQuestion;
    if (!question) return undefined;
    return this.userAnswers().get(question.id);
  }

  selectAnswer(answer: string): void {
    const question = this.currentQuestion;
    if (!question || this.submitted()) return;

    const answers = new Map(this.userAnswers());
    answers.set(question.id, answer);
    this.userAnswers.set(answers);
  }

  previousQuestion(): void {
    if (!this.isFirstQuestion) {
      this.currentQuestionIndex.update(i => i - 1);
    }
  }

  nextQuestion(): void {
    if (!this.isLastQuestion) {
      this.currentQuestionIndex.update(i => i + 1);
    }
  }

  submitAnswers(): void {
    console.log('[ActivityModal] submitAnswers called');
    console.log('allQuestionsAnswered:', this.allQuestionsAnswered);
    console.log('progressId:', this.progressId);
    console.log('isSubmitting:', this.isSubmitting());
    console.log('userAnswers size:', this.userAnswers().size);
    console.log('totalQuestions:', this.totalQuestions);

    if (!this.allQuestionsAnswered || !this.progressId || this.isSubmitting()) {
      console.log('[ActivityModal] Submit blocked - validation failed');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const responses: QuestionSubmission[] = [];
    this.userAnswers().forEach((studentAnswer, questionId) => {
      responses.push({ questionId, studentAnswer });
    });

    console.log('[ActivityModal] Submitting responses:', responses);

    this.questionResponseService.submitResponses({
      progressId: this.progressId,
      responses
    }).subscribe({
      next: (result) => {
        this.submitted.set(true);
        this.results.set(result.results);
        this.isSubmitting.set(false);

        if (result.allCorrect) {
          // Wait 2 seconds before closing and emitting success
          setTimeout(() => {
            this.completed.emit(true);
          }, 2000);
        }
      },
      error: (error) => {
        console.error('Error submitting responses:', error);
        this.errorMessage.set('Error al enviar las respuestas. Intenta nuevamente.');
        this.isSubmitting.set(false);
      }
    });
  }

  retryIncorrect(): void {
    // Find incorrect answers and remove them
    const incorrectResults = this.results().filter(r => !r.isCorrect);
    const answers = new Map(this.userAnswers());

    incorrectResults.forEach(r => {
      answers.delete(r.questionId);
    });

    this.userAnswers.set(answers);
    this.submitted.set(false);
    this.results.set([]);

    // Navigate to first incorrect question
    const firstIncorrectIndex = this.questions.findIndex(q =>
      incorrectResults.some(r => r.questionId === q.id)
    );
    if (firstIncorrectIndex !== -1) {
      this.currentQuestionIndex.set(firstIncorrectIndex);
    }
  }

  getResultForQuestion(questionId: number): QuestionResult | undefined {
    return this.results().find(r => r.questionId === questionId);
  }

  isQuestionCorrect(questionId: number): boolean {
    const result = this.getResultForQuestion(questionId);
    return result?.isCorrect || false;
  }

  isQuestionIncorrect(questionId: number): boolean {
    const result = this.getResultForQuestion(questionId);
    return result !== undefined && !result.isCorrect;
  }

  get allCorrect(): boolean {
    return this.submitted() && this.results().every(r => r.isCorrect);
  }

  get hasIncorrectAnswers(): boolean {
    return this.submitted() && this.results().some(r => !r.isCorrect);
  }

  closeModal(): void {
    if (!this.submitted() || this.allCorrect) {
      this.close.emit();
    }
  }

  getAnswerButtonClass(option: string): string {
    const question = this.currentQuestion;
    if (!question) return 'btn-outline-primary';

    const isSelected = this.currentAnswer === option;

    if (!this.submitted()) {
      return isSelected ? 'btn-primary' : 'btn-outline-primary';
    }

    // After submission
    const result = this.getResultForQuestion(question.id);
    if (!result) return 'btn-outline-primary';

    if (isSelected) {
      return result.isCorrect ? 'btn-success' : 'btn-danger';
    }

    return 'btn-outline-secondary';
  }

  getProgressPercentage(): number {
    if (this.totalQuestions === 0) return 0;
    return Math.round((this.userAnswers().size / this.totalQuestions) * 100);
  }
}
