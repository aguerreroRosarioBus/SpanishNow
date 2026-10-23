import {TestBed} from '@angular/core/testing';
import {provideRouter,ActivatedRoute,convertToParamMap} from '@angular/router';
import {of} from 'rxjs';
import {PurchasesComponent} from './purchases.component';
import {PackagesService} from './packages.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
const base={id:3,offerId:10,buyerId:4,teacherId:2,version:1,status:'active',expiresAt:'2026-12-05T00:00:00Z',paidAt:'2026-10-23T00:00:00Z',pausedAt:null,pauseCount:0,minutesPerSession:50,seatsCovered:1,balance:{granted:4,available:4,reserved:0,consumed:0,expired:0,refunded:0}};
const snap={nameEn:'Four sessions',nameEs:'Cuatro sesiones',sessionsCount:4,validityHours:2160,templateVersion:1,policyVersion:1,policy:{maxPauses:1,refundWindowHours:360,refundMode:'x'}};
function render(snapshot:object){
  TestBed.configureTestingModule({imports:[PurchasesComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},
    {provide:ActivatedRoute,useValue:{snapshot:{data:{teacher:false}},paramMap:of(convertToParamMap({}))}},
    {provide:AuthService,useValue:{currentUser:()=>({id:4})}},
    {provide:PackagesService,useValue:{purchases:()=>of([{...base,snapshot}]),error:()=> 'Error'}}]});
  TestBed.inject(I18nService).setLocale('es');
  const f=TestBed.createComponent(PurchasesComponent);f.detectChanges();return f.nativeElement.textContent as string;
}
describe('Saldo de clases: nombre de la docente',()=>{
  it('muestra el nombre real de la docente',()=>{expect(render({...snap,teacherName:'Solange'})).toContain('Docente: Solange');});
  it('si el snapshot no trae teacherName no imprime undefined ni la etiqueta',()=>{
    const text=render(snap);expect(text).not.toContain('undefined');expect(text).not.toContain('Docente:');expect(text).toContain('Cuatro sesiones');
  });
});
