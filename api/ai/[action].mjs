// Vercel's Vite API routing needs an entry point for this nested URL segment.
// Reuse the handler so origin checks, consent and error handling stay identical.
export { default } from '../[...path].mjs';
export const maxDuration = 120;
