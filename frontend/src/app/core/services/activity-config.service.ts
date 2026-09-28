import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActivityConfig } from '../models/course.model';

@Injectable({
  providedIn: 'root'
})
export class ActivityConfigService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/activity-configs`;

  /**
   * Get all activity configurations for a specific story
   * @param storyId - The ID of the story
   * @returns Observable of ActivityConfig array sorted by order
   */
  getConfigsByStory(storyId: number): Observable<ActivityConfig[]> {
    return this.http.get<ActivityConfig[]>(`${this.apiUrl}/story/${storyId}`);
  }

  /**
   * Create a new activity configuration
   * @param data - The activity config data to create
   * @returns Observable of created ActivityConfig
   */
  createConfig(data: Partial<ActivityConfig>): Observable<ActivityConfig> {
    return this.http.post<ActivityConfig>(this.apiUrl, data);
  }

  /**
   * Update an existing activity configuration
   * @param id - The activity config ID
   * @param data - Partial data to update
   * @returns Observable of updated ActivityConfig
   */
  updateConfig(id: number, data: Partial<ActivityConfig>): Observable<ActivityConfig> {
    return this.http.put<ActivityConfig>(`${this.apiUrl}/${id}`, data);
  }

  /**
   * Delete an activity configuration
   * @param id - The activity config ID to delete
   * @returns Observable of void
   */
  deleteConfig(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Batch update all activity configs for a story
   * @param storyId - The story ID
   * @param configs - Array of activity config data to save
   * @returns Observable of all saved ActivityConfigs
   */
  batchUpdate(storyId: number, configs: Partial<ActivityConfig>[]): Observable<ActivityConfig[]> {
    return this.http.post<ActivityConfig[]>(`${this.apiUrl}/story/${storyId}/batch`, { configs });
  }

  /**
   * Reorder activity configs for a story
   * @param storyId - The story ID
   * @param configs - Array of {id, order} to reorder
   * @returns Observable of all updated ActivityConfigs
   */
  reorder(storyId: number, configs: Array<{id: number, order: number}>): Observable<ActivityConfig[]> {
    return this.http.put<ActivityConfig[]>(`${this.apiUrl}/story/${storyId}/reorder`, { configs });
  }
}
