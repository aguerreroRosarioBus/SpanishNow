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
