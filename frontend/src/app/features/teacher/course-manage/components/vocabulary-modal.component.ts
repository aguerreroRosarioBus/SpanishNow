import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VocabularyService } from '../../../../core/services/vocabulary.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Unit, Vocabulary } from '../../../../core/models/course.model';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';

/** Vocabulario de una unidad: alta con audio e imagen opcionales, listado y borrado. */
@Component({
  selector: 'app-vocabulary-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent],
  templateUrl: './vocabulary-modal.component.html'
})
export class VocabularyModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private vocabularyService = inject(VocabularyService);
  private toast = inject(ToastService);

  unit = input.required<Unit>();
  audio = viewChild.required<AudioInputComponent>('audio');

  vocabulary = signal<Vocabulary[]>([]);
  isSubmitting = signal(false);
  private imageFile: File | null = null;

  form = inject(FormBuilder).group({
    word: ['', [Validators.required, Validators.minLength(1)]],
    translation: ['', [Validators.required, Validators.minLength(1)]],
    example: [''],
    partOfSpeech: ['']
  });

  ngOnInit(): void {
    this.vocabularyService.getVocabularyByUnit(this.unit().id).subscribe({
      next: vocab => this.vocabulary.set(vocab),
      error: error => console.error('Error loading vocabulary:', error)
    });
  }

  close(): void { this.store.close(); }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.imageFile = file;
  }

  create(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);

    const formData = new FormData();
    formData.append('unitId', this.unit().id.toString());
    formData.append('word', this.form.value.word!);
    formData.append('translation', this.form.value.translation!);
    if (this.form.value.example) formData.append('example', this.form.value.example);
    if (this.form.value.partOfSpeech) formData.append('partOfSpeech', this.form.value.partOfSpeech);
    const audio = this.audio().getFile();
    if (audio) formData.append('audio', audio);
    if (this.imageFile) formData.append('image', this.imageFile);

    this.vocabularyService.createVocabulary(formData).subscribe({
      next: created => {
        this.vocabulary.update(list => [...list, created]);
        this.form.reset();
        this.audio().reset();
        this.imageFile = null;
        this.isSubmitting.set(false);
        this.toast.success('Vocabulario creado exitosamente');
      },
      error: error => {
        console.error('Error creating vocabulary:', error);
        this.toast.error('Error al crear vocabulario');
        this.isSubmitting.set(false);
      }
    });
  }

  remove(id: number): void {
    this.store.confirm('Eliminar Vocabulario', '¿Estás seguro de eliminar este vocabulario?', 'Eliminar', () => {
      this.vocabularyService.deleteVocabulary(id).subscribe({
        next: () => {
          this.vocabulary.update(list => list.filter(v => v.id !== id));
          this.toast.success('Vocabulario eliminado exitosamente');
        },
        error: error => {
          console.error('Error deleting vocabulary:', error);
          this.toast.error('Error al eliminar vocabulario');
        }
      });
    }, 'danger');
  }
}
