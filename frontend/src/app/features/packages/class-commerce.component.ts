import { IconComponent } from '../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header.component';
import { TabBarComponent } from '../../shared/components/tab-bar/tab-bar.component';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, forkJoin, Observable } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ChatFormat } from '../chat/chat-format';
import { HotmartGuideImageComponent } from '../teacher/course-manage/components/hotmart-guide-image.component';
import { PackageCatalogComponent } from './package-catalog.component';
import { ClassHotmartSetup, ClassSale, PackageTemplate } from './packages.model';
import { PackagesService } from './packages.service';
import { ToastService } from '../../core/services/toast.service';

type Tab = 'setup' | 'packages' | 'sales';
type Step = 'home' | 'key' | 'address' | 'test' | 'events' | 'package' | 'preview';
const codePattern = /^[A-Za-z0-9-]{1,40}$/;

@Component({
  selector: 'app-class-commerce',
  imports: [IconComponent, EmptyStateComponent, SectionHeaderComponent, TabBarComponent, FormsModule, RouterLink, TranslatePipe, HotmartGuideImageComponent, PackageCatalogComponent],
  templateUrl: './class-commerce.component.html',
  styleUrl: './class-commerce.component.scss',
})
export class ClassCommerceComponent {
  private readonly api = inject(PackagesService);
  private readonly destroy = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(I18nService);
  readonly fmt = inject(ChatFormat);
  readonly tabs = ['setup', 'packages', 'sales'] as const;
  readonly tab = signal<Tab>('setup');
  readonly tabItems = computed(() => this.tabs.map(id => ({ id, label: this.i18n.t('packages.commerce.tab.' + id) })));
  readonly step = signal<Step>('home');
  readonly setup = signal<ClassHotmartSetup | null>(null);
  readonly items = signal<PackageTemplate[]>([]);
  readonly busy = signal(false);
  readonly key = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly url = signal('');
  readonly checkoutOpened = signal(false);
  readonly priceConfirmed = signal(false);
  readonly productId = signal('');
  readonly offerCode = signal('');
  readonly sales = signal<ClassSale[] | null>(null);
  readonly nextSale = signal<number | null>(null);
  readonly products = computed(() => this.items().filter(item => item.current && item.status !== 'archived'));
  readonly selected = computed(() => this.products().find(item => item.id === this.selectedId()));
  readonly mapped = computed(() => this.products().filter(({ current }) =>
    current?.hotmartCheckoutUrl && current.hotmartProductId && current.hotmartOfferCode));
  readonly approval = computed(() => {
    const mode = this.setup()?.approval;
    return mode === 'connected' || mode === 'shared';
  });
  readonly reviewed = computed(() => {
    const ids = this.setup()?.approvedPackageIds;
    return ids ? this.mapped().filter(item => ids.includes(item.id)) : this.mapped();
  });
  // La aprobación es por cuenta: con la cuenta aprobada los paquetes nuevos no esperan otra revisión.
  readonly packageReviewPending = computed(() => !this.approval() && this.mapped().length > 0);
  readonly ready = computed(() => this.approval() && this.setup()?.classesEnabled && !this.setup()?.salesPaused
    && this.reviewed().some(item => item.status === 'active'));
  readonly setupState = computed(() => {
    const setup = this.setup();
    if (setup?.approval === 'fake') return 'practice';
    if (this.ready()) return 'ready';
    if (setup?.approval === 'changed') return 'changed';
    if (setup?.pending && !setup.verifiedAt) return 'continue';
    if (!this.approval() && this.mapped().length && setup?.verifiedAt) return 'review';
    if (this.approval() && !setup?.classesEnabled) return 'disabled';
    if (this.approval() && this.reviewed().some(item => item.status === 'active') && setup?.salesPaused) return 'paused';
    if (this.approval() && this.reviewed().length) return 'publish';
    if (this.packageReviewPending()) return 'review';
    if (this.approval() || setup?.verifiedAt) return 'prepare';
    return 'start';
  });

  readonly checkout = computed(() => {
    try {
      const url = new URL(this.url().trim());
      if (url.origin === 'https://pay.hotmart.com' && !url.username && !url.password && !url.hash
        && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname) && this.url().trim().length <= 500) return url;
    } catch { /* El enlace se valida antes de mostrar la vista previa. */ }
    return null;
  });
  readonly linkHasOffer = computed(() => Boolean(this.checkout()?.searchParams.has('off')));
  readonly offer = computed(() => {
    const values = this.checkout()?.searchParams.getAll('off') ?? [];
    return values.length === 1 ? values[0] : values.length ? '' : this.offerCode().trim();
  });
  readonly checkoutPreview = computed(() => {
    const url = this.checkout();
    const offer = this.offer();
    if (!url || !codePattern.test(offer) || !codePattern.test(this.productId().trim())) return null;
    const preview = new URL(url.pathname, url.origin);
    preview.searchParams.set('off', offer);
    return preview.toString();
  });

  /** Si la persona eligió la pestaña a mano (o vino en la URL), no se la cambia al recargar el estado. */
  private tabPinned = false;
  private tabApplied = false;
  /** Paquete que viene en la URL para vincularlo con Hotmart (`?package=`). */
  private readonly packageParam = Number(this.route.snapshot.queryParamMap.get('package')) || null;

  constructor() {
    const requested = this.route.snapshot.queryParamMap.get('tab');
    if (requested && (this.tabs as readonly string[]).includes(requested)) {
      this.tab.set(requested as Tab);
      this.tabPinned = true;
    }
    this.load();
  }

  /** Con la venta habilitada y nada pendiente de configurar, lo útil es ver los paquetes. */
  private defaultTab(): Tab {
    return ['ready', 'paused', 'publish'].includes(this.setupState()) ? 'packages' : 'setup';
  }

  /** Desde la lista de paquetes: abre el paso de vincular con Hotmart con ese paquete elegido. */
  linkPackage(id: number) {
    this.tabPinned = true;
    this.tab.set('setup');
    this.start();
    if (this.step() === 'package') this.selectPackage(id);
  }

  private applyInitialState() {
    if (this.tabApplied) return;
    this.tabApplied = true;
    if (!this.tabPinned) this.tab.set(this.defaultTab());
    if (this.tab() === 'sales') Promise.resolve().then(() => this.loadSales());
    if (this.packageParam && this.tab() === 'setup') {
      this.start();
      const target = this.products().find(item => item.id === this.packageParam);
      if (target && this.step() === 'package') this.selectPackage(target.id);
    }
  }

  private run<T>(request: Observable<T>, done: (value: T) => void, failed?: (error: unknown) => string) {
    if (this.busy()) return;
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: done,
      error: error => this.toast.error(failed?.(error) ?? this.api.error(error)),
    });
  }

  load() {
    this.run(forkJoin({setup:this.api.hotmartSetup(), items:this.api.list()}), ({ setup, items }) => {
      this.setup.set(setup);
      this.items.set(items);
      this.applyInitialState();
    });
  }

  chooseTab(tab: Tab) {
    if (this.busy()) return;
    this.tabPinned = true;
    this.tab.set(tab);
    if (tab === 'setup') this.load();
    if (tab === 'sales') this.loadSales();
  }

  go(step: Step) {
    if (step !== 'key') this.key.set('');
    if (step !== 'preview') this.resetConfirmation();
    this.step.set(step);
  }

  start() {
    const setup = this.setup();
    if (this.approval() || setup?.approval === 'fake' || this.mapped().length && setup?.verifiedAt && !setup.pending) {
      this.go('package');
    } else if (setup?.pending) {
      this.go('address');
    } else if (setup?.verifiedAt) {
      this.go('events');
    } else {
      this.go('key');
    }
  }

  saveKey() {
    const key = this.key().trim();
    if (!key) return;
    this.run(this.api.saveHotmartKey(key), setup => {
      this.setup.set(setup);
      this.key.set('');
      this.go('address');
    }, error => (error as {error?:{code?:string}})?.error?.code === 'hotmart_hottok_invalid'
      ? this.i18n.t('teacherManage.courseEdit.hotmartKeyInvalid')
      : this.i18n.t('teacherManage.courseEdit.hotmartKeyError'));
  }

  async copyAddress(input: HTMLInputElement) {
    try {
      await navigator.clipboard.writeText(input.value);
      this.toast.success(this.i18n.t('teacherManage.courseEdit.copied'));
    } catch {
      input.focus();
      input.select();
      this.toast.error(this.i18n.t('teacherManage.courseEdit.copyError'));
    }
  }

  checkTest() {
    this.run(this.api.hotmartSetup(), setup => {
      this.setup.set(setup);
      if (setup.verifiedAt && !setup.pending) this.go('events');
      else this.toast.info(this.i18n.t('packages.commerce.testWaiting'));
    });
  }

  selectPackage(id: number | null) {
    this.selectedId.set(id);
    const current = this.selected()?.current;
    this.url.set(current?.hotmartCheckoutUrl ?? '');
    this.productId.set(current?.hotmartProductId ?? '');
    this.offerCode.set(current?.hotmartOfferCode ?? '');
    this.resetConfirmation();
  }

  private resetConfirmation() {
    this.checkoutOpened.set(false);
    this.priceConfirmed.set(false);
  }

  setLink(value: string) {
    if (value !== this.url()) this.offerCode.set('');
    this.resetConfirmation();
    this.url.set(value);
  }

  name(item: PackageTemplate) {
    return this.i18n.locale() === 'es' ? item.current?.nameEs : item.current?.nameEn;
  }

  savePackage() {
    const item = this.selected();
    if (!item?.current || !this.checkoutPreview() || !this.checkoutOpened() || !this.priceConfirmed()) return;
    this.run(this.api.linkHotmart(item.id, {version:item.current.version,url:this.url().trim(),
      productId:this.productId().trim(),offerCode:this.offer()}), updated => {
      // Con la cuenta aprobada, el paquete vinculado queda aprobado sin otra revisión.
      if (this.setup()?.approval === 'connected') {
        this.setup.update(setup => setup && {...setup,approvedPackageIds:setup.approvedPackageIds
          ? [...new Set([...setup.approvedPackageIds,item.id])] : setup.approvedPackageIds});
      }
      this.items.update(items => items.map(item => item.id === updated.id ? updated : item));
      this.selectPackage(updated.id);
      this.go('home');
      this.toast.success(this.i18n.t('packages.commerce.packageSaved'));
    });
  }

  resume() {
    this.run(this.api.pause(false), settings => {
      this.setup.update(value => value && {...value,salesPaused:Boolean(settings.salesPausedAt)});
    });
  }

  loadSales(before?: number) {
    this.run(this.api.classSales(before), page => {
      this.sales.update(current => before ? [...(current ?? []), ...page.items] : page.items);
      this.nextSale.set(page.next);
    });
  }
}
