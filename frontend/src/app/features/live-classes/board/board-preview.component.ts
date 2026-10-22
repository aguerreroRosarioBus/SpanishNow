import { Component, computed, input } from '@angular/core';
import { BoardPage } from '../../../core/models/live-class.model';
import { pathOf } from './board.logic';

/** Lightweight, noninteractive frame previews; never mounts another editor or focus target. */
@Component({
  selector: 'app-board-preview', standalone: true,
  template: `<svg viewBox="0 0 1600 900" aria-hidden="true" focusable="false">
    <rect width="1600" height="900" fill="white" />
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
  styles: [':host { display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--color-bg); } svg { display: block; width: 100%; height: 100%; }']
})
export class BoardPreviewComponent {
  page = input.required<BoardPage>();
  elements = computed(() => this.page().elements.slice(0, 60));
  readonly path = pathOf;
}
