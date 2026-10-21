import { Component, computed, input, signal } from '@angular/core';

/** Tarjeta de curso (catálogo, Mis cursos y dashboard del profesor). Las acciones van en el pie, proyectadas. */
@Component({
  selector: 'app-course-card',
  standalone: true,
  templateUrl: './course-card.component.html',
  styleUrl: './course-card.component.scss'
})
export class CourseCardComponent {
  title = input.required<string>();
  level = input<string | null | undefined>(null);
  description = input<string | null | undefined>(null);
  imageUrl = input<string | null | undefined>(null);

  private imageFailed = signal(false);
  showImage = computed(() => !!this.imageUrl() && !this.imageFailed());
  /** Iniciales del título para la portada sin imagen */
  initials = computed(() => {
    const words = this.title().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  });

  onImageError(): void {
    this.imageFailed.set(true);
  }
}
