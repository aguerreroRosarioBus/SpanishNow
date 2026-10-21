import { CommonModule } from '@angular/common';
import { Component, computed, input, model, signal } from '@angular/core';
import { Question, Vocabulary } from '../../../core/models/course.model';
import { LessonBlock, LessonBlockType, LessonPhase } from '../../../core/services/lesson-plan.service';
import { storyTextFromBlocks, tprsChecklist } from './tprs-checklist';

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

  readonly tabs = TABS;
  readonly phases = PHASES;
  questionStates = signal<Record<string, 'question' | 'wrong' | 'correct' | 'continued'>>({});

  storyText = computed(() => storyTextFromBlocks(this.blocks()));
  checklist = computed(() => tprsChecklist({ blocks: this.blocks(), vocabulary: this.vocabulary(), questions: this.questions(), storyId: this.storyId() }));
  doneCount = computed(() => this.checklist().filter(item => item.ok).length);

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
