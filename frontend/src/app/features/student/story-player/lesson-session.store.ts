import { I18nService } from '../../../core/i18n/i18n.service';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { StudentAnswerResult, StudentLesson, StudentLessonBlock, StudentLessonService } from '../../../core/services/student-lesson.service';
import { LessonAudioService } from './lesson-audio.service';
import { LessonNavigationStore } from './lesson-navigation.store';

export const REINFORCEMENT_TYPES = ['flashcards', 'matching', 'listen_repeat'];

/** Estado de la lección TPRS publicada de la historia actual (bloques, respuestas, refuerzos). */
@Injectable()
export class LessonSessionStore {
  private i18n = inject(I18nService);
  private api = inject(StudentLessonService);
  private toastService = inject(ToastService);
  private nav = inject(LessonNavigationStore);
  readonly audio = inject(LessonAudioService);

  lesson = signal<StudentLesson | null>(null);
  loading = signal(false);
  private failure = signal<{key: string; error?: unknown} | null>(null);
  visibleError = computed(() => { const f = this.failure(); return f ? (f.error ? this.i18n.errorMessage(f.error, f.key) : this.i18n.t(f.key)) : ''; });

  answerText = signal('');
  answerResult = signal<StudentAnswerResult | null>(null);

  activeBlocks = computed(() => (this.lesson()?.blocks || [])
    .filter(block => block.active && block.phase !== 'later' && !REINFORCEMENT_TYPES.includes(block.type))
    .slice().sort((a, b) => a.position - b.position));
  reinforcementBlocks = computed(() => (this.lesson()?.blocks || [])
    .filter(block => block.active && block.phase === 'after' && REINFORCEMENT_TYPES.includes(block.type))
    .slice().sort((a, b) => a.position - b.position));
  currentBlock = computed(() => {
    const blocks = this.activeBlocks();
    const lastBlockKey = this.lesson()?.progress.lastBlockKey;
    return blocks.find(block => block.blockKey === lastBlockKey) ||
      (this.reinforcementBlocks().some(block => block.blockKey === lastBlockKey) ? blocks[blocks.length - 1] : null) || null;
  });
  currentBlockIndex = computed(() => this.activeBlocks().findIndex(block => block.blockKey === this.currentBlock()?.blockKey));
  narrativeCompleted = computed(() => Boolean(this.lesson()?.progress.narrativeCompleted));

  load(storyId: number): void {
    this.audio.stop();
    this.loading.set(true);
    this.failure.set(null);
    this.answerResult.set(null);
    this.api.getStory(storyId).subscribe({
      next: lesson => {
        this.lesson.set(lesson);
        this.loading.set(false);
        if (lesson.progress.narrativeCompleted) this.nav.markStoryCompleted(lesson.storyId);
        const blocks = lesson.blocks.filter(block => block.active && block.phase !== 'later').sort((a, b) => a.position - b.position);
        if (!blocks.length) {
          this.failure.set({key: 'player.noBlocks'});
          return;
        }
        if (!lesson.progress.lastBlockKey) this.persistCurrentBlock(blocks[0]);
      },
      error: error => {
        this.loading.set(false);
        if (this.nav.handleLocked(error)) return;
        console.error('Error loading assigned lesson:', error);
        this.failure.set({key: 'player.lessonError', error});
        this.loading.set(false);
      }
    });
  }

  retryLoad(): void {
    const storyId = this.nav.currentStoryId();
    if (storyId) this.load(storyId);
  }

  private persistCurrentBlock(block: StudentLessonBlock): void {
    const lesson = this.lesson();
    if (!lesson) return;
    this.audio.stop();
    this.api.setCurrentBlock(lesson.progress.id, block.blockKey).subscribe({
      next: progress => {
        this.patchProgress(p => ({ ...p, lastBlockKey: progress.lastBlockKey, narrativeCompleted: progress.narrativeCompleted }));
        this.answerText.set('');
        this.answerResult.set(null);
      },
      error: error => { if (!this.nav.handleLocked(error)) this.failure.set({key: 'player.progressError', error}); }
    });
  }

  /** Salta a un paso de la barra de pasos (índice dentro de los bloques activos). */
  goToBlockIndex(index: number): void {
    const block = this.activeBlocks()[index];
    if (block && index !== this.currentBlockIndex()) this.persistCurrentBlock(block);
  }

  goToBlock(offset: number): void {
    const block = this.activeBlocks()[this.currentBlockIndex() + offset];
    if (block) this.persistCurrentBlock(block);
  }

  setAnswer(value: string): void { this.answerText.set(value); }

  retryAnswer(): void {
    this.answerResult.set(null);
    this.answerText.set('');
  }

  submitAnswer(): void {
    const lesson = this.lesson();
    const block = this.currentBlock();
    const answer = this.answerText().trim();
    if (!lesson || !block?.questionId || !answer) return;
    this.failure.set(null);
    this.api.answer(lesson.progress.id, block.blockKey, block.questionId, answer).subscribe({
      next: result => {
        this.answerResult.set(result);
        this.patchProgress(p => ({
          ...p,
          answers: [...p.answers, { blockKey: result.blockKey, questionId: result.questionId, studentAnswer: answer, isCorrect: result.isCorrect, attempt: result.attempt }]
        }));
      },
      error: error => { if (!this.nav.handleLocked(error)) this.failure.set({key: 'player.answerError', error}); }
    });
  }

  completeNarrative(): void {
    const lesson = this.lesson();
    if (!lesson) return;
    this.api.completeNarrative(lesson.progress.id).subscribe({
      next: () => {
        this.patchProgress(p => ({ ...p, narrativeCompleted: true }));
        this.nav.markStoryCompleted(lesson.storyId);
        this.toastService.success(this.i18n.t('player.readingComplete'));
      },
      error: error => { if (!this.nav.handleLocked(error)) this.failure.set({key: 'player.completeFirst', error}); }
    });
  }

  completeReinforcement(block: StudentLessonBlock, onDone: () => void): void {
    const lesson = this.lesson();
    if (!lesson) return;
    this.api.completeReinforcement(lesson.progress.id, block.blockKey).subscribe({
      next: () => {
        this.patchProgress(p => ({
          ...p,
          reinforcements: [...p.reinforcements.filter(item => item.blockKey !== block.blockKey), { blockKey: block.blockKey, completed: true }]
        }));
        onDone();
        this.toastService.success(this.i18n.t('player.reinforcementComplete'));
      },
      error: error => { if (!this.nav.handleLocked(error)) this.failure.set({key: 'player.reinforcementError', error}); }
    });
  }

  isReinforcementComplete(blockKey: string): boolean {
    return Boolean(this.lesson()?.progress.reinforcements.some(item => item.blockKey === blockKey && item.completed));
  }

  private patchProgress(change: (progress: StudentLesson['progress']) => StudentLesson['progress']): void {
    this.lesson.update(current => current ? { ...current, progress: change(current.progress) } : current);
  }
}
