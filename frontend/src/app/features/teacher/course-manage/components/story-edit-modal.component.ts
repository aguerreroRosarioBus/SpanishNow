import { Component, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StoryService } from '../../../../core/services/story.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Story } from '../../../../core/models/course.model';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/** Edición de título, texto (si no hay lección) y audios de una historia (reemplazar o eliminar audio actual). */
@Component({
  selector: 'app-story-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent, IconComponent],
  templateUrl: './story-edit-modal.component.html'
})
export class StoryEditModalComponent {
  private store = inject(CourseManageStore);
  private storyService = inject(StoryService);
  private toast = inject(ToastService);

  story = input.required<Story>();
  slow = viewChild.required<AudioInputComponent>('slow');
  normal = viewChild.required<AudioInputComponent>('normal');

  deleteAudioSlow = signal(false);
  deleteAudioNormal = signal(false);

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    text: ['']
  });

  /** Con lección, el texto lo genera el compositor y aquí es de solo lectura. */
  textLocked = signal(false);

  ngOnInit(): void {
    this.textLocked.set(!!this.story().hasLessonPlan);
    this.form.patchValue({ title: this.story().title, text: this.story().text });
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const story = this.story();
    const formData = new FormData();
    formData.append('title', this.form.value.title!);
    if (!this.textLocked() && (this.form.value.text ?? '') !== (story.text ?? '')) formData.append('text', this.form.value.text ?? '');

    const slow = this.slow().getFile();
    if (slow) formData.append('audioSlow', slow);
    else if (this.deleteAudioSlow()) formData.append('deleteAudioSlow', 'true');

    const normal = this.normal().getFile();
    if (normal) formData.append('audioNormal', normal);
    else if (this.deleteAudioNormal()) formData.append('deleteAudioNormal', 'true');

    this.storyService.updateStory(story.id, formData).subscribe({
      next: updated => {
        this.store.patchStory(updated.id, s => ({ ...s, ...updated }));
        this.close();
        this.toast.success('Historia actualizada exitosamente');
      },
      error: error => {
        console.error('Error updating story:', error);
        if (error?.status === 409) {
          // La historia ya tenía lección aunque no lo sabíamos: se bloquea el texto y se conserva lo demás.
          this.store.patchStory(story.id, s => ({ ...s, hasLessonPlan: true }));
          this.textLocked.set(true);
          this.form.patchValue({ text: story.text });
          this.toast.error('El texto se genera desde la lección. Editalo en el compositor.');
        } else this.toast.error('Error al actualizar la historia');
      }
    });
  }
}
