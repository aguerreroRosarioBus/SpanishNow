// Slugs for the public course URL: lowercase ASCII words separated by single hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LENGTH = 160;

/** "Aprende español con un cortometraje (Parte 1)" -> "aprende-espanol-con-un-cortometraje-parte-1" */
function slugify(text) {
  const slug = String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH - 8) // room for a "-123" suffix
    .replace(/-+$/, '');
  return slug || 'course';
}

/** First free slug for `base` (base, base-2, base-3...). `taken(slug)` resolves true when the slug is in use. */
async function uniqueSlug(base, taken) {
  let candidate = base;
  for (let n = 2; await taken(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

module.exports = { SLUG_PATTERN, MAX_LENGTH, slugify, uniqueSlug };
