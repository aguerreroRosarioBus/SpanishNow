import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LessonComposerComponent } from '../lesson-composer/lesson-composer.component';
import { CourseManageStore } from './course-manage.store';
import { CourseContentStore } from './course-content.store';
import { MaterialsModalComponent } from './components/materials-modal.component';
import { QuizModalComponent } from './components/quiz-modal.component';
import { StudentsPanelComponent } from './components/students-panel.component';
import { UnitListComponent } from './components/unit-list.component';
import { CourseEditModalComponent } from './components/course-edit-modal.component';
import { UnitFormModalComponent } from './components/unit-form-modal.component';
import { StoryCreateModalComponent } from './components/story-create-modal.component';
import { StoryEditModalComponent } from './components/story-edit-modal.component';
import { QuestionModalComponent } from './components/question-modal.component';
import { VocabularyModalComponent } from './components/vocabulary-modal.component';
import { RepetitionModalComponent } from './components/repetition-modal.component';
import { TooltipModalComponent } from './components/tooltip-modal.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Pantalla de gestión de contenido de un curso: orquesta la lista de unidades y los diálogos. */
@Component({
  selector: 'app-course-manage',
  standalone: true,
  imports: [
    CommonModule, RouterLink, IconComponent, ConfirmDialogComponent, LessonComposerComponent, UnitListComponent,
    CourseEditModalComponent, UnitFormModalComponent, StoryCreateModalComponent, StoryEditModalComponent,
    QuestionModalComponent, VocabularyModalComponent, RepetitionModalComponent, TooltipModalComponent,
    StudentsPanelComponent, MaterialsModalComponent, QuizModalComponent, TranslatePipe
  ],
  providers: [CourseManageStore, CourseContentStore],
  templateUrl: './course-manage.html',
  styleUrl: './course-manage.scss',
})
export class CourseManageComponent implements OnInit {
  store = inject(CourseManageStore);
  private content = inject(CourseContentStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** Pestaña activa: contenido (unidades) o alumnos. */
  tab = signal<'content' | 'students'>('content');

  constructor() {
    // Cuando llegan las unidades se consulta el quiz de cada una para los indicadores de las tarjetas
    let loaded = false;
    effect(() => {
      const ids = this.store.units().map(u => u.id);
      if (!loaded && ids.length) {
        loaded = true;
        untracked(() => this.content.loadQuizzes(ids));
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const story = Number(this.route.snapshot.queryParamMap.get('story'));
      if (Number.isInteger(story) && story > 0) this.store.highlightStoryId.set(story);
      this.store.load(+id);
      this.content.loadMaterials(+id);
    }
    else this.router.navigate(['/teacher/dashboard']);
  }

  storyCount = computed(() => this.store.units().reduce((sum, unit) => sum + (unit.stories?.length ?? 0), 0));
  /** Historias con lección publicada: sin ninguna, el curso todavía no tiene nada para estudiar. */
  publishedCount = computed(() =>
    this.store.units().reduce((sum, unit) => sum + (unit.stories ?? []).filter(s => s.lessonStatus === 'published').length, 0));
}
