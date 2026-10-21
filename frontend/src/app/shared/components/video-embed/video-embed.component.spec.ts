import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { VideoEmbedComponent, isAllowedEmbedUrl } from './video-embed.component';

@Component({ standalone: true, imports: [VideoEmbedComponent], template: `<app-video-embed [url]="url()" title="Mi video" />` })
class HostComponent { url = signal<string | null>(null); }

function render(url: string | null) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.url.set(url);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null;
}

describe('VideoEmbedComponent', () => {
  const allowed = [
    'https://www.youtube-nocookie.com/embed/abc123',
    'https://player.vimeo.com/video/76979871',
    'https://iframe.mediadelivery.net/embed/1234/abcd-ef'
  ];
  const rejected = [
    'https://www.youtube.com/embed/abc123',
    'https://youtu.be/abc123',
    'http://www.youtube-nocookie.com/embed/abc123',
    'https://evil.example.com/https://www.youtube-nocookie.com/embed/abc',
    'https://www.youtube-nocookie.com.evil.com/embed/abc',
    'https://www.youtube-nocookie.com/embed/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    ' https://player.vimeo.com/video/1',
    'https://player.vimeo.com/video/1 onload=alert(1)',
    '',
    null
  ];

  it.each(allowed)('acepta %s', url => {
    expect(isAllowedEmbedUrl(url)).toBe(true);
    const iframe = render(url);
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe(url);
    expect(iframe!.getAttribute('loading')).toBe('lazy');
    expect(iframe!.getAttribute('allow')).toContain('fullscreen');
    expect(iframe!.getAttribute('title')).toBe('Mi video');
    expect(iframe!.getAttribute('sandbox')).toBeTruthy();
  });

  it.each(rejected)('rechaza %s', url => {
    expect(isAllowedEmbedUrl(url)).toBe(false);
    expect(render(url)).toBeNull();
  });
});
