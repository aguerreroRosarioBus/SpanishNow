import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Question } from '../../../core/models/course.model';
import { QuestionService } from '../../../core/services/question.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Failure, failureText } from './failure';

/** Crea una pregunta Sí/No o de dos opciones sin salir del compositor. */
@Component({
  selector: 'app-inline-question-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './inline-question-form.component.html',
  styleUrl: './inline-forms.scss'
})
export class InlineQuestionFormComponent {
  private api = inject(QuestionService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private i18n = inject(I18nService);

  storyId = input.required<number>();
  /** Texto del keyframe de contexto (solo para orientar a la profesora). */
  contextText = input('');
  /** Prefijo único para los ids de los campos. */
  uid = input('q');
  created = output<Question>();
  cancelled = output<void>();

  text = signal('');
  type = signal<'yes_no' | 'choice'>('yes_no');
  optionA = signal('');
  optionB = signal('');
  correct = signal(''); // 'Sí'/'No' en yes_no; '0'/'1' (índice) en choice
  busy = signal(false);
  /** Error pendiente de traducir (validación de envío o fallo del servidor). */
  private failure = signal<Failure | null>(null);
  error = computed(() => failureText(this.i18n, this.failure()));

  options = computed(() => (this.type() === 'yes_no' ? ['Sí', 'No'] : [this.optionA().trim(), this.optionB().trim()]));
  /** Clave I18N de la primera regla incumplida ('' si el formulario es válido). */
  private validationKey = computed(() => {
    if (!this.text().trim()) return 'teacherComposer.qForm.enterQuestion';
    const options = this.options();
    if (this.type() === 'choice') {
      if (!options[0] || !options[1]) return 'teacherComposer.qForm.enterOptions';
      if (options[0].toLocaleLowerCase('es') === options[1].toLocaleLowerCase('es')) return 'teacherComposer.qForm.distinctOptions';
    }
    if (this.correctAnswer() === '') return 'teacherComposer.qForm.markCorrect';
    return '';
  });
  validation = computed(() => { const key = this.validationKey(); return key ? this.i18n.t(key) : ''; });

  ngAfterViewInit(): void { setTimeout(() => (this.host.nativeElement.querySelector('textarea, input') as HTMLElement | null)?.focus(), 0); }

  correctAnswer(): string {
    const c = this.correct();
    if (this.type() === 'yes_no') return c;
    return c === '0' || c === '1' ? this.options()[+c] : '';
  }

  setType(type: 'yes_no' | 'choice'): void { this.type.set(type); this.correct.set(''); this.failure.set(null); }

  async submit(): Promise<void> {
    if (this.validationKey() || this.busy()) { if (this.validationKey()) this.failure.set({ key: this.validationKey() }); return; }
    this.busy.set(true); this.failure.set(null);
    try {
      const question = await firstValueFrom(this.api.createQuestion({
        storyId: this.storyId(), questionText: this.text().trim(), answerType: this.type(),
        options: this.options(), correctAnswer: this.correctAnswer()
      }));
      this.created.emit(question);
    } catch (error: any) {
      this.failure.set({ key: 'teacherComposer.qForm.createError', error });
    } finally { this.busy.set(false); }
  }
}
