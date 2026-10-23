import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicCertificate } from '../../../core/models/content.model';
import { CertificateService } from '../../../core/services/certificate.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/** Verificación pública de un certificado (sin sesión). */
@Component({
  selector: 'app-certificate-verify',
  standalone: true,
  imports: [TranslatePipe, RouterLink, IconComponent],
  templateUrl: './certificate-verify.component.html',
  styleUrl: './certificate-verify.component.scss'
})
export class CertificateVerifyComponent implements OnInit {
  private i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  private displayZone(): string { return this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  private route = inject(ActivatedRoute);
  private service = inject(CertificateService);

  code = signal('');
  certificate = signal<PublicCertificate | null>(null);
  isLoading = signal(true);
  notFound = signal(false);
  loadError = signal(false);

  ngOnInit(): void {
    const code = (this.route.snapshot.paramMap.get('code') ?? '').trim();
    this.code.set(code);
    this.service.verify(code).subscribe({
      next: certificate => {
        this.certificate.set(certificate);
        this.isLoading.set(false);
      },
      error: error => {
        if (error?.status === 404) this.notFound.set(true);
        else this.loadError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  issuedDate(value: string): string { return this.i18n.formatInstant(value, this.displayZone(), { dateStyle: 'long' }); }

  pdfUrl(): string { return this.service.pdfUrl(this.certificate()?.code ?? this.code()); }
}
