import previews from './job-source-previews.json';

function sourceKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return `${url.origin}${url.pathname}?recruitmentContentIdx=${url.searchParams.get('recruitmentContentIdx') || ''}`;
  } catch { return ''; }
}

// A captured page is valid only for the same posting and the same imported text.
// A changed source must never silently display an older screenshot.
export function jobSourcePreview(job) {
  if (!job) return null;
  const key = sourceKey(job.url);
  return previews.find(preview => key && sourceKey(preview.sourceUrl) === key && preview.sourceBody === job.body) || null;
}
