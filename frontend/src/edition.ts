/** Mirrors backend `APP_EDITION=full`. Build with `vite build --mode full` (see `.env.full`). */
export function isFullEdition(): boolean {
  return import.meta.env.VITE_EDITION === 'full'
}
