import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {
  readonly features = [
    { icon: 'book-open', title: 'info.storiesTitle', text: 'info.stories' },
    { icon: 'headphones', title: 'info.audioTitle', text: 'info.audio' },
    { icon: 'circle-check', title: 'info.activitiesTitle', text: 'info.activities' },
    { icon: 'bar-chart', title: 'info.progressTitle', text: 'info.progress' }
  ];
}
