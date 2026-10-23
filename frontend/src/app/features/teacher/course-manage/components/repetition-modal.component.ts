import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RepetitionActivityService } from '../../../../core/services/repetition-activity.service';
import { ToastService } from '../../../../core/services/toast.service';
import { RepetitionActivity, Story } from '../../../../core/models/course.model';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AudioInputComponent } from '../audio/audio-input.component';
import { CourseManageStore } from '../course-manage.store';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/** Audios de escuchar y repetir de una historia: alta, listado, reordenamiento y borrado. */
@Component({
  selector: 'app-repetition-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AudioInputComponent, IconComponent, TranslatePipe],
  templateUrl: './repetition-modal.component.html'
})
export class RepetitionModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private service = inject(RepetitionActivityService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  story = input.required<Story>();
  audio = viewChild.required<AudioInputComponent>('audio');

  repetitions = signal<RepetitionActivity[]>([]);
  isSubmitting = signal(false);
  private dragged: RepetitionActivity | null = null;

  form = inject(FormBuilder).group({
    phrase: ['', [Validators.required, Validators.minLength(3)]]
  });

  ngOnInit(): void { this.load(); }

  close(): void { this.store.close(); }

  private load(): void {
    this.service.getActivitiesByStory(this.story().id).subscribe({
      next: activities => this.repetitions.set(activities),
      error: error => console.error('Error loading repetition activities:', error)
    });
  }

  create(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    const formData = new FormData();
    formData.append('storyId', this.story().id.toString());
    formData.append('phrase', this.form.value.phrase!);
    const audio = this.audio().getFile();
    if (audio) formData.append('audio', audio);

    this.service.createActivity(formData).subscribe({
      next: created => {
        this.repetitions.update(list => [...list, created]);
        this.form.reset();
        this.audio().reset();
        this.isSubmitting.set(false);
        this.toast.success(this.i18n.t('teacherManage.repetition.created'));
      },
      error: error => {
        console.error('Error creating repetition activity:', error);
        this.toast.error(this.i18n.t('teacherManage.repetition.createError'));
        this.isSubmitting.set(false);
      }
    });
  }

  remove(id: number): void {
    this.store.confirm('teacherManage.repetition.deleteTitle', 'teacherManage.repetition.deleteMessage', 'teacherManage.common.delete', () => {
      this.service.deleteActivity(id).subscribe({
        next: () => {
          this.repetitions.update(list => list.filter(r => r.id !== id));
          this.toast.success(this.i18n.t('teacherManage.repetition.deleted'));
        },
        error: error => {
          console.error('Error deleting repetition activity:', error);
          this.toast.error(this.i18n.t('teacherManage.repetition.deleteError'));
        }
      });
    }, 'danger');
  }

  // ===== Drag & drop =====

  onDragStart(event: DragEvent, activity: RepetitionActivity): void {
    this.dragged = activity;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onDrop(event: DragEvent, target: RepetitionActivity): void {
    event.preventDefault();
    event.stopPropagation();
    const dragged = this.dragged;
    this.dragged = null;
    if (!dragged || dragged.id === target.id) return;

    const list = [...this.repetitions()];
    const targetIndex = list.findIndex(r => r.id === target.id);
    const [removed] = list.splice(list.findIndex(r => r.id === dragged.id), 1);
    list.splice(targetIndex, 0, removed);
    const ordered = list.map((r, index) => ({ ...r, order: index }));
    this.repetitions.set(ordered);

    Promise.all(ordered.map(r => firstValueFrom(this.service.updateActivity(r.id, { order: r.order }))))
      .catch(error => {
        console.error('Error reordering repetition activities:', error);
        this.toast.error(this.i18n.t('teacherManage.repetition.reorderError'));
        this.load();
      });
  }
}
