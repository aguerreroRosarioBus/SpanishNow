import { Component, OnDestroy, OnInit, effect, signal, inject, untracked } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LessonAudioService } from './lesson-audio.service';
import { LessonNavigationStore } from './lesson-navigation.store';
import { LessonSessionStore } from './lesson-session.store';
import { PlayerSidebarComponent } from './components/player-sidebar.component';
import { LessonViewComponent } from './components/lesson-view.component';
import { IntroViewComponent } from './components/intro-view.component';
import { QuizViewComponent } from './components/quiz-view.component';
import { UnitLockedViewComponent } from './components/unit-locked-view.component';

/** Contenedor del reproductor: carga el curso y coordina el índice del curso con la lección actual. */
@Component({
  selector: 'app-story-player',
  standalone: true,
  imports: [TranslatePipe, PlayerSidebarComponent, LessonViewComponent, IntroViewComponent, QuizViewComponent, UnitLockedViewComponent],
  providers: [LessonNavigationStore, LessonSessionStore, LessonAudioService],
  templateUrl: './story-player.component.html',
  styleUrl: './story-player.component.scss'
})
export class StoryPlayerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  nav = inject(LessonNavigationStore);
  indexOpen=signal(false);
  private session = inject(LessonSessionStore);
  private audio = inject(LessonAudioService);

  constructor() {
    // Cada vez que cambia la historia seleccionada (índice o fin de lección) se carga su lección.
    effect(() => {
      const storyId = this.nav.currentStoryId();
      if (storyId) untracked(() => this.session.load(storyId));
      else untracked(() => this.audio.stop());
    });
  }

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }
    this.route.params.subscribe(params => {
      const story = Number(this.route.snapshot?.queryParamMap?.get('story'));
      const focusComments = this.route.snapshot?.queryParamMap?.get('focus') === 'comments';
      this.nav.load(+params['courseId'], Number.isInteger(story) && story > 0 ? story : null, focusComments);
    });
  }

  ngOnDestroy(): void {
    this.audio.stop();
  }
}
