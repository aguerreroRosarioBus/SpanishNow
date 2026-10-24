import { Component, computed, input } from '@angular/core';
import { BoardPage } from '../../../core/models/live-class.model';
import { pageFrame, pathOf } from './board.logic';

/** Lightweight, noninteractive frame previews; never mounts another editor or focus target. */
@Component({
  selector: 'app-board-preview', standalone: true,
  host: { '[style.aspect-ratio]': "frame().w + ' / ' + frame().h" },
  template: `<svg [attr.viewBox]="frame().x + ' ' + frame().y + ' ' + frame().w + ' ' + frame().h" aria-hidden="true" focusable="false">
    <defs>
      <pattern [attr.id]="'preview-dots-' + page().id" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="#ccd4df" /></pattern>
      <pattern [attr.id]="'preview-grid-' + page().id" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dfe5ed" stroke-width="1" /></pattern>
      <pattern [attr.id]="'preview-lines-' + page().id" [attr.width]="frame().w" height="40" patternUnits="userSpaceOnUse"><path [attr.d]="'M 0 40 L ' + frame().w + ' 40'" fill="none" stroke="#dfe5ed" stroke-width="1" /></pattern>
    </defs>
    <rect [attr.x]="frame().x" [attr.y]="frame().y" [attr.width]="frame().w" [attr.height]="frame().h" fill="white" />
    @if (page().background !== 'plain') { <rect [attr.x]="frame().x" [attr.y]="frame().y" [attr.width]="frame().w" [attr.height]="frame().h" [attr.fill]="'url(#preview-' + page().background + '-' + page().id + ')'" /> }
    @for (e of elements(); track e.id) {
      @switch (e.type) {
        @case ('pen') { <path [attr.d]="path(e.points)" [attr.stroke]="e.color" [attr.stroke-width]="e.width + 3" fill="none" stroke-linecap="round" /> }
        @case ('line') { <path [attr.d]="path(e.points)" [attr.stroke]="e.color" [attr.stroke-width]="e.width + 3" fill="none" /> }
        @case ('ellipse') { <ellipse [attr.cx]="e.x + e.w / 2" [attr.cy]="e.y + e.h / 2" [attr.rx]="e.w / 2" [attr.ry]="e.h / 2" [attr.stroke]="e.color" stroke-width="8" fill="none" /> }
        @case ('image') { <image [attr.href]="e.url" [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.w" [attr.height]="e.h" preserveAspectRatio="xMidYMid meet" /> }
        @case ('text') { <text [attr.x]="e.x" [attr.y]="e.y + 30" [attr.fill]="e.color" font-size="32">{{ (e.text || '').slice(0, 40) }}</text> }
        @default { <rect [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.w" [attr.height]="e.h" [attr.fill]="e.type === 'note' ? e.color : e.type === 'link' ? '#e3eef7' : 'none'" [attr.stroke]="e.type === 'rect' ? e.color : 'none'" stroke-width="8" /> }
      }
    }
  </svg>`,
  styles: [':host { display: block; width: 100%; overflow: hidden; background: var(--color-bg); } svg { display: block; width: 100%; height: 100%; }']
})
export class BoardPreviewComponent {
  page = input.required<BoardPage>();
  frame = computed(() => pageFrame(this.page()));
  elements = computed(() => this.page().elements.slice(0, 60));
  readonly path = pathOf;
}
