import { Component, OnDestroy, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../../core/services/toast.service';
import { AudioRecorder } from './audio-recorder';

/**
 * Selector de audio reutilizable: subir un archivo o grabar con el micrófono.
 * El padre lee el resultado con `getFile()` al enviar el formulario.
 */
@Component({
  selector: 'app-audio-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio-input.component.html'
})
export class AudioInputComponent implements OnDestroy {
  private toast = inject(ToastService);

  /** Prefijo único para los ids/nombres de los radios. */
  name = input.required<string>();
  /** inline: botones lado a lado con aviso de grabación; stacked: botones a todo el ancho. */
  layout = input<'inline' | 'stacked'>('inline');
  uploadLabel = input('📁 Subir archivo');
  recordLabel = input('🎤 Grabar');
  uploadHint = input('');
  recordHint = input('');
  recordingText = input('Grabando... Habla ahora');
  recordedText = input('✓ Audio grabado correctamente');
  recordedFileName = input('recording.webm');
  startedMessage = input('Grabación iniciada');
  stoppedMessage = input('Grabación detenida');
  micErrorMessage = input('No se pudo acceder al micrófono');
  /** Valida tipo (audio/*) y tamaño (máx 50MB) al elegir el archivo. */
  validate = input(false);
  fileInputId = input<string | null>(null);

  method = signal<'upload' | 'record'>('upload');
  file = signal<File | null>(null);
  private recorder?: AudioRecorder;

  get rec(): AudioRecorder {
    return this.recorder ??= new AudioRecorder(this.toast, {
      started: this.startedMessage(), stopped: this.stoppedMessage(), micError: this.micErrorMessage()
    });
  }

  setMethod(method: 'upload' | 'record'): void { this.method.set(method); }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.validate()) {
      if (!file.type.startsWith('audio/')) {
        this.toast.warning('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        this.toast.warning('El archivo es muy grande. Máximo 50MB');
        input.value = '';
        return;
      }
    }
    this.file.set(file);
  }

  /** Archivo según el método elegido (subido o grabado), o null. */
  getFile(): File | null {
    return this.method() === 'upload' ? this.file() : this.rec.toFile(this.recordedFileName());
  }

  reset(): void {
    this.file.set(null);
    this.rec.clear();
    this.method.set('upload');
  }

  ngOnDestroy(): void {
    this.rec.clear();
  }
}
