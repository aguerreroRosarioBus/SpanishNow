import { signal } from '@angular/core';

export interface AudioRecorderMessages {
  started: string;
  stopped: string;
  micError: string;
}

/** Grabación de audio con el micrófono (un MediaRecorder por instancia). */
export class AudioRecorder {
  isRecording = signal(false);
  blob = signal<Blob | null>(null);
  url = signal<string | null>(null);
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(private notify: { success(m: string): void; error(m: string): void }, public messages: AudioRecorderMessages) {}

  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recorder = new MediaRecorder(stream);
      this.chunks = [];
      this.recorder.ondataavailable = event => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onstop = () => {
        const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
        this.blob.set(audioBlob);
        this.url.set(URL.createObjectURL(audioBlob));
        // Libera el micrófono
        stream.getTracks().forEach(track => track.stop());
      };
      this.recorder.start();
      this.isRecording.set(true);
      this.notify.success(this.messages.started);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.notify.error(this.messages.micError);
    }
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
      this.isRecording.set(false);
      this.notify.success(this.messages.stopped);
    }
  }

  clear(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.blob.set(null);
    this.url.set(null);
    this.chunks = [];
    this.recorder = null;
  }

  toFile(name: string): File | null {
    const blob = this.blob();
    return blob ? new File([blob], name, { type: 'audio/webm' }) : null;
  }
}
