import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LiveClassService } from '../../core/services/live-class.service';
import { liveErrorMessage } from './live-classes.component';
@Component({
  standalone: true, imports: [RouterLink],
  template: `<div class="page-container"><h1 class="page-title">Entrar a clase</h1>@if (error()) { <p role="alert" class="alert alert-danger">{{ error() }}</p><button type="button" class="btn btn-primary" (click)="join()" [disabled]="loading()">Reintentar</button> } @else { <p role="status">Entrando a la pizarra…</p> } <a routerLink="/live" class="btn btn-secondary ms-2">Ver mis clases</a></div>`
})
export class LiveJoinComponent implements OnInit {
  private api = inject(LiveClassService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  error = signal(''); loading = signal(false);
  ngOnInit(): void { this.join(); }
  join(): void {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    this.api.join(this.route.snapshot.paramMap.get('code') || '').subscribe({ next: result => { void this.router.navigate(['/live', result.id], { replaceUrl: true }); }, error: e => { this.error.set(liveErrorMessage(e)); this.loading.set(false); } });
  }
}
