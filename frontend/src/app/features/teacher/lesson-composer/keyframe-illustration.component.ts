import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LessonBlock, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IMAGE_ACCEPT, suggestAlt, validateImageFile } from './image-file';
import { WhiteboardService } from './whiteboard/whiteboard.service';

/** Ilustración de un keyframe: subir imagen o dibujarla en la pizarra. Mismo flujo de guardado previo que el audio. */
@Component({
  selector: 'app-keyframe-illustration',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './keyframe-illustration.component.html',
  styleUrl: './keyframe-illustration.component.scss'
})
export class KeyframeIllustrationComponent {
  private lessonApi = inject(LessonPlanService);
  private whiteboard = inject(WhiteboardService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  storyId = input.required<number>();
  block = input.required<LessonBlock>();
  dirty = input(false);
  disabled = input(false);
  ensureSaved = input<() => Promise<boolean>>(async () => true);
  imageChange = output<{ blockKey: string; imageUrl: string | null }>();
  altChange = output<{ blockKey: string; imageAlt: string }>();

  readonly accept = IMAGE_ACCEPT;
  busy = signal(false);
  error = signal('');
  confirmRemove = signal(false);
  enlarged = signal(false);

  suggestion = computed(() => suggestAlt(this.block().text));
  locked = computed(() => this.disabled() || this.busy());

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.upload(file);
  }

  async draw(editCurrent: boolean): Promise<void> {
    if (this.locked()) return;
    const file = await this.whiteboard.open({ backgroundUrl: editCurrent ? this.block().imageUrl ?? null : null, title: editCurrent ? 'Editar dibujo' : 'Dibujar ilustración' });
    if (file) await this.upload(file);
  }

  private async upload(file: File): Promise<void> {
    const invalid = validateImageFile(file);
    if (invalid) { this.error.set(invalid); return; }
    await this.run(async () => {
      const key = this.block().blockKey;
      const result = await firstValueFrom(this.lessonApi.uploadKeyframeImage(this.storyId(), key, file));
      this.imageChange.emit({ blockKey: key, imageUrl: result.imageUrl });
      if (!this.block().imageAlt?.trim() && this.suggestion()) this.altChange.emit({ blockKey: key, imageAlt: this.suggestion() });
    }, 'No se pudo subir la imagen. Inténtalo de nuevo.');
  }

  async remove(): Promise<void> {
    this.confirmRemove.set(false);
    await this.run(async () => {
      await firstValueFrom(this.lessonApi.deleteKeyframeImage(this.storyId(), this.block().blockKey));
      this.imageChange.emit({ blockKey: this.block().blockKey, imageUrl: null });
    }, 'No se pudo quitar la imagen.');
  }

  private async run(action: () => Promise<void>, fallback: string): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      if (this.dirty() && !(await this.ensureSaved()())) {
        this.error.set('Primero hay que guardar el borrador; revisa el mensaje de error del compositor.');
        return;
      }
      await action();
    } catch (error: any) {
      this.error.set(error?.error?.error || fallback);
    } finally {
      this.busy.set(false);
    }
  }

  openLarge(): void {
    this.enlarged.set(true);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.ill-lightbox-close')?.focus(), 0);
  }
  closeLarge(): void {
    this.enlarged.set(false);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.ill-thumb')?.focus(), 0);
  }

  onAlt(value: string): void { this.altChange.emit({ blockKey: this.block().blockKey, imageAlt: value }); }
  useSuggestion(): void { this.onAlt(this.suggestion()); }

  /** Escape cierra solo la vista ampliada, sin cerrar el compositor. */
  onLightboxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); this.closeLarge(); }
  }
}
