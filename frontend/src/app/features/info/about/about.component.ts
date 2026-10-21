import { Component } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {
  readonly features = [
    { icon: 'book-open', title: 'Historias interactivas', text: 'Aprende a través de historias atractivas en diferentes niveles.' },
    { icon: 'headphones', title: 'Audio nativo', text: 'Escucha pronunciación auténtica a diferentes velocidades.' },
    { icon: 'circle-check', title: 'Actividades', text: 'Refuerza lo aprendido con ejercicios interactivos.' },
    { icon: 'bar-chart', title: 'Seguimiento', text: 'Monitorea tu progreso y logros.' }
  ];
}
