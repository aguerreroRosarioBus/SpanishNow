import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  HotmartService,
  HotmartSetup,
  TeacherHotmartConnection
} from '../../../../core/services/hotmart.service';

@Component({
  selector: 'app-teacher-hotmart-connection',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  host: { '(window:focus)': 'checkWhenReturning()' },
  templateUrl: './teacher-hotmart-connection.component.html'
})
export class TeacherHotmartConnectionComponent {
  private readonly api = inject(HotmartService);
  private readonly destroyRef = inject(DestroyRef);
  readonly connection = signal<TeacherHotmartConnection | null>(null);
  readonly legacy = signal<HotmartSetup | null>(null);
  readonly key = new FormControl('', { nonNullable: true });
  readonly changingKey = signal(false);
  readonly checking = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly copied = signal<'personal' | 'shared' | null>(null);
  readonly manualCopy = signal<'personal' | 'shared' | null>(null);
  readonly verified = computed(() => Boolean(this.connection()?.verifiedAt));
  readonly state = computed(() => {
    if (this.verified() && this.connection()?.pending) return 'teacherManage.courseEdit.hotmartReplacementPending';
    if (this.verified()) return 'teacherManage.courseEdit.hotmartVerified';
    return this.connection()?.pending ? 'teacherManage.courseEdit.hotmartWaiting' : 'teacherManage.courseEdit.hotmartNotConnected';
  });
  readonly hasHttps = computed(() => this.connection()?.webhookUrl?.startsWith('https://') ?? false);

  constructor() {
    this.refresh();
    this.api.setup().pipe(takeUntilDestroyed()).subscribe({
      next: value => this.legacy.set(value),
      error: () => this.legacy.set(null)
    });
  }

  refresh(): void {
    if (this.checking() || this.saving()) return;
    this.checking.set(true);
    this.error.set('');
    this.api.connection().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.checking.set(false))
    ).subscribe({
      next: value => this.connection.set(value),
      error: () => this.error.set('teacherManage.courseEdit.hotmartReadError')
    });
  }

  checkWhenReturning(): void {
    if (this.connection()?.pending) this.refresh();
  }

  saveKey(): void {
    const value = this.key.value.trim();
    if (!value || this.checking() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.saveKey(value).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: connection => {
        this.connection.set(connection);
        this.key.reset();
        this.changingKey.set(false);
      },
      error: response => this.error.set(response?.error?.code === 'hotmart_hottok_invalid'
        ? 'teacherManage.courseEdit.hotmartKeyInvalid'
        : 'teacherManage.courseEdit.hotmartKeyError')
    });
  }

  async copy(input: HTMLInputElement, target: 'personal' | 'shared'): Promise<void> {
    this.copied.set(null);
    this.manualCopy.set(null);
    try {
      await navigator.clipboard.writeText(input.value);
      this.copied.set(target);
    } catch {
      input.focus();
      input.select();
      this.manualCopy.set(target);
    }
  }
}
