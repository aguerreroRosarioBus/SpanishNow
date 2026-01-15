import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Progress {
  id: number;
  enrollmentId: number;
  storyId: number;
  completed: boolean;
  activitiesCompleted: boolean;
  flashcardsViewed: boolean;
  questionsCompleted: boolean;
  matchingCompleted: boolean;
  listenRepeatCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProgressService {
  private apiUrl = `${environment.apiUrl}/enrollment`;

  constructor(private http: HttpClient) {}

  // Mark story as completed
  markStoryCompleted(enrollmentId: number, storyId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress`, {
      enrollmentId,
      storyId
    });
  }

  // Mark flashcards as viewed
  markFlashcardsViewed(progressId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress/${progressId}/flashcards-viewed`, {});
  }

  // Mark matching as completed
  markMatchingCompleted(progressId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress/${progressId}/matching-completed`, {});
  }

  // Mark listen & repeat as completed
  markListenRepeatCompleted(progressId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress/${progressId}/listen-repeat-completed`, {});
  }

  // Mark questions as completed
  markQuestionsCompleted(progressId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress/${progressId}/questions-completed`, {});
  }

  // Update activitiesCompleted flag
  updateActivitiesCompleted(progressId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress/${progressId}/update-activities`, {});
  }

  // Get progress for an enrollment
  getProgress(enrollmentId: number): Observable<Progress[]> {
    return this.http.get<Progress[]>(`${this.apiUrl}/${enrollmentId}/progress`);
  }

  // Reset all progress for an enrollment
  resetProgress(enrollmentId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${enrollmentId}/reset-progress`);
  }
}
