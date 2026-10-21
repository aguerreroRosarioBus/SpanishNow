import { Component, OnInit, inject } from '@angular/core';
import { MaterialsListComponent } from '../../../../shared/components/materials-list/materials-list.component';
import { VideoEmbedComponent } from '../../../../shared/components/video-embed/video-embed.component';
import { LessonNavigationStore } from '../lesson-navigation.store';

/** Primer ítem del curso: video de bienvenida y materiales generales. */
@Component({
  selector: 'app-intro-view',
  standalone: true,
  imports: [VideoEmbedComponent, MaterialsListComponent],
  template: `
    <article class="lesson-card">
      <header class="lesson-head">
        <span class="lesson-head__meta">Bienvenida</span>
        <h1 class="lesson-head__title">{{ nav.course()?.title }}</h1>
      </header>
      <app-video-embed [url]="nav.course()?.introVideoUrl" title="Video de bienvenida" />
      <footer class="lesson-foot">
        <span></span>
        <button type="button" class="btn btn-primary btn-lg" (click)="start()" [disabled]="!nav.canGoNext()">Empezar el curso</button>
      </footer>
    </article>
    <app-materials-list [materials]="nav.course()?.materials" heading="Materiales del curso" />
  `,
  styleUrl: './lesson-view.component.scss'
})
export class IntroViewComponent implements OnInit {
  nav = inject(LessonNavigationStore);

  ngOnInit(): void { this.nav.markIntroSeen(); }

  start(): void { this.nav.goToNext(); }
}
