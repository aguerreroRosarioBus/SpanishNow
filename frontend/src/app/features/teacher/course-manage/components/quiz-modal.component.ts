import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { QuizQuestionDraft, UnitQuiz } from '../../../../core/models/content.model';
import { Unit } from '../../../../core/models/course.model';
import { QuizService } from '../../../../core/services/quiz.service';
import { ToastService } from '../../../../core/services/toast.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { CourseContentStore } from '../course-content.store';
import { CourseManageStore } from '../course-manage.store';
import {
  QUIZ_LIMITS, addOption, emptyQuestion, emptyQuiz, moveQuestion, removeOption, toPayload, validateQuiz
} from '../quiz-editor.logic';

/** Editor del quiz de una unidad: título, puntaje, publicación y preguntas de opción múltiple. */
@Component({
  selector: 'app-quiz-modal',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './quiz-modal.component.html'
})
export class QuizModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private content = inject(CourseContentStore);
  private api = inject(QuizService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  unit = input.required<Unit>();

  readonly limits = QUIZ_LIMITS;
  quiz = signal<UnitQuiz>(emptyQuiz());
  /** El quiz ya existe en el servidor (habilita «Eliminar quiz»). */
  exists = signal(false);
  isLoading = signal(true);
  isSaving = signal(false);
  /** Claves I18N de los avisos ('' = sin aviso); el error del servidor se guarda crudo y se traduce al leer. */
  loadError = signal('');
  private notice = signal('');
  private saveFailure = signal<{ error: unknown } | null>(null);
  errorMessage = computed(() => {
    const failure = this.saveFailure();
    if (failure) return this.i18n.errorMessage(failure.error, 'teacherManage.quiz.saveError');
    return this.notice() ? this.i18n.t(this.notice()) : '';
  });
  showErrors = signal(false);

  heading = computed(() => this.i18n.t('teacherManage.quiz.heading', { unit: unitDisplayTitle(this.unit().title) }));
  validation = computed(() => validateQuiz(this.quiz()));

  ngOnInit(): void {
    this.api.getForTeacher(this.unit().id).subscribe({
      next: quiz => {
        this.quiz.set({ ...quiz, questions: quiz.questions.map(q => ({ ...q, explanation: q.explanation ?? '' })) });
        this.exists.set(true);
        this.isLoading.set(false);
      },
      error: error => {
        if (error?.status === 404) this.quiz.set(emptyQuiz());
        else this.loadError.set('teacherManage.quiz.loadError');
        this.isLoading.set(false);
      }
    });
  }

  close(): void { this.store.close(); }

  setField(field: 'title', value: string): void { this.quiz.update(q => ({ ...q, [field]: value })); }
  setScore(value: string): void { this.quiz.update(q => ({ ...q, passingScore: value === '' ? NaN : Number(value) })); }
  setPublished(value: boolean): void { this.quiz.update(q => ({ ...q, isPublished: value })); }

  private patchQuestion(index: number, change: (q: QuizQuestionDraft) => QuizQuestionDraft): void {
    this.quiz.update(quiz => ({ ...quiz, questions: quiz.questions.map((q, i) => i === index ? change(q) : q) }));
  }

  setPrompt(index: number, value: string): void { this.patchQuestion(index, q => ({ ...q, prompt: value })); }
  setExplanation(index: number, value: string): void { this.patchQuestion(index, q => ({ ...q, explanation: value })); }
  setCorrect(index: number, optionIndex: number): void { this.patchQuestion(index, q => ({ ...q, correctIndex: optionIndex })); }
  setOption(index: number, optionIndex: number, value: string): void {
    this.patchQuestion(index, q => ({ ...q, options: q.options.map((o, i) => i === optionIndex ? value : o) }));
  }
  addOption(index: number): void { this.patchQuestion(index, addOption); }
  removeOption(index: number, optionIndex: number): void { this.patchQuestion(index, q => removeOption(q, optionIndex)); }

  addQuestion(): void {
    if (this.quiz().questions.length >= QUIZ_LIMITS.maxQuestions) return;
    this.quiz.update(q => ({ ...q, questions: [...q.questions, emptyQuestion()] }));
  }
  removeQuestion(index: number): void {
    this.quiz.update(q => ({ ...q, questions: q.questions.filter((_, i) => i !== index) }));
  }
  move(index: number, offset: number): void {
    this.quiz.update(q => ({ ...q, questions: moveQuestion(q.questions, index, index + offset) }));
  }

  letter(i: number): string { return String.fromCharCode(65 + i); }

  save(): void {
    this.showErrors.set(true);
    if (!this.validation().valid) {
      this.saveFailure.set(null);
      this.notice.set('teacherManage.quiz.reviewFields');
      return;
    }
    this.saveFailure.set(null);
    this.notice.set('');
    this.isSaving.set(true);
    const unitId = this.unit().id;
    this.api.save(unitId, toPayload(this.quiz())).subscribe({
      next: saved => {
        this.content.setQuiz(unitId, saved);
        this.isSaving.set(false);
        this.close();
        this.toast.success(this.i18n.t(saved.isPublished ? 'teacherManage.quiz.savedPublished' : 'teacherManage.quiz.savedDraft'));
      },
      error: error => {
        this.isSaving.set(false);
        this.notice.set('');
        this.saveFailure.set({ error });
      }
    });
  }

  deleteQuiz(): void {
    const unitId = this.unit().id;
    this.store.confirm('teacherManage.quiz.deleteTitle', 'teacherManage.quiz.deleteMessage', 'teacherManage.quiz.deleteTitle', () => {
      this.api.remove(unitId).subscribe({
        next: () => {
          this.content.setQuiz(unitId, null);
          this.close();
          this.toast.success(this.i18n.t('teacherManage.quiz.deleted'));
        },
        error: () => this.toast.error(this.i18n.t('teacherManage.quiz.deleteError'))
      });
    }, 'danger');
  }
}
