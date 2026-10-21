import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { QuestionService } from '../../../../core/services/question.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Question, Story } from '../../../../core/models/course.model';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';
import { TooltipModalComponent } from './tooltip-modal.component';

/** Preguntas de una historia: alta/edición con audio opcional, listado, borrado y tooltips por pregunta. */
@Component({
  selector: 'app-question-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent, TooltipModalComponent],
  templateUrl: './question-modal.component.html',
  styleUrl: './question-modal.component.scss'
})
export class QuestionModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private questionService = inject(QuestionService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  story = input.required<Story>();
  audio = viewChild.required<AudioInputComponent>('audio');

  questions = signal<Question[]>([]);
  isSubmitting = signal(false);
  isEditing = signal(false);
  editingId = signal<number | null>(null);
  tooltipQuestion = signal<Question | null>(null);

  form = this.fb.group({
    questionText: ['', [Validators.required, Validators.minLength(5)]],
    answerType: ['yes_no', Validators.required],
    options: this.fb.array<FormControl<string | null>>([]),
    correctAnswer: ['', Validators.required]
  });

  get options(): FormArray { return this.form.get('options') as FormArray; }
  get answerType(): string | null | undefined { return this.form.get('answerType')?.value; }

  ngOnInit(): void {
    this.questionService.getQuestionsByStory(this.story().id).subscribe({
      next: questions => {
        this.questions.set(questions);
        this.store.setStoryQuestions(this.story().id, questions);
      },
      error: error => {
        console.error('Error loading questions:', error);
        this.toast.error('Error al cargar las preguntas');
      }
    });
  }

  close(): void { this.store.close(); }

  private resetForm(): void {
    this.form.reset({ questionText: '', answerType: 'yes_no', correctAnswer: '' });
    this.options.clear();
    this.audio().reset();
  }

  addOption(): void { this.options.push(new FormControl('', Validators.required)); }
  removeOption(index: number): void {
    if (this.options.length > 2) this.options.removeAt(index);
  }

  edit(question: Question): void {
    this.isEditing.set(true);
    this.editingId.set(question.id);
    this.audio().reset();
    this.form.patchValue({
      questionText: question.questionText,
      answerType: question.answerType,
      correctAnswer: question.correctAnswer || ''
    });
    this.options.clear();
    if (question.answerType === 'choice' && question.options) {
      question.options.forEach(option => this.options.push(new FormControl(option, Validators.required)));
    }
    setTimeout(() => {
      document.querySelector('.card-header.bg-primary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.resetForm();
  }

  submit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);

    const answerType = this.form.value.answerType as Question['answerType'];
    const data: Partial<Question> = {
      storyId: this.story().id,
      questionText: this.form.value.questionText!,
      answerType,
      correctAnswer: this.form.value.correctAnswer!
    };
    if (answerType === 'choice') {
      data.options = (this.options.value as string[]).filter(opt => opt.trim() !== '');
      if (data.options.length < 2) {
        this.toast.warning('Debes agregar al menos 2 opciones');
        this.isSubmitting.set(false);
        return;
      }
    }

    const editing = this.isEditing();
    const questionId = this.editingId();
    const audioFile = this.audio().getFile();
    const request$ = audioFile
      ? (editing && questionId ? this.questionService.updateQuestionWithAudio(questionId, data, audioFile) : this.questionService.createQuestionWithAudio(data, audioFile))
      : (editing && questionId ? this.questionService.updateQuestion(questionId, data) : this.questionService.createQuestion(data));

    request$.subscribe({
      next: question => {
        const storyId = this.story().id;
        if (editing && questionId) {
          this.questions.update(list => list.map(q => q.id === questionId ? question : q));
          this.store.patchStory(storyId, s => ({ ...s, questions: (s.questions || []).map(q => q.id === questionId ? question : q) }));
          this.toast.success('Pregunta actualizada exitosamente');
        } else {
          this.questions.update(list => [...list, question]);
          this.store.patchStory(storyId, s => ({ ...s, questions: [...(s.questions || []), question] }));
          this.toast.success('Pregunta creada exitosamente');
        }
        this.resetForm();
        this.isSubmitting.set(false);
        this.isEditing.set(false);
        this.editingId.set(null);
      },
      error: error => {
        console.error(`Error ${editing ? 'updating' : 'creating'} question:`, error);
        this.toast.error(`Error al ${editing ? 'actualizar' : 'crear'} la pregunta`);
        this.isSubmitting.set(false);
      }
    });
  }

  remove(questionId: number): void {
    this.store.confirm('Eliminar Pregunta', '¿Estás seguro de eliminar esta pregunta?', 'Eliminar', () => {
      this.questionService.deleteQuestion(questionId).subscribe({
        next: () => {
          this.questions.update(list => list.filter(q => q.id !== questionId));
          this.store.patchStory(this.story().id, s => ({ ...s, questions: (s.questions || []).filter(q => q.id !== questionId) }));
          this.toast.success('Pregunta eliminada exitosamente');
        },
        error: error => {
          console.error('Error deleting question:', error);
          this.toast.error('Error al eliminar la pregunta');
        }
      });
    }, 'danger');
  }
}
