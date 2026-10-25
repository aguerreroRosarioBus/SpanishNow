import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupsComponent } from './groups.component';
import { PackagesService } from './packages.service';
import { ChatService } from '../../core/services/chat.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
describe('Grupos: fecha local y selección completa',()=>{
 function setup(){const createGroup=vi.fn((..._args:unknown[])=>of({id:9}));TestBed.configureTestingModule({providers:[provideRouter([]),{provide:PackagesService,useValue:{list:()=>of([{id:1,status:'active',current:{id:11,modality:'group',groupSize:2,minutesPerSession:50}}]),groups:()=>of([]),createGroup,error:()=>''}},{provide:ChatService,useValue:{list:()=>of({items:[],nextCursor:null})}},{provide:UserPreferencesService,useValue:{preferences:signal({timeZone:'America/New_York'})}}]});vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);const c=TestBed.runInInjectionContext(()=>new GroupsComponent());c.ngOnInit();c.selectPackage(1);return{c,createGroup};}
 it('solo crea con todas las plazas e instante explícito de la zona elegida',()=>{const {c,createGroup}=setup();c.localStart.set('2026-11-14T14:00');c.toggle(3);c.create();expect(createGroup).not.toHaveBeenCalled();c.toggle(4);expect(c.canCreate()).toBe(true);c.create();expect(createGroup).toHaveBeenCalledWith({templateVersionId:11,tentativeStartsAt:'2026-11-14T19:00:00.000Z',invitedIds:[3,4]});});
 it('no permite crear en una hora ambigua hasta elegir una instancia',()=>{const {c,createGroup}=setup();c.toggle(3);c.toggle(4);c.localStart.set('2026-11-01T01:30');expect(c.canCreate()).toBe(false);c.create();expect(createGroup).not.toHaveBeenCalled();c.choose('-05:00',1);expect(c.canCreate()).toBe(true);c.create();expect(createGroup.mock.calls[0][0]).toMatchObject({tentativeStartsAt:'2026-11-01T06:30:00.000Z'});});
});
