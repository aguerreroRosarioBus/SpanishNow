import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TimeInterval, presentSessionTime } from '../../core/time/class-time';

/** Horario de una clase: fecha y hora compactas en la zona de quien mira; la zona queda como texto secundario y el horario del docente solo aparece si es distinto. */
@Component({
  selector: 'app-session-time', standalone: true, imports: [TranslatePipe],
  template: `@if (view(); as v) {
    <div class="when">
      <p class="when-main">
        <time [attr.datetime]="interval().startsAt">{{ v.recipient.day }} · {{ v.recipient.range }}</time>
      </p>
      <p class="when-zone">{{ 'schedule.recipient' | t }} · {{ v.recipient.zone }} · UTC{{ v.recipient.offset }}</p>
      @if (v.teacherDiffers) {
        <p class="when-teacher" data-testid="teacher-time"><span class="when-label">{{ 'schedule.teacherTime' | t }}</span>
          {{ v.teacher.day }} · {{ v.teacher.range }}
          <span class="when-zone">{{ v.teacher.zone }} · UTC{{ v.teacher.offset }}</span></p>
        @if (v.differentDates) { <p class="when-zone" role="note">{{ 'schedule.differentDates' | t }}</p> }
      }
    </div>
  }`,
  styles: [`:host{display:block}.when p{margin:0;overflow-wrap:anywhere}.when-main{font:600 1.125rem/1.3 var(--font-heading);color:var(--color-text)}.when-zone{font-size:.8125rem;color:var(--color-text-light)}.when-teacher{margin-top:var(--spacing-sm)!important;font-size:.875rem}.when-label{display:block;font-size:.75rem;font-weight:700;color:var(--color-text-light)}.when-teacher .when-zone{display:block}`]
})
export class SessionTimeComponent {
  interval = input.required<TimeInterval>();
  recipientZone = input.required<string>();
  teacherZone = input.required<string>();
  private i18n = inject(I18nService);
  view = computed(() => {
    try {
      const locale = this.i18n.locale(), t = presentSessionTime(this.interval(), this.recipientZone(), this.teacherZone(), locale);
      const tag = locale === 'es' ? 'es-AR' : 'en-US', { startsAt, endsAt } = this.interval();
      const part = (zone: string, instant: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { timeZone: zone, ...options }).format(new Date(instant));
      const dayOf = (zone: string, instant: string) => part(zone, instant, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[,.]/g, '');
      const timeOf = (zone: string, instant: string) => part(zone, instant, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const side = (p: typeof t.recipient, zone: string) => {
        const sameDay = p.start.date === p.end.date;
        return { zone: p.start.timeZone, offset: p.start.offset, day: dayOf(zone, startsAt),
          range: sameDay ? `${timeOf(zone, startsAt)}–${timeOf(zone, endsAt)}` : `${timeOf(zone, startsAt)} – ${dayOf(zone, endsAt)} ${timeOf(zone, endsAt)}` };
      };
      const recipient = side(t.recipient, this.recipientZone()), teacher = side(t.teacher, this.teacherZone());
      return { recipient, teacher, differentDates: t.differentDates,
        teacherDiffers: t.recipient.start.localStart !== t.teacher.start.localStart || t.recipient.end.localStart !== t.teacher.end.localStart };
    } catch { return null; }
  });
}
