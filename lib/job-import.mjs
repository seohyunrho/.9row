import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as requestHttps } from 'node:https';
import { Readable } from 'node:stream';
import { recognizeImageText } from './job-ocr.mjs';
import { recruitmentTables, outsideTableLines, cellParagraphs } from './job-table-layout.mjs';

const MAX_HTML_BYTES = 3_000_000;
const MAX_REDIRECTS = 4;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_BODY_LENGTH = 60_000;

function problem(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    // Allow global unicast only. This rejects loopback, mapped, link-local,
    // unique-local, multicast and documentation ranges.
    const first = Number.parseInt(lower.split(':')[0] || '0', 16);
    return first >= 0x2000 && first <= 0x3fff &&
      !lower.startsWith('2001:db8:') && !lower.startsWith('2001:10:') &&
      !lower.startsWith('::ffff:');
  }
  return false;
}

async function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw problem('공고 링크 형식을 확인해 주세요.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || isIP(host)) {
    throw problem('보안상 공개된 HTTPS 공고 링크만 가져올 수 있어요.');
  }
  let addresses;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw problem('공고 사이트 주소를 찾지 못했어요. 링크를 확인해 주세요.'); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw problem('보안상 공개된 HTTPS 공고 링크만 가져올 수 있어요.');
  }
  return url;
}

async function readResponse(response, json = false) {
  const contentType = response.headers.get('content-type') || '';
  const allowedType = json ? /^application\/(?:[\w.+-]+\+)?json\b/i : /^(text\/html|application\/xhtml\+xml)\b/i;
  if (!allowedType.test(contentType)) {
    throw problem('이 링크는 읽을 수 있는 공고 웹페이지가 아니에요.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw problem('공고 페이지 내용을 가져오지 못했어요.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        throw problem('공고 페이지가 너무 커서 읽지 못했어요.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return bytes.toString('utf8'); }
}

// Cloud imports validate the DNS answer used for the actual connection too.
// A second lookup must not change a previously public hostname to a private IP.
function fetchWithPublicDns(url, options) {
  return new Promise((resolve, reject) => {
    const request = requestHttps(url, {
      headers: { ...options.headers, 'Accept-Encoding': 'identity' }, signal: options.signal, agent: false,
      lookup(hostname, lookupOptions, callback) {
        lookup(hostname, { all: true, verbatim: true }).then(addresses => {
          if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
            callback(problem('보안상 공개된 HTTPS 공고 링크만 가져올 수 있어요.')); return;
          }
          if (lookupOptions.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        }, callback);
      },
    }, response => {
      try {
        const encoding = response.headers['content-encoding'];
        if (encoding && encoding !== 'identity') throw problem('이 공고 사이트의 전송 형식을 읽지 못했어요.');
        const headers = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
        const status = response.statusCode || 502;
        const stream = [204, 205, 304].includes(status) ? null : Readable.toWeb(response);
        if (!stream) response.resume();
        resolve(new Response(stream, { status, headers }));
      } catch (error) { response.destroy(); reject(error); }
    });
    request.on('error', reject);
    request.end();
  });
}

async function fetchHtml(value, { json = false, prefix, pinDns = false } = {}) {
  let current = value;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const url = await validateUrl(current);
    let response;
    try {
      response = await (pinDns ? fetchWithPublicDns : fetch)(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: json ? 'application/json' : 'text/html,application/xhtml+xml;q=0.9',
          'User-Agent': 'MoaJobImporter/1.0 (local app)',
          ...(prefix ? { prefix } : {}),
        },
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw problem('공고 사이트 응답이 늦어져 가져오기를 멈췄어요.');
      }
      throw problem('공고 사이트에 연결하지 못했어요.');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === MAX_REDIRECTS) throw problem('공고 링크 이동이 너무 많아 가져오지 못했어요.');
      // The public Recruiter API is fixed; do not forward its tenant header to another origin.
      if (prefix && new URL(location, url).origin !== url.origin) throw problem('공고 내용 주소가 변경되어 읽지 못했어요.');
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      if ([401, 403, 429].includes(response.status)) {
        throw problem('공고 사이트가 자동 읽기를 허용하지 않았어요. 링크만으로는 보관하지 못했습니다.');
      }
      throw problem(`공고 사이트가 페이지를 보내지 않았어요. (응답 ${response.status})`);
    }
    return { html: await readResponse(response, json), url: url.href };
  }
  throw problem('공고 페이지로 이동하지 못했어요.');
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    try { return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match; }
    catch { return match; }
  });
}

function plainText(html) {
  return decodeEntities(String(html || '')
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6]|\/tr|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function metaValues(html) {
  const values = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    const key = (attr.property || attr.name || '').toLowerCase();
    if (key && attr.content) values[key] = attr.content;
  }
  return values;
}

function schemaValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(schemaValue).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    return schemaValue(value.name ?? value.value ?? value.text ?? value.description ?? '');
  }
  return '';
}

function findJobPosting(value) {
  if (Array.isArray(value)) {
    for (const item of value) { const result = findJobPosting(item); if (result) return result; }
  } else if (value && typeof value === 'object') {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => String(type).split(/[\/#]/).pop() === 'JobPosting')) return value;
    for (const child of Object.values(value)) { const result = findJobPosting(child); if (result) return result; }
  }
  return null;
}

function jsonLdJob(html) {
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const result = findJobPosting(JSON.parse(decodeEntities(match[1]).trim()));
      if (result) return result;
    } catch { /* Ignore unrelated or malformed structured data. */ }
  }
  return null;
}

function labeledValue(text, labels) {
  const label = labels.join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*([^\\n|]{2,100})`, 'i'));
  return match?.[1]?.trim() || '';
}

function inferType(value) {
  if (/인턴|intern/i.test(value)) return '인턴';
  if (/경력|experienced|mid[- ]?career|senior/i.test(value)) return '경력';
  if (/신입|entry[- ]?level|new.?grad/i.test(value)) return '신입';
  return '무관';
}

function dateOnly(value) {
  // A deadline belongs to the publisher's calendar day, even when its time has an offset.
  const isoDay = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  if (isoDay) {
    const parsed = new Date(`${isoDay}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoDay ? isoDay : '';
  }
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function extractRequirements(text, { ocr = false } = {}) {
  // OCR may add spaces within a Korean heading. Keep the original wording below it.
  const loose = label => [...label].join('[ \\t]*');
  const prefix = '^\\s*(?:\\d+[.)]\\s*)?(?:[■□○●◎▶▷◆◇※*•·▪-]\\s*)*(?:(?:공통|부문별|분야별|기타)\\s*)?';
  const wanted = ['지원자격', '응시자격', '자격요건', '필수요건', '우대사항', '우대조건'].map(loose).join('|');
  const other = ['주요업무', '담당업무', '모집부문', '모집분야', '근무조건', '근무지', '전형절차', '전형일정',
    '접수기간', '지원방법', '제출서류', '유의사항', '기타사항', '채용절차', '문의', '인재상', '복리후생'].map(loose).join('|');
  const heading = new RegExp(`${prefix}(${wanted})(?=\\s|[:：]|$)\\s*[:：]?\\s*(.*)$`, 'i');
  const boundary = new RegExp(`${prefix}(?:${other})(?=\\s|[:：]|$)`, 'i');
  const unrelated = /반환|청구|파기|보관|취소|불이익|부정\s*행위|사실과\s*다르|허위|문의\s*사항|접수\s*기간|접수\s*마감|지원서\s*접수|전형\s*일정|작성\s*후\s*제출|온라인\s*입사지원/;
  const bullet = /^\s*(?:[-*•·▪■□○●◎▶▷◆◇※]|\d+[.)])\s*/;
  // This fallback selects verbatim evidence, never repairs OCR words or infers a condition.
  const qualificationSentence = line => !unrelated.test(line) && [
    /기\s*졸업|졸업\s*예정|(?:학사|석사|박사|대졸|초대졸)\s*(?:이상|학위|보유)/,
    /(?:입사|근무)[가이]?\s*가능/,
    /공인\s*(?:영어|외국어)\s*(?:성적|점수)/,
    /병역\s*(?:필|이행|면제)|군\s*면제/,
    /해외\s*여행.*결격|결격.*해외\s*여행/,
    /(?:장애인|보훈|국가유공자).*(?:우대|가점|가산)/,
    /(?:영어|외국어)\s*(?:회화)?.*(?:능통|구사)/,
    /자격증.*(?:소지|보유|취득)/,
    /(?:영어권|해외\s*대학).*졸업.*면제/,
    /(?:관련|실무|해당).*경력.*(?:이상|보유|우대)/,
  ].some(pattern => pattern.test(line));
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  const capturedLines = new Set();
  let current = null;
  const finish = () => {
    if (current && current.lines.map(item => item.line).join('\n').trim().length > 0) {
      sections.push({ index: current.index, text: [current.heading, ...current.lines.map(item => item.line)].join('\n').trim() });
      current.lines.forEach(item => capturedLines.add(item.index));
    }
    current = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(heading);
    if (match) {
      finish();
      current = { index, heading: match[1].trim(), lines: match[2] ? [{ line: match[2], index }] : [] };
    } else if (boundary.test(line) || (ocr && unrelated.test(line))) {
      finish();
    } else if (current) {
      // An unrecognised following heading must not pull schedules and legal notices into a section.
      if (ocr && line.trim() && !bullet.test(line) && !qualificationSentence(line)) finish();
      else current.lines.push({ line, index });
    }
  }
  finish();
  const fallback = lines.map((line, index) => ({ text: line, index }))
    .filter(item => !capturedLines.has(item.index) && bullet.test(item.text) && qualificationSentence(item.text));
  const result = [...sections, ...fallback].sort((a, b) => a.index - b.index).map(item => item.text).join('\n\n');
  return { text: result, method: fallback.length ? 'sentences' : sections.length ? 'headings' : 'none' };
}

function recruiterJobId(url) {
  const parsed = new URL(url);
  if (!/^[a-z0-9-]+\.recruiter\.co\.kr$/i.test(parsed.hostname)) return '';
  return parsed.pathname.match(/^\/career\/jobs\/(\d+)\/?$/)?.[1] || '';
}

// Otoki publishes the posting itself in #boardContent, with generic site metadata.
// Match balanced containers so nested divs cannot truncate the actual posting.
function elementContent(html, name, matches) {
  const tags = new RegExp(`<\\/?${name}\\b[^>]*>`, 'gi');
  let start = -1;
  let depth = 0;
  for (const tag of html.matchAll(tags)) {
    const closing = /^<\//.test(tag[0]);
    if (start < 0) {
      if (!closing && matches(attributes(tag[0]))) { start = tag.index + tag[0].length; depth = 1; }
    } else {
      depth += closing ? -1 : 1;
      if (depth === 0) return html.slice(start, tag.index);
    }
  }
  return '';
}

const hasClass = (attrs, name) => (attrs.class || '').split(/\s+/).includes(name);
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cellText = html => plainText(html.replace(/\s+/g, ' ').replace(/<br\b[^>]*>/gi, ' '));

function otokiTable(table) {
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  const headers = [...(rows[0]?.[1] || '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)].map(cell => cellText(cell[1]));
  if (headers.join('|') !== '직무|근무지|담당업무 및 비전|우대전공|자격요건') {
    throw problem('오뚜기 공고의 모집 표 형식이 달라 내용을 정확히 구분하지 못했어요. 원문 사이트에서 확인해 주세요.');
  }
  const grid = [];
  const output = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = grid[rowIndex] ||= [];
    let column = 0;
    for (const cell of rows[rowIndex][1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)) {
      while (row[column] !== undefined) column++;
      const attrs = attributes(cell[1]);
      const rowspan = Number(attrs.rowspan ?? 1);
      const colspan = Number(attrs.colspan ?? 1);
      if (!Number.isInteger(rowspan) || rowspan < 1 || rowIndex + rowspan > rows.length || colspan !== 1 || column >= headers.length) {
        throw problem('오뚜기 공고 표의 합쳐진 칸을 정확히 구분하지 못해 저장하지 않았어요.');
      }
      for (let offset = 0; offset < rowspan; offset++) {
        const target = grid[rowIndex + offset] ||= [];
        if (target[column] !== undefined) throw problem('오뚜기 공고 표의 칸이 겹쳐 저장하지 않았어요.');
        target[column] = cell[2];
      }
      column++;
    }
    if (Array.from({ length: headers.length }, (_, i) => row[i]).some(cell => cell === undefined) || !cellText(row[0])) {
      throw problem('오뚜기 공고 표의 일부 내용을 찾지 못해 저장하지 않았어요.');
    }
    const role = escapeHtml(cellText(row[0]));
    const location = escapeHtml(cellText(row[1]));
    const major = escapeHtml(cellText(row[3]));
    const duties = row[2].replace(/<li\b[^>]*>/gi, '<li>• ');
    const conditions = row[4].replace(/<dt\b[^>]*>([\s\S]*?)<\/dt\s*>/gi, (tag, label) => {
      const kind = cellText(label).replace(/[\[\]\s]/g, '');
      return kind === '필수' ? '<h4>지원자격</h4>' : kind === '우대' ? '<h4>우대사항</h4>' : tag;
    });
    // Repeat only explicitly row-spanned cells; no conditions are inferred from neighbouring roles.
    output.push(`<section><h3>직무: ${role}</h3><h4>주요업무</h4>${duties}
      <h4>${major === '전공무관' ? '지원자격' : '우대사항'}</h4><p>${major === '전공무관' ? '전공' : '우대전공'}: ${major}</p>
      <h4>기타사항</h4><h3>직무: ${role}</h3>${conditions}<h4>기타사항</h4><p>근무지: ${location}</p></section>`);
  }
  if (!output.length) throw problem('오뚜기 공고에 모집 직무가 없어 저장하지 않았어요.');
  return output.join('\n');
}

function otokiDescription(html, url, meta) {
  const parsed = new URL(url);
  if (!['www.otoki.com', 'otoki.com'].includes(parsed.hostname) || parsed.pathname !== '/about/recruitment-detail') return null;
  const cleanHtml = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const board = elementContent(cleanHtml, 'section', attrs => hasClass(attrs, 'board_detail'));
  const content = elementContent(board, 'div', attrs => attrs.id === 'boardContent');
  const title = plainText(elementContent(board, 'h2', attrs => hasClass(attrs, 'tit')));
  const company = plainText(meta['og:site_name'] || '');
  if (!content || !company || !title.includes(company) || !/채용|모집/.test(title)) {
    throw problem('오뚜기 페이지에서 공고 제목과 본문을 찾지 못했어요. 채용공고 상세 링크인지 확인해 주세요.');
  }
  const images = sourceImages(content, url);
  const body = plainText(content.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi, otokiTable)
    .replace(/\s+/g, ' ').replace(/<br\b[^>]*>/gi, ' ')
    .replace(/<(h[1-6]|dt)\b/gi, '<p></p><$1')
    .replace(/<img\b[^>]*>/gi, tag => escapeHtml(attributes(tag).alt || '')));
  // Read the deadline only from the application period, never the publication/graduation date.
  const period = body.match(/서류접수기간\s*및\s*방법\s*\n\s*기간\s*[:：]\s*([^\n]+)/)?.[1] || '';
  const dates = period.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^~～]*[~～]\s*(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
  const deadline = dates && (dates[4] || Number(dates[5]) >= Number(dates[2]))
    ? dateOnly(`${dates[4] || dates[1]}-${dates[5].padStart(2, '0')}-${dates[6].padStart(2, '0')}`) : '';
  return { title, company, body, images, deadline };
}

function sourceImages(html, url) {
  const origin = new URL(url).origin;
  const images = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attributes(match[0]).src;
    if (!src) throw problem('공고 원문 이미지 주소를 찾지 못해 저장하지 않았어요.');
    let image;
    try {
      image = new URL(src, url);
    } catch { throw problem('공고 원문 이미지 주소를 읽지 못해 저장하지 않았어요.'); }
    if (image.protocol !== 'https:' || image.origin !== origin || image.username || image.password) {
      throw problem('안전하게 불러올 수 없는 공고 원문 이미지가 있어 저장하지 않았어요.');
    }
    images.push(image.href);
  }
  const unique = [...new Set(images)];
  if (unique.length > 12) throw problem('공고 원문 이미지가 너무 많아 전체를 보관하지 못했어요. 원문 링크에서 확인해 주세요.');
  return unique;
}

function recruiterDescription(data, url) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.title !== 'string' || !data.title.trim()
      || data.jobDescriptionType !== 'HTML' || typeof data.jobDescription !== 'string') {
    throw problem('이 공고의 본문 형식을 아직 읽을 수 없어 저장하지 않았어요. 원문을 확인한 뒤 직접 등록해 주세요.');
  }
  const body = plainText(data.jobDescription);
  const images = sourceImages(data.jobDescription, url);
  if (body.length < 40 && images.length === 0) throw problem('공고 본문이나 안전하게 불러올 수 있는 원문 이미지를 찾지 못해 저장하지 않았어요.');
  return { body, images, bodyFormat: images.length && body.length < 40 ? 'image' : 'text' };
}

async function cancelImageStream(stream) {
  try { await stream?.cancel(); } catch { /* Cleanup must not replace the original error. */ }
}

async function readSourceImage(value, sourceUrl, budget) {
  const url = await validateUrl(value);
  if (url.origin !== new URL(sourceUrl).origin) {
    throw problem('공고와 출처가 다른 이미지는 자동으로 읽을 수 없어요.');
  }
  let response;
  try {
    // Recruiter's image host accepts GET but returns 403 for HEAD.
    response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'image/*', 'User-Agent': 'MoaJobImporter/1.0 (local app)' },
    });
  } catch { throw problem('공고 원문 이미지를 불러오지 못해 저장하지 않았어요. 잠시 뒤 다시 시도해 주세요.'); }
  if (!response.ok || !/^image\/(?:jpeg|png|webp|gif)\b/i.test(response.headers.get('content-type') || '')) {
    await cancelImageStream(response.body);
    throw problem('공고 원문 이미지를 확인하지 못해 저장하지 않았어요. 원문 링크에서 확인해 주세요.');
  }
  const announcedSize = Number(response.headers.get('content-length'));
  if (announcedSize > MAX_IMAGE_BYTES || announcedSize > budget.remaining) {
    await cancelImageStream(response.body);
    throw problem('공고 이미지 용량이 읽기 제한을 넘어 저장하지 않았어요. 이미지 한 장은 12MB, 전체는 32MB까지 읽을 수 있습니다.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw problem('공고 원문 이미지가 비어 있어 저장하지 않았어요.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_IMAGE_BYTES || size > budget.remaining) {
        throw problem('공고 이미지 용량이 읽기 제한을 넘어 저장하지 않았어요. 이미지 한 장은 12MB, 전체는 32MB까지 읽을 수 있습니다.');
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    await cancelImageStream(reader);
    if (error.status) throw error;
    throw problem('공고 원문 이미지를 끝까지 읽지 못해 저장하지 않았어요. 잠시 뒤 다시 시도해 주세요.');
  } finally {
    reader.releaseLock();
  }
  if (!size) throw problem('공고 원문 이미지가 비어 있어 저장하지 않았어요.');
  budget.remaining -= size;
  return Buffer.concat(chunks, size);
}

async function addImageText(job) {
  if (!job.sourceImages?.length) return job;
  const budget = { remaining: MAX_TOTAL_IMAGE_BYTES };
  const parts = job.body.trim() ? [job.body.trim()] : [];
  const textLayout = [];
  for (let index = 0; index < job.sourceImages.length; index++) {
    const bytes = await readSourceImage(job.sourceImages[index], job.url, budget);
    let result;
    try {
      result = await recognizeImageText(bytes);
    } catch (error) {
      if (/^JOB_OCR_[A-Z_]+$/.test(error?.code || '') && typeof error.message === 'string') throw error;
      throw problem(`공고 이미지 ${index + 1}장의 글자를 읽지 못해 저장하지 않았어요. 이 컴퓨터의 한국어 글자 읽기 기능을 확인한 뒤 다시 시도해 주세요.`);
    }
    const text = typeof result?.text === 'string' ? result.text.replace(/\r\n?/g, '\n').trim() : '';
    if (!text) throw problem(`공고 이미지 ${index + 1}장에서 글자를 찾지 못해 저장하지 않았어요. 원문 이미지가 선명한지 확인해 주세요.`);
    textLayout.push({ imageIndex: index, width: result.width, height: result.height, lines: result.lines, rules: result.rules });
    parts.push(text);
    if (parts.join('\n\n').length > MAX_BODY_LENGTH) {
      throw problem('공고 본문이 60,000자를 넘어 전체를 보관하지 못했어요. 내용을 임의로 자르지 않고 저장을 멈췄습니다.');
    }
  }
  const body = parts.join('\n\n');
  if (body.length < 40) throw problem('이미지에서 공고 내용을 충분히 읽지 못해 저장하지 않았어요. 원문 이미지가 선명한지 확인해 주세요.');
  const extractedRequirements = extractRequirements(body, { ocr: true });
  const tables = recruitmentTables(textLayout, body);
  // A summary of a multi-role table must keep each role attached to its own conditions.
  if (tables.length) {
    const common = outsideTableLines(tables[0]).filter(line => /^\s*[-*•·]/.test(line.text) && /학위|졸업|우대|가점/.test(line.text));
    const commonText = common.map(line => {
      const continuation = outsideTableLines(tables[0]).filter(next => next.y > line.y && next.y - line.y < line.height * 2.2 && Math.abs(next.x - line.x) < line.height && !/^\s*[-*•·]/.test(next.text));
      return [line.text, ...continuation.map(next => next.text)].join(' ');
    }).filter(text => !/취소|허위/.test(text));
    extractedRequirements.text = ['[공통]', ...commonText, ...tables.flatMap(table => table.rows.map(row =>
      [`[${row.roleLines[0].text}]`, ...(row.major.length ? [`전공: ${row.major.map(line => line.text).join(' ')}`] : []), ...cellParagraphs(row.conditions)].join('\n')))].join('\n\n');
    extractedRequirements.method = 'table-cells';
  }
  return {
    ...job, body, textLayout, bodyFormat: 'image-text', requirements: extractedRequirements.text,
    requirementsExtraction: extractedRequirements.method,
    textExtraction: {
      method: 'windows-ocr', status: 'complete', language: 'ko', imageCount: job.sourceImages.length, needsReview: true,
      extractedAt: new Date().toISOString(), version: 2,
    },
  };
}

// Exported for offline parser checks; it never reads or writes the user's saved data.
export function parseJobFromHtml(html, url, recruiterData = null) {
  const meta = metaValues(html);
  const otokiContent = otokiDescription(html, url, meta);
  const schema = jsonLdJob(html);
  const visible = plainText(html).slice(0, 30_000);
  const recruiterContent = recruiterData ? recruiterDescription(recruiterData, url) : null;
  const description = otokiContent?.body ?? (recruiterContent ? recruiterContent.body : schemaValue(schema?.description));
  // Social previews often contain only the title. They are not a substitute for the actual posting.
  const contentHtml = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1]
    || html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || html;
  const body = otokiContent || recruiterContent ? description
    : plainText(description || contentHtml.replace(/<(head|header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '));
  if (body.length > MAX_BODY_LENGTH) throw problem('공고 본문이 60,000자를 넘어 전체를 보관하지 못했어요. 내용을 임의로 자르지 않고 저장을 멈췄습니다.');
  const titleTag = decodeEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '');
  const role = otokiContent?.title || schemaValue(recruiterData?.title) || schemaValue(schema?.title ?? schema?.headline) || meta['og:title'] || meta['twitter:title'] || plainText(titleTag).split(/\s*[|｜·]\s*/)[0];
  const org = schema?.hiringOrganization;
  const company = otokiContent?.company || (recruiterData ? meta.author : '') || schemaValue(org?.name ?? org)
    || labeledValue(body, ['기업명', '회사명', '채용 기업', '기업']) || labeledValue(visible, ['기업명', '회사명', '채용 기업', '기업']) || '';
  if (!company || !role || (body.length < 40 && !recruiterContent?.images.length)) {
    throw problem('페이지는 열렸지만 회사·공고 제목·본문을 충분히 찾지 못해 저장하지 않았어요. 이 사이트의 공고 구조를 읽는 방식을 확인해야 합니다.');
  }
  const schemaRequirements = schemaValue(schema?.qualifications ?? schema?.skills);
  const extractedRequirements = extractRequirements(body);
  const requirements = schemaRequirements || extractedRequirements.text;
  const type = (otokiContent ? inferType(otokiContent.title) : '') || ({ NEW: '신입', CAREER: '경력', ALL: '무관' })[recruiterData?.careerType]
    || inferType(`${schemaValue(schema?.employmentType)} ${role} ${description}`);
  const deadline = otokiContent ? otokiContent.deadline : dateOnly(recruiterData?.endDateTime || schema?.validThrough) || dateOnly(labeledValue(visible, ['접수 마감', '마감일', '접수 기간', '지원 기간']));
  return {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    company: company.slice(0, 150), role: role.slice(0, 150), type, deadline,
    url, body, requirements, requirementsExtraction: schemaRequirements ? 'structured' : extractedRequirements.method,
    stage: 'saved', color: 'green',
    ...(otokiContent ? { sourceImages: otokiContent.images, bodyFormat: 'text' } : {}),
    ...(recruiterContent ? {
      sourceImages: recruiterContent.images, bodyFormat: recruiterContent.bodyFormat,
      sourceTags: [...new Set((Array.isArray(recruiterData.tagList) ? recruiterData.tagList : [])
        .map(tag => typeof tag?.tagName === 'string' ? tag.tagName.trim().slice(0, 100) : '').filter(Boolean))].slice(0, 30),
    } : {}),
    createdAt: new Date().toISOString(), importedAt: new Date().toISOString(),
  };
}

export async function importJobFromUrl(value, { imageText = true, pinDns = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048) throw problem('공고 링크를 확인해 주세요.');
  const { html, url } = await fetchHtml(value.trim(), { pinDns });
  const id = recruiterJobId(url);
  if (id) {
    // This is the unauthenticated request made by Recruiter's public careers page.
    const { html: payload } = await fetchHtml(`https://api-recruiter.recruiter.co.kr/position/v2/jobflex/${id}`, {
      json: true, prefix: new URL(url).hostname, pinDns,
    });
    let data;
    try { data = JSON.parse(payload); } catch { throw problem('공고 사이트가 보낸 내용을 읽지 못했어요.'); }
    const job = parseJobFromHtml(html, url, data);
    if (!imageText) return job.sourceImages?.length ? {
      ...job,
      textExtraction: { method: 'none', status: 'deferred', imageCount: job.sourceImages.length, needsReview: true },
    } : job;
    return addImageText(job);
  }
  return parseJobFromHtml(html, url);
}
