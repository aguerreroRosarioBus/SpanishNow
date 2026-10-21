import { CommonModule } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Question, Vocabulary } from '../../../core/models/course.model';
import { LessonBlock, LessonBlockType, LessonPhase } from '../../../core/services/lesson-plan.service';
import { storyTextFromBlocks, tprsChecklist } from './tprs-checklist';
import { PROGRAMMATIC_SCROLL_MS, canAutoScroll, nearestScrollTop, scrollBehavior } from './scroll-sync';

export type SidePanelTab = 'story' | 'tprs' | 'preview';
const PHASES: LessonPhase[] = ['before', 'during', 'after', 'later'];
const PHASE_LABEL: Record<LessonPhase, string> = { before: 'Antes', during: 'Durante', after: 'Después', later: 'Más adelante' };
const TYPE_LABEL: Record<LessonBlockType, string> = { expression: 'Expresión', keyframe: 'Keyframe', question: 'Pregunta', full_story: 'Lectura y audio completos', flashcards: 'Tarjetas', matching: 'Emparejar', listen_repeat: 'Repetición oral' };
const TABS: { id: SidePanelTab; label: string }[] = [
  { id: 'story', label: 'La historia hasta ahora' }, { id: 'tprs', label: 'Chequeo TPRS' }, { id: 'preview', label: 'Vista previa' }
];

/** Panel lateral del compositor: texto acumulado, chequeo TPRS en vivo y vista previa del recorrido del alumno. */
@Component({
  selector: 'app-composer-side-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './composer-side-panel.component.html',
  styleUrl: './composer-side-panel.component.scss'
})
export class ComposerSidePanelComponent {
  blocks = input.required<LessonBlock[]>();
  questions = input<Question[]>([]);
  vocabulary = input<Vocabulary[]>([]);
  storyId = input<number>();
  audioNormalUrl = input<string | null | undefined>(null);
  tab = model<SidePanelTab>('story');
  /** Bloque activo en el compositor (foco/edición): se resalta y, si hace falta, se muestra. */
  activeBlockKey = input<string | null>(null);
  /** Clic/Enter en un elemento del panel: el compositor lleva ese bloque a la vista. */
  navigate = output<string>();

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private injector = inject(Injector);
  private pointerOver = false;
  private lastUserScrollAt = -Infinity;
  private programmaticUntil = 0;

  readonly tabs = TABS;
  readonly phases = PHASES;
  questionStates = signal<Record<string, 'question' | 'wrong' | 'correct' | 'continued'>>({});

  storyText = computed(() => storyTextFromBlocks(this.blocks()));
  checklist = computed(() => tprsChecklist({ blocks: this.blocks(), vocabulary: this.vocabulary(), questions: this.questions(), storyId: this.storyId() }));
  doneCount = computed(() => this.checklist().filter(item => item.ok).length);

  /** Keyframes activos con texto, un párrafo cada uno (mismo criterio que storyText). */
  storyParagraphs = computed(() => this.blocks().filter(b => b.type === 'keyframe' && b.active && (b.text ?? '').trim()).map(b => ({ key: b.blockKey, text: (b.text ?? '').trim() })));
  /** Keyframe resaltado en «La historia hasta ahora»: el activo o, si es una pregunta, su keyframe de contexto. */
  highlightedKeyframeKey = computed(() => {
    const key = this.activeBlockKey(), active = this.blocks().find(b => b.blockKey === key);
    if (!active) return null;
    return active.type === 'question' ? active.contextBlockKey ?? null : active.type === 'keyframe' ? active.blockKey : null;
  });

  constructor() {
    effect(() => {
      this.activeBlockKey(); this.tab(); this.blocks();
      afterNextRender(() => this.revealActive(), { injector: this.injector });
    });
  }

  onPointerEnter(): void { this.pointerOver = true; }
  onPointerLeave(): void { this.pointerOver = false; }
  /** Desplazamiento manual (rueda/táctil) o `scroll` fuera de la ventana de nuestro propio scroll. */
  onUserScrollIntent(): void { this.lastUserScrollAt = Date.now(); }
  onScroll(): void { if (Date.now() > this.programmaticUntil) this.lastUserScrollAt = Date.now(); }

  /** Desplaza solo el contenedor del panel, y solo si el elemento resaltado no se ve entero. */
  revealActive(): void {
    const container = this.scroller()?.nativeElement;
    if (!container || this.tab() === 'tprs') return;
    const item = container.querySelector<HTMLElement>('[aria-current="true"]');
    if (!item || !canAutoScroll(this.pointerOver, this.lastUserScrollAt, Date.now())) return;
    const top = nearestScrollTop(container, item);
    if (top === null) return;
    const behavior = scrollBehavior();
    this.programmaticUntil = Date.now() + (behavior === 'smooth' ? PROGRAMMATIC_SCROLL_MS : 100);
    container.scrollTo({ top, behavior });
  }

  /** Clic en el elemento de la vista previa; ignora los clics sobre controles internos. */
  onItemClick(event: Event, block: LessonBlock): void {
    if ((event.target as HTMLElement).closest('button, a, audio, input, select, textarea')) return;
    this.navigate.emit(block.blockKey);
  }

  phaseLabel(phase: LessonPhase): string { return PHASE_LABEL[phase]; }
  typeLabel(type: LessonBlockType): string { return TYPE_LABEL[type]; }
  previewBlocks(phase: LessonPhase): LessonBlock[] { return this.blocks().filter(b => b.phase === phase && b.active); }
  hasDuring(): boolean { return this.blocks().some(b => b.phase === 'during'); }
  narrativeText(): string { return this.previewBlocks('during').filter(b => b.type === 'keyframe').map(b => b.text || '').join(' '); }
  previewLabel(block: LessonBlock): string { return block.text || block.vocabularySnapshot?.word || this.vocabulary().find(v => v.id === block.vocabularyId)?.word || block.questionSnapshot?.questionText || this.typeLabel(block.type); }
  vocabImage(block: LessonBlock): string | null { return this.vocabulary().find(v => v.id === block.vocabularyId)?.imageUrl || null; }
  questionText(block: LessonBlock): string { return block.questionSnapshot?.questionText || this.questions().find(q => q.id === block.questionId)?.questionText || block.text || 'Pregunta sin contenido'; }
  contextText(block: LessonBlock): string { return this.blocks().find(item => item.blockKey === block.contextBlockKey)?.text || 'Keyframe sin texto'; }
  questionState(block: LessonBlock): string { return this.questionStates()[block.blockKey] || 'question'; }
  setQuestionState(block: LessonBlock, state: 'wrong' | 'correct' | 'continued'): void { this.questionStates.update(s => ({ ...s, [block.blockKey]: state })); }

  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.findIndex(t => t.id === this.tab()) + step + TABS.length) % TABS.length];
    this.tab.set(next.id);
    setTimeout(() => (document.getElementById('side-tab-' + next.id) as HTMLElement | null)?.focus(), 0);
  }
}
