import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type StudentLessonBlockType = 'expression' | 'keyframe' | 'question' | 'full_story' | 'flashcards' | 'matching' | 'listen_repeat';
export interface StudentLessonBlock {
  blockKey: string;
  position: number;
  type: StudentLessonBlockType;
  phase: 'before' | 'during' | 'after' | 'later';
  active: boolean;
  required: boolean;
  text?: string | null;
  audioUrl?: string | null;
  questionId?: number | null;
  contextBlockKey?: string | null;
  question?: { questionText: string; answerType: string; options?: string[]; audioUrl?: string | null } | null;
  vocabulary?: { word: string; translation: string; example?: string } | null;
}
export interface StudentLesson {
  id: number;
  storyId: number;
  revision: number;
  status: 'published';
  blocks: StudentLessonBlock[];
  story: { id: number; title: string; fullStoryText: string; audioSlowUrl?: string | null; audioNormalUrl?: string | null };
  progress: {
    id: number;
    lastBlockKey: string | null;
    narrativeCompleted: boolean;
    answers: Array<{ blockKey: string; questionId: number; studentAnswer: string; isCorrect: boolean; attempt: number }>;
    reinforcements: Array<{ blockKey: string; completed: boolean }>;
  };
}
export interface StudentAnswerResult {
  blockKey: string;
  questionId: number;
  isCorrect: boolean;
  attempt: number;
  context: { blockKey: string | null; text: string | null } | null;
  canRetry: boolean;
  canContinue: boolean;
}

@Injectable({ providedIn: 'root' })
export class StudentLessonService {
  private readonly apiUrl = `${environment.apiUrl}/lesson-plans`;
  constructor(private http: HttpClient) {}

  getStory(storyId: number): Observable<StudentLesson> {
    return this.http.get<StudentLesson>(`${this.apiUrl}/story/${storyId}`);
  }
  setCurrentBlock(progressId: number, blockKey: string): Observable<{ lastBlockKey: string; narrativeCompleted: boolean; revision: number }> {
    return this.http.put<{ lastBlockKey: string; narrativeCompleted: boolean; revision: number }>(`${this.apiUrl}/progress/${progressId}/current-block`, { blockKey });
  }
  answer(progressId: number, blockKey: string, questionId: number, studentAnswer: string): Observable<StudentAnswerResult> {
    return this.http.post<StudentAnswerResult>(`${this.apiUrl}/progress/${progressId}/answers`, { blockKey, questionId, studentAnswer });
  }
  completeNarrative(progressId: number): Observable<{ id: number; narrativeCompleted: boolean }> {
    return this.http.post<{ id: number; narrativeCompleted: boolean }>(`${this.apiUrl}/progress/${progressId}/complete-narrative`, {});
  }
  completeReinforcement(progressId: number, blockKey: string): Observable<{ blockKey: string; completed: boolean }> {
    return this.http.put<{ blockKey: string; completed: boolean }>(`${this.apiUrl}/progress/${progressId}/reinforcements/${encodeURIComponent(blockKey)}`, { completed: true });
  }
}
