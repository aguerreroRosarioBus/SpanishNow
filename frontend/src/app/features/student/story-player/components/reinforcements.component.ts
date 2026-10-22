import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { StudentLessonBlock } from '../../../../core/services/student-lesson.service';
import { ToastService } from '../../../../core/services/toast.service';
import { VocabularyService } from '../../../../core/services/vocabulary.service';
import { FlashcardModalComponent } from '../../flashcard-modal/flashcard-modal.component';
import { MatchingModalComponent } from '../../matching-modal/matching-modal.component';
import { ListenRepeatModalComponent } from '../../listen-repeat-modal/listen-repeat-modal.component';
import { LessonNavigationStore } from '../lesson-navigation.store';
import { LessonSessionStore } from '../lesson-session.store';

/** Refuerzos opcionales de la historia (flashcards, emparejar, escuchar y repetir) y sus modales. */
@Component({
  selector: 'app-reinforcements',
  standalone: true,
  imports: [TranslatePipe, IconComponent, FlashcardModalComponent, MatchingModalComponent, ListenRepeatModalComponent],
  templateUrl: './reinforcements.component.html',
  styleUrl: './reinforcements.component.scss'
})
export class ReinforcementsComponent {
  i18n = inject(I18nService);
  session = inject(LessonSessionStore);
  nav = inject(LessonNavigationStore);
  private vocabularyService = inject(VocabularyService);
  private toastService = inject(ToastService);

  showFlashcardModal = signal(false);
  showMatchingModal = signal(false);
  showListenRepeatModal = signal(false);
  listenRepeatStoryId = signal<number | undefined>(undefined);
  activeBlock = signal<StudentLessonBlock | null>(null);

  label(block: StudentLessonBlock): string {
    return block.type === 'flashcards' ? this.i18n.t('player.flashcards') : block.type === 'matching' ? this.i18n.t('player.matching') : this.i18n.t('player.listenRepeat');
  }

  icon(block: StudentLessonBlock): string {
    return block.type === 'flashcards' ? 'layers' : block.type === 'matching' ? 'puzzle' : 'headphones';
  }

  description(block: StudentLessonBlock): string {
    return block.type === 'flashcards' ? this.i18n.t('player.flashcardHint') : block.type === 'matching' ? this.i18n.t('player.matchingHint') : this.i18n.t('player.listenHint');
  }

  open(block: StudentLessonBlock): void {
    const unit = this.nav.currentUnit();
    const storyId = this.session.lesson()?.storyId;
    if (!unit || !storyId) return;
    this.activeBlock.set(block);
    if (block.type === 'flashcards') this.showVocabularyModal(unit.id, this.showFlashcardModal, 'player.noFlashcards', 'player.flashcardsError');
    else if (block.type === 'matching') this.showVocabularyModal(unit.id, this.showMatchingModal, 'player.noMatching', 'player.activityError');
    else if (block.type === 'listen_repeat') this.showListenRepeat(storyId);
  }

  onModalCompleted(): void {
    const block = this.activeBlock();
    if (block) this.session.completeReinforcement(block, () => this.closeAllModals());
  }

  closeAllModals(): void {
    this.showFlashcardModal.set(false);
    this.showMatchingModal.set(false);
    this.showListenRepeatModal.set(false);
    this.activeBlock.set(null);
  }

  private showVocabularyModal(unitId: number, flag: ReturnType<typeof signal<boolean>>, emptyMessage: string, errorMessage: string): void {
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: vocabulary => {
        if (vocabulary && vocabulary.length > 0) flag.set(true);
        else this.toastService.info(this.i18n.t(emptyMessage));
      },
      error: error => {
        console.error(errorMessage, error);
        this.toastService.error(this.i18n.errorMessage(error, errorMessage));
      }
    });
  }

  private showListenRepeat(storyId: number): void {
    const story = this.nav.currentUnit()?.stories?.find(s => s.id === storyId);
    if (!story) { this.toastService.error(this.i18n.t('player.storyMissing')); return; }
    if (story.repetitionActivities && story.repetitionActivities.length > 0) {
      this.listenRepeatStoryId.set(story.id);
      this.showListenRepeatModal.set(true);
    } else {
      this.toastService.info(this.i18n.t('player.noRepeat'));
    }
  }
}
