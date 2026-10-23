import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LessonBlock, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImageSearchComponent } from '../../../shared/components/image-search/image-search.component';
import { IMAGE_ACCEPT, imageFileErrorKey, suggestAlt } from './image-file';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Failure, failureText } from './failure';
import { WhiteboardService } from './whiteboard/whiteboard.service';

/** Ilustración de un keyframe: subir imagen o dibujarla en la pizarra. Mismo flujo de guardado previo que el audio. */
@Component({
  selector: 'app-keyframe-illustration',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ImageSearchComponent, TranslatePipe],
  templateUrl: './keyframe-illustration.component.html',
  styleUrl: './keyframe-illustration.component.scss'
})
export class KeyframeIllustrationComponent {
  private lessonApi = inject(LessonPlanService);
  private whiteboard = inject(WhiteboardService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private i18n = inject(I18nService);

  storyId = input.required<number>();
  block = input.required<LessonBlock>();
  dirty = input(false);
  disabled = input(false);
  ensureSaved = input<() => Promise<boolean>>(async () => true);
  imageChange = output<{ blockKey: string; imageUrl: string | null }>();
  altChange = output<{ blockKey: string; imageAlt: string }>();

  readonly accept = IMAGE_ACCEPT;
  busy = signal(false);
  private failure = signal<Failure | null>(null);
  error = computed(() => failureText(this.i18n, this.failure()));
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
    const file = await this.whiteboard.open({ backgroundUrl: editCurrent ? this.block().imageUrl ?? null : null, titleKey: editCurrent ? 'teacherComposer.wb.titleEdit' : 'teacherComposer.wb.titleIllustration' });
    if (file) await this.upload(file);
  }

  async upload(file: File): Promise<void> {
    if (this.locked()) return;
    const invalid = imageFileErrorKey(file);
    if (invalid) { this.failure.set({ key: invalid }); return; }
    await this.run(async () => {
      const key = this.block().blockKey;
      const result = await firstValueFrom(this.lessonApi.uploadKeyframeImage(this.storyId(), key, file));
      this.imageChange.emit({ blockKey: key, imageUrl: result.imageUrl });
      if (!this.block().imageAlt?.trim() && this.suggestion()) this.altChange.emit({ blockKey: key, imageAlt: this.suggestion() });
    }, 'teacherComposer.ill.uploadError');
  }

  async remove(): Promise<void> {
    this.confirmRemove.set(false);
    await this.run(async () => {
      await firstValueFrom(this.lessonApi.deleteKeyframeImage(this.storyId(), this.block().blockKey));
      this.imageChange.emit({ blockKey: this.block().blockKey, imageUrl: null });
    }, 'teacherComposer.ill.removeError');
  }

  private async run(action: () => Promise<void>, fallbackKey: string): Promise<void> {
    this.failure.set(null);
    this.busy.set(true);
    try {
      if (this.dirty() && !(await this.ensureSaved()())) {
        this.failure.set({ key: 'teacherComposer.ill.saveFirst' });
        return;
      }
      await action();
    } catch (error: any) {
      this.failure.set({ key: fallbackKey, error });
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
