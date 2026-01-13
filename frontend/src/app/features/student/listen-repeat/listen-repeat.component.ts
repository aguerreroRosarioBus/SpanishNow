import { Component, inject, OnInit, Input, Output, EventEmitter, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { RepetitionActivity } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

@Component({
  selector: 'app-listen-repeat',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './listen-repeat.component.html',
  styleUrl: './listen-repeat.component.scss'
})
export class ListenRepeatComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private repetitionService = inject(RepetitionActivityService);

  @Input() storyId?: number;
  @Output() completed = new EventEmitter<{ totalPhrases: number; goodPerformance: number }>(); // Emits phrase stats

  activities = signal<RepetitionActivity[]>([]);
  currentIndex = signal<number>(0);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Audio playback
  modelAudio: HTMLAudioElement | null = null;
  isPlayingModel = signal<boolean>(false);

  // Voice recording
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  recordedAudio: HTMLAudioElement | null = null;
  isRecording = signal<boolean>(false);
  hasRecording = signal<boolean>(false);
  isPlayingRecording = signal<boolean>(false);

  // Self-evaluation
  rating = signal<number>(0);
  ratings = signal<Map<number, number>>(new Map());

  ngOnInit(): void {
    // Check if storyId was provided as Input (from modal)
    if (this.storyId) {
      this.loadActivities();
      return;
    }

    // Otherwise, get from route params (standalone route)
    const id = this.route.snapshot.paramMap.get('storyId');
    if (id) {
      this.storyId = +id;
      this.loadActivities();
    } else {
      this.router.navigate(['/student/dashboard']);
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  cleanup(): void {
    if (this.modelAudio) {
      this.modelAudio.pause();
      this.modelAudio = null;
    }
    if (this.recordedAudio) {
      this.recordedAudio.pause();
      this.recordedAudio = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  loadActivities(): void {
    if (!this.storyId) {
      this.errorMessage.set('No se proporcionó ID de historia');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.repetitionService.getActivitiesByStory(this.storyId).subscribe({
      next: (activities) => {
        if (activities.length === 0) {
          this.errorMessage.set('No hay actividades de repetición para esta historia');
        }
        this.activities.set(activities);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading activities:', error);
        this.errorMessage.set('Error al cargar las actividades');
        this.isLoading.set(false);
      }
    });
  }

  get currentActivity(): RepetitionActivity | null {
    const acts = this.activities();
    if (acts.length === 0) return null;
    return acts[this.currentIndex()];
  }

  get totalActivities(): number {
    return this.activities().length;
  }

  get progress(): number {
    if (this.totalActivities === 0) return 0;
    return Math.round(((this.currentIndex() + 1) / this.totalActivities) * 100);
  }

  get completedCount(): number {
    return this.ratings().size;
  }

  playModel(): void {
    const activity = this.currentActivity;
    if (!activity || !activity.audioUrl) {
      alert('Audio no disponible para esta frase');
      return;
    }

    if (this.modelAudio) {
      this.modelAudio.pause();
    }

    this.modelAudio = new Audio(activity.audioUrl);

    this.modelAudio.addEventListener('ended', () => {
      this.isPlayingModel.set(false);
    });

    this.modelAudio.addEventListener('error', () => {
      alert('Error al cargar el audio');
      this.isPlayingModel.set(false);
    });

    this.modelAudio.play();
    this.isPlayingModel.set(true);
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        this.audioChunks.push(event.data);
      });

      this.mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedAudio = new Audio(audioUrl);
        this.hasRecording.set(true);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      });

      this.mediaRecorder.start();
      this.isRecording.set(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('No se pudo acceder al micrófono. Por favor, verifica los permisos.');
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
    }
  }

  playRecording(): void {
    if (this.recordedAudio) {
      this.recordedAudio.addEventListener('ended', () => {
        this.isPlayingRecording.set(false);
      });

      this.recordedAudio.play();
      this.isPlayingRecording.set(true);
    }
  }

  setRating(stars: number): void {
    this.rating.set(stars);
    const activity = this.currentActivity;
    if (activity) {
      const newRatings = new Map(this.ratings());
      newRatings.set(activity.id, stars);
      this.ratings.set(newRatings);
    }
  }

  nextActivity(): void {
    if (this.currentIndex() < this.totalActivities - 1) {
      this.currentIndex.update(i => i + 1);
      this.resetActivity();
    } else {
      // This is the last activity, check if all are completed
      this.checkCompletion();
    }
  }

  checkCompletion(): void {
    const total = this.totalActivities;
    const rated = this.ratings().size;

    if (rated === total) {
      // All phrases have been rated
      // Count how many have 3+ stars
      const goodPerformance = Array.from(this.ratings().values()).filter(r => r >= 3).length;

      // Emit completion with stats
      this.completed.emit({
        totalPhrases: total,
        goodPerformance: goodPerformance
      });
    }
  }

  previousActivity(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      this.resetActivity();
    }
  }

  resetActivity(): void {
    this.cleanup();
    this.hasRecording.set(false);
    this.isPlayingModel.set(false);
    this.isPlayingRecording.set(false);
    this.isRecording.set(false);

    const activity = this.currentActivity;
    if (activity) {
      this.rating.set(this.ratings().get(activity.id) || 0);
    } else {
      this.rating.set(0);
    }
  }

  restart(): void {
    this.currentIndex.set(0);
    this.ratings.set(new Map());
    this.resetActivity();
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }
}
