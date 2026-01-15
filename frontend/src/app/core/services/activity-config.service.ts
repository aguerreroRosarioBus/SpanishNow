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
   * Get all activity configurations for a specific unit
   * @param unitId - The ID of the unit
   * @returns Observable of ActivityConfig array sorted by order
   */
  getConfigsByUnit(unitId: number): Observable<ActivityConfig[]> {
    return this.http.get<ActivityConfig[]>(`${this.apiUrl}/unit/${unitId}`);
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
   * Batch update all activity configs for a unit
   * @param unitId - The unit ID
   * @param configs - Array of activity config data to save
   * @returns Observable of all saved ActivityConfigs
   */
  batchUpdate(unitId: number, configs: Partial<ActivityConfig>[]): Observable<ActivityConfig[]> {
    return this.http.post<ActivityConfig[]>(`${this.apiUrl}/unit/${unitId}/batch`, { configs });
  }
}
