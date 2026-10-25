import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { I18nService } from '../../core/i18n/i18n.service';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalFocusDirective } from './modal-focus.directive';
@Component({standalone:true,imports:[ModalFocusDirective,ReactiveFormsModule],template:`<button id="opener" (click)="open.set(true)">Abrir</button>@if(open()){<section tabindex="-1" appModalFocus (modalDismiss)="open.set(false)"><form [formGroup]="form"><input id="first" formControlName="value"><button id="last" type="button" (click)="open.set(false)">Cerrar</button></form></section>}`})
class Host {open=signal(false);form=new FormGroup({value:new FormControl('')});}
describe('Ventana con teclado',()=>{
 it('enfoca dentro, contiene Tab/Shift+Tab y restaura el foco al cerrar con Escape',async()=>{
   vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:20,height:20}] as unknown as DOMRectList);
   const f=TestBed.createComponent(Host);f.detectChanges();const opener=f.nativeElement.querySelector('#opener') as HTMLButtonElement;opener.focus();opener.click();f.detectChanges();await f.whenStable();
   expect(document.activeElement?.id).toBe('first');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true}));expect(document.activeElement?.id).toBe('last');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',cancelable:true}));expect(document.activeElement?.id).toBe('first');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));f.detectChanges();expect(f.componentInstance.open()).toBe(false);expect(document.activeElement).toBe(opener);vi.restoreAllMocks();
 });
 it('Escape conserva un borrador editado y traduce el aviso sin perder el texto',async()=>{
   const f=TestBed.createComponent(Host);TestBed.inject(I18nService).setLocale('en');f.componentInstance.open.set(true);f.detectChanges();await f.whenStable();
   const input=f.nativeElement.querySelector('#first') as HTMLInputElement;input.value='Título sin guardar';input.dispatchEvent(new Event('input'));f.detectChanges();expect(f.componentInstance.form.dirty).toBe(true);
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));f.detectChanges();expect(f.componentInstance.open()).toBe(true);expect(input.value).toBe('Título sin guardar');expect(f.nativeElement.querySelector('[role=alert]')?.textContent).toContain('unsaved changes');
   TestBed.inject(I18nService).setLocale('es');f.detectChanges();await f.whenStable();expect(f.nativeElement.querySelector('[role=alert]')?.textContent).toContain('cambios sin guardar');
   (f.nativeElement.querySelector('#last') as HTMLButtonElement).click();f.detectChanges();expect(f.componentInstance.open()).toBe(false);localStorage.removeItem('spanishnow.locale');
 });

});
