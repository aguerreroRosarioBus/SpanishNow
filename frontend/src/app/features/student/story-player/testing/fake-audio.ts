import { vi } from 'vitest';

/** Medio determinista: permite resolver promesas/eventos en orden adverso. No hace red. */
export class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  preload = '';
  duration = NaN;
  currentTime = 0;
  paused = true;
  ranges: Array<[number, number]> = [];
  get seekable(): TimeRanges {
    return { length: this.ranges.length, start: i => this.ranges[i][0], end: i => this.ranges[i][1] };
  }
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
  constructor() { super(); FakeAudio.instances.push(this); }
  emit(type: string): void { this.dispatchEvent(new Event(type)); }
  metadata(duration = 60, ranges: Array<[number, number]> = [[0, duration]]): void {
    this.duration = duration; this.ranges = ranges; this.emit('loadedmetadata');
  }
}
