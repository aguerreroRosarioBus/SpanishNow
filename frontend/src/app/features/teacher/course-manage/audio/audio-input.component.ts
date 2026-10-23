import { Component, OnDestroy, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../../core/services/toast.service';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AudioRecorder } from './audio-recorder';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/**
 * Selector de audio reutilizable: subir un archivo o grabar con el micrófono.
 * El padre lee el resultado con `getFile()` al enviar el formulario.
 */
@Component({
  selector: 'app-audio-input',
  standalone: true,
  imports: [CommonModule, IconComponent, TranslatePipe],
  templateUrl: './audio-input.component.html'
})
export class AudioInputComponent implements OnDestroy {
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  /** Prefijo único para los ids/nombres de los radios. */
  name = input.required<string>();
  /** inline: botones lado a lado con aviso de grabación; stacked: botones a todo el ancho. */
  layout = input<'inline' | 'stacked'>('inline');
  // Los textos son claves I18N (el padre pasa la clave); '' = sin texto.
  uploadLabel = input('teacherManage.audio.upload');
  recordLabel = input('teacherManage.audio.record');
  uploadHint = input('');
  recordHint = input('');
  recordingText = input('teacherManage.audio.recording');
  recordedText = input('teacherManage.audio.recorded');
  recordedFileName = input('recording.webm');
  startedMessage = input('teacherManage.audio.started');
  stoppedMessage = input('teacherManage.audio.stopped');
  micErrorMessage = input('teacherManage.audio.micError');
  /** Valida tipo (audio/*) y tamaño (máx 50MB) al elegir el archivo. */
  validate = input(false);
  fileInputId = input<string | null>(null);

  method = signal<'upload' | 'record'>('upload');
  file = signal<File | null>(null);
  private recorder?: AudioRecorder;

  get rec(): AudioRecorder {
    return this.recorder ??= new AudioRecorder(this.toast, () => ({
      started: this.i18n.t(this.startedMessage()), stopped: this.i18n.t(this.stoppedMessage()), micError: this.i18n.t(this.micErrorMessage())
    }));
  }

  setMethod(method: 'upload' | 'record'): void { this.method.set(method); }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.validate()) {
      if (!file.type.startsWith('audio/')) {
        this.toast.warning(this.i18n.t('teacherManage.audio.invalidType'));
        input.value = '';
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        this.toast.warning(this.i18n.t('teacherManage.audio.tooBig'));
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
