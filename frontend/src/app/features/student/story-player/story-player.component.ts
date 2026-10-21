import { Component, OnDestroy, OnInit, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LessonAudioService } from './lesson-audio.service';
import { LessonNavigationStore } from './lesson-navigation.store';
import { LessonSessionStore } from './lesson-session.store';
import { PlayerSidebarComponent } from './components/player-sidebar.component';
import { LessonViewComponent } from './components/lesson-view.component';

/** Contenedor del reproductor: carga el curso y coordina menú lateral, flechas y lección actual. */
@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [CommonModule, PlayerSidebarComponent, LessonViewComponent],
  providers: [LessonNavigationStore, LessonSessionStore, LessonAudioService],
  templateUrl: './story-player.component.html',
  styleUrl: './story-player.component.scss'
})
export class StoryPlayerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  nav = inject(LessonNavigationStore);
  private session = inject(LessonSessionStore);
  private audio = inject(LessonAudioService);

  constructor() {
    // Cada vez que cambia la historia seleccionada (menú o flechas) se carga su lección.
    effect(() => {
      const storyId = this.nav.currentStoryId();
      if (storyId) untracked(() => this.session.load(storyId));
    });
  }

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }
    this.route.params.subscribe(params => this.nav.load(+params['courseId']));
  }

  goBack(): void {
    this.router.navigate(['/student/dashboard']);
  }

  ngOnDestroy(): void {
    this.audio.stop();
  }
}
