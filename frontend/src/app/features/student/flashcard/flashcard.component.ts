import { Component, inject, OnInit, Input, Output, EventEmitter, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { Vocabulary } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

@Component({
  selector: 'app-flashcard',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './flashcard.component.html',
  styleUrl: './flashcard.component.scss'
})
export class FlashcardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private vocabularyService = inject(VocabularyService);

  @Input() unitId?: number;
  @Output() allViewed = new EventEmitter<void>();

  vocabulary = signal<Vocabulary[]>([]);
  currentIndex = signal<number>(0);
  isFlipped = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  isRandomMode = signal<boolean>(false);
  playedIndices = signal<Set<number>>(new Set());

  constructor() {
    // Track when all flashcards have been viewed
    effect(() => {
      const played = this.playedIndices();
      const total = this.vocabulary().length;

      if (total > 0 && played.size === total) {
        // All flashcards have been viewed at least once
        this.allViewed.emit();
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
        }
        this.vocabulary.set(vocab);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading vocabulary:', error);
        this.errorMessage.set('Error al cargar el vocabulario');
        this.isLoading.set(false);
      }
    });
  }

  get currentCard(): Vocabulary | null {
    const vocab = this.vocabulary();
    if (vocab.length === 0) return null;
    return vocab[this.currentIndex()];
  }

  get totalCards(): number {
    return this.vocabulary().length;
  }

  get progress(): number {
    if (this.totalCards === 0) return 0;
    if (this.isRandomMode()) {
      return Math.round((this.playedIndices().size / this.totalCards) * 100);
    }
    return Math.round(((this.currentIndex() + 1) / this.totalCards) * 100);
  }

  flipCard(): void {
    this.isFlipped.update(flipped => !flipped);

    // Mark current card as viewed when flipped
    if (!this.isFlipped()) {
      const played = new Set(this.playedIndices());
      played.add(this.currentIndex());
      this.playedIndices.set(played);
    }
  }

  nextCard(): void {
    if (this.isRandomMode()) {
      this.nextRandomCard();
    } else {
      if (this.currentIndex() < this.totalCards - 1) {
        this.currentIndex.update(i => i + 1);
        this.isFlipped.set(false);
      }
    }
  }

  previousCard(): void {
    if (!this.isRandomMode() && this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      this.isFlipped.set(false);
    }
  }

  nextRandomCard(): void {
    const vocab = this.vocabulary();
    if (vocab.length === 0) return;

    const played = this.playedIndices();

    // Si ya jugamos todas, reiniciar
    if (played.size >= vocab.length) {
      this.playedIndices.set(new Set());
      this.currentIndex.set(Math.floor(Math.random() * vocab.length));
      this.playedIndices.update(s => new Set([...s, this.currentIndex()]));
    } else {
      // Encontrar índice no jugado
      let newIndex: number;
      do {
        newIndex = Math.floor(Math.random() * vocab.length);
      } while (played.has(newIndex));

      this.currentIndex.set(newIndex);
      this.playedIndices.update(s => new Set([...s, newIndex]));
    }

    this.isFlipped.set(false);
  }

  toggleRandomMode(): void {
    this.isRandomMode.update(mode => !mode);
    this.playedIndices.set(new Set([this.currentIndex()]));
    this.isFlipped.set(false);
  }

  playAudio(): void {
    const card = this.currentCard;
    if (card && card.audioUrl) {
      const audio = new Audio(card.audioUrl);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
        alert('Error al reproducir el audio');
      });
    }
  }

  restart(): void {
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.playedIndices.set(new Set([0]));
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }
}
