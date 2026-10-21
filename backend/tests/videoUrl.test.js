// Video links: YouTube, Vimeo and Bunny are normalised to their embed URL; anything else is rejected.
const { normalizeVideoUrl, parseVideoField } = require('../src/utils/videoUrl');

const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const BUNNY = 'https://iframe.mediadelivery.net/embed/12345/a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('normalizeVideoUrl', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1', YT],
    ['http://youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', YT],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', YT],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0', YT],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', YT],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://vimeo.com/76979871/ABCDEF1234', 'https://player.vimeo.com/video/76979871?h=abcdef1234'], // unlisted
    ['https://vimeo.com/76979871?h=abcdef1234', 'https://player.vimeo.com/video/76979871?h=abcdef1234'],
    ['https://player.vimeo.com/video/76979871?h=abcdef1234&autoplay=1', 'https://player.vimeo.com/video/76979871?h=abcdef1234'],
    ['https://vimeo.com/channels/staffpicks/76979871', 'https://player.vimeo.com/video/76979871'],
    [BUNNY, BUNNY],
    ['https://iframe.mediadelivery.net/play/12345/a1b2c3d4-e5f6-7890-abcd-ef1234567890', BUNNY],
    ['https://player.mediadelivery.net/embed/12345/A1B2C3D4-E5F6-7890-ABCD-EF1234567890?autoplay=false', BUNNY],
    ['  https://youtu.be/dQw4w9WgXcQ  ', YT]
  ])('%s', (input, expected) => {
    expect(normalizeVideoUrl(input)).toBe(expected);
  });

  test('normalising an already normalised URL changes nothing', () => {
    for (const url of [YT, BUNNY, 'https://player.vimeo.com/video/76979871', 'https://player.vimeo.com/video/76979871?h=abcdef1234']) {
      expect(normalizeVideoUrl(url)).toBe(url);
    }
  });

  test.each([
    '', '   ', 'hola', 'https://example.com/video.mp4', 'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch', 'https://www.youtube.com/channel/UC123',
    'https://youtu.be/', 'https://vimeo.com/', 'https://vimeo.com/abc', 'https://vimeo.com/76979871/not-a-hash!',
    'https://vimeo.com/user/76979871/extra/1', 'https://iframe.mediadelivery.net/embed/12345/not-a-guid',
    'https://iframe.mediadelivery.net/embed/abc/a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'https://iframe.mediadelivery.net/embed/12345',
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${'a'.repeat(500)}`, 42, null, undefined, {}, []
  ])('rejects %p', input => {
    expect(normalizeVideoUrl(input)).toBeNull();
  });
});

describe('parseVideoField', () => {
  test('missing leaves the field alone; null and empty string clear it; links are normalised; others are an error', () => {
    expect(parseVideoField({}, 'videoUrl')).toEqual({ skip: true });
    expect(parseVideoField(undefined, 'videoUrl')).toEqual({ skip: true });
    expect(parseVideoField({ videoUrl: null }, 'videoUrl')).toEqual({ value: null });
    expect(parseVideoField({ videoUrl: '' }, 'videoUrl')).toEqual({ value: null });
    expect(parseVideoField({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }, 'videoUrl')).toEqual({ value: YT });
    expect(parseVideoField({ videoUrl: 'https://example.com/x' }, 'videoUrl')).toEqual({ error: expect.stringMatching(/YouTube, Vimeo or Bunny/) });
  });
});
