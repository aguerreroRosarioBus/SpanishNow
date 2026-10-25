import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalFocusDirective } from './modal-focus.directive';
@Component({standalone:true,imports:[ModalFocusDirective],template:`<button id="opener" (click)="open.set(true)">Abrir</button>@if(open()){<section tabindex="-1" appModalFocus (modalDismiss)="open.set(false)"><input id="first"><button id="last">Cerrar</button></section>}`})
class Host {open=signal(false);}
describe('Ventana con teclado',()=>{
 it('enfoca dentro, contiene Tab/Shift+Tab y restaura el foco al cerrar con Escape',async()=>{
   vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:20,height:20}] as unknown as DOMRectList);
   const f=TestBed.createComponent(Host);f.detectChanges();const opener=f.nativeElement.querySelector('#opener') as HTMLButtonElement;opener.focus();opener.click();f.detectChanges();await f.whenStable();
   expect(document.activeElement?.id).toBe('first');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true}));expect(document.activeElement?.id).toBe('last');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',cancelable:true}));expect(document.activeElement?.id).toBe('first');
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));f.detectChanges();expect(f.componentInstance.open()).toBe(false);expect(document.activeElement).toBe(opener);vi.restoreAllMocks();
 });
});
