import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { KeyframeTooltip, LessonBlock, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { Tooltip, TooltipService } from '../../../core/services/tooltip.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Failure, failureText } from './failure';

const toKeyframeTooltip = (t: Tooltip, fallback?: KeyframeTooltip): KeyframeTooltip => ({
  id: t.id,
  startOffset: t.startOffset ?? fallback?.startOffset ?? 0,
  endOffset: t.endOffset ?? fallback?.endOffset ?? 0,
  selectedText: t.selectedText ?? fallback?.selectedText ?? '',
  tooltipContent: t.tooltipContent,
  isActive: t.isActive ?? fallback?.isActive ?? true
});

/** Audio y tooltips de un keyframe del compositor. Los offsets son relativos al texto del keyframe GUARDADO. */
@Component({
  selector: 'app-keyframe-extras',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './keyframe-extras.component.html',
  styleUrl: './keyframe-extras.component.scss'
})
export class KeyframeExtrasComponent {
  private lessonApi = inject(LessonPlanService);
  private tooltipApi = inject(TooltipService);
  private i18n = inject(I18nService);

  storyId = input.required<number>();
  block = input.required<LessonBlock>();
  /** Versión guardada del bloque en el borrador (null si el bloque aún no se guardó). */
  saved = input<LessonBlock | null>(null);
  dirty = input(false);
  disabled = input(false);
  ensureSaved = input<() => Promise<boolean>>(async () => true);
  audioChange = output<{ blockKey: string; audioUrl: string | null }>();
  tooltipsChange = output<{ blockKey: string; tooltips: KeyframeTooltip[] }>();

  // Audio
  uploading = signal(false);
  private audioFailure = signal<Failure | null>(null);
  audioError = computed(() => failureText(this.i18n, this.audioFailure()));

  // Tooltips
  selection = signal({ start: 0, end: 0 });
  creating = signal(false);
  newContent = signal('');
  editingId = signal<number | null>(null);
  editContent = signal('');
  tooltipBusy = signal(false);
  private tooltipFailure = signal<Failure | null>(null);
  tooltipError = computed(() => failureText(this.i18n, this.tooltipFailure()));

  savedText = computed(() => this.saved()?.text ?? '');
  tooltips = computed(() => this.saved()?.tooltips ?? []);
  tooltipBlockReason = computed(() => {
    if (!this.saved()) return this.i18n.t('teacherComposer.extras.reasonUnsavedBlock');
    if ((this.block().text ?? '') !== this.savedText()) return this.i18n.t('teacherComposer.extras.reasonUnsavedText');
    if (!this.savedText().trim()) return this.i18n.t('teacherComposer.extras.reasonEmpty');
    return '';
  });
  selectedSnippet = computed(() => {
    const { start, end } = this.selection();
    return this.savedText().slice(start, end);
  });
  selectionOverlaps = computed(() => {
    const { start, end } = this.selection();
    return this.tooltips().some(t => t.isActive && start < t.endOffset && end > t.startOffset);
  });
  canCreate = computed(() => !this.disabled() && !this.tooltipBlockReason() && !!this.selectedSnippet().trim() && !this.selectionOverlaps());

  async onAudioFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('audio/')) { this.audioFailure.set({ key: 'teacherComposer.extras.notAudio' }); return; }
    await this.runAudio(async () => {
      const result = await firstValueFrom(this.lessonApi.uploadKeyframeAudio(this.storyId(), this.block().blockKey, file));
      this.audioChange.emit({ blockKey: this.block().blockKey, audioUrl: result.audioUrl });
    }, 'teacherComposer.extras.uploadError');
  }

  async removeAudio(): Promise<void> {
    await this.runAudio(async () => {
      await firstValueFrom(this.lessonApi.deleteKeyframeAudio(this.storyId(), this.block().blockKey));
      this.audioChange.emit({ blockKey: this.block().blockKey, audioUrl: null });
    }, 'teacherComposer.extras.removeError');
  }

  private async runAudio(action: () => Promise<void>, fallbackKey: string): Promise<void> {
    this.audioFailure.set(null);
    this.uploading.set(true);
    try {
      if (this.dirty() && !(await this.ensureSaved()())) {
        this.audioFailure.set({ key: 'teacherComposer.extras.saveFirst' });
        return;
      }
      await action();
    } catch (error: any) {
      this.audioFailure.set({ key: fallbackKey, error });
    } finally {
      this.uploading.set(false);
    }
  }

  // Selección sobre el textarea de solo lectura: sus índices coinciden con text.slice().
  onSelect(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.selection.set({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
  }

  startCreate(): void { if (this.canCreate()) { this.creating.set(true); this.newContent.set(''); this.tooltipFailure.set(null); } }
  cancelCreate(): void { this.creating.set(false); }

  async createTooltip(): Promise<void> {
    const { start, end } = this.selection();
    const content = this.newContent().trim();
    if (!this.canCreate() || !content) return;
    this.tooltipBusy.set(true); this.tooltipFailure.set(null);
    try {
      const created = await firstValueFrom(this.tooltipApi.createTooltip({
        targetType: 'keyframe', targetId: this.storyId(), blockKey: this.block().blockKey,
        startOffset: start, endOffset: end, selectedText: this.savedText().slice(start, end), tooltipContent: content
      }));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: [...this.tooltips(), toKeyframeTooltip(created, { id: created.id, startOffset: start, endOffset: end, selectedText: this.savedText().slice(start, end), tooltipContent: content, isActive: true })] });
      this.creating.set(false); this.selection.set({ start: 0, end: 0 });
    } catch (error: any) {
      this.tooltipFailure.set({ key: 'teacherComposer.extras.createError', error });
    } finally { this.tooltipBusy.set(false); }
  }

  startEdit(tooltip: KeyframeTooltip): void { this.editingId.set(tooltip.id); this.editContent.set(tooltip.tooltipContent); this.tooltipFailure.set(null); }
  cancelEdit(): void { this.editingId.set(null); }

  async saveEdit(tooltip: KeyframeTooltip): Promise<void> {
    const content = this.editContent().trim();
    if (!content) return;
    this.tooltipBusy.set(true); this.tooltipFailure.set(null);
    try {
      const updated = await firstValueFrom(this.tooltipApi.updateTooltip(tooltip.id, { tooltipContent: content }));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: this.tooltips().map(t => t.id === tooltip.id ? toKeyframeTooltip({ ...updated, tooltipContent: updated?.tooltipContent ?? content }, t) : t) });
      this.editingId.set(null);
    } catch (error: any) {
      this.tooltipFailure.set({ key: 'teacherComposer.extras.updateError', error });
    } finally { this.tooltipBusy.set(false); }
  }

  async deleteTooltip(tooltip: KeyframeTooltip): Promise<void> {
    this.tooltipBusy.set(true); this.tooltipFailure.set(null);
    try {
      await firstValueFrom(this.tooltipApi.deleteTooltip(tooltip.id));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: this.tooltips().filter(t => t.id !== tooltip.id) });
    } catch (error: any) {
      this.tooltipFailure.set({ key: 'teacherComposer.extras.deleteError', error });
    } finally { this.tooltipBusy.set(false); }
  }
}
