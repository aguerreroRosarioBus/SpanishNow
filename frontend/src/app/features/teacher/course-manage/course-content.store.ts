import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { Material } from '../../../core/models/course.model';
import { UnitQuiz } from '../../../core/models/content.model';
import { MaterialService } from '../../../core/services/material.service';
import { QuizService } from '../../../core/services/quiz.service';

export interface QuizInfo { isPublished: boolean; questionCount: number; }

/** Materiales y quizzes del curso para los indicadores de las tarjetas y los diálogos de contenido. */
@Injectable()
export class CourseContentStore {
  private materialService = inject(MaterialService);
  private quizService = inject(QuizService);

  materials = signal<Material[]>([]);
  /** unitId -> resumen del quiz (ausente = sin quiz). */
  quizzes = signal<Record<number, QuizInfo>>({});

  private materialsByStory = computed(() => groupCount(this.materials(), m => m.storyId));
  private materialsByUnit = computed(() => groupCount(this.materials().filter(m => !m.storyId), m => m.unitId));

  loadMaterials(courseId: number): void {
    this.materialService.list(courseId).pipe(catchError(() => of([] as Material[])))
      .subscribe(list => this.materials.set(list));
  }

  loadQuizzes(unitIds: number[]): void {
    if (!unitIds.length) return;
    forkJoin(unitIds.map(id => this.quizService.getForTeacher(id).pipe(catchError(() => of(null))))).subscribe(results => {
      const next: Record<number, QuizInfo> = {};
      results.forEach((quiz, i) => { if (quiz) next[unitIds[i]] = toInfo(quiz); });
      this.quizzes.set(next);
    });
  }

  storyMaterialCount(storyId: number): number { return this.materialsByStory().get(storyId) ?? 0; }
  /** PDFs de la unidad en sí (sin los de sus historias). */
  unitMaterialCount(unitId: number): number { return this.materialsByUnit().get(unitId) ?? 0; }
  quiz(unitId: number): QuizInfo | null { return this.quizzes()[unitId] ?? null; }

  setQuiz(unitId: number, quiz: UnitQuiz | null): void {
    this.quizzes.update(current => {
      const next = { ...current };
      if (quiz) next[unitId] = toInfo(quiz); else delete next[unitId];
      return next;
    });
  }
}

function toInfo(quiz: UnitQuiz): QuizInfo {
  return { isPublished: !!quiz.isPublished, questionCount: quiz.questions?.length ?? 0 };
}

function groupCount<T>(list: T[], key: (item: T) => number | null | undefined): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of list) {
    const k = key(item);
    if (k != null) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
