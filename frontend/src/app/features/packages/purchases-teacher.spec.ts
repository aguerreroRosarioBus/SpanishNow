import {TestBed} from '@angular/core/testing';
import {provideRouter,ActivatedRoute,convertToParamMap} from '@angular/router';
import {of,throwError} from 'rxjs';
import {PurchasesComponent} from './purchases.component';
import {PackagesService} from './packages.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
import {ChatFormat} from '../chat/chat-format';
const base={id:3,offerId:10,buyerId:4,teacherId:2,version:1,status:'active',expiresAt:'2026-12-05T00:00:00Z',paidAt:'2026-10-23T00:00:00Z',pausedAt:null,pauseCount:0,minutesPerSession:50,seatsCovered:1,balance:{granted:4,available:4,reserved:0,consumed:0,expired:0,refunded:0}};
const snap={nameEn:'Four sessions',nameEs:'Cuatro sesiones',sessionsCount:4,validityHours:2160,templateVersion:1,policyVersion:1,policy:{maxPauses:1,refundWindowHours:360,refundMode:'x'}};
let last:HTMLElement;
function render(snapshot:object,opts:{teacher?:boolean;purchase?:object;fail?:boolean}={}){
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({imports:[PurchasesComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},
    {provide:ChatFormat,useValue:{timeZone:()=> 'America/Argentina/Cordoba'}},
    {provide:ActivatedRoute,useValue:{snapshot:{data:{teacher:opts.teacher===true}},paramMap:of(convertToParamMap({}))}},
    {provide:AuthService,useValue:{currentUser:()=>({id:4})}},
    {provide:PackagesService,useValue:{purchases:()=>opts.fail?throwError(()=>({status:500})):of([{...base,snapshot,...(opts.purchase??{})}]),error:()=> 'Error'}}]});
  TestBed.inject(I18nService).setLocale('es');
  const f=TestBed.createComponent(PurchasesComponent);f.detectChanges();last=f.nativeElement as HTMLElement;return last.textContent as string;
}
describe('Saldo de clases: nombre de la docente',()=>{
  it('muestra el nombre real de la docente',()=>{expect(render({...snap,teacherName:'Solange'})).toContain('Docente: Solange');});
  it('si el snapshot no trae teacherName no imprime undefined ni la etiqueta',()=>{
    const text=render(snap);expect(text).not.toContain('undefined');expect(text).not.toContain('Docente:');expect(text).toContain('Cuatro sesiones');
  });
});

const expiry='2027-01-21T19:43:00.000Z';
const balance={granted:4,available:3,reserved:0,consumed:1,expired:0,refunded:0};
describe('Saldo de clases: jerarquía de la tarjeta (#71)',()=>{
  it('vista docente: nombre de la alumna, estado como etiqueta y saldo destacado sin filas en cero',()=>{
    const text=render({...snap,teacherName:'Solange'},{teacher:true,purchase:{buyerName:'Lucía Fernández',expiresAt:expiry,balance}});
    expect(last.querySelector('.buyer')?.textContent).toContain('Lucía Fernández');
    expect(last.querySelector('.card-head .badge-status')?.textContent?.trim()).toBe('Activo');
    expect(last.querySelector('.balance-num')?.textContent).toBe('3');
    expect(text).toContain('disponibles de 4');
    expect(text).toContain('Utilizadas 1');expect(text).not.toContain('Reservadas');expect(text).not.toContain('Vencidas');expect(text).not.toContain('Reembolsadas');
    expect(text).not.toContain('Docente:');
    expect(last.querySelector('dl')).toBeNull();
  });
  it('sin nombre de la alumna no imprime undefined ni null',()=>{
    const text=render(snap,{teacher:true,purchase:{buyerName:null}});
    expect(text).not.toContain('undefined');expect(text).not.toContain('null');expect(last.querySelector('.buyer')).toBeNull();
  });
  it('el vencimiento es fecha compacta y, aparte, hora exacta con zona IANA y desplazamiento',()=>{
    const text=render(snap,{purchase:{expiresAt:expiry,balance}});
    expect(text).toContain('Vence el 21 ene 2027');
    expect(text).toContain('16:43 · America/Argentina/Cordoba · UTC-03:00');
    expect(text).not.toContain('Vigente hasta');
  });
  it('una compra vencida dice «Venció el»',()=>{
    expect(render(snap,{purchase:{status:'expired',expiresAt:expiry}})).toContain('Venció el 21 ene 2027');
  });
  it('la vigencia conserva las horas reales y agrega los días solo como ayuda',()=>{
    const text=render(snap,{purchase:{expiresAt:expiry,balance}});
    expect(text).toContain('4 clases × 50 min · plazas: 1 · vigencia: 2160 horas transcurridas desde el pago (equivale a 90 días de 24 h)');
    const odd=render({...snap,validityHours:100},{purchase:{expiresAt:expiry,balance}});
    expect(odd).toContain('vigencia: 100 horas transcurridas desde el pago');expect(odd).not.toContain('equivale');
  });
  it('una sola acción principal por tarjeta y «Actualizar estado» ya no está suelto',()=>{
    render(snap,{purchase:{expiresAt:expiry,balance}});
    expect(last.querySelectorAll('.btn-primary').length).toBe(1);
    expect(last.querySelector('.btn-primary')?.textContent?.trim()).toBe('Agendar una clase');
    expect(last.textContent).not.toContain('Actualizar estado');
  });
  it('alumna sin saldo: la acción principal es hablar con la docente; docente con saldo corto: enviar nueva oferta',()=>{
    render(snap,{purchase:{expiresAt:expiry,balance:{...balance,available:0,consumed:4},status:'exhausted'}});
    expect(last.querySelector('.btn-primary')?.textContent?.trim()).toBe('Abrir conversación privada');
    render(snap,{teacher:true,purchase:{expiresAt:expiry,balance:{...balance,available:1}}});
    expect(last.querySelector('.btn-primary')?.textContent?.trim()).toBe('Enviar nueva oferta');
    render(snap,{teacher:true,purchase:{expiresAt:'2030-01-01T00:00:00Z',balance}});
    expect(last.querySelector('.btn-primary')?.textContent?.trim()).toBe('Ver agenda');
  });
  it('«Reintentar» aparece solo junto a un error',()=>{
    render(snap,{purchase:{balance}});
    expect(last.textContent).not.toContain('Reintentar');
    render(snap,{fail:true});
    expect(last.querySelector('[role="alert"]')?.textContent).toContain('Reintentar');
  });
  it('las claves nuevas existen en es y en',()=>{
    const keys=Object.keys(PACKAGE_MESSAGES.es).filter(k=>/^packages\.purchase\.(expires|expiredOn|expiryExact|availableOf|conditions|conditionsDays|retry|scheduleStudent|scheduleTeacher|actionFor)$/.test(k));
    expect(keys.length).toBe(10);
    for(const k of keys)expect(PACKAGE_MESSAGES.en[k]).toBeDefined();
  });
});
