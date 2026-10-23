import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { FlashcardComponent } from './flashcard.component';
import { MatchingComponent } from '../matching/matching.component';
import { ListenRepeatComponent } from '../listen-repeat/listen-repeat.component';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { I18nService } from '../../../core/i18n/i18n.service';

const vocabulary = [{id: 1, word: 'palabra original', translation: 'original word'}, {id: 2, word: 'segunda palabra', translation: 'second word'}];
function setup() {
  const getVocabularyByUnit = vi.fn(() => of(vocabulary));
  const getActivitiesByStory = vi.fn(() => of([{id: 1, phrase: 'Frase original', audioUrl: null}, {id: 2, phrase: 'Otra frase original', audioUrl: null}]));
  TestBed.configureTestingModule({providers: [provideRouter([]),
    {provide: VocabularyService, useValue: {getVocabularyByUnit}},
    {provide: RepetitionActivityService, useValue: {getActivitiesByStory}}
  ]});
  const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
  return {i18n, getVocabularyByUnit, getActivitiesByStory};
}
it('flashcards: conserva tarjeta volteada, modo y vistas; idioma no vuelve a emitir completado', () => {
  const {i18n, getVocabularyByUnit} = setup(); const f = TestBed.createComponent(FlashcardComponent);
  f.componentRef.setInput('unitId', 1); f.detectChanges(); const c = f.componentInstance;
  c.isFlipped.set(true); c.currentIndex.set(1); c.isRandomMode.set(true);
  const complete = vi.fn(() => i18n.t('common.language'));
  c.allViewed.subscribe(complete); c.playedIndices.set(new Set([0, 1])); f.detectChanges();
  expect(complete).toHaveBeenCalledTimes(1); const viewed = c.playedIndices();
  i18n.setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Vocabulary flashcards');
  expect(f.nativeElement.textContent).toContain('segunda palabra');
  expect(c.currentIndex()).toBe(1); expect(c.isFlipped()).toBe(true); expect(c.isRandomMode()).toBe(true);
  expect(c.playedIndices()).toBe(viewed); expect(complete).toHaveBeenCalledTimes(1);
  expect(getVocabularyByUnit).toHaveBeenCalledTimes(1);
});
it('matching: conserva orden, selección y parejas; idioma no reemite ni baraja', () => {
  const {i18n, getVocabularyByUnit} = setup(); const f = TestBed.createComponent(MatchingComponent);
  f.componentRef.setInput('unitId', 1); f.detectChanges(); const c = f.componentInstance;
  c.selectItem(c.words()[0]); const selected = c.selectedWord(); const translations = c.translations();
  const complete = vi.fn(() => i18n.t('common.language'));
  c.completed.subscribe(complete); c.matches.set(2); c.attempts.set(2); c.isComplete.set(true); f.detectChanges();
  expect(complete).toHaveBeenCalledTimes(1);
  i18n.setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Match the words');
  expect(c.selectedWord()).toBe(selected); expect(c.translations()).toBe(translations);
  expect(c.matches()).toBe(2); expect(c.attempts()).toBe(2);
  expect(complete).toHaveBeenCalledTimes(1); expect(getVocabularyByUnit).toHaveBeenCalledTimes(1);
});
it('escuchar/repetir: conserva grabación, calificación y frase sin pausar audio al cambiar idioma', () => {
  const {i18n, getActivitiesByStory} = setup(); const f = TestBed.createComponent(ListenRepeatComponent);
  f.componentRef.setInput('storyId', 1); f.detectChanges(); const c = f.componentInstance;
  c.currentIndex.set(1); c.setRating(4); c.hasRecording.set(true);
  const media = {pause: vi.fn()} as unknown as HTMLAudioElement; c.recordedAudio = media; const ratings = c.ratings();
  i18n.setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Listen and repeat');
  expect(f.nativeElement.textContent).toContain('Otra frase original');
  expect(c.currentIndex()).toBe(1); expect(c.rating()).toBe(4); expect(c.ratings()).toBe(ratings);
  expect(c.recordedAudio).toBe(media); expect(c.hasRecording()).toBe(true);
  expect(media.pause).not.toHaveBeenCalled(); expect(getActivitiesByStory).toHaveBeenCalledTimes(1);
});
