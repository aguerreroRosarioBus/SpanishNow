import { Component, Input, Output, EventEmitter, signal, OnInit, inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TooltipService, Tooltip, CreateTooltipDto } from '../../../core/services/tooltip.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-tooltip-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="tooltip-editor">
      <!-- Text Display Area with Selection -->
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">Contenido de Texto</h6>
          <button
            *ngIf="hasSelection()"
            class="btn btn-sm btn-primary"
            (click)="openTooltipModal()"
          >
            💡 Agregar Tooltip a Selección
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
          <h6 class="mb-0">Tooltips Existentes ({{ tooltips().length }})</h6>
        </div>
        <div class="card-body">
          <div *ngIf="tooltips().length === 0" class="text-muted text-center py-3">
            No hay tooltips creados aún. Selecciona texto arriba para crear uno.
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
                      (chars {{ tooltip.startOffset }}-{{ tooltip.endOffset }})
                    </small>
                  </div>
                  <div class="mb-1">
                    <strong>Tooltip:</strong> {{ tooltip.tooltipContent }}
                  </div>
                  <small class="text-muted">
                    Creado por {{ tooltip.creator?.name || 'Desconocido' }}
                  </small>
                </div>
                <div class="btn-group">
                  <button
                    class="btn btn-sm btn-outline-primary"
                    (click)="editTooltip(tooltip)"
                  >
                    Editar
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    (click)="deleteTooltip(tooltip.id)"
                  >
                    Eliminar
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
              {{ editingTooltip() ? 'Editar Tooltip' : 'Agregar Tooltip' }}
            </h5>
            <button type="button" class="btn-close" (click)="closeModal()"></button>
          </div>
          <form [formGroup]="tooltipForm" (ngSubmit)="saveTooltip()">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Texto Seleccionado</label>
                <div class="alert alert-info">
                  <strong>{{ currentSelection()?.text || editingTooltip()?.selectedText }}</strong>
                </div>
              </div>

              <div class="mb-3">
                <label for="tooltipContent" class="form-label">Contenido del Tooltip *</label>
                <textarea
                  id="tooltipContent"
                  class="form-control"
                  rows="4"
                  formControlName="tooltipContent"
                  placeholder="Ingresa la explicación, traducción o nota de ayuda..."
                ></textarea>
                <small class="text-muted">
                  Esto aparecerá cuando los estudiantes hagan clic o pasen el cursor sobre el texto resaltado.
                </small>
              </div>

              <div class="mb-3">
                <label class="form-label">Color de Resaltado</label>
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
                    <span class="ms-1">{{ color.label }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">
                Cancelar
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="tooltipForm.invalid || isSubmitting()"
              >
                <span *ngIf="!isSubmitting()">
                  {{ editingTooltip() ? 'Actualizar' : 'Crear' }} Tooltip
                </span>
                <span *ngIf="isSubmitting()">
                  <span class="spinner-border spinner-border-sm me-2"></span>
                  Guardando...
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

  tooltips = signal<Tooltip[]>([]);
  renderedText = signal<string>('');
  showModal = signal<boolean>(false);
  hasSelection = signal<boolean>(false);
  currentSelection = signal<{ text: string; start: number; end: number } | null>(null);
  editingTooltip = signal<Tooltip | null>(null);
  isSubmitting = signal<boolean>(false);

  tooltipForm: FormGroup;

  availableColors = [
    { value: 'yellow', label: 'Amarillo' },
    { value: 'blue', label: 'Azul' },
    { value: 'green', label: 'Verde' },
    { value: 'pink', label: 'Rosa' }
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
        this.toastService.error('Error al cargar tooltips');
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
          this.toastService.success('Tooltip actualizado exitosamente');
          this.closeModal();
          this.isSubmitting.set(false);
          this.tooltipsChanged.emit(this.tooltips());
        },
        error: (error) => {
          console.error('Error updating tooltip:', error);
          this.toastService.error(error.error?.error || 'Error al actualizar tooltip');
          this.isSubmitting.set(false);
        }
      });
    } else {
      // Create new tooltip
      const selection = this.currentSelection();
      if (!selection) {
        this.toastService.warning('No hay texto seleccionado');
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
          this.toastService.success('Tooltip creado exitosamente');
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
          const errorMsg = error.error?.error || 'Error al crear tooltip';
          if (error.status === 409) {
            this.toastService.error('Esta selección se solapa con un tooltip existente');
          } else {
            this.toastService.error(errorMsg);
          }
          this.isSubmitting.set(false);
        }
      });
    }
  }

  deleteTooltip(id: number): void {
    if (!confirm('¿Estás seguro de que deseas eliminar este tooltip?')) {
      return;
    }

    this.tooltipService.deleteTooltip(id).subscribe({
      next: () => {
        this.tooltips.update(current => current.filter(t => t.id !== id));
        this.renderTextWithTooltips();
        this.toastService.success('Tooltip eliminado exitosamente');
        this.tooltipsChanged.emit(this.tooltips());
      },
      error: (error) => {
        console.error('Error deleting tooltip:', error);
        this.toastService.error('Error al eliminar tooltip');
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
