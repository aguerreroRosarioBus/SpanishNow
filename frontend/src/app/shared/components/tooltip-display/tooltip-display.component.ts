import { Component, Input, OnInit, signal, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TooltipService, Tooltip } from '../../../core/services/tooltip.service';

@Component({
  selector: 'app-tooltip-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="tooltip-display-container"
      #textContainer
      (click)="onTextClick($event)"
    >
      <div
        class="text-content"
        [innerHTML]="renderedText()"
        style="white-space: pre-wrap; font-size: 1.1rem; line-height: 1.8;"
      ></div>

      <!-- Tooltip Popover -->
      <div
        *ngIf="activeTooltip()"
        class="tooltip-popover"
        [style.top.px]="popoverPosition().top"
        [style.left.px]="popoverPosition().left"
        (click)="$event.stopPropagation()"
      >
        <div class="tooltip-popover-content">
          <button
            type="button"
            class="btn-close btn-sm float-end"
            (click)="closeTooltip()"
          ></button>
          <div class="tooltip-popover-body">
            {{ activeTooltip()?.tooltipContent }}
          </div>
        </div>
        <div class="tooltip-popover-arrow"></div>
      </div>

      <!-- Overlay to close tooltip when clicking outside -->
      <div
        *ngIf="activeTooltip()"
        class="tooltip-overlay"
        (click)="closeTooltip()"
      ></div>
    </div>
  `,
  styles: [`
    .tooltip-display-container {
      position: relative;
      cursor: default;
      overflow: visible;
    }

    .text-content ::ng-deep .tooltip-highlight {
      padding: 2px 0;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      border-radius: 2px;
    }

    .text-content ::ng-deep .tooltip-highlight:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-yellow {
      background-color: rgba(255, 255, 0, 0.3);
      border-bottom: 2px dotted #ffd700;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-blue {
      background-color: rgba(135, 206, 250, 0.3);
      border-bottom: 2px dotted #4169e1;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-green {
      background-color: rgba(144, 238, 144, 0.3);
      border-bottom: 2px dotted #32cd32;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-pink {
      background-color: rgba(255, 182, 193, 0.3);
      border-bottom: 2px dotted #ff69b4;
    }

    .text-content ::ng-deep .tooltip-highlight.active {
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .tooltip-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1040;
      background-color: transparent;
    }

    .tooltip-popover {
      position: absolute;
      z-index: 1050;
      background-color: white;
      border: 1px solid #dee2e6;
      border-radius: 0.5rem;
      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
      padding: 1rem;
      max-width: 300px;
      min-width: 200px;
    }

    .tooltip-popover-content {
      position: relative;
    }

    .tooltip-popover-body {
      font-size: 0.95rem;
      line-height: 1.5;
      color: #212529;
      padding-right: 1.5rem;
    }

    .tooltip-popover-arrow {
      position: absolute;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 8px solid white;
      top: -8px;
      left: 20px;
    }

    .tooltip-popover-arrow::before {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-bottom: 9px solid #dee2e6;
      top: -2px;
      left: -9px;
    }
  `]
})
export class TooltipDisplayComponent implements OnInit, AfterViewInit {
  @Input() targetType: 'story' | 'question' = 'story';
  @Input() targetId!: number;
  @Input() text!: string;

  @ViewChild('textContainer') textContainer!: ElementRef;

  private tooltipService = inject(TooltipService);
  private sanitizer = inject(DomSanitizer);

  tooltips = signal<Tooltip[]>([]);
  renderedText = signal<SafeHtml>('');
  activeTooltip = signal<Tooltip | null>(null);
  popoverPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  ngOnInit(): void {
    this.loadTooltips();
  }

  ngAfterViewInit(): void {
    // Setup complete
  }

  loadTooltips(): void {
    const request$ = this.targetType === 'story'
      ? this.tooltipService.getTooltipsForStory(this.targetId)
      : this.tooltipService.getTooltipsForQuestion(this.targetId);

    request$.subscribe({
      next: (tooltips) => {
        this.tooltips.set(tooltips);
        this.renderTextWithTooltips();
      },
      error: (error) => {
        console.error('Error loading tooltips:', error);
        this.renderedText.set(this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(this.text)));
      }
    });
  }

  renderTextWithTooltips(): void {
    const tooltips = [...this.tooltips()].sort((a, b) => a.startOffset - b.startOffset);
    let html = '';
    let lastIndex = 0;

    for (const tooltip of tooltips) {
      // Add text before tooltip
      html += this.escapeHtml(this.text.substring(lastIndex, tooltip.startOffset));

      // Add highlighted text with tooltip
      const highlightedText = this.escapeHtml(tooltip.selectedText);
      html += `<span class="tooltip-highlight highlight-${tooltip.highlightColor}" data-tooltip-id="${tooltip.id}">${highlightedText}</span>`;

      lastIndex = tooltip.endOffset;
    }

    // Add remaining text
    html += this.escapeHtml(this.text.substring(lastIndex));

    // Bypass security to preserve data-tooltip-id attributes
    this.renderedText.set(this.sanitizer.bypassSecurityTrustHtml(html));
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  onTextClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.classList.contains('tooltip-highlight')) {
      const tooltipId = parseInt(target.getAttribute('data-tooltip-id') || '0', 10);
      const tooltip = this.tooltips().find(t => t.id === tooltipId);

      if (tooltip) {
        // Remove active class from all highlights
        const allHighlights = this.textContainer.nativeElement.querySelectorAll('.tooltip-highlight');
        allHighlights.forEach((el: HTMLElement) => el.classList.remove('active'));

        // Add active class to clicked highlight
        target.classList.add('active');

        // Calculate popover position relative to container
        const rect = target.getBoundingClientRect();
        const containerRect = this.textContainer.nativeElement.getBoundingClientRect();

        this.popoverPosition.set({
          top: rect.bottom - containerRect.top + 10,
          left: rect.left - containerRect.left
        });

        this.activeTooltip.set(tooltip);
      }
    } else {
      this.closeTooltip();
    }
  }

  closeTooltip(): void {
    // Remove active class from all highlights
    if (this.textContainer && this.textContainer.nativeElement) {
      const allHighlights = this.textContainer.nativeElement.querySelectorAll('.tooltip-highlight');
      allHighlights.forEach((el: HTMLElement) => el.classList.remove('active'));
    }

    this.activeTooltip.set(null);
  }
}
