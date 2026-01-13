import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActivityConfig {
  id: number;
  storyId: number;
  activityType: 'flashcards' | 'questions' | 'matching' | 'listen_repeat';
  isEnabled: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityConfigService {
  private apiUrl = `${environment.apiUrl}/activity-configs`;

  constructor(private http: HttpClient) {}

  /**
   * Get all activity configurations for a specific story
   * @param storyId - The ID of the story
   * @returns Observable of ActivityConfig array sorted by order
   */
  getConfigsByStory(storyId: number): Observable<ActivityConfig[]> {
    return this.http.get<ActivityConfig[]>(`${this.apiUrl}/story/${storyId}`);
  }

  /**
   * Update a single activity configuration (enable/disable or change order)
   * @param id - The activity config ID
   * @param data - Partial data to update (isEnabled, order)
   * @returns Observable of updated ActivityConfig
   */
  updateConfig(id: number, data: Partial<ActivityConfig>): Observable<ActivityConfig> {
    return this.http.put<ActivityConfig>(`${this.apiUrl}/${id}`, data);
  }

  /**
   * Reorder multiple activities at once (drag & drop)
   * @param storyId - The story ID
   * @param configs - Array of {id, order} pairs
   * @returns Observable of all updated ActivityConfigs for the story
   */
  reorderActivities(storyId: number, configs: { id: number; order: number }[]): Observable<ActivityConfig[]> {
    return this.http.put<ActivityConfig[]>(`${this.apiUrl}/story/${storyId}/reorder`, { configs });
  }

  /**
   * Create a new activity configuration (rarely used, usually auto-created with story)
   * @param config - The activity config to create
   * @returns Observable of created ActivityConfig
   */
  createConfig(config: Omit<ActivityConfig, 'id' | 'createdAt' | 'updatedAt'>): Observable<ActivityConfig> {
    return this.http.post<ActivityConfig>(this.apiUrl, config);
  }

  /**
   * Delete an activity configuration (rarely used, usually just disabled instead)
   * @param id - The activity config ID to delete
   * @returns Observable of deletion result
   */
  deleteConfig(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
