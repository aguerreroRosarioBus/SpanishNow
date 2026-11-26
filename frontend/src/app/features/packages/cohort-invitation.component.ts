import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatFormat } from '../chat/chat-format';
import { PackagesService } from './packages.service';
import { ClassCohort } from './packages.model';
import { toastFrom } from '../../core/services/toast.service';

/** Detalle de un grupo de clases: invitación para quien la recibe y panel de seguimiento para el docente. */
@Component({
  selector: 'app-cohort-invitation', standalone: true, imports: [TranslatePipe, RouterLink],
  styles: [`
    .member-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; border-top: 1px solid var(--color-border); }
    .member-row:first-child { border-top: 0; }
    .member-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .detail-list { display: grid; gap: 4px; margin: 0; }
    .detail-list dt { font-weight: 600; }
    .detail-list dd { margin: 0 0 8px; }
    .note { color: var(--color-text-light); margin: 0; }
  `],
  template: `
  <div class="page-container">
    <nav class="breadcrumb-nav" [attr.aria-label]="(isTeacher() ? 'packages.group.nav' : 'packages.group.backMessages') | t">
      <a [routerLink]="isTeacher() ? '/teacher/class-cohorts' : '/messages'">← {{ (isTeacher() ? 'packages.group.nav' : 'packages.group.backMessages') | t }}</a>
    </nav>
    <header class="page-header">
      <div class="page-header__main">
        <h1 class="page-title">{{ (isTeacher() ? 'packages.group.title' : 'packages.group.invitation') | t }}</h1>
        @if (cohort(); as c) {
          <p class="page-summary">@if (c.confirmedSession; as session) {
            {{ 'packages.group.confirmedSession' | t:{ date: instant(session.startsAt) } }}
          } @else { {{ ('packages.group.status.' + (c.invitation?.status ?? c.status)) | t }} }
          · {{ 'packages.group.accepted' | t:{count:c.acceptedCount,total:c.groupSize} }}</p>
        }
      </div>
      <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="load()">{{ 'packages.offer.refresh' | t }}</button>
    </header>
    @if (cohort(); as c) {
      <section class="card mb-3" aria-labelledby="cohort-schedule">
        <div class="card-header"><h2 id="cohort-schedule" class="h5 mb-0">{{ 'packages.group.scheduleTitle' | t }}</h2></div>
        <div class="card-body">
          <dl class="detail-list">
            @if (c.confirmedSession; as session) {
              <dt>{{ 'packages.group.confirmedTime' | t }}</dt>
              <dd><a routerLink="/schedule" [queryParams]="{ sessionId: session.id }">{{ instant(session.startsAt) }} ({{ fmt.timeZone() }})</a></dd>
            } @else {
              <dt>{{ (isPast(c.tentativeStartsAt) ? 'packages.group.tentativePastLabel' : 'packages.group.tentativeLabel') | t }}</dt>
              <dd>{{ instant(c.tentativeStartsAt) }} ({{ fmt.timeZone() }})</dd>
            }
            <dt>{{ 'packages.group.deadlineLabel' | t }}</dt>
            <dd>{{ instant(c.formingDeadlineAt) }} ({{ fmt.timeZone() }})</dd>
          </dl>
          @if (c.status === 'forming' && isPast(c.formingDeadlineAt)) {
            <p class="alert alert-warning mb-0" role="status">{{ 'packages.group.deadlinePassed' | t }}</p>
          }
        </div>
      </section>

      @if (c.members) {
        <section class="card mb-3" aria-labelledby="cohort-members">
          <div class="card-header"><h2 id="cohort-members" class="h5 mb-0">{{ 'packages.group.membersTitle' | t }}</h2></div>
          <div class="card-body">
            @for (m of c.members; track m.userId) {
              <div class="member-row">
                <span><strong>{{ m.name }}</strong> · {{ ('packages.group.status.' + m.status) | t }}</span>
                <span class="member-actions">
                  @if (m.conversationId) {
                    <a class="btn btn-secondary btn-sm" [routerLink]="['/messages', m.conversationId]">{{ 'packages.group.openChat' | t }}</a>
                    @if (readyForOffers(c)) {
                      <a class="btn btn-primary btn-sm" routerLink="/teacher/class-offers/new" [queryParams]="{conversationId:m.conversationId,cohortId:c.id}">{{ 'packages.offer.send' | t }}</a>
                    }
                  }
                </span>
              </div>
            }
            @if (readyForOffers(c)) {
              <p class="note mt-3">{{ 'packages.group.teacherHint' | t }}</p>
            } @else if (c.status === 'forming' && c.acceptedCount < c.groupSize) {
              <p class="note mt-3">{{ 'packages.group.waitingHint' | t }}</p>
            }
          </div>
        </section>
      } @else {
        <section class="card mb-3" aria-labelledby="cohort-reply">
          <div class="card-header"><h2 id="cohort-reply" class="h5 mb-0">{{ 'packages.group.yourReply' | t }}</h2></div>
          <div class="card-body">
            <p>{{ 'packages.group.noPayment' | t }}</p>
            @if (c.invitation?.status === 'invited' && c.status === 'forming') {
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="respond(true)">{{ 'packages.group.accept' | t }}</button>
                <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="respond(false)">{{ 'packages.group.decline' | t }}</button>
              </div>
            } @else {
              <p class="mb-0" role="status"><strong>{{ ('packages.group.status.' + (c.invitation?.status ?? c.status)) | t }}</strong></p>
            }
          </div>
        </section>
      }
    }
  </div>`
})
export class CohortInvitationComponent {
  private api = inject(PackagesService);
  private destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);
  readonly fmt = inject(ChatFormat);
  private id = 0;
  cohort = signal<ClassCohort | null>(null);
  busy = signal(false);
  private failure = signal<unknown>(null);
  error = computed(() => this.failure() ? this.api.error(this.failure()) : '');
  /** El docente es quien recibe la lista de integrantes; quien ha sido invitado solo ve su propia invitación. */
  isTeacher = computed(() => Boolean(this.cohort()?.members));

  constructor() {
    toastFrom(() => this.error());
    // Se vuelve a cargar al cambiar de id sin salir del componente (D-03).
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.id = Number(params.get('id'));
      this.cohort.set(null);
      this.load();
    });
  }

  load(): void {
    const id = this.id;
    this.failure.set(null);
    this.api.group(id).subscribe({
      next: c => { if (id === this.id) this.cohort.set(c); },
      error: e => { if (id === this.id) this.failure.set(e); }
    });
  }
  instant(value: string): string { return this.i18n.formatInstant(value, this.fmt.timeZone()); }
  isPast(value: string): boolean { return new Date(value).getTime() < Date.now(); }
  readyForOffers(c: ClassCohort): boolean { return c.status === 'forming' && c.acceptedCount === c.groupSize; }
  respond(accepted: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.respondGroup(this.id, accepted).subscribe({
      next: c => { this.cohort.set(c); this.busy.set(false); },
      error: e => { this.failure.set(e); this.busy.set(false); }
    });
  }
}
