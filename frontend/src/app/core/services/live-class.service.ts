import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BoardOperation, ClassroomCourse, DriveBoardFile, GoogleStatus, LiveBoard, LiveClass, LiveSnapshot } from '../models/live-class.model';

@Injectable({ providedIn: 'root' })
export class LiveClassService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/live-classes`;
  list() { return this.http.get<LiveClass[]>(this.url); }
  create(title: string, courseId: number | null) { return this.http.post<LiveClass>(this.url, { title, courseId }); }
  join(code: string) { return this.http.post<{ id: number }>(`${this.url}/join`, { code }); }
  snapshot(id: number, revision?: number) { return this.http.get<LiveSnapshot>(`${this.url}/${id}`, { params: revision === undefined ? {} : { since: String(revision) } }); }
  presence(id: number) { return this.http.post<void>(`${this.url}/${id}/presence`, {}); }
  settings(id: number, settings: Partial<Pick<LiveClass, 'status' | 'title' | 'allowStudentEdit'>>) { return this.http.patch<LiveClass>(`${this.url}/${id}`, settings); }
  change(id: number, operations: BoardOperation[]) { return this.http.post<{ revision: number; board: LiveBoard }>(`${this.url}/${id}/operations`, { operations }); }
  upload(id: number, image: File) { const data = new FormData(); data.append('image', image); return this.http.post<{ url: string }>(`${this.url}/${id}/images`, data); }
  googleStatus() { return this.http.get<GoogleStatus>(`${this.url}/google/status`); }
  connect() { return this.http.post<{ url: string }>(`${this.url}/google/connect`, {}); }
  disconnect() { return this.http.delete<void>(`${this.url}/google/connection`); }
  classroomCourses(pageToken?: string) { return this.http.get<{ courses: ClassroomCourse[]; nextPageToken: string | null }>(`${this.url}/google/courses`, { params: pageToken ? { pageToken } : {} }); }
  linkClassroom(id: number, courseId: string) { return this.http.post<LiveClass>(`${this.url}/${id}/classroom`, { courseId }); }
  announce(id: number) { return this.http.post<LiveClass>(`${this.url}/${id}/classroom/announce`, {}); }
  saveDrive(id: number) { return this.http.post<LiveClass>(`${this.url}/${id}/drive`, {}); }
  driveFiles(pageToken?: string) { return this.http.get<{ files: DriveBoardFile[]; nextPageToken?: string }>(`${this.url}/google/drive-files`, { params: pageToken ? { pageToken } : {} }); }
  restore(id: number, fileId: string, expectedRevision: number) { return this.http.post<LiveSnapshot>(`${this.url}/${id}/drive/restore`, { fileId, expectedRevision }); }
}
