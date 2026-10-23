import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TimeInterval, presentSessionTime } from '../../core/time/class-time';

@Component({
  selector: 'app-session-time', standalone: true, imports: [TranslatePipe],
  template: `@if (view(); as v) {
    <div class="time-zone"><strong>{{ 'schedule.recipient' | t }}</strong>
      <time [attr.datetime]="interval().startsAt">{{ v.recipient.startLabel }}</time><span> — </span>
      <time [attr.datetime]="interval().endsAt">{{ v.recipient.endLabel }}</time>
      <small>{{ v.recipient.start.timeZone }} · UTC{{ v.recipient.start.offset }} @if (v.recipient.start.offset !== v.recipient.end.offset) { → UTC{{ v.recipient.end.offset }} }</small>
    </div>
    <div class="time-zone secondary"><strong>{{ 'schedule.teacherTime' | t }}</strong>
      <span>{{ v.teacher.startLabel }} — {{ v.teacher.endLabel }}</span>
      <small>{{ v.teacher.start.timeZone }} · UTC{{ v.teacher.start.offset }} @if (v.teacher.start.offset !== v.teacher.end.offset) { → UTC{{ v.teacher.end.offset }} }</small>
    </div>
    @if (v.differentDates) { <p class="small mb-0" role="note">{{ 'schedule.differentDates' | t }}</p> }
  }`,
  styles: [`.time-zone { margin:.5rem 0; overflow-wrap:anywhere } strong, small { display:block } .secondary { color:var(--color-text-muted,#625e59);font-size:.9em }`]
})
export class SessionTimeComponent {
  interval = input.required<TimeInterval>();
  recipientZone = input.required<string>();
  teacherZone = input.required<string>();
  private i18n = inject(I18nService);
  view = computed(() => { try { return presentSessionTime(this.interval(), this.recipientZone(), this.teacherZone(), this.i18n.locale()); } catch { return null; } });
}
