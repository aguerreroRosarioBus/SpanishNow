import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type LessonPhase = 'before' | 'during' | 'after' | 'later';
export type LessonBlockType = 'expression' | 'keyframe' | 'question' | 'full_story' | 'flashcards' | 'matching' | 'listen_repeat';

export interface KeyframeTooltip {
  id: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  tooltipContent: string;
  isActive: boolean;
}

export interface LessonBlock {
  blockKey: string;
  position?: number;
  type: LessonBlockType;
  phase: LessonPhase;
  active: boolean;
  required: boolean;
  text?: string | null;
  audioUrl?: string | null;
  tooltips?: KeyframeTooltip[];
  questionId?: number | null;
  contextBlockKey?: string | null;
  vocabularyId?: number | null;
  vocabularyRole?: 'target' | 'support' | 'revisit';
  revisitStoryId?: number | null;
  questionSnapshot?: { questionText: string; answerType: string; options?: string[] } | null;
  vocabularySnapshot?: { word: string; translation: string; example?: string } | null;
}

export interface LessonPlan {
  id: number;
  storyId: number;
  revision: number;
  status: 'draft' | 'published';
  audioSlowUrl?: string | null;
  audioNormalUrl?: string | null;
  blocks: LessonBlock[];
}

@Injectable({ providedIn: 'root' })
export class LessonPlanService {
  private readonly apiUrl = `${environment.apiUrl}/lesson-plans`;

  constructor(private http: HttpClient) {}

  getDraft(storyId: number): Observable<LessonPlan> {
    return this.http.get<LessonPlan>(`${this.apiUrl}/story/${storyId}/draft`);
  }

  saveDraft(storyId: number, revision: number, blocks: LessonBlock[]): Observable<LessonPlan> {
    // Los tooltips se gestionan por /api/tooltips; no forman parte del payload del borrador.
    const orderedBlocks = blocks.map(({ tooltips, ...block }, position) => ({ ...block, position }));
    return this.http.put<LessonPlan>(`${this.apiUrl}/story/${storyId}/draft`, { revision, blocks: orderedBlocks });
  }

  reorder(storyId: number, revision: number, blockKeys: string[]): Observable<LessonPlan> {
    return this.http.put<LessonPlan>(`${this.apiUrl}/story/${storyId}/draft/reorder`, { revision, blockKeys });
  }

  publish(storyId: number, revision: number): Observable<LessonPlan> {
    return this.http.post<LessonPlan>(`${this.apiUrl}/story/${storyId}/publish`, { revision });
  }

  uploadKeyframeAudio(storyId: number, blockKey: string, file: File): Observable<{ blockKey: string; audioUrl: string }> {
    const form = new FormData();
    form.append('audio', file);
    return this.http.post<{ blockKey: string; audioUrl: string }>(this.audioUrl(storyId, blockKey), form);
  }

  deleteKeyframeAudio(storyId: number, blockKey: string): Observable<{ blockKey: string; audioUrl: null }> {
    return this.http.delete<{ blockKey: string; audioUrl: null }>(this.audioUrl(storyId, blockKey));
  }

  private audioUrl(storyId: number, blockKey: string): string {
    return `${this.apiUrl}/story/${storyId}/draft/blocks/${encodeURIComponent(blockKey)}/audio`;
  }
}
