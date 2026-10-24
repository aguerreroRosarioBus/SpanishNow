import { Directive, ElementRef, inject, Injector, input } from '@angular/core';
import { TUTORIALS } from '../../../core/tutorials/tutorials';
import { TutorialService } from '../../../core/tutorials/tutorial.service';

/** Iniciador dentro del diálogo: accesible sin salir del contexto modal. */
@Directive({ selector: 'button[appTutorial]', standalone: true, host: { '(click)': 'start()' } })
export class TutorialTriggerDirective {
  readonly appTutorial = input.required<string>();
  private readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef);
  private readonly injector = inject(Injector);

  start(): void {
    const tour = TUTORIALS.find(item => item.id === this.appTutorial());
    const trigger = this.element.nativeElement;
    const root = tour ? trigger.closest<HTMLElement>(tour.root) : null;
    if (tour && root) void this.injector.get(TutorialService).start(tour, root, trigger);
  }
}
