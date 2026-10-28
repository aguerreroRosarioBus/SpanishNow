import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { ClassCohort, ClassOffer, ClassSettings, PackageTemplate, ClassOrder, CheckoutState, ClassPurchase, RefundPreview, PaymentJob, ClassProviderState, ProviderVerifyBody } from './packages.model';
@Injectable({providedIn:'root'})
export class PackagesService {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private base = environment.apiUrl;
  refundPreview(id:number,type='voluntary'){return this.http.get<RefundPreview>(`${this.base}/me/class-packages/${id}/refund-preview`,{params:{type}});}
  requestRefund(id:number,body:unknown,key:string){return this.http.post<RefundPreview>(`${this.base}/me/class-packages/${id}/refund-requests`,body,{headers:{'Idempotency-Key':key}});}
  refundRequests(){return this.http.get<RefundPreview[]>(`${this.base}/admin/class-refund-requests`);}
  reviewRefund(id:number,body:unknown){return this.http.post<RefundPreview>(`${this.base}/admin/class-refund-requests/${id}/review`,body);}
  paymentList(status:string){return this.http.get<{items:ClassOrder[];events:{id:number;orderId:number|null;eventType:string;createdAt:string}[]}>(`${this.base}/admin/class-payments`,{params:{status}});}
  resolvePayment(id:number,action:string,reason:string,refundedAmount?:number){return this.http.post<{manualRequired?:boolean}>(`${this.base}/admin/class-payments/${id}/resolve`,{action,reason,...(refundedAmount!=null?{refundedAmount}:{})});}
  providerState(){return this.http.get<ClassProviderState>(`${this.base}/admin/class-provider`);}
  verifyProvider(body:ProviderVerifyBody){return this.http.post(`${this.base}/admin/class-provider/verify`,body);}
  revokeProvider(reason:string){return this.http.post(`${this.base}/admin/class-provider/revoke`,{reason});}
  paymentJobs(){return this.http.get<PaymentJob[]>(`${this.base}/admin/class-payment-jobs`);}
  acknowledgePaymentJob(id:number,reason:string){return this.http.post(`${this.base}/admin/class-payment-jobs/${id}/acknowledge`,{reason});}
  verifyRefundDeadline(id:number,deadline:string,reason:string){return this.http.post(`${this.base}/admin/class-purchases/${id}/refund-deadline`,{deadline,reason});}
  retryPaymentJob(id:number,reason:string){return this.http.post(`${this.base}/admin/class-payment-jobs/${id}/retry`,{reason});}
  fakeRefundComplete(orderId:number){return this.http.post(`${this.base}/admin/class-payments/${orderId}/fake-refund-complete`,{});}
  teachers(){return this.http.get<{id:number;name:string;settings:ClassSettings|null}[]>(`${this.base}/admin/class-teachers`);}
  enableTeacher(id:number,enabled:boolean){return this.http.patch(`${this.base}/admin/class-teachers/${id}`,{enabled});}
  policies(){return this.http.get<{version:number;rules:Record<string,unknown>}[]>(`${this.base}/admin/class-policies`);}
  createPolicy(body:unknown){return this.http.post(`${this.base}/admin/class-policies`,body);}
  adjustmentPurchase(id:number){return this.http.get<ClassPurchase>(`${this.base}/admin/class-purchases/${id}`);}
  adjustPurchase(id:number,body:unknown,key:string){return this.http.post<ClassPurchase>(`${this.base}/admin/class-purchases/${id}/adjustments`,body,{headers:{'Idempotency-Key':key}});}
  groups(){return this.http.get<ClassCohort[]>(`${this.base}/teacher/class-cohorts`);}
  createGroup(body:unknown){return this.http.post<ClassCohort>(`${this.base}/teacher/class-cohorts`,body);}
  checkout(id:number,key:string,body:unknown) {return this.http.post<{order:ClassOrder;checkoutUrl:string|null}>(`${this.base}/class-offers/${id}/checkout`,body,{headers:{'Idempotency-Key':key}});}
  checkoutState(id:number) {return this.http.get<CheckoutState>(`${this.base}/class-offers/${id}/checkout`);}
  fakeComplete(id:number) {return this.http.post<CheckoutState>(`${this.base}/class-offers/${id}/checkout/fake-complete`,{});}
  cancelOffer(id:number,reason:string) {return this.http.post<ClassOffer>(`${this.base}/class-offers/${id}/cancel`,{reason});}
  replaceOffer(id:number,body:unknown,key:string) {return this.http.post<ClassOffer>(`${this.base}/class-offers/${id}/replace`,body,{headers:{'Idempotency-Key':key}});}
  purchases(teacher=false) {return this.http.get<ClassPurchase[]>(`${this.base}/${teacher?'teacher/class-purchases':'me/class-packages'}`);}
  purchase(id:number) {return this.http.get<ClassPurchase>(`${this.base}/me/class-packages/${id}`);}
  changePurchase(p:ClassPurchase,action:string,reason?:string) {return this.http.post<ClassPurchase>(`${this.base}/me/class-packages/${p.id}/${action}`,{version:p.version,...(reason?{reason}:{})});}
  group(id:number) { return this.http.get<ClassCohort>(`${this.base}/class-cohorts/${id}`); }
  respondGroup(id:number,accepted:boolean) { return this.http.post<ClassCohort>(`${this.base}/class-cohorts/${id}/invitation/${accepted?'accept':'decline'}`,{}); }
  offer(id: number) { return this.http.get<ClassOffer>(`${this.base}/class-offers/${id}`); }
  sendOffer(conversationId: number, body: { templateVersionId: number; cohortId?: number; beneficiaryIds?: number[] }, key: string) {
    return this.http.post<ClassOffer>(`${this.base}/conversations/${conversationId}/offers`,body,{headers:{'Idempotency-Key':key}});
  }
  list() { return this.http.get<PackageTemplate[]>(`${this.base}/teacher/class-packages`); }
  detail(id: number) { return this.http.get<PackageTemplate>(`${this.base}/teacher/class-packages/${id}`); }
  importInitial() { return this.http.post<PackageTemplate[]>(`${this.base}/teacher/class-packages/import-initial`, {}); }
  settings() { return this.http.get<ClassSettings>(`${this.base}/teacher/class-settings`); }
  pause(salesPaused: boolean) { return this.http.patch<ClassSettings>(`${this.base}/teacher/class-settings`, {salesPaused}); }
  create(body: unknown) { return this.http.post<PackageTemplate>(`${this.base}/teacher/class-packages`, body); }
  save(id: number, body: unknown) { return this.http.post<PackageTemplate>(`${this.base}/teacher/class-packages/${id}/versions`, body); }
  status(id: number, status: string, version: number) { return this.http.patch<PackageTemplate>(`${this.base}/teacher/class-packages/${id}/status`, {status, version}); }
  error(error: unknown) {
    const code = (error as {error?:{code?:string}})?.error?.code;
    if(code && this.i18n.has(`packages.errors.${code}`)) return this.i18n.t(`packages.errors.${code}`);
    return code && this.i18n.has(`legal.errors.${code}`) ? this.i18n.t(`legal.errors.${code}`) : this.i18n.errorMessage(error);
  }
}
