import { Component, Input, Output, EventEmitter, signal, OnInit, inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TooltipService, Tooltip, CreateTooltipDto } from '../../../core/services/tooltip.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-tooltip-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent, TranslatePipe],
  template: `
    <div class="tooltip-editor">
      <!-- Text Display Area with Selection -->
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">{{ 'teacherComposer.tooltipEditor.textContent' | t }}</h6>
          <button
            *ngIf="hasSelection()"
            class="btn btn-sm btn-primary"
            (click)="openTooltipModal()"
          >
            <app-icon name="lightbulb" [size]="16" />{{ 'teacherComposer.tooltipEditor.addToSelection' | t }}
          </button>
        </div>
        <div
          class="card-body"
          #textContainer
          (mouseup)="onTextSelection()"
        >
          <div
            class="text-content"
            [innerHTML]="renderedText()"
            style="white-space: pre-wrap; font-size: 1.1rem; line-height: 1.8;"
          ></div>
        </div>
      </div>

      <!-- Existing Tooltips List -->
      <div class="card">
        <div class="card-header">
          <h6 class="mb-0">{{ 'teacherComposer.tooltipEditor.existing' | t:{ count: tooltips().length } }}</h6>
        </div>
        <div class="card-body">
          <div *ngIf="tooltips().length === 0" class="text-muted text-center py-3">
            {{ 'teacherComposer.tooltipEditor.none' | t }}
          </div>

          <div class="list-group">
            <div
              *ngFor="let tooltip of tooltips()"
              class="list-group-item"
            >
              <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <span
                      class="badge rounded-pill px-3 py-2"
                      [style.background-color]="getColorHex(tooltip.highlightColor)"
                      style="color: #333;"
                    >
                      {{ tooltip.selectedText }}
                    </span>
                    <small class="text-muted">
                      {{ 'teacherComposer.tooltipEditor.chars' | t:{ start: tooltip.startOffset, end: tooltip.endOffset } }}
                    </small>
                  </div>
                  <div class="mb-1">
                    <strong>{{ 'teacherComposer.tooltipEditor.tooltipLabel' | t }}</strong> {{ tooltip.tooltipContent }}
                  </div>
                  <small class="text-muted">
                    {{ 'teacherComposer.tooltipEditor.createdBy' | t:{ name: tooltip.creator?.name || ('teacherComposer.tooltipEditor.unknown' | t) } }}
                  </small>
                </div>
                <div class="btn-group">
                  <button
                    class="btn btn-sm btn-outline-primary"
                    (click)="editTooltip(tooltip)"
                  >
                    {{ 'teacherComposer.tooltipEditor.edit' | t }}
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    (click)="deleteTooltip(tooltip.id)"
                  >
                    {{ 'teacherComposer.tooltipEditor.delete' | t }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip Creation/Edit Modal -->
    <div
      class="modal fade"
      [class.show]="showModal()"
      [style.display]="showModal() ? 'block' : 'none'"
      tabindex="-1"
    >
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {{ (editingTooltip() ? 'teacherComposer.tooltipEditor.editTitle' : 'teacherComposer.tooltipEditor.addTitle') | t }}
            </h5>
            <button type="button" class="btn-close" [attr.aria-label]="'teacherComposer.tooltipEditor.closeAria' | t" (click)="closeModal()"></button>
          </div>
          <form [formGroup]="tooltipForm" (ngSubmit)="saveTooltip()">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">{{ 'teacherComposer.tooltipEditor.selectedText' | t }}</label>
                <div class="alert alert-info">
                  <strong>{{ currentSelection()?.text || editingTooltip()?.selectedText }}</strong>
                </div>
              </div>

              <div class="mb-3">
                <label for="tooltipContent" class="form-label">{{ 'teacherComposer.tooltipEditor.contentLabel' | t }}</label>
                <textarea
                  id="tooltipContent"
                  class="form-control"
                  rows="4"
                  formControlName="tooltipContent"
                  [placeholder]="'teacherComposer.tooltipEditor.placeholder' | t"
                ></textarea>
                <small class="text-muted">
                  {{ 'teacherComposer.tooltipEditor.contentHelp' | t }}
                </small>
              </div>

              <div class="mb-3">
                <label class="form-label">{{ 'teacherComposer.tooltipEditor.colorLabel' | t }}</label>
                <div class="d-flex gap-2 flex-wrap">
                  <button
                    *ngFor="let color of availableColors"
                    type="button"
                    class="btn btn-sm"
                    [class.btn-outline-secondary]="tooltipForm.get('highlightColor')?.value !== color.value"
                    [class.btn-primary]="tooltipForm.get('highlightColor')?.value === color.value"
                    (click)="tooltipForm.patchValue({ highlightColor: color.value })"
                  >
                    <span
                      class="d-inline-block rounded-circle"
                      [style.background-color]="getColorHex(color.value)"
                      style="width: 20px; height: 20px; border: 1px solid #ddd;"
                    ></span>
                    <span class="ms-1">{{ color.labelKey | t }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">
                {{ 'teacherComposer.tooltipEditor.cancel' | t }}
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="tooltipForm.invalid || isSubmitting()"
              >
                <span *ngIf="!isSubmitting()">
                  {{ (editingTooltip() ? 'teacherComposer.tooltipEditor.update' : 'teacherComposer.tooltipEditor.create') | t }}
                </span>
                <span *ngIf="isSubmitting()">
                  <span class="spinner-border spinner-border-sm me-2"></span>
                  {{ 'teacherComposer.tooltipEditor.saving' | t }}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Backdrop -->
    <div
      class="modal-backdrop fade"
      [class.show]="showModal()"
      *ngIf="showModal()"
    ></div>
  `,
  styles: [`
    .text-content {
      cursor: text;
      user-select: text;
    }

    .text-content ::ng-deep .tooltip-highlight {
      padding: 2px 0;
      cursor: help;
      position: relative;
      border-radius: 2px;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-yellow {
      background-color: rgba(255, 255, 0, 0.3);
      border-bottom: 2px solid #ffd700;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-blue {
      background-color: rgba(135, 206, 250, 0.3);
      border-bottom: 2px solid #4169e1;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-green {
      background-color: rgba(144, 238, 144, 0.3);
      border-bottom: 2px solid #32cd32;
    }

    .text-content ::ng-deep .tooltip-highlight.highlight-pink {
      background-color: rgba(255, 182, 193, 0.3);
      border-bottom: 2px solid #ff69b4;
    }
  `]
})
export class TooltipEditorComponent implements OnInit {
  @Input() targetType: 'story' | 'question' = 'story';
  @Input() targetId!: number;
  @Input() text!: string;
  @Output() tooltipsChanged = new EventEmitter<Tooltip[]>();

  @ViewChild('textContainer') textContainer!: ElementRef;

  private tooltipService = inject(TooltipService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private i18n = inject(I18nService);

  tooltips = signal<Tooltip[]>([]);
  renderedText = signal<string>('');
  showModal = signal<boolean>(false);
  hasSelection = signal<boolean>(false);
  currentSelection = signal<{ text: string; start: number; end: number } | null>(null);
  editingTooltip = signal<Tooltip | null>(null);
  isSubmitting = signal<boolean>(false);

  tooltipForm: FormGroup;

  availableColors = [
    { value: 'yellow', labelKey: 'teacherComposer.tooltipEditor.color.yellow' },
    { value: 'blue', labelKey: 'teacherComposer.tooltipEditor.color.blue' },
    { value: 'green', labelKey: 'teacherComposer.tooltipEditor.color.green' },
    { value: 'pink', labelKey: 'teacherComposer.tooltipEditor.color.pink' }
  ];

  constructor() {
    this.tooltipForm = this.fb.group({
      tooltipContent: ['', [Validators.required, Validators.minLength(3)]],
      highlightColor: ['yellow']
    });
  }

  ngOnInit(): void {
    this.loadTooltips();
  }

  loadTooltips(): void {
    const request$ = this.targetType === 'story'
      ? this.tooltipService.getTooltipsForStory(this.targetId)
      : this.tooltipService.getTooltipsForQuestion(this.targetId);

    request$.subscribe({
      next: (tooltips) => {
        this.tooltips.set(tooltips);
        this.renderTextWithTooltips();
        this.tooltipsChanged.emit(tooltips);
      },
      error: (error) => {
        console.error('Error loading tooltips:', error);
        this.toastService.error(this.i18n.errorMessage(error, 'teacherComposer.tooltipEditor.loadError'));
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

    this.renderedText.set(html);
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  onTextSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.hasSelection.set(false);
      this.currentSelection.set(null);
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      this.hasSelection.set(false);
      this.currentSelection.set(null);
      return;
    }

    // Calculate offsets in plain text
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(this.textContainer.nativeElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    this.currentSelection.set({
      text: selectedText,
      start: startOffset,
      end: endOffset
    });
    this.hasSelection.set(true);
  }

  openTooltipModal(): void {
    this.editingTooltip.set(null);
    this.tooltipForm.reset({
      tooltipContent: '',
      highlightColor: 'yellow'
    });
    this.showModal.set(true);
  }

  editTooltip(tooltip: Tooltip): void {
    this.editingTooltip.set(tooltip);
    this.tooltipForm.patchValue({
      tooltipContent: tooltip.tooltipContent,
      highlightColor: tooltip.highlightColor
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingTooltip.set(null);
    this.tooltipForm.reset();
  }

  saveTooltip(): void {
    if (this.tooltipForm.invalid) return;

    this.isSubmitting.set(true);

    const editing = this.editingTooltip();

    if (editing) {
      // Update existing tooltip
      const updateData = {
        tooltipContent: this.tooltipForm.get('tooltipContent')?.value,
        highlightColor: this.tooltipForm.get('highlightColor')?.value
      };

      this.tooltipService.updateTooltip(editing.id, updateData).subscribe({
        next: (updatedTooltip) => {
          this.tooltips.update(current =>
            current.map(t => t.id === updatedTooltip.id ? updatedTooltip : t)
          );
          this.renderTextWithTooltips();
          this.toastService.success(this.i18n.t('teacherComposer.tooltipEditor.updated'));
          this.closeModal();
          this.isSubmitting.set(false);
          this.tooltipsChanged.emit(this.tooltips());
        },
        error: (error) => {
          console.error('Error updating tooltip:', error);
          this.toastService.error(this.i18n.errorMessage(error, 'teacherComposer.tooltipEditor.updateError'));
          this.isSubmitting.set(false);
        }
      });
    } else {
      // Create new tooltip
      const selection = this.currentSelection();
      if (!selection) {
        this.toastService.warning(this.i18n.t('teacherComposer.tooltipEditor.noSelection'));
        this.isSubmitting.set(false);
        return;
      }

      const createData: CreateTooltipDto = {
        targetType: this.targetType,
        targetId: this.targetId,
        startOffset: selection.start,
        endOffset: selection.end,
        selectedText: selection.text,
        tooltipContent: this.tooltipForm.get('tooltipContent')?.value,
        highlightColor: this.tooltipForm.get('highlightColor')?.value
      };

      this.tooltipService.createTooltip(createData).subscribe({
        next: (newTooltip) => {
          this.tooltips.update(current => [...current, newTooltip]);
          this.renderTextWithTooltips();
          this.toastService.success(this.i18n.t('teacherComposer.tooltipEditor.created'));
          this.closeModal();
          this.hasSelection.set(false);
          this.currentSelection.set(null);
          this.isSubmitting.set(false);
          this.tooltipsChanged.emit(this.tooltips());

          // Clear text selection
          window.getSelection()?.removeAllRanges();
        },
        error: (error) => {
          console.error('Error creating tooltip:', error);
          if (error.status === 409) {
            this.toastService.error(this.i18n.t('teacherComposer.tooltipEditor.overlap'));
          } else {
            this.toastService.error(this.i18n.errorMessage(error, 'teacherComposer.tooltipEditor.createError'));
          }
          this.isSubmitting.set(false);
        }
      });
    }
  }

  deleteTooltip(id: number): void {
    if (!confirm(this.i18n.t('teacherComposer.tooltipEditor.confirmDelete'))) {
      return;
    }

    this.tooltipService.deleteTooltip(id).subscribe({
      next: () => {
        this.tooltips.update(current => current.filter(t => t.id !== id));
        this.renderTextWithTooltips();
        this.toastService.success(this.i18n.t('teacherComposer.tooltipEditor.deleted'));
        this.tooltipsChanged.emit(this.tooltips());
      },
      error: (error) => {
        console.error('Error deleting tooltip:', error);
        this.toastService.error(this.i18n.errorMessage(error, 'teacherComposer.tooltipEditor.deleteError'));
      }
    });
  }

  getColorHex(color: string): string {
    const colorMap: { [key: string]: string } = {
      'yellow': '#fff59d',
      'blue': '#90caf9',
      'green': '#a5d6a7',
      'pink': '#f48fb1'
    };
    return colorMap[color] || '#fff59d';
  }
}
