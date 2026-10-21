import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { KeyframeTooltip, LessonBlock, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { Tooltip, TooltipService } from '../../../core/services/tooltip.service';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './keyframe-extras.component.html',
  styleUrl: './keyframe-extras.component.scss'
})
export class KeyframeExtrasComponent {
  private lessonApi = inject(LessonPlanService);
  private tooltipApi = inject(TooltipService);

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
  audioError = signal('');

  // Tooltips
  selection = signal({ start: 0, end: 0 });
  creating = signal(false);
  newContent = signal('');
  editingId = signal<number | null>(null);
  editContent = signal('');
  tooltipBusy = signal(false);
  tooltipError = signal('');

  savedText = computed(() => this.saved()?.text ?? '');
  tooltips = computed(() => this.saved()?.tooltips ?? []);
  tooltipBlockReason = computed(() => {
    if (!this.saved()) return 'Guarda el borrador para poder crear tooltips en este keyframe.';
    if ((this.block().text ?? '') !== this.savedText()) return 'El texto de este keyframe tiene cambios sin guardar. Guarda el borrador para crear tooltips.';
    if (!this.savedText().trim()) return 'Escribe y guarda el texto del keyframe para crear tooltips.';
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
    if (file.type && !file.type.startsWith('audio/')) { this.audioError.set('El archivo seleccionado no es un audio.'); return; }
    await this.runAudio(async () => {
      const result = await firstValueFrom(this.lessonApi.uploadKeyframeAudio(this.storyId(), this.block().blockKey, file));
      this.audioChange.emit({ blockKey: this.block().blockKey, audioUrl: result.audioUrl });
    }, 'No se pudo subir el audio. Inténtalo de nuevo.');
  }

  async removeAudio(): Promise<void> {
    await this.runAudio(async () => {
      await firstValueFrom(this.lessonApi.deleteKeyframeAudio(this.storyId(), this.block().blockKey));
      this.audioChange.emit({ blockKey: this.block().blockKey, audioUrl: null });
    }, 'No se pudo quitar el audio.');
  }

  private async runAudio(action: () => Promise<void>, fallback: string): Promise<void> {
    this.audioError.set('');
    this.uploading.set(true);
    try {
      if (this.dirty() && !(await this.ensureSaved()())) {
        this.audioError.set('Primero hay que guardar el borrador; revisa el mensaje de error del compositor.');
        return;
      }
      await action();
    } catch (error: any) {
      this.audioError.set(error?.error?.error || fallback);
    } finally {
      this.uploading.set(false);
    }
  }

  // Selección sobre el textarea de solo lectura: sus índices coinciden con text.slice().
  onSelect(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.selection.set({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
  }

  startCreate(): void { if (this.canCreate()) { this.creating.set(true); this.newContent.set(''); this.tooltipError.set(''); } }
  cancelCreate(): void { this.creating.set(false); }

  async createTooltip(): Promise<void> {
    const { start, end } = this.selection();
    const content = this.newContent().trim();
    if (!this.canCreate() || !content) return;
    this.tooltipBusy.set(true); this.tooltipError.set('');
    try {
      const created = await firstValueFrom(this.tooltipApi.createTooltip({
        targetType: 'keyframe', targetId: this.storyId(), blockKey: this.block().blockKey,
        startOffset: start, endOffset: end, selectedText: this.savedText().slice(start, end), tooltipContent: content
      }));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: [...this.tooltips(), toKeyframeTooltip(created, { id: created.id, startOffset: start, endOffset: end, selectedText: this.savedText().slice(start, end), tooltipContent: content, isActive: true })] });
      this.creating.set(false); this.selection.set({ start: 0, end: 0 });
    } catch (error: any) {
      this.tooltipError.set(error?.error?.error || 'No se pudo crear el tooltip.');
    } finally { this.tooltipBusy.set(false); }
  }

  startEdit(tooltip: KeyframeTooltip): void { this.editingId.set(tooltip.id); this.editContent.set(tooltip.tooltipContent); this.tooltipError.set(''); }
  cancelEdit(): void { this.editingId.set(null); }

  async saveEdit(tooltip: KeyframeTooltip): Promise<void> {
    const content = this.editContent().trim();
    if (!content) return;
    this.tooltipBusy.set(true); this.tooltipError.set('');
    try {
      const updated = await firstValueFrom(this.tooltipApi.updateTooltip(tooltip.id, { tooltipContent: content }));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: this.tooltips().map(t => t.id === tooltip.id ? toKeyframeTooltip({ ...updated, tooltipContent: updated?.tooltipContent ?? content }, t) : t) });
      this.editingId.set(null);
    } catch (error: any) {
      this.tooltipError.set(error?.error?.error || 'No se pudo actualizar el tooltip.');
    } finally { this.tooltipBusy.set(false); }
  }

  async deleteTooltip(tooltip: KeyframeTooltip): Promise<void> {
    this.tooltipBusy.set(true); this.tooltipError.set('');
    try {
      await firstValueFrom(this.tooltipApi.deleteTooltip(tooltip.id));
      this.tooltipsChange.emit({ blockKey: this.block().blockKey, tooltips: this.tooltips().filter(t => t.id !== tooltip.id) });
    } catch (error: any) {
      this.tooltipError.set(error?.error?.error || 'No se pudo eliminar el tooltip.');
    } finally { this.tooltipBusy.set(false); }
  }
}
