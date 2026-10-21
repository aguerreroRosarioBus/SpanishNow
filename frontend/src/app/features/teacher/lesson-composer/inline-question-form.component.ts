import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Question } from '../../../core/models/course.model';
import { QuestionService } from '../../../core/services/question.service';

/** Crea una pregunta Sí/No o de dos opciones sin salir del compositor. */
@Component({
  selector: 'app-inline-question-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inline-question-form.component.html',
  styleUrl: './inline-forms.scss'
})
export class InlineQuestionFormComponent {
  private api = inject(QuestionService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

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
  error = signal('');

  options = computed(() => (this.type() === 'yes_no' ? ['Sí', 'No'] : [this.optionA().trim(), this.optionB().trim()]));
  validation = computed(() => {
    if (!this.text().trim()) return 'Escribe la pregunta.';
    const options = this.options();
    if (this.type() === 'choice') {
      if (!options[0] || !options[1]) return 'Escribe las dos opciones.';
      if (options[0].toLocaleLowerCase('es') === options[1].toLocaleLowerCase('es')) return 'Las dos opciones deben ser distintas.';
    }
    if (this.correctAnswer() === '') return 'Marca la respuesta correcta.';
    return '';
  });

  ngAfterViewInit(): void { setTimeout(() => (this.host.nativeElement.querySelector('textarea, input') as HTMLElement | null)?.focus(), 0); }

  correctAnswer(): string {
    const c = this.correct();
    if (this.type() === 'yes_no') return c;
    return c === '0' || c === '1' ? this.options()[+c] : '';
  }

  setType(type: 'yes_no' | 'choice'): void { this.type.set(type); this.correct.set(''); this.error.set(''); }

  async submit(): Promise<void> {
    if (this.validation() || this.busy()) { this.error.set(this.validation()); return; }
    this.busy.set(true); this.error.set('');
    try {
      const question = await firstValueFrom(this.api.createQuestion({
        storyId: this.storyId(), questionText: this.text().trim(), answerType: this.type(),
        options: this.options(), correctAnswer: this.correctAnswer()
      }));
      this.created.emit(question);
    } catch (error: any) {
      this.error.set(error?.error?.error || 'No se pudo crear la pregunta.');
    } finally { this.busy.set(false); }
  }
}
