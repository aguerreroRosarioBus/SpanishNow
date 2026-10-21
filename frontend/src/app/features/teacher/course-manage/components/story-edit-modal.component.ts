import { Component, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StoryService } from '../../../../core/services/story.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Story } from '../../../../core/models/course.model';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';

/** Edición de título, texto y audios de una historia (reemplazar o eliminar audio actual). */
@Component({
  selector: 'app-story-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent],
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
    text: ['', [Validators.required, Validators.minLength(20)]]
  });

  ngOnInit(): void {
    this.form.patchValue({ title: this.story().title, text: this.story().text });
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const story = this.story();
    const formData = new FormData();
    formData.append('title', this.form.value.title!);
    formData.append('text', this.form.value.text!);

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
        this.toast.error('Error al actualizar la historia');
      }
    });
  }
}
