import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, FormControl, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CourseService } from '../../../core/services/course.service';
import { UnitService } from '../../../core/services/unit.service';
import { StoryService } from '../../../core/services/story.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { RepetitionActivityService } from '../../../core/services/repetition-activity.service';
import { ActivityConfigService } from '../../../core/services/activity-config.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Unit, Story, Question, Vocabulary, RepetitionActivity, ActivityConfig } from '../../../core/models/course.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-course-manage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ConfirmDialogComponent],
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
  private activityConfigService = inject(ActivityConfigService);
  private toastService = inject(ToastService);
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
  showActivityConfigModal = signal<boolean>(false);

  // Confirm dialog states
  showConfirmDialog = signal<boolean>(false);
  confirmDialogData = signal<{
    title: string;
    message: string;
    confirmText: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);

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
  isEditingQuestion = signal<boolean>(false);
  editingQuestionId = signal<number | null>(null);

  // Activity Config states
  selectedUnitForActivity = signal<Unit | null>(null);
  activityConfigs = signal<ActivityConfig[]>([]);
  previewItems = signal<Array<{ type: string; title: string; order: number; icon: string; id?: number; requiredStories?: number[]; activityType?: string }>>([]);
  draggedPreviewItem: { type: string; id?: number; activityType?: string } | null = null;

  // Accordion state - track which units are expanded
  expandedUnits = signal<Set<number>>(new Set());

  // Forms
  courseForm: FormGroup;
  unitForm: FormGroup;
  storyForm: FormGroup;
  questionForm: FormGroup;
  vocabularyForm: FormGroup;
  repetitionForm: FormGroup;

  // Activity Config forms (one per type)
  activityConfigForms: {
    questions: FormGroup;
    flashcards: FormGroup;
    matching: FormGroup;
    listen_repeat: FormGroup;
  };

  // File uploads
  audioSlowFile: File | null = null;
  audioNormalFile: File | null = null;
  vocabAudioFile: File | null = null;
  vocabImageFile: File | null = null;
  repetitionAudioFile: File | null = null;
  questionAudioFile: File | null = null;

  // Audio recording for repetition activities
  audioMethod: 'upload' | 'record' = 'upload';
  isRecording = signal<boolean>(false);
  recordedAudioBlob = signal<Blob | null>(null);
  recordedAudioUrl = signal<string | null>(null);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // Audio recording for stories
  audioSlowMethod: 'upload' | 'record' = 'upload';
  audioNormalMethod: 'upload' | 'record' = 'upload';
  isRecordingSlowAudio = signal<boolean>(false);
  isRecordingNormalAudio = signal<boolean>(false);
  recordedSlowAudioBlob = signal<Blob | null>(null);
  recordedNormalAudioBlob = signal<Blob | null>(null);
  recordedSlowAudioUrl = signal<string | null>(null);
  recordedNormalAudioUrl = signal<string | null>(null);
  private slowAudioRecorder: MediaRecorder | null = null;
  private normalAudioRecorder: MediaRecorder | null = null;
  private slowAudioChunks: Blob[] = [];
  private normalAudioChunks: Blob[] = [];

  // Audio recording for vocabulary
  vocabAudioMethod: 'upload' | 'record' = 'upload';
  isRecordingVocabAudio = signal<boolean>(false);
  recordedVocabAudioBlob = signal<Blob | null>(null);
  recordedVocabAudioUrl = signal<string | null>(null);
  private vocabAudioRecorder: MediaRecorder | null = null;
  private vocabAudioChunks: Blob[] = [];

  // Audio recording for questions
  questionAudioMethod: 'upload' | 'record' = 'upload';
  isRecordingQuestionAudio = signal<boolean>(false);
  recordedQuestionAudioBlob = signal<Blob | null>(null);
  recordedQuestionAudioUrl = signal<string | null>(null);
  private questionAudioRecorder: MediaRecorder | null = null;
  private questionAudioChunks: Blob[] = [];

  // Audio recording for edit story
  editAudioSlowMethod: 'upload' | 'record' = 'upload';
  editAudioNormalMethod: 'upload' | 'record' = 'upload';
  isRecordingEditSlowAudio = signal<boolean>(false);
  isRecordingEditNormalAudio = signal<boolean>(false);
  recordedEditSlowAudioBlob = signal<Blob | null>(null);
  recordedEditNormalAudioBlob = signal<Blob | null>(null);
  recordedEditSlowAudioUrl = signal<string | null>(null);
  recordedEditNormalAudioUrl = signal<string | null>(null);
  private editSlowAudioRecorder: MediaRecorder | null = null;
  private editNormalAudioRecorder: MediaRecorder | null = null;
  private editSlowAudioChunks: Blob[] = [];
  private editNormalAudioChunks: Blob[] = [];

  // Audio deletion flags
  deleteAudioSlow: boolean = false;
  deleteAudioNormal: boolean = false;

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
      correctAnswer: ['', Validators.required]  // Always required for all question types
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

    // Activity Config forms
    this.activityConfigForms = {
      questions: this.createActivityConfigForm('questions'),
      flashcards: this.createActivityConfigForm('flashcards'),
      matching: this.createActivityConfigForm('matching'),
      listen_repeat: this.createActivityConfigForm('listen_repeat')
    };
  }

  createActivityConfigForm(activityType: string): FormGroup {
    return this.fb.group({
      id: [null],
      unitId: [null],
      activityType: [activityType],
      order: [null],
      isEnabled: [false],
      requiredStoryIds: [[]]
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

  // Confirm Dialog Helper
  showConfirm(title: string, message: string, confirmText: string, onConfirm: () => void, type: 'danger' | 'warning' = 'danger'): void {
    this.confirmDialogData.set({ title, message, confirmText, type, onConfirm });
    this.showConfirmDialog.set(true);
  }

  onConfirmDialogConfirmed(): void {
    const data = this.confirmDialogData();
    if (data) {
      data.onConfirm();
    }
    this.closeConfirmDialog();
  }

  closeConfirmDialog(): void {
    this.showConfirmDialog.set(false);
    this.confirmDialogData.set(null);
  }

  loadCourseDetails(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.courseService.getCourse(this.courseId()).subscribe({
      next: (course) => {
        this.course.set(course);
        this.units.set(course.units || []);
        // Expand all units by default on initial load
        this.expandAllUnits();
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
        this.toastService.success('Curso actualizado exitosamente');
      },
      error: (error) => {
        console.error('Error updating course:', error);
        this.toastService.error('Error al actualizar el curso');
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
        this.toastService.error('Error al crear la unidad');
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
        this.toastService.success('Unidad actualizada exitosamente');
      },
      error: (error) => {
        console.error('Error updating unit:', error);
        this.toastService.error('Error al actualizar la unidad');
      }
    });
  }

  deleteUnit(unitId: number): void {
    this.showConfirm(
      'Eliminar Unidad',
      '¿Estás seguro de eliminar esta unidad? Se eliminarán todas sus historias.',
      'Eliminar',
      () => {
        this.unitService.deleteUnit(unitId).subscribe({
          next: () => {
            this.units.update(current => current.filter(u => u.id !== unitId));
            this.toastService.success('Unidad eliminada exitosamente');
          },
          error: (error) => {
            console.error('Error deleting unit:', error);
            this.toastService.error('Error al eliminar la unidad');
          }
        });
      },
      'danger'
    );
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
    this.clearRecordingSlowAudio();
    this.clearRecordingNormalAudio();
    this.audioSlowMethod = 'upload';
    this.audioNormalMethod = 'upload';
  }

  closeEditStoryModal(): void {
    this.showStoryEditModal.set(false);
    this.storyForm.reset();
    this.selectedStory.set(null);
    this.selectedUnitId.set(null);
    this.audioSlowFile = null;
    this.audioNormalFile = null;
    this.clearRecordingEditSlowAudio();
    this.clearRecordingEditNormalAudio();
    this.editAudioSlowMethod = 'upload';
    this.editAudioNormalMethod = 'upload';
    this.deleteAudioSlow = false;
    this.deleteAudioNormal = false;
    this.isEditMode.set(false);
  }

  // Audio deletion methods
  markAudioSlowForDeletion(): void {
    this.deleteAudioSlow = true;
  }

  cancelAudioSlowDeletion(): void {
    this.deleteAudioSlow = false;
  }

  markAudioNormalForDeletion(): void {
    this.deleteAudioNormal = true;
  }

  cancelAudioNormalDeletion(): void {
    this.deleteAudioNormal = false;
  }

  onAudioSlowSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      // Validar tipo
      if (!file.type.startsWith('audio/')) {
        this.toastService.warning('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      // Validar tamaño (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        this.toastService.warning('El archivo es muy grande. Máximo 50MB');
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
        this.toastService.warning('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      // Validar tamaño (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        this.toastService.warning('El archivo es muy grande. Máximo 50MB');
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

    // Add slow audio from file upload or recording
    if (this.audioSlowMethod === 'upload' && this.audioSlowFile) {
      formData.append('audioSlow', this.audioSlowFile);
    } else if (this.audioSlowMethod === 'record' && this.recordedSlowAudioBlob()) {
      const audioFile = new File([this.recordedSlowAudioBlob()!], 'audio-slow.webm', { type: 'audio/webm' });
      formData.append('audioSlow', audioFile);
    }

    // Add normal audio from file upload or recording
    if (this.audioNormalMethod === 'upload' && this.audioNormalFile) {
      formData.append('audioNormal', this.audioNormalFile);
    } else if (this.audioNormalMethod === 'record' && this.recordedNormalAudioBlob()) {
      const audioFile = new File([this.recordedNormalAudioBlob()!], 'audio-normal.webm', { type: 'audio/webm' });
      formData.append('audioNormal', audioFile);
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
        this.toastService.error('Error al crear la historia');
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

    // Add slow audio from file upload or recording
    if (this.editAudioSlowMethod === 'upload' && this.audioSlowFile) {
      formData.append('audioSlow', this.audioSlowFile);
    } else if (this.editAudioSlowMethod === 'record' && this.recordedEditSlowAudioBlob()) {
      const audioFile = new File([this.recordedEditSlowAudioBlob()!], 'audio-slow.webm', { type: 'audio/webm' });
      formData.append('audioSlow', audioFile);
    } else if (this.deleteAudioSlow) {
      // Send special marker to delete audio
      formData.append('deleteAudioSlow', 'true');
    }

    // Add normal audio from file upload or recording
    if (this.editAudioNormalMethod === 'upload' && this.audioNormalFile) {
      formData.append('audioNormal', this.audioNormalFile);
    } else if (this.editAudioNormalMethod === 'record' && this.recordedEditNormalAudioBlob()) {
      const audioFile = new File([this.recordedEditNormalAudioBlob()!], 'audio-normal.webm', { type: 'audio/webm' });
      formData.append('audioNormal', audioFile);
    } else if (this.deleteAudioNormal) {
      // Send special marker to delete audio
      formData.append('deleteAudioNormal', 'true');
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
        this.toastService.success('Historia actualizada exitosamente');
      },
      error: (error) => {
        console.error('Error updating story:', error);
        this.toastService.error('Error al actualizar la historia');
      }
    });
  }

  deleteStory(unitId: number, storyId: number): void {
    this.showConfirm(
      'Eliminar Historia',
      '¿Estás seguro de eliminar esta historia?',
      'Eliminar',
      () => {
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
            this.toastService.success('Historia eliminada exitosamente');
          },
          error: (error) => {
            console.error('Error deleting story:', error);
            this.toastService.error('Error al eliminar la historia');
          }
        });
      },
      'danger'
    );
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
    this.questionAudioFile = null;
    this.questionAudioMethod = 'upload';
    this.clearRecordingQuestionAudio();
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
        this.toastService.error('Error al cargar las preguntas');
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

  onQuestionAudioSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      // Validate type
      if (!file.type.startsWith('audio/')) {
        this.toastService.warning('Por favor selecciona un archivo de audio válido');
        input.value = '';
        return;
      }
      // Validate size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        this.toastService.warning('El archivo es muy grande. Máximo 50MB');
        input.value = '';
        return;
      }
      this.questionAudioFile = file;
    }
  }

  editQuestion(question: Question): void {
    this.isEditingQuestion.set(true);
    this.editingQuestionId.set(question.id);
    this.questionAudioFile = null;

    // Populate form with question data
    this.questionForm.patchValue({
      questionText: question.questionText,
      answerType: question.answerType,
      correctAnswer: question.correctAnswer || ''
    });

    // Clear and populate options for choice questions
    this.questionOptions.clear();
    if (question.answerType === 'choice' && question.options) {
      question.options.forEach((option: string) => {
        this.questionOptions.push(new FormControl(option, Validators.required));
      });
    }

    // Scroll to form
    setTimeout(() => {
      const formElement = document.querySelector('.card-header.bg-primary');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  cancelEditQuestion(): void {
    this.isEditingQuestion.set(false);
    this.editingQuestionId.set(null);
    this.questionAudioFile = null;
    this.resetQuestionForm();
  }

  createQuestion(): void {
    if (this.questionForm.invalid || !this.selectedStory()) return;

    this.isSubmittingQuestion.set(true);

    const answerType = this.questionForm.get('answerType')?.value;
    const data: any = {
      storyId: this.selectedStory()!.id,
      questionText: this.questionForm.get('questionText')?.value,
      answerType: answerType,
      correctAnswer: answerType === 'open_ended' ? null : this.questionForm.get('correctAnswer')?.value
    };

    // Add options for multiple choice
    if (answerType === 'choice') {
      data.options = this.questionOptions.value.filter((opt: string) => opt.trim() !== '');

      if (data.options.length < 2) {
        this.toastService.warning('Debes agregar al menos 2 opciones');
        this.isSubmittingQuestion.set(false);
        return;
      }
    }

    // Check if we're editing or creating
    const isEditing = this.isEditingQuestion();
    const questionId = this.editingQuestionId();

    // Convert recorded audio blob to file if it exists
    let audioFile = this.questionAudioFile;
    if (!audioFile && this.questionAudioMethod === 'record' && this.recordedQuestionAudioBlob()) {
      audioFile = new File([this.recordedQuestionAudioBlob()!], 'question-audio.webm', { type: 'audio/webm' });
    }

    let request$;

    if (audioFile) {
      // Use FormData when there's an audio file
      if (isEditing && questionId) {
        request$ = this.questionService.updateQuestionWithAudio(questionId, data, audioFile);
      } else {
        request$ = this.questionService.createQuestionWithAudio(data, audioFile);
      }
    } else {
      // Use regular JSON when there's no audio file
      if (isEditing && questionId) {
        request$ = this.questionService.updateQuestion(questionId, data);
      } else {
        request$ = this.questionService.createQuestion(data);
      }
    }

    request$.subscribe({
      next: (question) => {
        if (isEditing && questionId) {
          // Update existing question
          this.storyQuestions.update(current =>
            current.map(q => q.id === questionId ? question : q)
          );
          this.toastService.success('Pregunta actualizada exitosamente');
        } else {
          // Add new question
          this.storyQuestions.update(current => [...current, question]);
          this.toastService.success('Pregunta creada exitosamente');
        }

        this.resetQuestionForm();
        this.isSubmittingQuestion.set(false);
        this.isEditingQuestion.set(false);
        this.editingQuestionId.set(null);
        this.questionAudioFile = null;

        // Update the story in units
        this.units.update(current => {
          return current.map(unit => ({
            ...unit,
            stories: (unit.stories || []).map(s =>
              s.id === this.selectedStory()!.id
                ? {
                    ...s,
                    questions: isEditing
                      ? (s.questions || []).map(q => q.id === questionId ? question : q)
                      : [...(s.questions || []), question]
                  }
                : s
            )
          }));
        });
      },
      error: (error) => {
        console.error(`Error ${isEditing ? 'updating' : 'creating'} question:`, error);
        this.toastService.error(`Error al ${isEditing ? 'actualizar' : 'crear'} la pregunta`);
        this.isSubmittingQuestion.set(false);
      }
    });
  }

  deleteQuestion(questionId: number): void {
    this.showConfirm(
      'Eliminar Pregunta',
      '¿Estás seguro de eliminar esta pregunta?',
      'Eliminar',
      () => {
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
            this.toastService.success('Pregunta eliminada exitosamente');
          },
          error: (error) => {
            console.error('Error deleting question:', error);
            this.toastService.error('Error al eliminar la pregunta');
          }
        });
      },
      'danger'
    );
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
    this.clearRecordingVocabAudio();
    this.vocabAudioMethod = 'upload';
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

    // Add audio from file upload or recording
    if (this.vocabAudioMethod === 'upload' && this.vocabAudioFile) {
      formData.append('audio', this.vocabAudioFile);
    } else if (this.vocabAudioMethod === 'record' && this.recordedVocabAudioBlob()) {
      const audioFile = new File([this.recordedVocabAudioBlob()!], 'vocab-audio.webm', { type: 'audio/webm' });
      formData.append('audio', audioFile);
    }

    if (this.vocabImageFile) {
      formData.append('image', this.vocabImageFile);
    }

    this.vocabularyService.createVocabulary(formData).subscribe({
      next: (newVocab) => {
        this.unitVocabulary.update(current => [...current, newVocab]);
        this.resetVocabularyForm();
        this.isSubmittingVocabulary.set(false);
        this.toastService.success('Vocabulario creado exitosamente');
      },
      error: (error) => {
        console.error('Error creating vocabulary:', error);
        this.toastService.error('Error al crear vocabulario');
        this.isSubmittingVocabulary.set(false);
      }
    });
  }

  deleteVocabulary(id: number): void {
    this.showConfirm(
      'Eliminar Vocabulario',
      '¿Estás seguro de eliminar este vocabulario?',
      'Eliminar',
      () => {
        this.vocabularyService.deleteVocabulary(id).subscribe({
          next: () => {
            this.unitVocabulary.update(current => current.filter(v => v.id !== id));
            this.toastService.success('Vocabulario eliminado exitosamente');
          },
          error: (error) => {
            console.error('Error deleting vocabulary:', error);
            this.toastService.error('Error al eliminar vocabulario');
          }
        });
      },
      'danger'
    );
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
    this.clearRecording();
    this.audioMethod = 'upload';
  }

  resetRepetitionForm(): void {
    this.repetitionForm.reset();
    this.repetitionAudioFile = null;
    this.clearRecording();
    this.audioMethod = 'upload';
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

    // Add audio from file upload or recording
    if (this.audioMethod === 'upload' && this.repetitionAudioFile) {
      formData.append('audio', this.repetitionAudioFile);
    } else if (this.audioMethod === 'record' && this.recordedAudioBlob()) {
      const audioFile = new File([this.recordedAudioBlob()!], 'recording.webm', { type: 'audio/webm' });
      formData.append('audio', audioFile);
    }

    this.repetitionActivityService.createActivity(formData).subscribe({
      next: (newActivity: RepetitionActivity) => {
        this.storyRepetitions.update(current => [...current, newActivity]);
        this.resetRepetitionForm();
        this.isSubmittingRepetition.set(false);
        this.toastService.success('Actividad de repetición creada exitosamente');
      },
      error: (error: any) => {
        console.error('Error creating repetition activity:', error);
        this.toastService.error('Error al crear actividad de repetición');
        this.isSubmittingRepetition.set(false);
      }
    });
  }

  deleteRepetition(id: number): void {
    this.showConfirm(
      'Eliminar Actividad',
      '¿Estás seguro de eliminar esta actividad de repetición?',
      'Eliminar',
      () => {
        this.repetitionActivityService.deleteActivity(id).subscribe({
          next: () => {
            this.storyRepetitions.update(current => current.filter(r => r.id !== id));
            this.toastService.success('Actividad de repetición eliminada exitosamente');
          },
          error: (error: any) => {
            console.error('Error deleting repetition activity:', error);
            this.toastService.error('Error al eliminar actividad de repetición');
          }
        });
      },
      'danger'
    );
  }

  // ===== AUDIO RECORDING FUNCTIONALITY =====

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.recordedAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedAudioUrl.set(audioUrl);

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.toastService.success('Grabación iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono. Por favor, permite el acceso.');
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
      this.toastService.success('Grabación detenida');
    }
  }

  clearRecording(): void {
    if (this.recordedAudioUrl()) {
      URL.revokeObjectURL(this.recordedAudioUrl()!);
    }
    this.recordedAudioBlob.set(null);
    this.recordedAudioUrl.set(null);
    this.audioChunks = [];
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }
  }

  // ===== AUDIO RECORDING FOR STORIES =====

  async startRecordingSlowAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.slowAudioRecorder = new MediaRecorder(stream);
      this.slowAudioChunks = [];

      this.slowAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.slowAudioChunks.push(event.data);
        }
      };

      this.slowAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.slowAudioChunks, { type: 'audio/webm' });
        this.recordedSlowAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedSlowAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.slowAudioRecorder.start();
      this.isRecordingSlowAudio.set(true);
      this.toastService.success('Grabación de audio lento iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingSlowAudio(): void {
    if (this.slowAudioRecorder && this.slowAudioRecorder.state !== 'inactive') {
      this.slowAudioRecorder.stop();
      this.isRecordingSlowAudio.set(false);
      this.toastService.success('Grabación de audio lento detenida');
    }
  }

  clearRecordingSlowAudio(): void {
    if (this.recordedSlowAudioUrl()) {
      URL.revokeObjectURL(this.recordedSlowAudioUrl()!);
    }
    this.recordedSlowAudioBlob.set(null);
    this.recordedSlowAudioUrl.set(null);
    this.slowAudioChunks = [];
    if (this.slowAudioRecorder) {
      this.slowAudioRecorder = null;
    }
  }

  async startRecordingNormalAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.normalAudioRecorder = new MediaRecorder(stream);
      this.normalAudioChunks = [];

      this.normalAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.normalAudioChunks.push(event.data);
        }
      };

      this.normalAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.normalAudioChunks, { type: 'audio/webm' });
        this.recordedNormalAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedNormalAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.normalAudioRecorder.start();
      this.isRecordingNormalAudio.set(true);
      this.toastService.success('Grabación de audio normal iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingNormalAudio(): void {
    if (this.normalAudioRecorder && this.normalAudioRecorder.state !== 'inactive') {
      this.normalAudioRecorder.stop();
      this.isRecordingNormalAudio.set(false);
      this.toastService.success('Grabación de audio normal detenida');
    }
  }

  clearRecordingNormalAudio(): void {
    if (this.recordedNormalAudioUrl()) {
      URL.revokeObjectURL(this.recordedNormalAudioUrl()!);
    }
    this.recordedNormalAudioBlob.set(null);
    this.recordedNormalAudioUrl.set(null);
    this.normalAudioChunks = [];
    if (this.normalAudioRecorder) {
      this.normalAudioRecorder = null;
    }
  }

  // ===== VOCABULARY AUDIO RECORDING =====

  async startRecordingVocabAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.vocabAudioRecorder = new MediaRecorder(stream);
      this.vocabAudioChunks = [];

      this.vocabAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.vocabAudioChunks.push(event.data);
        }
      };

      this.vocabAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.vocabAudioChunks, { type: 'audio/webm' });
        this.recordedVocabAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedVocabAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.vocabAudioRecorder.start();
      this.isRecordingVocabAudio.set(true);
      this.toastService.success('Grabación de audio iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingVocabAudio(): void {
    if (this.vocabAudioRecorder && this.vocabAudioRecorder.state !== 'inactive') {
      this.vocabAudioRecorder.stop();
      this.isRecordingVocabAudio.set(false);
      this.toastService.success('Grabación de audio detenida');
    }
  }

  clearRecordingVocabAudio(): void {
    if (this.recordedVocabAudioUrl()) {
      URL.revokeObjectURL(this.recordedVocabAudioUrl()!);
    }
    this.recordedVocabAudioBlob.set(null);
    this.recordedVocabAudioUrl.set(null);
    this.vocabAudioChunks = [];
    if (this.vocabAudioRecorder) {
      this.vocabAudioRecorder = null;
    }
  }

  // ===== QUESTION AUDIO RECORDING =====

  async startRecordingQuestionAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.questionAudioRecorder = new MediaRecorder(stream);
      this.questionAudioChunks = [];

      this.questionAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.questionAudioChunks.push(event.data);
        }
      };

      this.questionAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.questionAudioChunks, { type: 'audio/webm' });
        this.recordedQuestionAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedQuestionAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.questionAudioRecorder.start();
      this.isRecordingQuestionAudio.set(true);
      this.toastService.success('Grabación de audio iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingQuestionAudio(): void {
    if (this.questionAudioRecorder && this.questionAudioRecorder.state !== 'inactive') {
      this.questionAudioRecorder.stop();
      this.isRecordingQuestionAudio.set(false);
      this.toastService.success('Grabación de audio detenida');
    }
  }

  clearRecordingQuestionAudio(): void {
    if (this.recordedQuestionAudioUrl()) {
      URL.revokeObjectURL(this.recordedQuestionAudioUrl()!);
    }
    this.recordedQuestionAudioBlob.set(null);
    this.recordedQuestionAudioUrl.set(null);
    this.questionAudioChunks = [];
    if (this.questionAudioRecorder) {
      this.questionAudioRecorder = null;
    }
  }

  // ===== EDIT STORY AUDIO RECORDING =====

  async startRecordingEditSlowAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.editSlowAudioRecorder = new MediaRecorder(stream);
      this.editSlowAudioChunks = [];

      this.editSlowAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.editSlowAudioChunks.push(event.data);
        }
      };

      this.editSlowAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.editSlowAudioChunks, { type: 'audio/webm' });
        this.recordedEditSlowAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedEditSlowAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.editSlowAudioRecorder.start();
      this.isRecordingEditSlowAudio.set(true);
      this.toastService.success('Grabación de audio lento iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingEditSlowAudio(): void {
    if (this.editSlowAudioRecorder && this.editSlowAudioRecorder.state !== 'inactive') {
      this.editSlowAudioRecorder.stop();
      this.isRecordingEditSlowAudio.set(false);
      this.toastService.success('Grabación de audio lento detenida');
    }
  }

  clearRecordingEditSlowAudio(): void {
    if (this.recordedEditSlowAudioUrl()) {
      URL.revokeObjectURL(this.recordedEditSlowAudioUrl()!);
    }
    this.recordedEditSlowAudioBlob.set(null);
    this.recordedEditSlowAudioUrl.set(null);
    this.editSlowAudioChunks = [];
    if (this.editSlowAudioRecorder) {
      this.editSlowAudioRecorder = null;
    }
  }

  async startRecordingEditNormalAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.editNormalAudioRecorder = new MediaRecorder(stream);
      this.editNormalAudioChunks = [];

      this.editNormalAudioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.editNormalAudioChunks.push(event.data);
        }
      };

      this.editNormalAudioRecorder.onstop = () => {
        const audioBlob = new Blob(this.editNormalAudioChunks, { type: 'audio/webm' });
        this.recordedEditNormalAudioBlob.set(audioBlob);
        const audioUrl = URL.createObjectURL(audioBlob);
        this.recordedEditNormalAudioUrl.set(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      this.editNormalAudioRecorder.start();
      this.isRecordingEditNormalAudio.set(true);
      this.toastService.success('Grabación de audio normal iniciada');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.toastService.error('No se pudo acceder al micrófono');
    }
  }

  stopRecordingEditNormalAudio(): void {
    if (this.editNormalAudioRecorder && this.editNormalAudioRecorder.state !== 'inactive') {
      this.editNormalAudioRecorder.stop();
      this.isRecordingEditNormalAudio.set(false);
      this.toastService.success('Grabación de audio normal detenida');
    }
  }

  clearRecordingEditNormalAudio(): void {
    if (this.recordedEditNormalAudioUrl()) {
      URL.revokeObjectURL(this.recordedEditNormalAudioUrl()!);
    }
    this.recordedEditNormalAudioBlob.set(null);
    this.recordedEditNormalAudioUrl.set(null);
    this.editNormalAudioChunks = [];
    if (this.editNormalAudioRecorder) {
      this.editNormalAudioRecorder = null;
    }
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
        this.toastService.error('Error al reordenar unidades');
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
      this.toastService.warning('Solo puedes reordenar historias dentro de la misma unidad');
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
    // Update each story's order in the backend using the order-specific endpoint
    const updatePromises = stories.map(story =>
      firstValueFrom(this.storyService.updateStoryOrder(story.id, story.order))
    );

    Promise.all(updatePromises)
      .then(() => {
        console.log('Stories reordered successfully');
      })
      .catch(error => {
        console.error('Error reordering stories:', error);
        this.toastService.error('Error al reordenar historias');
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
        this.toastService.error('Error al reordenar actividades');
        this.loadRepetitionsForStory(this.selectedStory()!.id); // Reload to reset order
      });
  }

  // ===== ACTIVITY CONFIG MANAGEMENT =====

  openActivityConfigModal(unit: Unit): void {
    this.selectedUnitForActivity.set(unit);
    this.loadActivityConfigs(unit.id);
    this.showActivityConfigModal.set(true);
  }

  closeActivityConfigModal(): void {
    this.showActivityConfigModal.set(false);
    this.selectedUnitForActivity.set(null);
    this.activityConfigs.set([]);
    this.previewItems.set([]);
    // Reset forms
    Object.values(this.activityConfigForms).forEach(form => {
      form.reset({ isEnabled: false, requiredStoryIds: [] });
    });
  }

  loadActivityConfigs(unitId: number): void {
    this.activityConfigService.getConfigsByUnit(unitId).subscribe({
      next: (configs) => {
        this.activityConfigs.set(configs);
        // Populate forms with existing data
        configs.forEach(config => {
          const form = this.activityConfigForms[config.activityType as keyof typeof this.activityConfigForms];
          if (form) {
            form.patchValue(config);
          }
        });
        // Build preview
        this.buildPreviewItems();
      },
      error: (error) => {
        console.error('Error loading activity configs:', error);
        this.toastService.error('Error al cargar configuración de actividades');
        // Still build preview with just stories
        this.buildPreviewItems();
      }
    });
  }

  buildPreviewItems(): void {
    const unit = this.selectedUnitForActivity();
    if (!unit) return;

    const items: Array<{ type: string; title: string; order: number; icon: string; id?: number; requiredStories?: number[]; activityType?: string }> = [];

    // Add stories
    (unit.stories || []).forEach(story => {
      items.push({
        type: 'story',
        title: story.title,
        order: story.order,
        icon: '📖',
        id: story.id
      });
    });

    // Add enabled activities
    Object.keys(this.activityConfigForms).forEach(activityType => {
      const form = this.activityConfigForms[activityType as keyof typeof this.activityConfigForms];
      if (form.value.isEnabled) {
        const order = form.value.order !== null ? form.value.order : 9999;
        items.push({
          type: 'activity',
          title: this.getActivityTitle(activityType),
          order: order,
          icon: this.getActivityIcon(activityType),
          activityType: activityType,
          requiredStories: form.value.requiredStoryIds || []
        });
      }
    });

    // Sort by order
    items.sort((a, b) => a.order - b.order);

    this.previewItems.set(items);
  }

  getActivityTitle(type: string): string {
    const titles: { [key: string]: string } = {
      'questions': 'Preguntas de comprensión',
      'flashcards': 'Tarjetas de vocabulario',
      'matching': 'Emparejar vocabulario',
      'listen_repeat': 'Escuchar y repetir'
    };
    return titles[type] || type;
  }

  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'questions': '🎯',
      'flashcards': '🃏',
      'matching': '🔗',
      'listen_repeat': '🎧'
    };
    return icons[type] || '❓';
  }

  getOrderedStories(): Story[] {
    const unit = this.selectedUnitForActivity();
    if (!unit || !unit.stories) return [];
    return [...unit.stories].sort((a, b) => a.order - b.order);
  }

  toggleStoryRequirement(activityType: string, storyId: number): void {
    const form = this.activityConfigForms[activityType as keyof typeof this.activityConfigForms];
    const current = form.value.requiredStoryIds || [];

    if (current.includes(storyId)) {
      // Remove
      form.patchValue({
        requiredStoryIds: current.filter((id: number) => id !== storyId)
      });
    } else {
      // Add
      form.patchValue({
        requiredStoryIds: [...current, storyId]
      });
    }
    this.buildPreviewItems();
  }

  onActivityEnabledChange(activityType: string): void {
    const form = this.activityConfigForms[activityType as keyof typeof this.activityConfigForms];

    // If enabling, set a default order if not set
    if (form.value.isEnabled && form.value.order === null) {
      // Find the highest order and add 1
      const unit = this.selectedUnitForActivity();
      if (unit) {
        const maxStoryOrder = Math.max(...(unit.stories || []).map(s => s.order), 0);
        const maxActivityOrder = Math.max(
          ...Object.values(this.activityConfigForms)
            .filter(f => f.value.isEnabled && f.value.order !== null)
            .map(f => f.value.order),
          0
        );
        const maxOrder = Math.max(maxStoryOrder, maxActivityOrder);
        form.patchValue({ order: maxOrder + 1 });
      }
    }

    this.buildPreviewItems();
  }

  // Drag & Drop for preview items
  onPreviewDragStart(event: DragEvent, item: { type: string; id?: number; activityType?: string }): void {
    this.draggedPreviewItem = item;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onPreviewDrop(event: DragEvent, targetItem: { type: string; id?: number; activityType?: string }): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedPreviewItem) return;

    // Can't drop on itself
    if (
      this.draggedPreviewItem.type === targetItem.type &&
      this.draggedPreviewItem.id === targetItem.id &&
      this.draggedPreviewItem.activityType === targetItem.activityType
    ) {
      this.draggedPreviewItem = null;
      return;
    }

    const items = [...this.previewItems()];
    const draggedIndex = items.findIndex(i =>
      (i.type === 'story' && i.id === this.draggedPreviewItem!.id && this.draggedPreviewItem!.type === 'story') ||
      (i.type === 'activity' && i.activityType === this.draggedPreviewItem!.activityType && this.draggedPreviewItem!.type === 'activity')
    );
    const targetIndex = items.findIndex(i =>
      (i.type === 'story' && i.id === targetItem.id && targetItem.type === 'story') ||
      (i.type === 'activity' && i.activityType === targetItem.activityType && targetItem.type === 'activity')
    );

    if (draggedIndex === -1 || targetIndex === -1) {
      this.draggedPreviewItem = null;
      return;
    }

    // Reorder items
    const [removed] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, removed);

    // Recalculate order values (0, 1, 2, 3...)
    items.forEach((item, index) => {
      const newOrder = index;
      item.order = newOrder;

      // Update form for activities
      if (item.type === 'activity' && item.activityType) {
        const form = this.activityConfigForms[item.activityType as keyof typeof this.activityConfigForms];
        if (form) {
          form.patchValue({ order: newOrder });
        }
      }
      // Note: Stories order is not editable from this modal, they are read-only references
    });

    this.previewItems.set(items);
    this.draggedPreviewItem = null;
  }

  saveActivityConfigs(): void {
    const unit = this.selectedUnitForActivity();
    if (!unit) return;

    // Gather all enabled configs from forms
    const configs: Partial<ActivityConfig>[] = [];

    Object.keys(this.activityConfigForms).forEach(activityType => {
      const form = this.activityConfigForms[activityType as keyof typeof this.activityConfigForms];
      if (form.value.isEnabled) {
        configs.push({
          id: form.value.id || undefined,
          unitId: unit.id,
          activityType: form.value.activityType,
          order: form.value.order,
          isEnabled: form.value.isEnabled,
          requiredStoryIds: form.value.requiredStoryIds || []
        });
      }
    });

    // Save via batch update
    this.activityConfigService.batchUpdate(unit.id, configs).subscribe({
      next: (savedConfigs) => {
        this.toastService.success('Configuración de actividades guardada exitosamente');
        this.activityConfigs.set(savedConfigs);
        this.closeActivityConfigModal();
      },
      error: (error) => {
        console.error('Error saving activity configs:', error);
        this.toastService.error('Error al guardar configuración de actividades');
      }
    });
  }

  // ===== ACCORDION METHODS =====

  toggleUnit(unitId: number): void {
    const expanded = this.expandedUnits();
    const newExpanded = new Set(expanded);

    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }

    this.expandedUnits.set(newExpanded);
  }

  isUnitExpanded(unitId: number): boolean {
    return this.expandedUnits().has(unitId);
  }

  expandAllUnits(): void {
    const allIds = this.units().map(u => u.id);
    this.expandedUnits.set(new Set(allIds));
  }

  collapseAllUnits(): void {
    this.expandedUnits.set(new Set());
  }

  goBack(): void {
    this.router.navigate(['/teacher/dashboard']);
  }
}
