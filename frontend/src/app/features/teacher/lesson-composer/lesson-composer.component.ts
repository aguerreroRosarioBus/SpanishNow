import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LessonBlock, LessonBlockType, LessonPhase, LessonPlan, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { Story, Question, Vocabulary, Unit } from '../../../core/models/course.model';

const TUTORIAL_VERSION = '1';
const PHASES: LessonPhase[] = ['before', 'during', 'after', 'later'];
const PHASE_LABEL: Record<LessonPhase, string> = { before: 'Antes', during: 'Durante', after: 'Después', later: 'Más adelante' };

@Component({
  selector: 'app-lesson-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lesson-composer.component.html',
  styleUrl: './lesson-composer.component.scss'
})
export class LessonComposerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) story!: Story;
  @Input({ required: true }) unit!: Unit;
  @Input({ required: true }) courseUnits: Unit[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() manageQuestions = new EventEmitter<void>();
  @Output() manageVocabulary = new EventEmitter<void>();
  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') closeButton?: ElementRef<HTMLButtonElement>;

  private api = inject(LessonPlanService);
  private auth = inject(AuthService);
  private questionsApi = inject(QuestionService);
  private vocabApi = inject(VocabularyService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
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
  preview = signal(false);
  reordering = signal(false);
  reorderAnnouncement = signal('');
  private draggedBlockKey: string | null = null;
  private returnFocus: HTMLElement | null = null;
  private seenKey = '';
  private blocksBeforeExample: LessonBlock[] = [];
  previewQuestionState = signal<Record<string, 'question' | 'wrong' | 'correct' | 'continued'>>({});

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

  ngOnDestroy(): void { this.restoreFocus(); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.showTutorial()) { event.preventDefault(); this.closeTutorial(); }
      else if (this.preview()) { this.preview.set(false); }
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
  previewPhaseBlocks(phase: LessonPhase): LessonBlock[] { return this.phaseBlocks(phase).filter(block => block.active); }
  keyframesBefore(block: LessonBlock): LessonBlock[] {
    const index = this.blocks().findIndex(item => item.blockKey === block.blockKey);
    return this.blocks().slice(0, index).filter(item => item.type === 'keyframe' && item.active);
  }
  trackBlock(_: number, block: LessonBlock): string { return block.blockKey; }
  isPhaseValid(): boolean { return this.blocks().every((block, i, all) => PHASES.indexOf(block.phase) >= (i ? PHASES.indexOf(all[i - 1].phase) : 0)); }

  addBlock(type: LessonBlockType, phase: LessonPhase): void {
    const block: LessonBlock = { blockKey: crypto.randomUUID(), type, phase, active: type !== 'expression', required: false };
    if (type === 'expression') block.vocabularyRole = phase === 'later' ? 'revisit' : 'target';
    if (type === 'question') block.questionId = null;
    this.insertByPhase(block);
    this.changed();
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
      next: published => { this.plan.set(published); this.blocks.set(published.blocks); this.dirty.set(false); this.notice.set(`Revisión ${published.revision} publicada.`); this.publishing.set(false); },
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
    this.showTutorial.set(false); this.preview.set(true);
  }
  exitExample(): void { this.blocks.set(this.blocksBeforeExample); this.blocksBeforeExample = []; this.exampleMode.set(false); this.preview.set(false); }
  simulateWrong(block: LessonBlock): void { this.previewQuestionState.update(states => ({ ...states, [block.blockKey]: 'wrong' })); }
  retryQuestion(block: LessonBlock): void { this.previewQuestionState.update(states => ({ ...states, [block.blockKey]: 'correct' })); }
  continueQuestion(block: LessonBlock): void { this.previewQuestionState.update(states => ({ ...states, [block.blockKey]: 'continued' })); }
  questionState(block: LessonBlock): string { return this.previewQuestionState()[block.blockKey] || 'question'; }
  questionText(block: LessonBlock): string { return block.questionSnapshot?.questionText || this.questions().find(question => question.id === block.questionId)?.questionText || block.text || 'Pregunta sin contenido'; }
  close(): void { this.closed.emit(); this.restoreFocus(); }
  private restoreFocus(): void { if (this.returnFocus?.isConnected) this.returnFocus.focus(); }
  previewLabel(block: LessonBlock): string { return block.text || block.vocabularySnapshot?.word || block.questionSnapshot?.questionText || this.typeLabel(block.type); }
  typeLabel(type: LessonBlockType): string { return ({ expression: 'Expresión', keyframe: 'Keyframe', question: 'Pregunta', full_story: 'Lectura y audio completos', flashcards: 'Tarjetas', matching: 'Emparejar', listen_repeat: 'Repetición oral' })[type]; }
  currentStoryTitle(storyId: number | null | undefined): string { return this.stories().find(story => story.id === storyId)?.title || 'Selecciona una historia'; }
  availableRevisitStories(): Story[] { return this.stories().filter(story => story.id !== this.story.id); }
  contextText(block: LessonBlock): string { return this.blocks().find(item => item.blockKey === block.contextBlockKey)?.text || 'Keyframe sin texto'; }
  narrativeText(): string { return this.previewPhaseBlocks('during').filter(block => block.type === 'keyframe').map(block => block.text || '').join(' '); }
  toggleDemoMove(event: Event): void { (event.currentTarget as HTMLElement).closest('.move-demo')?.querySelector('.demo-track')?.classList.toggle('demo-moved'); }
}
