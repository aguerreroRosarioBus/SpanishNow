import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { ClassSettings, PackageTemplate } from './packages.model';
@Injectable({providedIn:'root'})
export class PackagesService {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private base = environment.apiUrl;
  list() { return this.http.get<PackageTemplate[]>(`${this.base}/teacher/class-packages`); }
  detail(id: number) { return this.http.get<PackageTemplate>(`${this.base}/teacher/class-packages/${id}`); }
  importInitial() { return this.http.post<PackageTemplate[]>(`${this.base}/teacher/class-packages/import-initial`, {}); }
  settings() { return this.http.get<ClassSettings>(`${this.base}/teacher/class-settings`); }
  pause(salesPaused: boolean) { return this.http.patch<ClassSettings>(`${this.base}/teacher/class-settings`, {salesPaused}); }
  save(id: number, body: unknown) { return this.http.post<PackageTemplate>(`${this.base}/teacher/class-packages/${id}/versions`, body); }
  status(id: number, status: string) { return this.http.patch<PackageTemplate>(`${this.base}/teacher/class-packages/${id}/status`, {status}); }
  error(error: unknown) {
    const code = (error as {error?:{code?:string}})?.error?.code;
    return code && this.i18n.has(`packages.errors.${code}`) ? this.i18n.t(`packages.errors.${code}`) : this.i18n.errorMessage(error);
  }
}
