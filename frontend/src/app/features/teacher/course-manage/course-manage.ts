import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
    CommonModule, ConfirmDialogComponent, LessonComposerComponent, UnitListComponent,
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

  /** Desde el compositor se pasa a gestionar preguntas o vocabulario cerrando el compositor. */
  goBack(): void {
    this.router.navigate(['/teacher/dashboard']);
  }
}
