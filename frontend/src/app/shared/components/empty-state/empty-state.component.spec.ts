import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';
import { SectionHeaderComponent } from '../section-header/section-header.component';
import { TabBarComponent } from '../tab-bar/tab-bar.component';

@Component({
  standalone: true,
  imports: [EmptyStateComponent, SectionHeaderComponent, TabBarComponent],
  template: `
    <app-empty-state icon="users" title="Sin datos" hint="Nada por ahora"><button type="button" id="cta">Crear</button></app-empty-state>
    <app-empty-state title="Solo título" />
    <app-section-header titleId="t1" title="Pagos" description="Revisá los pagos" />
    <app-tab-bar [items]="items" [active]="active" label="Secciones" (selected)="picked = $event" />`
})
class Host { items = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]; active = 'a'; picked = ''; }

describe('componentes compartidos de sección', () => {
  it('renderiza estado vacío, encabezado y pestañas', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const empties = el.querySelectorAll('app-empty-state');
    expect(empties[0].querySelector('strong')!.textContent).toBe('Sin datos');
    expect(empties[0].querySelector('.empty-state__hint')!.textContent).toBe('Nada por ahora');
    expect(empties[0].querySelector('#cta')).toBeTruthy();
    expect(empties[1].querySelector('.empty-state__hint')).toBeNull();
    expect(el.querySelector('h2#t1')!.textContent).toBe('Pagos');
    const tabs = el.querySelectorAll<HTMLButtonElement>('app-tab-bar button');
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
    tabs[1].click();
    expect(f.componentInstance.picked).toBe('b');
  });
});
