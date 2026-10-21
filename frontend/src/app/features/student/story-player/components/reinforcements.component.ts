import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, FlashcardModalComponent, MatchingModalComponent, ListenRepeatModalComponent],
  templateUrl: './reinforcements.component.html'
})
export class ReinforcementsComponent {
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
    return block.type === 'flashcards' ? 'Flashcards' : block.type === 'matching' ? 'Emparejar vocabulario' : 'Escuchar y repetir';
  }

  open(block: StudentLessonBlock): void {
    const unit = this.nav.currentUnit();
    const storyId = this.session.lesson()?.storyId;
    if (!unit || !storyId) return;
    this.activeBlock.set(block);
    if (block.type === 'flashcards') this.showVocabularyModal(unit.id, this.showFlashcardModal, 'No hay flashcards disponibles para esta unidad', 'Error al cargar las flashcards');
    else if (block.type === 'matching') this.showVocabularyModal(unit.id, this.showMatchingModal, 'No hay actividad de emparejamiento disponible', 'Error al cargar la actividad');
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
        else this.toastService.info(emptyMessage);
      },
      error: error => {
        console.error(errorMessage, error);
        this.toastService.error(errorMessage);
      }
    });
  }

  private showListenRepeat(storyId: number): void {
    const story = this.nav.currentUnit()?.stories?.find(s => s.id === storyId);
    if (!story) { this.toastService.error('Historia no encontrada'); return; }
    if (story.repetitionActivities && story.repetitionActivities.length > 0) {
      this.listenRepeatStoryId.set(story.id);
      this.showListenRepeatModal.set(true);
    } else {
      this.toastService.info('No hay actividades de escuchar y repetir disponibles para esta historia');
    }
  }
}
