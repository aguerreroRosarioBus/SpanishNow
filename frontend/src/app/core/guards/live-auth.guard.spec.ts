import { liveReturnUrl } from './live-auth.guard';
describe('live invitation return URL', () => {
  it('preserves only local live-class destinations', () => {
    expect(liveReturnUrl('/live/join/abcdefghijklmnop')).toBe('/live/join/abcdefghijklmnop');
    expect(liveReturnUrl('/live/123')).toBe('/live/123');
    for (const value of ['https://evil.com', '//evil.com/live', '/live\\evil.com', '/lively', '/teacher/dashboard', null]) expect(liveReturnUrl(value)).toBeNull();
  });
});
