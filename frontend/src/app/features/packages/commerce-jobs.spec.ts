import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {of,throwError} from 'rxjs';
import {CommerceAdminComponent} from './commerce-admin.component';
import {PackagesService} from './packages.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
function render(paymentJobs:()=>unknown){
  TestBed.configureTestingModule({imports:[CommerceAdminComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},
    {provide:AuthService,useValue:{currentUser:()=>null,hasPermission:(k:string)=>k==='class_payments.review'}},
    {provide:PackagesService,useValue:{refundRequests:()=>of([]),paymentList:()=>of({items:[],events:[]}),paymentJobs,error:()=>''}}]});
  TestBed.inject(I18nService).setLocale('es');
  const f=TestBed.createComponent(CommerceAdminComponent);f.detectChanges();return f.nativeElement.textContent as string;
}
describe('Administración de clases: trámites del proveedor',()=>{
  it('sin trámites muestra un estado vacío bajo el título',()=>{
    const text=render(()=>of([]));expect(text).toContain('Trámites del proveedor y recuperación');expect(text).toContain('No hay trámites del proveedor');
  });
  it('si la carga falla muestra el error de la sección y no el vacío',()=>{
    const text=render(()=>throwError(()=>({status:500})));expect(text).toContain('No pudimos cargar los trámites');expect(text).not.toContain('No hay trámites del proveedor');
  });
});
