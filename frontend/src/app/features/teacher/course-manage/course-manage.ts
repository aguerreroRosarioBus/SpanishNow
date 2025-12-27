import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseService } from '../../../core/services/course.service';
import { UnitService } from '../../../core/services/unit.service';
import { StoryService } from '../../../core/services/story.service';
import { Course, Unit, Story } from '../../../core/models/course.model';
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  courseId = signal<number>(0);
  course = signal<Course | null>(null);
  units = signal<Unit[]>([]);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Modal states
  showUnitModal = signal<boolean>(false);
  showStoryModal = signal<boolean>(false);
  selectedUnitId = signal<number | null>(null);

  // Forms
  unitForm: FormGroup;
  storyForm: FormGroup;

  // Story audio files
  audioSlowFile: File | null = null;
  audioNormalFile: File | null = null;

  constructor() {
    // Unit form
    this.unitForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      order: [0, [Validators.required, Validators.min(0)]]
    });

    // Story form
    this.storyForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      text: ['', [Validators.required, Validators.minLength(20)]],
      order: [0, [Validators.required, Validators.min(0)]]
    });
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

  // ===== UNIT MANAGEMENT =====

  openUnitModal(): void {
    this.unitForm.reset({ order: this.units().length });
    this.showUnitModal.set(true);
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
      description: this.unitForm.get('description')?.value,
      order: this.unitForm.get('order')?.value
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
    this.selectedUnitId.set(unitId);
    const unit = this.units().find(u => u.id === unitId);
    const storiesCount = unit?.stories?.length || 0;
    this.storyForm.reset({ order: storiesCount });
    this.audioSlowFile = null;
    this.audioNormalFile = null;
    this.showStoryModal.set(true);
  }

  closeStoryModal(): void {
    this.showStoryModal.set(false);
    this.storyForm.reset();
    this.selectedUnitId.set(null);
    this.audioSlowFile = null;
    this.audioNormalFile = null;
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
    formData.append('order', this.storyForm.get('order')?.value);

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

  goBack(): void {
    this.router.navigate(['/teacher/dashboard']);
  }
}
