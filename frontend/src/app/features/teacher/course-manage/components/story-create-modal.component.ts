import { Component, inject, input, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StoryService } from '../../../../core/services/story.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';

/** Nueva historia con audios lento y normal opcionales (subidos o grabados). */
@Component({
  selector: 'app-story-create-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent],
  templateUrl: './story-create-modal.component.html'
})
export class StoryCreateModalComponent {
  private store = inject(CourseManageStore);
  private storyService = inject(StoryService);
  private toast = inject(ToastService);

  unitId = input.required<number>();
  slow = viewChild.required<AudioInputComponent>('slow');
  normal = viewChild.required<AudioInputComponent>('normal');

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    text: ['', [Validators.required, Validators.minLength(20)]]
  });

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const formData = new FormData();
    formData.append('unitId', this.unitId().toString());
    formData.append('title', this.form.value.title!);
    formData.append('text', this.form.value.text!);
    const slow = this.slow().getFile();
    const normal = this.normal().getFile();
    if (slow) formData.append('audioSlow', slow);
    if (normal) formData.append('audioNormal', normal);

    this.storyService.createStory(formData).subscribe({
      next: story => {
        this.store.addStory(this.unitId(), story);
        this.close();
      },
      error: error => {
        console.error('Error creating story:', error);
        this.toast.error('Error al crear la historia');
      }
    });
  }
}
