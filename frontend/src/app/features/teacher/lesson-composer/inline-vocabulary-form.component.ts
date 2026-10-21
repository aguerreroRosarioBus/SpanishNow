import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Vocabulary } from '../../../core/models/course.model';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImageSearchComponent } from '../../../shared/components/image-search/image-search.component';
import { IMAGE_ACCEPT, validateImageFile } from './image-file';
import { WhiteboardService } from './whiteboard/whiteboard.service';

/** Crea (o reutiliza) una expresión del vocabulario de la unidad sin salir del compositor. */
@Component({
  selector: 'app-inline-vocabulary-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ImageSearchComponent],
  templateUrl: './inline-vocabulary-form.component.html',
  styleUrl: './inline-forms.scss'
})
export class InlineVocabularyFormComponent implements OnDestroy {
  private api = inject(VocabularyService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private whiteboard = inject(WhiteboardService);

  unitId = input.required<number>();
  initialWord = input('');
  /** Vocabulario actual de la unidad: una palabra igual (sin mayúsculas) se reutiliza en vez de duplicarse. */
  existing = input<Vocabulary[]>([]);
  uid = input('v');
  created = output<Vocabulary>();
  cancelled = output<void>();

  readonly accept = IMAGE_ACCEPT;
  image = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  word = signal('');
  translation = signal('');
  busy = signal(false);
  error = signal('');
  match = computed(() => {
    const key = this.word().trim().toLocaleLowerCase('es');
    return key ? this.existing().find(v => v.word.trim().toLocaleLowerCase('es') === key) ?? null : null;
  });

  ngOnDestroy(): void { this.setImage(null); }

  setImage(file: File | null): void {
    const previous = this.imagePreview();
    if (previous && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previous);
    this.image.set(file);
    this.imagePreview.set(file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null);
  }
  onImageFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) { this.error.set(invalid); return; }
    this.error.set(''); this.setImage(file);
  }
  async draw(): Promise<void> {
    const file = await this.whiteboard.open({ backgroundUrl: null, title: 'Dibujar la expresión' });
    if (file) { this.error.set(''); this.setImage(file); }
  }
  removeImage(): void { this.setImage(null); }

  ngOnInit(): void { this.word.set(this.initialWord().trim()); }
  ngAfterViewInit(): void {
    setTimeout(() => (this.host.nativeElement.querySelector(this.initialWord() ? `#${this.uid()}-tr` : `#${this.uid()}-word`) as HTMLElement | null)?.focus(), 0);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    const match = this.match();
    if (match) { this.created.emit(match); return; }
    const word = this.word().trim(), translation = this.translation().trim();
    if (!word || !translation) { this.error.set('Escribe la expresión y su traducción.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      const form = new FormData();
      form.append('unitId', String(this.unitId()));
      form.append('word', word);
      form.append('translation', translation);
      const image = this.image();
      if (image) form.append('image', image, image.name);
      this.created.emit(await firstValueFrom(this.api.createVocabulary(form)));
    } catch (error: any) {
      this.error.set(error?.error?.error || 'No se pudo crear la expresión.');
    } finally { this.busy.set(false); }
  }
}
