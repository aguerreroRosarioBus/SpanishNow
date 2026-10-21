import { Component, input, output } from '@angular/core';
import { TooltipEditorComponent } from '../../../../shared/components/tooltip-editor/tooltip-editor.component';

/** Gestión de tooltips de una historia o de una pregunta. */
@Component({
  selector: 'app-tooltip-modal',
  standalone: true,
  imports: [TooltipEditorComponent],
  templateUrl: './tooltip-modal.component.html'
})
export class TooltipModalComponent {
  title = input.required<string>();
  targetType = input.required<'story' | 'question'>();
  targetId = input.required<number>();
  text = input.required<string>();
  closed = output<void>();
}
