import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OfferCreateComponent } from './offer-create.component';
import { OfferDetailComponent } from './offer-detail.component';
import { PackagesService } from './packages.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatFormat } from '../chat/chat-format';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { PACKAGE_MESSAGES } from './packages.i18n';
const current={id:33,version:3,nameEn:'Four sessions',nameEs:'Cuatro sesiones',priceAmount:9000,currency:'USD',sessionsCount:4,minutesPerSession:50,seatsCovered:1,validityHours:2160,modality:'individual',expectations:{en:{audience:'<script>hi</script>'},es:{audience:'Texto español'}}};
const offer={id:10,conversationId:9,amount:9000,currency:'USD',sessionsCount:4,minutesPerSession:50,seatsCovered:1,status:'sent',expiresAt:'2026-11-05T00:00:00Z',snapshot:{...current,teacherName:'Docente ficticio',templateVersion:3,policyVersion:1,policy:{freeCancelHours:24,maxPauseHours:720,maxPauses:1},legalDocuments:[]}};
describe('W05 ofertas UI',()=>{
  it('preview muestra destinatario, precio y términos; reintento conserva clave y nueva selección la cambia',()=>{
    const send=vi.fn().mockReturnValue(throwError(()=>new Error('network')));
    TestBed.configureTestingModule({imports:[OfferCreateComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({conversationId:'9'})}}},{provide:ChatService,useValue:{get:()=>of({counterpart:{name:'Alumno ficticio'}})}},{provide:PackagesService,useValue:{list:()=>of([{id:2,status:'active',current}]),sendOffer:send,error:()=> 'Error'}}]});
    const f=TestBed.createComponent(OfferCreateComponent);f.detectChanges();const c=f.componentInstance;c.select(2);f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Alumno ficticio');expect(f.nativeElement.textContent).toContain('USD');expect(f.nativeElement.querySelector('script')).toBeNull();
    c.send();c.send();expect(send.mock.calls[0][2]).toBe(send.mock.calls[1][2]);expect(send.mock.calls[0][1]).toEqual({templateVersionId:33});
    c.select(2);c.send();expect(send.mock.calls[2][2]).not.toBe(send.mock.calls[0][2]);
  });
  it('detalle usa snapshot; idioma no vuelve al catálogo ni altera dinero',()=>{
    const get=vi.fn(()=>of(offer));
    TestBed.configureTestingModule({imports:[OfferDetailComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:'10'}))}},{provide:ChatFormat,useValue:{timeZone:()=> 'America/Argentina/Cordoba'}},{provide:PackagesService,useValue:{offer:get,error:()=> 'Error'}}]});
    const f=TestBed.createComponent(OfferDetailComponent);f.detectChanges();const c=f.componentInstance;const before=c.offer();TestBed.inject(I18nService).setLocale('es');f.detectChanges();
    expect(c.name()).toBe('Cuatro sesiones');expect(c.offer()).toBe(before);expect(c.offer()!.amount).toBe(9000);expect(get).toHaveBeenCalledTimes(1);expect(f.nativeElement.textContent).toContain('America/Argentina/Cordoba');
  });
});
describe('Tanda B: ofertas con plantillas sin versión',()=>{
  const setup=(items:unknown[],send=vi.fn(()=>of({id:77})))=>{
    TestBed.configureTestingModule({imports:[OfferCreateComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({conversationId:'9'})}}},{provide:ChatService,useValue:{get:()=>of({counterpart:{id:5,name:'Alumno ficticio'}})}},{provide:PackagesService,useValue:{list:()=>of(items),sendOffer:send,error:()=> 'Error'}}]});
    TestBed.inject(I18nService).setLocale('es');
    const f=TestBed.createComponent(OfferCreateComponent);f.detectChanges();return {f,c:f.componentInstance,send};
  };
  it('una plantilla con current null no rompe el selector, avisa qué falta y enlaza al catálogo',()=>{
    const {f,c}=setup([{id:1,status:'active',templateKey:'individual-1x30',current:null},{id:2,status:'draft',templateKey:'individual-4x50',current:null}]);
    expect(c.items()).toEqual([]);expect(c.incomplete()).toBe(2);
    const text=f.nativeElement.textContent as string;
    expect(text).toContain('Paquetes sin versión: 2');
    expect(f.nativeElement.querySelector('a[href="/teacher/class-packages"]')).toBeTruthy();
  });
  it('Tanda C: sin paquete disponible muestra un estado vacío con el requisito, el enlace al catálogo y cómo volver a revisar o a la conversación',()=>{
    const {f}=setup([]);
    const empty=f.nativeElement.querySelector('[data-testid="offer-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();expect(empty.textContent).toContain('No tenés ningún paquete disponible');
    expect(empty.querySelector('a[href="/teacher/class-packages"]')).toBeTruthy();
    expect(empty.querySelector('a[href="/messages/9"]')).toBeTruthy();
    expect(Array.from(empty.querySelectorAll('button')).some(b=>b.textContent!.includes('volver a revisar'))).toBe(true);
    expect(f.nativeElement.querySelector('#packageChoice')).toBeNull();
  });
  it('Tanda C: con paquetes disponibles no se muestra el estado vacío',()=>{
    const {f}=setup([{id:2,status:'active',templateKey:'individual-4x50',current}]);
    expect(f.nativeElement.querySelector('[data-testid="offer-empty"]')).toBeNull();expect(f.nativeElement.querySelector('#packageChoice')).toBeTruthy();
  });
  it('con un paquete individual activo con versión aparece en el selector aunque haya otro sin versión, y la oferta se envía (sandbox)',()=>{
    const {f,c,send}=setup([{id:1,status:'draft',templateKey:'individual-1x30',current:null},{id:2,status:'active',templateKey:'individual-4x50',current}]);
    expect(c.items().map(p=>p.id)).toEqual([2]);
    const options=Array.from<HTMLElement>(f.nativeElement.querySelectorAll('#packageChoice option')).map(o=>o.textContent!.trim());
    expect(options).toContain('Cuatro sesiones');
    c.select(2);f.detectChanges();expect(f.nativeElement.textContent).toContain('USD');
    const button=Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('button')).find(b=>b.textContent!.includes('Enviar esta oferta'));
    expect(button).toBeTruthy();c.send();
    expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0]).toEqual([9,{templateVersionId:33},expect.any(String)]);
  });
});
