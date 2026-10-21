import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicCertificate } from '../../../core/models/content.model';
import { CertificateService } from '../../../core/services/certificate.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/** Verificación pública de un certificado (en inglés, sin sesión). */
@Component({
  selector: 'app-certificate-verify',
  standalone: true,
  imports: [DatePipe, RouterLink, IconComponent],
  templateUrl: './certificate-verify.component.html',
  styleUrl: './certificate-verify.component.scss'
})
export class CertificateVerifyComponent implements OnInit {
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

  pdfUrl(): string { return this.service.pdfUrl(this.certificate()?.code ?? this.code()); }
}
