import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseService } from '../../../core/services/course.service';
import { UnitService } from '../../../core/services/unit.service';
import { StoryService } from '../../../core/services/story.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { Course, Unit, Story, Question, Vocabulary, RepetitionActivity } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

@Component({
  selector: 'app-course-manage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavbarComponent],
  templateUrl: './course-manage.html',
  styleUrl: './course-manage.scss',
})
export class CourseManageComponent implements OnInit {
  private courseService = inject(CourseService);
  private unitService = inject(UnitService);
  private storyService = inject(StoryService);
  private questionService = inject(QuestionService);
  private vocabularyService = inject(VocabularyService);
  private repetitionActivityService = inject(RepetitionActivityService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  courseId = signal<number>(0);
  course = signal<Course | null>(null);
  units = signal<Unit[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Modal states
  showCourseEditModal = signal<boolean>(false);
  showUnitModal = signal<boolean>(false);
  showUnitEditModal = signal<boolean>(false);
  showStoryModal = signal<boolean>(false);
  showStoryEditModal = signal<boolean>(false);
  showQuestionModal = signal<boolean>(false);
  showVocabularyModal = signal<boolean>(false);
  showRepetitionModal = signal<boolean>(false);
  selectedUnitId = signal<number | null>(null);
  selectedUnit = signal<Unit | null>(null);
  selectedStory = signal<Story | null>(null);
  isEditMode = signal<boolean>(false);
  storyQuestions = signal<Question[]>([]);
  unitVocabulary = signal<Vocabulary[]>([]);
  storyRepetitions = signal<RepetitionActivity[]>([]);
  isSubmittingQuestion = signal<boolean>(false);
  isSubmittingVocabulary = signal<boolean>(false);
  isSubmittingRepetition = signal<boolean>(false);

  // Forms
  courseForm: FormGroup;
  unitForm: FormGroup;
  storyForm: FormGroup;
  questionForm: FormGroup;
  vocabularyForm: FormGroup;
  repetitionForm: FormGroup;

  // File uploads
  audioSlowFile: File | null = null;
  audioNormalFile: File | null = null;
  vocabAudioFile: File | null = null;
  vocabImageFile: File | null = null;
  repetitionAudioFile: File | null = null;

  constructor() {
    // Course form
    this.courseForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['']
    });

    // Unit form
    this.unitForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]]
    });

    // Story form
    this.storyForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      text: ['', [Validators.required, Validators.minLength(20)]]
    });

    // Question form
    this.questionForm = this.fb.group({
      questionText: ['', [Validators.required, Validators.minLength(5)]],
      answerType: ['yes_no', Validators.required],
      options: this.fb.array([]),
      correctAnswer: ['', Validators.required]
    });

    // Vocabulary form
    this.vocabularyForm = this.fb.group({
      word: ['', [Validators.required, Validators.minLength(1)]],
      translation: ['', [Validators.required, Validators.minLength(1)]],
      example: [''],
      partOfSpeech: ['']
    });

    // Repetition activity form
    this.repetitionForm = this.fb.group({
      phrase: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  get questionOptions(): FormArray {
    return this.questionForm.get('options') as FormArray;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.courseId.set(+id);
      this.loadCourseDetails();
    } else {
      this.router.navigate(['/teacher/dashboard']);
    }
  }

  loadCourseDetails(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.courseService.getCourse(this.courseId()).subscribe({
      next: (course) => {
        this.course.set(course);
        this.units.set(course.units || []);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading course:', error);
        this.errorMessage.set('Error al cargar el curso');
        this.isLoading.set(false);
      }
    });
  }

  // ===== COURSE MANAGEMENT =====

  openEditCourseModal(): void {
    const currentCourse = this.course();
    if (currentCourse) {
      this.courseForm.patchValue({
        title: currentCourse.title,
        description: currentCourse.description || ''
      });
      this.showCourseEditModal.set(true);
    }
  }

  closeEditCourseModal(): void {
    this.showCourseEditModal.set(false);
    this.courseForm.reset();
  }

  updateCourse(): void {
    if (this.courseForm.invalid) return;

    const data = {
      title: this.courseForm.get('title')?.value,
      description: this.courseForm.get('description')?.value
    };

    this.courseService.updateCourse(this.courseId(), data).subscribe({
      next: (updatedCourse) => {
        this.course.set(updatedCourse);
        this.closeEditCourseModal();
        alert('Curso actualizado exitosamente');
      },
      error: (error) => {
        console.error('Error updating course:', error);
        alert('Error al actualizar el curso');
      }
    });
  }

  // ===== UNIT MANAGEMENT =====

  openUnitModal(): void {
    this.isEditMode.set(false);
    this.unitForm.reset();
    this.showUnitModal.set(true);
  }

  openEditUnitModal(unit: Unit): void {
    this.isEditMode.set(true);
    this.selectedUnit.set(unit);
    this.unitForm.patchValue({
      title: unit.title,
      description: unit.description
    });
    this.showUnitEditModal.set(true);
  }

  closeEditUnitModal(): void {
    this.showUnitEditModal.set(false);
    this.selectedUnit.set(null);
    this.isEditMode.set(false);
    this.unitForm.reset();
  }

  closeUnitModal(): void {
    this.showUnitModal.set(false);
    this.unitForm.reset();
  }

  createUnit(): void {
    if (this.unitForm.invalid) return;

    const data = {
      courseId: this.courseId(),
      title: this.unitForm.get('title')?.value,
      description: this.unitForm.get('description')?.value
    };

    this.unitService.createUnit(data).subscribe({
      next: (newUnit) => {
        this.units.update(current => [...current, newUnit]);
        this.closeUnitModal();
      },
      error: (error) => {
        console.error('Error creating unit:', error);
        alert('Error al crear la unidad');
      }
    });
  }

  updateUnit(): void {
    if (this.unitForm.invalid) return;

    const unit = this.selectedUnit();
    if (!unit) return;

    const data = {
      title: this.unitForm.get('title')?.value,
      description: this.unitForm.get('description')?.value
    };

    this.unitService.updateUnit(unit.id, data).subscribe({
      next: (updatedUnit) => {
        this.units.update(current =>
          current.map(u => u.id === updatedUnit.id ? { ...u, ...updatedUnit } : u)
        );
        this.closeEditUnitModal();
        alert('Unidad actualizada exitosamente');
      },
      error: (error) => {
        console.error('Error updating unit:', error);
        alert('Error al actualizar la unidad');
      }
    });
  }

  deleteUnit(unitId: number): void {
    if (!confirm('¿Estás seguro de eliminar esta unidad? Se eliminarán todas sus historias.')) {
      return;
    }

    this.unitService.deleteUnit(unitId).subscribe({
      next: () => {
        this.units.update(current => current.filter(u => u.id !== unitId));
      },
      error: (error) => {
        console.error('Error deleting unit:', error);
        alert('Error al eliminar la unidad');
      }
    });
  }

  // ===== STORY MANAGEMENT =====

  openStoryModal(unitId: number): void {
    this.isEditMode.set(false);
    this.selectedUnitId.set(unitId);
    this.storyForm.reset();
    this.audioSlowFile = null;
    this.audioNormalFile = null;
    this.showStoryModal.set(true);
  }

  openEditStoryModal(story: Story, unitId: number): void {
    this.isEditMode.set(true);
    this.selectedStory.set(story);
    this.selectedUnitId.set(unitId);
    this.storyForm.patchValue({
      title: story.title,
      text: story.text
    });
    this.audioSlowFile = null;
    this.audioNormalFile = null;
    this.showStoryEditModal.set(true);
  }

  closeStoryModal(): void {
    this.showStoryModal.set(false);
    this.storyForm.reset();
    this.selectedUnitId.set(null);
    this.audioSlowFile = null;
    this.audioNormalFile = null;
  }

  closeEditStoryModal(): void {
    this.showStoryEditModal.set(false);
    this.storyForm.reset();
    this.selectedStory.set(null);
    this.selectedUnitId.set(null);
    this.audioSlowFile = null;
    this.audioNormalFile = null;
    this.isEditMode.set(false);
  }

  onAudioSlowSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      // Validar tipo
      if (!file.type.startsWith('audio/')) {
        alert('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      // Validar tamaño (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        alert('El archivo es muy grande. Máximo 50MB');
        input.value = '';
        return;
      }
      this.audioSlowFile = file;
    }
  }

  onAudioNormalSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      // Validar tipo
      if (!file.type.startsWith('audio/')) {
        alert('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      // Validar tamaño (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        alert('El archivo es muy grande. Máximo 50MB');
        input.value = '';
        return;
      }
      this.audioNormalFile = file;
    }
  }

  createStory(): void {
    if (this.storyForm.invalid || !this.selectedUnitId()) return;

    const formData = new FormData();
    formData.append('unitId', this.selectedUnitId()!.toString());
    formData.append('title', this.storyForm.get('title')?.value);
    formData.append('text', this.storyForm.get('text')?.value);

    if (this.audioSlowFile) {
      formData.append('audioSlow', this.audioSlowFile);
    }
    if (this.audioNormalFile) {
      formData.append('audioNormal', this.audioNormalFile);
    }

    this.storyService.createStory(formData).subscribe({
      next: (newStory) => {
        // Agregar la historia a la unidad correspondiente
        this.units.update(current => {
          return current.map(unit => {
            if (unit.id === this.selectedUnitId()) {
              return {
                ...unit,
                stories: [...(unit.stories || []), newStory]
              };
            }
            return unit;
          });
        });
        this.closeStoryModal();
      },
      error: (error) => {
        console.error('Error creating story:', error);
        alert('Error al crear la historia');
      }
    });
  }

  updateStory(): void {
    if (this.storyForm.invalid) return;

    const story = this.selectedStory();
    if (!story) return;

    const formData = new FormData();
    formData.append('title', this.storyForm.get('title')?.value);
    formData.append('text', this.storyForm.get('text')?.value);

    if (this.audioSlowFile) {
      formData.append('audioSlow', this.audioSlowFile);
    }
    if (this.audioNormalFile) {
      formData.append('audioNormal', this.audioNormalFile);
    }

    this.storyService.updateStory(story.id, formData).subscribe({
      next: (updatedStory) => {
        this.units.update(current => {
          return current.map(unit => {
            if (unit.id === this.selectedUnitId()) {
              return {
                ...unit,
                stories: (unit.stories || []).map(s =>
                  s.id === updatedStory.id ? { ...s, ...updatedStory } : s
                )
              };
            }
            return unit;
          });
        });
        this.closeEditStoryModal();
        alert('Historia actualizada exitosamente');
      },
      error: (error) => {
        console.error('Error updating story:', error);
        alert('Error al actualizar la historia');
      }
    });
  }

  deleteStory(unitId: number, storyId: number): void {
    if (!confirm('¿Estás seguro de eliminar esta historia?')) {
      return;
    }

    this.storyService.deleteStory(storyId).subscribe({
      next: () => {
        this.units.update(current => {
          return current.map(unit => {
            if (unit.id === unitId) {
              return {
                ...unit,
                stories: (unit.stories || []).filter(s => s.id !== storyId)
              };
            }
            return unit;
          });
        });
      },
      error: (error) => {
        console.error('Error deleting story:', error);
        alert('Error al eliminar la historia');
      }
    });
  }

  // ===== QUESTION MANAGEMENT =====

  openQuestionModal(story: Story): void {
    this.selectedStory.set(story);
    this.showQuestionModal.set(true);
    this.loadQuestionsForStory(story.id);
    this.resetQuestionForm();
  }

  closeQuestionModal(): void {
    this.showQuestionModal.set(false);
    this.selectedStory.set(null);
    this.storyQuestions.set([]);
    this.resetQuestionForm();
  }

  resetQuestionForm(): void {
    this.questionForm.reset({
      questionText: '',
      answerType: 'yes_no',
      correctAnswer: ''
    });
    this.questionOptions.clear();
  }

  loadQuestionsForStory(storyId: number): void {
    this.questionService.getQuestionsByStory(storyId).subscribe({
      next: (questions) => {
        this.storyQuestions.set(questions);
        // Update the story in units with questions
        this.units.update(current => {
          return current.map(unit => ({
            ...unit,
            stories: (unit.stories || []).map(s =>
              s.id === storyId ? { ...s, questions } : s
            )
          }));
        });
      },
      error: (error) => {
        console.error('Error loading questions:', error);
        alert('Error al cargar las preguntas');
      }
    });
  }

  addOption(): void {
    this.questionOptions.push(new FormControl('', Validators.required));
  }

  removeOption(index: number): void {
    if (this.questionOptions.length > 2) {
      this.questionOptions.removeAt(index);
    }
  }

  createQuestion(): void {
    if (this.questionForm.invalid || !this.selectedStory()) return;

    this.isSubmittingQuestion.set(true);

    const answerType = this.questionForm.get('answerType')?.value;
    const data: any = {
      storyId: this.selectedStory()!.id,
      questionText: this.questionForm.get('questionText')?.value,
      answerType: answerType,
      correctAnswer: this.questionForm.get('correctAnswer')?.value
    };

    // Add options for multiple choice
    if (answerType === 'choice') {
      data.options = this.questionOptions.value.filter((opt: string) => opt.trim() !== '');

      if (data.options.length < 2) {
        alert('Debes agregar al menos 2 opciones');
        this.isSubmittingQuestion.set(false);
        return;
      }
    }

    this.questionService.createQuestion(data).subscribe({
      next: (newQuestion) => {
        this.storyQuestions.update(current => [...current, newQuestion]);
        this.resetQuestionForm();
        this.isSubmittingQuestion.set(false);

        // Update the story in units
        this.units.update(current => {
          return current.map(unit => ({
            ...unit,
            stories: (unit.stories || []).map(s =>
              s.id === this.selectedStory()!.id
                ? { ...s, questions: [...(s.questions || []), newQuestion] }
                : s
            )
          }));
        });
      },
      error: (error) => {
        console.error('Error creating question:', error);
        alert('Error al crear la pregunta');
        this.isSubmittingQuestion.set(false);
      }
    });
  }

  deleteQuestion(questionId: number): void {
    if (!confirm('¿Estás seguro de eliminar esta pregunta?')) {
      return;
    }

    this.questionService.deleteQuestion(questionId).subscribe({
      next: () => {
        this.storyQuestions.update(current => current.filter(q => q.id !== questionId));

        // Update the story in units
        this.units.update(current => {
          return current.map(unit => ({
            ...unit,
            stories: (unit.stories || []).map(s =>
              s.id === this.selectedStory()!.id
                ? { ...s, questions: (s.questions || []).filter(q => q.id !== questionId) }
                : s
            )
          }));
        });
      },
      error: (error) => {
        console.error('Error deleting question:', error);
        alert('Error al eliminar la pregunta');
      }
    });
  }

  // ===== VOCABULARY MANAGEMENT =====

  openVocabularyModal(unit: Unit): void {
    this.selectedUnit.set(unit);
    this.showVocabularyModal.set(true);
    this.loadVocabularyForUnit(unit.id);
    this.resetVocabularyForm();
  }

  closeVocabularyModal(): void {
    this.showVocabularyModal.set(false);
    this.vocabularyForm.reset();
    this.vocabAudioFile = null;
    this.vocabImageFile = null;
  }

  resetVocabularyForm(): void {
    this.vocabularyForm.reset();
    this.vocabAudioFile = null;
    this.vocabImageFile = null;
  }

  loadVocabularyForUnit(unitId: number): void {
    this.vocabularyService.getVocabularyByUnit(unitId).subscribe({
      next: (vocab) => {
        this.unitVocabulary.set(vocab);
      },
      error: (error) => {
        console.error('Error loading vocabulary:', error);
      }
    });
  }

  onVocabAudioSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.vocabAudioFile = file;
    }
  }

  onVocabImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.vocabImageFile = file;
    }
  }

  createVocabulary(): void {
    if (this.vocabularyForm.invalid) return;

    this.isSubmittingVocabulary.set(true);
    const unit = this.selectedUnit();
    if (!unit) return;

    const formData = new FormData();
    formData.append('unitId', unit.id.toString());
    formData.append('word', this.vocabularyForm.get('word')?.value);
    formData.append('translation', this.vocabularyForm.get('translation')?.value);

    const example = this.vocabularyForm.get('example')?.value;
    if (example) formData.append('example', example);

    const partOfSpeech = this.vocabularyForm.get('partOfSpeech')?.value;
    if (partOfSpeech) formData.append('partOfSpeech', partOfSpeech);

    if (this.vocabAudioFile) {
      formData.append('audio', this.vocabAudioFile);
    }

    if (this.vocabImageFile) {
      formData.append('image', this.vocabImageFile);
    }

    this.vocabularyService.createVocabulary(formData).subscribe({
      next: (newVocab) => {
        this.unitVocabulary.update(current => [...current, newVocab]);
        this.resetVocabularyForm();
        this.isSubmittingVocabulary.set(false);
        alert('Vocabulario creado exitosamente');
      },
      error: (error) => {
        console.error('Error creating vocabulary:', error);
        alert('Error al crear vocabulario');
        this.isSubmittingVocabulary.set(false);
      }
    });
  }

  deleteVocabulary(id: number): void {
    if (!confirm('¿Eliminar este vocabulario?')) return;

    this.vocabularyService.deleteVocabulary(id).subscribe({
      next: () => {
        this.unitVocabulary.update(current => current.filter(v => v.id !== id));
      },
      error: (error) => {
        console.error('Error deleting vocabulary:', error);
        alert('Error al eliminar vocabulario');
      }
    });
  }

  // ===== REPETITION ACTIVITY MANAGEMENT =====

  openRepetitionModal(story: Story): void {
    this.selectedStory.set(story);
    this.showRepetitionModal.set(true);
    this.loadRepetitionsForStory(story.id);
    this.resetRepetitionForm();
  }

  closeRepetitionModal(): void {
    this.showRepetitionModal.set(false);
    this.repetitionForm.reset();
    this.repetitionAudioFile = null;
  }

  resetRepetitionForm(): void {
    this.repetitionForm.reset();
    this.repetitionAudioFile = null;
  }

  loadRepetitionsForStory(storyId: number): void {
    this.repetitionActivityService.getActivitiesByStory(storyId).subscribe({
      next: (activities: RepetitionActivity[]) => {
        this.storyRepetitions.set(activities);
      },
      error: (error: any) => {
        console.error('Error loading repetition activities:', error);
      }
    });
  }

  onRepetitionAudioSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.repetitionAudioFile = file;
    }
  }

  createRepetition(): void {
    if (this.repetitionForm.invalid) return;

    this.isSubmittingRepetition.set(true);
    const story = this.selectedStory();
    if (!story) return;

    const formData = new FormData();
    formData.append('storyId', story.id.toString());
    formData.append('phrase', this.repetitionForm.get('phrase')?.value);

    if (this.repetitionAudioFile) {
      formData.append('audio', this.repetitionAudioFile);
    }

    this.repetitionActivityService.createActivity(formData).subscribe({
      next: (newActivity: RepetitionActivity) => {
        this.storyRepetitions.update(current => [...current, newActivity]);
        this.resetRepetitionForm();
        this.isSubmittingRepetition.set(false);
        alert('Actividad de repetición creada exitosamente');
      },
      error: (error: any) => {
        console.error('Error creating repetition activity:', error);
        alert('Error al crear actividad de repetición');
        this.isSubmittingRepetition.set(false);
      }
    });
  }

  deleteRepetition(id: number): void {
    if (!confirm('¿Eliminar esta actividad de repetición?')) return;

    this.repetitionActivityService.deleteActivity(id).subscribe({
      next: () => {
        this.storyRepetitions.update(current => current.filter(r => r.id !== id));
      },
      error: (error: any) => {
        console.error('Error deleting repetition activity:', error);
        alert('Error al eliminar actividad de repetición');
      }
    });
  }

  // ===== DRAG & DROP FUNCTIONALITY =====

  // Drag & Drop state
  draggedUnit: Unit | null = null;
  draggedStory: { story: Story; unitId: number } | null = null;
  draggedRepetition: RepetitionActivity | null = null;

  // Unit drag & drop
  onUnitDragStart(event: DragEvent, unit: Unit): void {
    this.draggedUnit = unit;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onUnitDrop(event: DragEvent, targetUnit: Unit): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedUnit || this.draggedUnit.id === targetUnit.id) {
      this.draggedUnit = null;
      return;
    }

    const units = [...this.units()];
    const draggedIndex = units.findIndex(u => u.id === this.draggedUnit!.id);
    const targetIndex = units.findIndex(u => u.id === targetUnit.id);

    // Remove dragged unit and insert at target position
    const [removed] = units.splice(draggedIndex, 1);
    units.splice(targetIndex, 0, removed);

    // Update order values
    units.forEach((u, index) => {
      u.order = index;
    });

    this.units.set(units);

    // Save new order to backend
    this.saveUnitsOrder(units);

    this.draggedUnit = null;
  }

  saveUnitsOrder(units: Unit[]): void {
    // Update each unit's order in the backend
    const updatePromises = units.map(unit =>
      this.unitService.updateUnit(unit.id, { order: unit.order }).toPromise()
    );

    Promise.all(updatePromises)
      .then(() => {
        console.log('Units reordered successfully');
      })
      .catch(error => {
        console.error('Error reordering units:', error);
        alert('Error al reordenar unidades');
        this.loadCourseDetails(); // Reload to reset order
      });
  }

  // Story drag & drop
  onStoryDragStart(event: DragEvent, story: Story, unitId: number): void {
    this.draggedStory = { story, unitId };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onStoryDrop(event: DragEvent, targetStory: Story, targetUnitId: number): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedStory || this.draggedStory.story.id === targetStory.id) {
      this.draggedStory = null;
      return;
    }

    // Only allow reordering within same unit
    if (this.draggedStory.unitId !== targetUnitId) {
      alert('Solo puedes reordenar historias dentro de la misma unidad');
      this.draggedStory = null;
      return;
    }

    const units = [...this.units()];
    const unitIndex = units.findIndex(u => u.id === targetUnitId);
    const unit = units[unitIndex];

    if (!unit || !unit.stories) {
      this.draggedStory = null;
      return;
    }

    const stories = [...unit.stories];
    const draggedIndex = stories.findIndex(s => s.id === this.draggedStory!.story.id);
    const targetIndex = stories.findIndex(s => s.id === targetStory.id);

    // Remove dragged story and insert at target position
    const [removed] = stories.splice(draggedIndex, 1);
    stories.splice(targetIndex, 0, removed);

    // Update order values
    stories.forEach((s, index) => {
      s.order = index;
    });

    unit.stories = stories;
    this.units.set(units);

    // Save new order to backend
    this.saveStoriesOrder(stories);

    this.draggedStory = null;
  }

  saveStoriesOrder(stories: Story[]): void {
    // Update each story's order in the backend
    const updatePromises = stories.map(story =>
      this.storyService.updateStory(story.id, { order: story.order }).toPromise()
    );

    Promise.all(updatePromises)
      .then(() => {
        console.log('Stories reordered successfully');
      })
      .catch(error => {
        console.error('Error reordering stories:', error);
        alert('Error al reordenar historias');
        this.loadCourseDetails(); // Reload to reset order
      });
  }

  // Repetition Activity drag & drop
  onRepetitionDragStart(event: DragEvent, activity: RepetitionActivity): void {
    this.draggedRepetition = activity;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onRepetitionDrop(event: DragEvent, targetActivity: RepetitionActivity): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedRepetition || this.draggedRepetition.id === targetActivity.id) {
      this.draggedRepetition = null;
      return;
    }

    const repetitions = [...this.storyRepetitions()];
    const draggedIndex = repetitions.findIndex(r => r.id === this.draggedRepetition!.id);
    const targetIndex = repetitions.findIndex(r => r.id === targetActivity.id);

    // Remove dragged activity and insert at target position
    const [removed] = repetitions.splice(draggedIndex, 1);
    repetitions.splice(targetIndex, 0, removed);

    // Update order values
    repetitions.forEach((r, index) => {
      r.order = index;
    });

    this.storyRepetitions.set(repetitions);

    // Save new order to backend
    this.saveRepetitionsOrder(repetitions);

    this.draggedRepetition = null;
  }

  saveRepetitionsOrder(repetitions: RepetitionActivity[]): void {
    // Update each repetition activity's order in the backend
    const updatePromises = repetitions.map(activity =>
      this.repetitionActivityService.updateActivity(activity.id, { order: activity.order }).toPromise()
    );

    Promise.all(updatePromises)
      .then(() => {
        console.log('Repetition activities reordered successfully');
      })
      .catch(error => {
        console.error('Error reordering repetition activities:', error);
        alert('Error al reordenar actividades');
        this.loadRepetitionsForStory(this.selectedStory()!.id); // Reload to reset order
      });
  }

  goBack(): void {
    this.router.navigate(['/teacher/dashboard']);
  }
}
