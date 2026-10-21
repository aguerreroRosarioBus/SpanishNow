import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { KeyframeExtrasComponent } from './keyframe-extras.component';
import { KeyframeIllustrationComponent } from './keyframe-illustration.component';
import { WhiteboardComponent } from './whiteboard/whiteboard.component';
import { WhiteboardService } from './whiteboard/whiteboard.service';
import { ComposerSidePanelComponent, SidePanelTab } from './composer-side-panel.component';
import { InlineQuestionFormComponent } from './inline-question-form.component';
import { InlineVocabularyFormComponent } from './inline-vocabulary-form.component';
import { KeyframeTooltip, LessonBlock, LessonBlockType, LessonPhase, LessonPlan, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { Story, Question, Vocabulary, Unit } from '../../../core/models/course.model';
import { storyTextFromBlocks } from './tprs-checklist';

const TUTORIAL_VERSION = '1';
const PHASES: LessonPhase[] = ['before', 'during', 'after', 'later'];
const PHASE_LABEL: Record<LessonPhase, string> = { before: 'Antes', during: 'Durante', after: 'Después', later: 'Más adelante' };

@Component({
  selector: 'app-lesson-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, KeyframeExtrasComponent, KeyframeIllustrationComponent, WhiteboardComponent, ComposerSidePanelComponent, InlineQuestionFormComponent, InlineVocabularyFormComponent],
  templateUrl: './lesson-composer.component.html',
  styleUrls: ['./lesson-composer.component.scss', './lesson-composer-tutorial.scss', './lesson-composer-flow.scss']
})
export class LessonComposerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) story!: Story;
  @Input({ required: true }) unit!: Unit;
  @Input({ required: true }) courseUnits: Unit[] = [];
  @Output() closed = new EventEmitter<void>();
  /** Texto de la historia reconstruido al publicar (keyframes activos unidos), para refrescar la lista sin recargar. */
  @Output() storyTextPublished = new EventEmitter<string>();
  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') closeButton?: ElementRef<HTMLButtonElement>;

  private api = inject(LessonPlanService);
  private auth = inject(AuthService);
  private questionsApi = inject(QuestionService);
  private vocabApi = inject(VocabularyService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  whiteboard = inject(WhiteboardService);
  plan = signal<LessonPlan | null>(null);
  blocks = signal<LessonBlock[]>([]);
  questions = signal<Question[]>([]);
  vocabulary = signal<Vocabulary[]>([]);
  stories = signal<Story[]>([]);
  loading = signal(true);
  saving = signal(false);
  publishing = signal(false);
  dirty = signal(false);
  error = signal('');
  notice = signal('');
  showTutorial = signal(false);
  exampleMode = signal(false);
  sideTab = signal<SidePanelTab>('story');
  /** Bloque de pregunta / de expresión con el formulario de creación abierto. */
  newQuestionFor = signal<string | null>(null);
  newExpressionFor = signal<string | null>(null);
  /** Selección de texto en el textarea de un keyframe y expresión que se está marcando. */
  private keyframeSelection = signal<{ blockKey: string; snippet: string } | null>(null);
  markTarget = signal<{ blockKey: string; word: string } | null>(null);
  reordering = signal(false);
  reorderAnnouncement = signal('');
  private draggedBlockKey: string | null = null;
  private returnFocus: HTMLElement | null = null;
  private seenKey = '';
  private blocksBeforeExample: LessonBlock[] = [];

  async ngOnInit(): Promise<void> {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const userId = this.auth.currentUser()?.id ?? 'unknown';
    this.seenKey = `spanishnow.lesson-tutorial.${userId}.v${TUTORIAL_VERSION}`;
    this.stories.set(this.courseUnits.flatMap(unit => unit.stories || []));
    try {
      const [plan, questions, vocabulary] = await Promise.all([
        firstValueFrom(this.api.getDraft(this.story.id)),
        firstValueFrom(this.questionsApi.getQuestionsByStory(this.story.id)),
        firstValueFrom(this.vocabApi.getVocabularyByUnit(this.unit.id))
      ]);
      this.plan.set(plan);
      this.blocks.set(plan.blocks.map(block => ({ ...block })));
      this.questions.set(questions);
      this.vocabulary.set(vocabulary);
      if (!localStorage.getItem(this.seenKey)) this.openTutorial();
    } catch (error: any) {
      this.error.set(error?.error?.error || 'No se pudo cargar el borrador. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
      if (!this.showTutorial()) setTimeout(() => this.closeButton?.nativeElement.focus(), 0);
    }
  }

  ngOnDestroy(): void { this.whiteboard.finish(null); this.restoreFocus(); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.showTutorial()) { event.preventDefault(); this.closeTutorial(); }
      else if (this.sideTab() === 'preview') { this.sideTab.set('story'); }
      else this.close();
      return;
    }
    if (!this.showTutorial() || event.key !== 'Tab') return;
    const root = this.host.nativeElement as HTMLElement;
    const modal = root.querySelector('.tutorial-dialog') as HTMLElement | null;
    const focusable = [...(modal?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || [])] as HTMLElement[];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (current && !modal?.contains(current)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
  }

  phaseLabel(phase: LessonPhase): string { return PHASE_LABEL[phase]; }
  phaseBlocks(phase: LessonPhase): LessonBlock[] { return this.blocks().filter(block => block.phase === phase); }
  keyframesBefore(block: LessonBlock): LessonBlock[] {
    const index = this.blocks().findIndex(item => item.blockKey === block.blockKey);
    return this.blocks().slice(0, index).filter(item => item.type === 'keyframe' && item.active);
  }
  savedBlock(block: LessonBlock): LessonBlock | null { return this.plan()?.blocks.find(item => item.blockKey === block.blockKey) ?? null; }
  ensureSavedFn = async (): Promise<boolean> => !this.dirty() || this.save();
  onAudioChange(event: { blockKey: string; audioUrl: string | null }): void { this.patchBlock(event.blockKey, { audioUrl: event.audioUrl }); }
  vocabImage(block: LessonBlock): string | null { return this.vocabulary().find(v => v.id === block.vocabularyId)?.imageUrl || null; }
  vocabWord(block: LessonBlock): string | null { return this.vocabulary().find(v => v.id === block.vocabularyId)?.word || null; }
  onImageChange(event: { blockKey: string; imageUrl: string | null }): void { this.patchBlock(event.blockKey, { imageUrl: event.imageUrl }); }
  /** La descripción sí es parte del borrador: marca cambios sin guardar. */
  onImageAlt(event: { blockKey: string; imageAlt: string }): void { this.updateBlock(event.blockKey, { imageAlt: event.imageAlt }); }
  onTooltipsChange(event: { blockKey: string; tooltips: KeyframeTooltip[] }): void { this.patchBlock(event.blockKey, { tooltips: event.tooltips }); }
  /** Aplica un cambio ya persistido por el backend (audio/tooltips) sin marcar el borrador como modificado. */
  private patchBlock(key: string, values: Partial<LessonBlock>): void {
    const apply = (list: LessonBlock[]) => list.map(block => block.blockKey === key ? { ...block, ...values } : block);
    this.plan.update(plan => plan ? { ...plan, blocks: apply(plan.blocks) } : plan);
    this.blocks.update(apply);
  }
  trackBlock(_: number, block: LessonBlock): string { return block.blockKey; }
  isPhaseValid(): boolean { return this.blocks().every((block, i, all) => PHASES.indexOf(block.phase) >= (i ? PHASES.indexOf(all[i - 1].phase) : 0)); }

  addBlock(type: LessonBlockType, phase: LessonPhase): void {
    const block: LessonBlock = { blockKey: crypto.randomUUID(), type, phase, active: type !== 'expression', required: false };
    if (type === 'expression') block.vocabularyRole = phase === 'later' ? 'revisit' : 'target';
    if (type === 'question') {
      block.questionId = null;
      block.contextBlockKey = [...this.blocks()].reverse().find(item => item.type === 'keyframe' && item.active)?.blockKey ?? null;
    }
    this.insertByPhase(block);
    this.changed();
  }

  /** Índice justo después del keyframe y de las preguntas que lo siguen (solo las suyas si `onlyOwn`). */
  private afterKeyframeGroup(keyframe: LessonBlock, onlyOwn: boolean): number {
    const list = this.blocks();
    let index = list.findIndex(item => item.blockKey === keyframe.blockKey) + 1;
    while (index < list.length && list[index].phase === keyframe.phase && list[index].type === 'question'
      && (!onlyOwn || list[index].contextBlockKey === keyframe.blockKey)) index++;
    return index;
  }
  private insertAt(index: number, block: LessonBlock): void {
    const list = [...this.blocks()];
    list.splice(index, 0, block);
    this.blocks.set(list);
    this.changed();
  }
  private focusSoon(selector: string): void { setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)?.focus(), 0); }

  /** «＋ Pregunta sobre esto»: pregunta ligada al keyframe, tras las que ya tenga, con el formulario de creación abierto. */
  addQuestionAfter(keyframe: LessonBlock): void {
    const block: LessonBlock = { blockKey: crypto.randomUUID(), type: 'question', phase: keyframe.phase, active: true, required: false, questionId: null, contextBlockKey: keyframe.blockKey };
    this.insertAt(this.afterKeyframeGroup(keyframe, true), block);
    this.newQuestionFor.set(block.blockKey);
  }
  /** «＋ Seguir la historia»: nuevo keyframe vacío tras este keyframe y sus preguntas. */
  addKeyframeAfter(keyframe: LessonBlock): void {
    const block: LessonBlock = { blockKey: crypto.randomUUID(), type: 'keyframe', phase: keyframe.phase, active: true, required: false, text: '' };
    this.insertAt(this.afterKeyframeGroup(keyframe, false), block);
    this.focusSoon('#kf-text-' + block.blockKey);
  }

  toggleNewQuestion(key: string): void { this.newQuestionFor.set(this.newQuestionFor() === key ? null : key); }
  onQuestionCreated(key: string, question: Question): void {
    this.questions.update(list => [...list, question]);
    this.updateBlock(key, { questionId: question.id });
    this.newQuestionFor.set(null);
  }
  toggleNewExpression(key: string): void { this.newExpressionFor.set(this.newExpressionFor() === key ? null : key); }
  private addVocabulary(word: Vocabulary): void { this.vocabulary.update(list => list.some(v => v.id === word.id) ? list : [...list, word]); }
  onExpressionCreated(key: string, word: Vocabulary): void {
    this.addVocabulary(word);
    this.updateBlock(key, { vocabularyId: word.id });
    this.newExpressionFor.set(null);
  }

  onKeyframeText(key: string, text: string): void {
    if (this.keyframeSelection()?.blockKey === key) this.keyframeSelection.set(null);
    this.updateBlock(key, { text });
  }
  onKeyframeSelect(event: Event, key: string): void {
    const el = event.target as HTMLTextAreaElement;
    const snippet = (el.value ?? '').slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim();
    if (snippet) this.keyframeSelection.set({ blockKey: key, snippet });
    else if (this.keyframeSelection()?.blockKey === key && document.activeElement === el) this.keyframeSelection.set(null);
  }
  markableSelection(key: string): string {
    const selection = this.keyframeSelection();
    return selection?.blockKey === key ? selection.snippet : '';
  }
  startMark(key: string, word: string): void { this.markTarget.set({ blockKey: key, word }); }
  /** Añade (activa, objetivo) la expresión marcada en «Antes», sin duplicar una ya presente. */
  onMarked(word: Vocabulary): void {
    this.addVocabulary(word);
    this.markTarget.set(null);
    this.keyframeSelection.set(null);
    const existing = this.blocks().find(b => b.type === 'expression' && b.phase === 'before' && b.vocabularyId === word.id);
    if (existing) {
      this.updateBlock(existing.blockKey, { active: true, vocabularyRole: 'target' });
    } else {
      this.insertByPhase({ blockKey: crypto.randomUUID(), type: 'expression', phase: 'before', active: true, required: false, vocabularyRole: 'target', vocabularyId: word.id });
      this.changed();
    }
    this.notice.set(`«${word.word}» añadida como expresión objetivo en Antes.`);
  }

  private insertByPhase(block: LessonBlock): void {
    const list = [...this.blocks()];
    const end = list.findIndex(item => PHASES.indexOf(item.phase) > PHASES.indexOf(block.phase));
    list.splice(end < 0 ? list.length : end, 0, block);
    this.blocks.set(list);
  }

  removeBlock(block: LessonBlock): void { this.blocks.set(this.blocks().filter(item => item.blockKey !== block.blockKey)); this.changed(); }
  toggleBlock(block: LessonBlock): void { this.updateBlock(block.blockKey, { active: !block.active }); }
  updateBlock(key: string, values: Partial<LessonBlock>): void {
    this.blocks.set(this.blocks().map(block => block.blockKey === key ? { ...block, ...values } : block));
    this.changed();
  }
  move(block: LessonBlock, offset: -1 | 1): void {
    if (this.reordering()) return;
    const from = this.blocks().findIndex(item => item.blockKey === block.blockKey), to = from + offset;
    if (to < 0 || to >= this.blocks().length || this.blocks()[to].phase !== block.phase) return;
    const list = [...this.blocks()]; [list[from], list[to]] = [list[to], list[from]];
    this.blocks.set(list); this.changed();
    const phasePosition = list.slice(0, to + 1).filter(item => item.phase === block.phase).length;
    this.persistOrder(list, block, phasePosition - 1);
  }
  onBlockDragStart(event: DragEvent, block: LessonBlock): void {
    if (this.exampleMode() || this.reordering()) { event.preventDefault(); return; }
    this.draggedBlockKey = block.blockKey;
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', block.blockKey); }
  }
  onBlockDragOver(event: DragEvent, target: LessonBlock): void {
    if (!this.draggedBlockKey || this.exampleMode() || target.phase !== this.blocks().find(block => block.blockKey === this.draggedBlockKey)?.phase) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
  onBlockDrop(event: DragEvent, target: LessonBlock): void {
    event.preventDefault();
    const draggedKey = this.draggedBlockKey || event.dataTransfer?.getData('text/plain');
    this.draggedBlockKey = null;
    if (!draggedKey || draggedKey === target.blockKey || this.exampleMode()) return;
    const list = [...this.blocks()];
    const from = list.findIndex(block => block.blockKey === draggedKey);
    const to = list.findIndex(block => block.blockKey === target.blockKey);
    if (from < 0 || to < 0 || list[from].phase !== list[to].phase) return;
    const [moved] = list.splice(from, 1);
    const insertionIndex = from < to ? to - 1 : to;
    list.splice(insertionIndex, 0, moved);
    this.blocks.set(list); this.changed();
    const finalIndex = list.findIndex(block => block.blockKey === moved.blockKey);
    const phasePosition = list.slice(0, finalIndex + 1).filter(block => block.phase === moved.phase).length;
    this.persistOrder(list, moved, phasePosition - 1);
  }
  onBlockDragEnd(): void { this.draggedBlockKey = null; }
  private async persistOrder(list: LessonBlock[], moved: LessonBlock, phasePosition: number): Promise<void> {
    if (this.reordering()) return;
    this.reordering.set(true);
    try {
      // New blocks must exist on the draft before the API can validate a full reorder list.
      if (this.dirty() && !(await this.save())) return;
      const plan = this.plan(); if (!plan) return;
      const updated = await firstValueFrom(this.api.reorder(this.story.id, plan.revision, list.map(item => item.blockKey)));
      this.plan.set(updated);
      this.blocks.set(updated.blocks.map(block => ({ ...block })));
      this.dirty.set(false);
      this.reorderAnnouncement.set(`${this.typeLabel(moved.type)} movido a la posición ${phasePosition + 1} de ${this.phaseLabel(moved.phase)}.`);
    } catch (error: any) {
      this.error.set(error?.error?.error || 'No se pudo guardar el nuevo orden.');
    } finally {
      this.reordering.set(false);
    }
  }
  private changed(): void { this.dirty.set(true); this.error.set(''); this.notice.set(''); }

  async save(): Promise<boolean> {
    const plan = this.plan(); if (!plan) return false;
    if (!this.isPhaseValid()) { this.error.set('Revisa el orden de las fases antes de guardar.'); return false; }
    this.saving.set(true); this.error.set('');
    try {
      const saved = await firstValueFrom(this.api.saveDraft(this.story.id, plan.revision, this.blocks()));
      this.plan.set(saved); this.blocks.set(saved.blocks.map(block => ({ ...block }))); this.dirty.set(false);
      this.notice.set('Borrador guardado.'); return true;
    } catch (error: any) {
      this.error.set(error?.error?.error || 'No se pudo guardar el borrador.'); return false;
    } finally { this.saving.set(false); }
  }

  async publish(): Promise<void> {
    const valid = this.validatePublish();
    if (valid) { this.error.set(valid); return; }
    if (this.dirty() && !(await this.save())) return;
    const plan = this.plan(); if (!plan) return;
    this.publishing.set(true); this.error.set('');
    this.api.publish(this.story.id, plan.revision).subscribe({
      next: published => { this.plan.set(published); this.blocks.set(published.blocks); this.dirty.set(false); this.notice.set(`Revisión ${published.revision} publicada.`); this.publishing.set(false); this.storyTextPublished.emit(storyTextFromBlocks(published.blocks)); },
      error: error => { this.error.set(error?.error?.error || 'No se pudo publicar.'); this.publishing.set(false); }
    });
  }
  private validatePublish(): string {
    const active = this.blocks().filter(block => block.active);
    if (!this.isPhaseValid()) return 'Las fases deben aparecer en este orden: Antes, Durante, Después y Más adelante.';
    if (!active.some(block => block.type === 'keyframe' && block.text?.trim())) return 'Añade al menos un keyframe activo con texto.';
    if (active.filter(block => block.type === 'full_story').length !== 1) return 'Debe haber exactamente un bloque de lectura completa activo.';
    for (const block of active) {
      if (block.type === 'question' && (!block.questionId || !block.contextBlockKey)) return 'Cada pregunta activa necesita una pregunta y el keyframe que le da contexto.';
      if (block.type === 'question' && !this.keyframesBefore(block).some(frame => frame.blockKey === block.contextBlockKey)) return 'Cada pregunta debe ir después de su keyframe de contexto activo.';
      if (block.type === 'expression' && !block.vocabularyId) return 'Selecciona una expresión para cada bloque de expresiones activo.';
      if (block.type === 'expression' && block.phase === 'later' && !block.revisitStoryId) return 'Elige la historia futura para cada expresión de Más adelante.';
    }
    return '';
  }

  openTutorial(): void { this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : this.returnFocus; this.showTutorial.set(true); setTimeout(() => ((this.host.nativeElement as HTMLElement).querySelector('.tutorial-dialog button') as HTMLButtonElement | null)?.focus(), 0); }
  closeTutorial(): void { this.showTutorial.set(false); localStorage.setItem(this.seenKey, 'seen'); setTimeout(() => this.returnFocus?.focus(), 0); }
  useTemplate(): void {
    this.exampleMode.set(false);
    this.blocks.set([
      { blockKey: crypto.randomUUID(), type: 'expression', phase: 'before', active: false, required: false, vocabularyRole: 'target' },
      { blockKey: crypto.randomUUID(), type: 'keyframe', phase: 'during', active: true, required: false, text: this.story.text },
      { blockKey: crypto.randomUUID(), type: 'full_story', phase: 'after', active: true, required: false },
      { blockKey: crypto.randomUUID(), type: 'expression', phase: 'later', active: false, required: false, vocabularyRole: 'revisit' }
    ]);
    this.changed(); this.closeTutorial();
  }
  showExample(): void {
    this.blocksBeforeExample = this.blocks().map(block => ({ ...block }));
    this.exampleMode.set(true);
    this.blocks.set([
      { blockKey: crypto.randomUUID(), type: 'expression', phase: 'before', active: true, required: false, vocabularyRole: 'target', vocabularySnapshot: { word: 'me llamo', translation: 'my name is' } },
      { blockKey: crypto.randomUUID(), type: 'expression', phase: 'before', active: true, required: false, vocabularyRole: 'target', vocabularySnapshot: { word: 'mucho gusto', translation: 'nice to meet you' } },
      { blockKey: crypto.randomUUID(), type: 'keyframe', phase: 'during', active: true, required: false, text: 'María llega a la fiesta y busca a su amiga.', },
      { blockKey: crypto.randomUUID(), type: 'question', phase: 'during', active: true, required: false, text: '¿Dónde está María?' },
      { blockKey: crypto.randomUUID(), type: 'keyframe', phase: 'during', active: true, required: false, text: 'María conoce a Luis. Él dice: «Me llamo Luis».', },
      { blockKey: crypto.randomUUID(), type: 'question', phase: 'during', active: true, required: false, text: '¿Cómo se llama el amigo de María?' },
      { blockKey: crypto.randomUUID(), type: 'keyframe', phase: 'during', active: true, required: false, text: 'María saluda a todos y disfruta la fiesta.' },
      { blockKey: crypto.randomUUID(), type: 'full_story', phase: 'after', active: true, required: false },
      { blockKey: crypto.randomUUID(), type: 'matching', phase: 'after', active: false, required: false },
      { blockKey: crypto.randomUUID(), type: 'expression', phase: 'later', active: true, required: false, vocabularyRole: 'revisit', vocabularySnapshot: { word: 'me llamo', translation: 'my name is' } }
    ]);
    this.showTutorial.set(false); this.sideTab.set('preview');
  }
  exitExample(): void { this.blocks.set(this.blocksBeforeExample); this.blocksBeforeExample = []; this.exampleMode.set(false); this.sideTab.set('story'); }
  close(): void { this.closed.emit(); this.restoreFocus(); }
  private restoreFocus(): void { if (this.returnFocus?.isConnected) this.returnFocus.focus(); }
  typeLabel(type: LessonBlockType): string { return ({ expression: 'Expresión', keyframe: 'Keyframe', question: 'Pregunta', full_story: 'Lectura y audio completos', flashcards: 'Tarjetas', matching: 'Emparejar', listen_repeat: 'Repetición oral' })[type]; }
  currentStoryTitle(storyId: number | null | undefined): string { return this.stories().find(story => story.id === storyId)?.title || 'Selecciona una historia'; }
  availableRevisitStories(): Story[] { return this.stories().filter(story => story.id !== this.story.id); }
  contextText(block: LessonBlock): string { return this.blocks().find(item => item.blockKey === block.contextBlockKey)?.text || 'Keyframe sin texto'; }
  toggleDemoMove(event: Event): void { (event.currentTarget as HTMLElement).closest('.move-demo')?.querySelector('.demo-track')?.classList.toggle('demo-moved'); }
}
