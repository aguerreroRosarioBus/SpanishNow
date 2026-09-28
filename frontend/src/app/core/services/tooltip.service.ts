import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Tooltip {
  id: number;
  targetType: 'story' | 'question';
  targetId: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  tooltipContent: string;
  createdBy: number;
  isActive: boolean;
  highlightColor: string;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: number;
    name: string;
  };
}

export interface CreateTooltipDto {
  targetType: 'story' | 'question';
  targetId: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  tooltipContent: string;
  highlightColor?: string;
}

export interface ValidationResult {
  totalTooltips: number;
  validTooltips: number;
  invalidTooltips: number;
  results: Array<{
    id: number;
    isValid: boolean;
    expectedText: string;
    actualText: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class TooltipService {
  private apiUrl = `${environment.apiUrl}/tooltips`;

  constructor(private http: HttpClient) {}

  getTooltipsForStory(storyId: number): Observable<Tooltip[]> {
    return this.http.get<Tooltip[]>(`${this.apiUrl}/story/${storyId}`);
  }

  getTooltipsForQuestion(questionId: number): Observable<Tooltip[]> {
    return this.http.get<Tooltip[]>(`${this.apiUrl}/question/${questionId}`);
  }

  createTooltip(data: CreateTooltipDto): Observable<Tooltip> {
    return this.http.post<Tooltip>(this.apiUrl, data);
  }

  updateTooltip(id: number, data: { tooltipContent?: string; highlightColor?: string }): Observable<Tooltip> {
    return this.http.put<Tooltip>(`${this.apiUrl}/${id}`, data);
  }

  deleteTooltip(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  validateTooltips(targetType: 'story' | 'question', targetId: number): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(`${this.apiUrl}/validate`, { targetType, targetId });
  }
}
