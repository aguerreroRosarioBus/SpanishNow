import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbTypeahead, NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { Observable, Subject, map, merge } from 'rxjs';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { PilotTheme } from '../../styles/primeng-theme';

/** La selección conserva el identificador IANA. Intl se usa solo para presentación. */
export function zoneLabel(zone: string): string {
  const parts = zone.replaceAll('_', ' ').split('/');
  return parts.length > 1 ? `${parts.pop()} · ${parts.join(' / ')}` : zone;
}
export function zoneOffset(zone: string, locale: string, date = new Date()): string {
  try {
    const offset =
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(date)
        .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    return offset.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('_', ' ');
const fallbackZones = [
  'UTC',
  'America/Argentina/Cordoba',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];
export function matchingZones(zones: string[], query: string): string[] {
  const words = normalize(query).trim().split(/\s+/);
  return zones
    .filter((zone) => words.every((word) => normalize(`${zone} ${zoneLabel(zone)}`).includes(word)))
    .slice(0, 40);
}

@Component({
  selector: 'app-time-zone-select',
  standalone: true,
  imports: [FormsModule, NgbTypeahead, TranslatePipe, IconComponent, AutoCompleteModule],
  template: `
    <label class="form-label" [for]="inputId()">{{ label() || ('visual.zone' | t) }}</label>
    <div class="zone-search">
      <app-icon name="search" [size]="18" />
      @if (variant() === 'pilot') {
        <p-autocomplete [inputId]="inputId()" [(ngModel)]="pilotModel" [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="edit()" [suggestions]="suggestions()" (completeMethod)="completePilot($event)"
          optionLabel="label" [forceSelection]="true" [completeOnFocus]="true" [minLength]="0" [delay]="120"
          [disabled]="disabled()" [placeholder]="'visual.zoneSearch' | t" [emptyMessage]="'visual.zoneEmpty' | t"
          [searchMessage]="'schedule.ui.zoneResults' | t" [emptySelectionMessage]="'visual.zoneSelect' | t"
          [ariaLabel]="label() || ('visual.zone' | t)" inputStyleClass="form-control pilot-zone-input"
          (onSelect)="selectPilot($event.value.zone)" appendTo="body" panelStyleClass="pilot-zone-panel" scrollHeight="260px">
          <ng-template #item let-option>
            <div class="zone-option"><span class="zone-result"><strong>{{ city(option.zone) }}</strong><span>{{ offset(option.zone) }}</span></span><small class="zone-iana">{{ option.zone }}</small></div>
          </ng-template>
        </p-autocomplete>
      } @else {
      <input
        class="form-control"
        [id]="inputId()"
        type="text"
        [(ngModel)]="model"
        [ngModelOptions]="{ standalone: true }"
        (input)="edit()"
        [ngbTypeahead]="search"
        [resultTemplate]="result"
        [inputFormatter]="format"
        [editable]="false"
        (selectItem)="select($event)"
        (focus)="focus.next('')"
        [disabled]="disabled()"
        autocomplete="off"
        spellcheck="false"
        [placeholder]="'visual.zoneSearch' | t"
        [attr.aria-describedby]="inputId() + '-help'"
        container="body"
        [popupClass]="'zone-options'"
      />
      }
    </div>
    <ng-template #result let-zone="result">
      <span class="zone-result"
        ><strong>{{ city(zone) }}</strong
        ><span>{{ offset(zone) }}</span></span
      >
      <small class="zone-iana">{{ zone }}</small>
    </ng-template>
    <p class="zone-help" [id]="inputId() + '-help'">{{ 'visual.zoneHelp' | t }}</p>
    @if (editing()) {
      <p class="zone-help" role="status">
        {{ (hasMatches() ? 'visual.zoneSelect' : 'visual.zoneEmpty') | t }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .form-label {
      display: block;
      line-height: 18px;
      font-size: 0.8125rem;
      font-weight: 600;
      margin: 0 0 6px;
    }
    .zone-search {
      position: relative;
    }
    .zone-search > app-icon {
      position: absolute;
      left: 13px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--color-text-light);
      z-index: 1;
    }
    input.form-control {
      padding-left: 40px;
      height: var(--control-height, 48px);
      min-height: var(--control-height, 48px);
      font-size: 0.875rem;
    }
    .zone-help {
      margin: 6px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-light);
    }
    .zone-result {
      display: flex;
      gap: 24px;
      justify-content: space-between;
      font-size: 0.875rem;
    }
    .zone-option { width: 100%; min-width: 0; }
    .zone-result span {
      color: var(--color-text-light);
      font-size: 0.8125rem;
    }
    .zone-iana {
      display: block;
      color: var(--color-text-light);
      font-size: 0.75rem;
    }
  `,
})
export class TimeZoneSelectComponent {
  private readonly pilotTheme = inject(PilotTheme);
  readonly i18n = inject(I18nService);
  inputId = input.required<string>();
  label = input('');
  value = input('');
  disabled = input(false);
  variant = input<'default' | 'pilot'>('default');
  valueChange = output<string>();
  model: string | null = null;
  pilotModel: { zone: string; label: string } | string | null = null;
  suggestions = signal<{ zone: string; label: string }[]>([]);
  private lastSelected = '';
  editing = signal(false);
  hasMatches = signal(true);
  readonly focus = new Subject<string>();
  private readonly deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private readonly supported =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : fallbackZones;
  readonly zones = computed(() =>
    [...new Set(['UTC', this.value(), this.deviceZone, ...this.supported].filter(Boolean))].sort(),
  );
  city = zoneLabel;
  offset(zone: string): string {
    return zoneOffset(zone, this.i18n.intlLocale());
  }
  format = (zone: string) => (zone ? `${zoneLabel(zone)} (${this.offset(zone)})` : '');
  search = (terms: Observable<string>) =>
    merge(terms, this.focus).pipe(
      map((term) => {
        const matches = matchingZones(this.zones(), term);
        this.hasMatches.set(matches.length > 0);
        return matches;
      }),
    );
  constructor() {
    effect(() => {
      const value = this.value();
      this.i18n.locale();
      if (value) {
        this.model = value;
        this.lastSelected = value;
        this.pilotModel = { zone: value, label: this.format(value) };
        this.editing.set(false);
      }
    });
  }
  edit(): void {
    this.editing.set(true);
    this.valueChange.emit('');
  }
  select(event: NgbTypeaheadSelectItemEvent<string>): void {
    this.editing.set(false);
    this.valueChange.emit(event.item);
  }
  completePilot(event: AutoCompleteCompleteEvent): void {
    const query = event.query.trim();
    const initial = !query || query === this.format(this.lastSelected);
    const zones = initial
      ? [...new Set([this.lastSelected, this.deviceZone, ...fallbackZones].filter(Boolean))].slice(0, 8)
      : matchingZones(this.zones(), query).slice(0, 8);
    this.hasMatches.set(zones.length > 0);
    this.suggestions.set(zones.map(zone => ({ zone, label: this.format(zone) })));
  }
  selectPilot(zone: string): void { this.editing.set(false); this.valueChange.emit(zone); }
}
