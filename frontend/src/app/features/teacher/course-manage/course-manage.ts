import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LessonComposerComponent } from '../lesson-composer/lesson-composer.component';
import { CourseManageStore } from './course-manage.store';
import { UnitListComponent } from './components/unit-list.component';
import { CourseEditModalComponent } from './components/course-edit-modal.component';
import { UnitFormModalComponent } from './components/unit-form-modal.component';
import { StoryCreateModalComponent } from './components/story-create-modal.component';
import { StoryEditModalComponent } from './components/story-edit-modal.component';
import { QuestionModalComponent } from './components/question-modal.component';
import { VocabularyModalComponent } from './components/vocabulary-modal.component';
import { RepetitionModalComponent } from './components/repetition-modal.component';
import { TooltipModalComponent } from './components/tooltip-modal.component';

/** Pantalla de gestión de contenido de un curso: orquesta la lista de unidades y los diálogos. */
@Component({
  selector: 'app-course-manage',
  standalone: true,
  imports: [
    CommonModule, RouterLink, IconComponent, PluralPipe, ConfirmDialogComponent, LessonComposerComponent, UnitListComponent,
    CourseEditModalComponent, UnitFormModalComponent, StoryCreateModalComponent, StoryEditModalComponent,
    QuestionModalComponent, VocabularyModalComponent, RepetitionModalComponent, TooltipModalComponent
  ],
  providers: [CourseManageStore],
  templateUrl: './course-manage.html',
  styleUrl: './course-manage.scss',
})
export class CourseManageComponent implements OnInit {
  store = inject(CourseManageStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.load(+id);
    else this.router.navigate(['/teacher/dashboard']);
  }

  storyCount = computed(() => this.store.units().reduce((sum, unit) => sum + (unit.stories?.length ?? 0), 0));
  /** Historias con lección publicada: sin ninguna, el curso todavía no tiene nada para estudiar. */
  publishedCount = computed(() =>
    this.store.units().reduce((sum, unit) => sum + (unit.stories ?? []).filter(s => s.lessonStatus === 'published').length, 0));
}
