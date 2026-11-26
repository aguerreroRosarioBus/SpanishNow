import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, Observable } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ChatFormat } from '../chat/chat-format';
import { HotmartGuideImageComponent } from '../teacher/course-manage/components/hotmart-guide-image.component';
import { PackageCatalogComponent } from './package-catalog.component';
import { ClassHotmartSetup, ClassSale, PackageTemplate } from './packages.model';
import { PackagesService } from './packages.service';

type Tab = 'setup' | 'packages' | 'sales';
type Step = 'home' | 'key' | 'address' | 'test' | 'events' | 'package' | 'preview';
const codePattern = /^[A-Za-z0-9-]{1,40}$/;

@Component({
  selector: 'app-class-commerce',
  imports: [FormsModule, RouterLink, TranslatePipe, HotmartGuideImageComponent, PackageCatalogComponent],
  templateUrl: './class-commerce.component.html',
  styleUrl: './class-commerce.component.scss',
})
export class ClassCommerceComponent {
  private readonly api = inject(PackagesService);
  private readonly destroy = inject(DestroyRef);
  readonly i18n = inject(I18nService);
  readonly fmt = inject(ChatFormat);
  readonly tabs = ['setup', 'packages', 'sales'] as const;
  readonly tab = signal<Tab>('setup');
  readonly step = signal<Step>('home');
  readonly setup = signal<ClassHotmartSetup | null>(null);
  readonly items = signal<PackageTemplate[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
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

  constructor() { this.load(); }

  private run<T>(request: Observable<T>, done: (value: T) => void, failed?: (error: unknown) => string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');
    request.pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: done,
      error: error => this.error.set(failed?.(error) ?? this.api.error(error)),
    });
  }

  load() {
    this.run(forkJoin({setup:this.api.hotmartSetup(), items:this.api.list()}), ({ setup, items }) => {
      this.setup.set(setup);
      this.items.set(items);
    });
  }

  chooseTab(tab: Tab) {
    if (this.busy()) return;
    this.tab.set(tab);
    this.error.set('');
    this.feedback.set('');
    if (tab === 'setup') this.load();
    if (tab === 'sales') this.loadSales();
  }

  go(step: Step) {
    if (step !== 'key') this.key.set('');
    this.error.set('');
    this.feedback.set('');
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
      this.feedback.set('teacherManage.courseEdit.copied');
    } catch {
      input.focus();
      input.select();
      this.feedback.set('teacherManage.courseEdit.copyError');
    }
  }

  checkTest() {
    this.run(this.api.hotmartSetup(), setup => {
      this.setup.set(setup);
      if (setup.verifiedAt && !setup.pending) this.go('events');
      else this.feedback.set('packages.commerce.testWaiting');
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
      this.feedback.set('packages.commerce.packageSaved');
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
