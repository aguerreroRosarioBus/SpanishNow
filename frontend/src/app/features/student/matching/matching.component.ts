import { Component, inject, OnInit, Input, Output, EventEmitter, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { Vocabulary } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

interface MatchItem {
  id: number;
  text: string;
  matched: boolean;
  type: 'word' | 'translation';
  vocabularyId: number;
}

@Component({
  selector: 'app-matching',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './matching.component.html',
  styleUrl: './matching.component.scss'
})
export class MatchingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private vocabularyService = inject(VocabularyService);

  @Input() unitId?: number;
  @Output() completed = new EventEmitter<number>(); // Emits accuracy percentage

  vocabulary = signal<Vocabulary[]>([]);
  words = signal<MatchItem[]>([]);
  translations = signal<MatchItem[]>([]);
  selectedWord = signal<MatchItem | null>(null);
  selectedTranslation = signal<MatchItem | null>(null);
  matches = signal<number>(0);
  attempts = signal<number>(0);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  isComplete = signal<boolean>(false);
  showCelebration = signal<boolean>(false);

  constructor() {
    // Track completion and emit accuracy
    effect(() => {
      if (this.isComplete()) {
        const accuracy = this.getAccuracy();
        this.completed.emit(accuracy);
      }
    });
  }

  ngOnInit(): void {
    // Check if unitId was provided as Input (from modal)
    if (this.unitId) {
      this.loadVocabulary();
      return;
    }

    // Otherwise, get from route params (standalone route)
    const id = this.route.snapshot.paramMap.get('unitId');
    if (id) {
      this.unitId = +id;
      this.loadVocabulary();
    } else {
      this.router.navigate(['/student/dashboard']);
    }
  }

  loadVocabulary(): void {
    if (!this.unitId) {
      this.errorMessage.set('No se proporcionó ID de unidad');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.vocabularyService.getVocabularyByUnit(this.unitId).subscribe({
      next: (vocab) => {
        if (vocab.length === 0) {
          this.errorMessage.set('No hay vocabulario disponible para esta unidad');
          this.isLoading.set(false);
          return;
        }

        // Take maximum 8 words for the matching game
        const selectedVocab = vocab.slice(0, Math.min(8, vocab.length));
        this.vocabulary.set(selectedVocab);
        this.setupGame(selectedVocab);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading vocabulary:', error);
        this.errorMessage.set('Error al cargar el vocabulario');
        this.isLoading.set(false);
      }
    });
  }

  setupGame(vocab: Vocabulary[]): void {
    // Create word items
    const wordItems: MatchItem[] = vocab.map((v, index) => ({
      id: index * 2,
      text: v.word,
      matched: false,
      type: 'word',
      vocabularyId: v.id
    }));

    // Create translation items
    const translationItems: MatchItem[] = vocab.map((v, index) => ({
      id: index * 2 + 1,
      text: v.translation,
      matched: false,
      type: 'translation',
      vocabularyId: v.id
    }));

    // Shuffle translations
    this.words.set(wordItems);
    this.translations.set(this.shuffleArray(translationItems));
    this.matches.set(0);
    this.attempts.set(0);
    this.isComplete.set(false);
    this.showCelebration.set(false);
  }

  shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  selectItem(item: MatchItem): void {
    if (item.matched) return;

    if (item.type === 'word') {
      this.selectedWord.set(item);
    } else {
      this.selectedTranslation.set(item);
    }

    // Check if both are selected
    const word = this.selectedWord();
    const translation = this.selectedTranslation();

    if (word && translation) {
      this.attempts.update(a => a + 1);
      this.checkMatch(word, translation);
    }
  }

  checkMatch(word: MatchItem, translation: MatchItem): void {
    if (word.vocabularyId === translation.vocabularyId) {
      // Correct match!
      this.words.update(items =>
        items.map(item => item.id === word.id ? { ...item, matched: true } : item)
      );
      this.translations.update(items =>
        items.map(item => item.id === translation.id ? { ...item, matched: true } : item)
      );
      this.matches.update(m => m + 1);

      // Check if game is complete
      if (this.matches() === this.vocabulary().length) {
        this.isComplete.set(true);
        this.showCelebration.set(true);
        setTimeout(() => this.showCelebration.set(false), 3000);
      }
    } else {
      // Wrong match - show briefly then reset
      setTimeout(() => {
        this.selectedWord.set(null);
        this.selectedTranslation.set(null);
      }, 500);
      return;
    }

    // Reset selection
    this.selectedWord.set(null);
    this.selectedTranslation.set(null);
  }

  isSelected(item: MatchItem): boolean {
    return this.selectedWord()?.id === item.id || this.selectedTranslation()?.id === item.id;
  }

  get accuracy(): number {
    if (this.attempts() === 0) return 0;
    return Math.round((this.matches() / this.attempts()) * 100);
  }

  getAccuracy(): number {
    return this.accuracy;
  }

  restart(): void {
    const vocab = this.vocabulary();
    this.setupGame(vocab);
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }
}
