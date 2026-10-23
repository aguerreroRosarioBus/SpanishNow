import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LiveClassService } from '../../core/services/live-class.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
@Component({
  standalone: true, imports: [RouterLink, TranslatePipe],
  template: `<div class="page-container"><h1 class="page-title">{{ 'liveBoard.join.title' | t }}</h1>@if (error()) { <p role="alert" class="alert alert-danger">{{ error() }}</p><button type="button" class="btn btn-primary" (click)="join()" [disabled]="loading()">{{ 'liveBoard.join.retry' | t }}</button> } @else { <p role="status">{{ 'liveBoard.join.entering' | t }}</p> } <a routerLink="/live" class="btn btn-secondary ms-2">{{ 'liveBoard.join.myClasses' | t }}</a></div>`
})
export class LiveJoinComponent implements OnInit {
  private api = inject(LiveClassService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private i18n = inject(I18nService);
  /** Se guarda el error HTTP (no el texto) para traducirlo al cambiar de idioma sin repetir la petición. */
  private failure = signal<unknown>(null);
  readonly error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'liveBoard.error.generic') : '');
  loading = signal(false);
  ngOnInit(): void { this.join(); }
  join(): void {
    if (this.loading()) return;
    this.loading.set(true); this.failure.set(null);
    this.api.join(this.route.snapshot.paramMap.get('code') || '').subscribe({ next: result => { void this.router.navigate(['/live', result.id], { replaceUrl: true }); }, error: e => { this.failure.set(e ?? {}); this.loading.set(false); } });
  }
}
