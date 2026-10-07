import { recruitmentTables, cellParagraphs } from './job-table-layout.mjs';

const MAX_SOURCE_LENGTH = 60_000;
const MAX_ITEM_LENGTH = 6_000;
const MAX_ITEMS = 100;

const normal = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const clean = value => String(value || '').trim().replace(/^(?:#{1,6}\s*|[-*•·▪■□○●◎▶▷◆◇※]\s*|\d+[.)]\s*)+/, '');
const bullet = value => /^\s*(?:[-*•·▪■□○●◎▶▷◆◇※]|\d+[.)])/.test(value);
const unwanted = value => /반환|청구|파기|서류\s*보관|입사\s*취소|합격\s*취소|불이익|부정\s*행위|사실과\s*다르|허위|접수\s*기간|접수\s*마감|전형\s*일정|희망\s*직무.*선택|타\s*직무.*배치/.test(value);
const universalCondition = value => /기\s*졸업|졸업\s*예정|(?:입사|근무)[가이]?\s*가능|공인\s*(?:영어|외국어)|병역|군\s*면제|해외\s*여행.*결격|(?:장애인|보훈|국가유공자).*(?:우대|가점)|영어\s*회화.*능통|영어권.*졸업.*면제/.test(value);
const explicitCondition = value => universalCondition(value) || /자격증|학위|경력.*(?:년|이상|보유)|(?:경험|능력|역량|전공).*(?:보유|필수|우대)|(?:필수|우대)\s*(?:조건|사항)|우대|가점/.test(value);
const dutyText = value => !unwanted(value) && !explicitCondition(value) && value.trim().length > 7
  && /기획|관리|운영|분석|개발|설계|제작|검토|처리|조사|수행|담당|영업|마케팅|인사|홍보|구매|회계|세무|물류|지원/.test(value);

function sourceLines(value) {
  return [...value.matchAll(/[^\r\n]+/g)].map(match => ({ text: match[0].trim(), start: match.index, end: match.index + match[0].length }));
}

function category(value) {
  const cleaned = clean(value);
  const text = /^[\[【]/.test(cleaned) ? cleaned.replace(/^[\[【]\s*/, '').replace(/\s*[\]】1]$/, '') : cleaned;
  const compact = normal(text);
  const definitions = [
    ['duties', /^(?:주요\s*업무|담당\s*업무|세부\s*직무|담당할\s*업무|하는\s*일)\s*[:：]?\s*(.*)$/],
    ['qualifications', /^(?:(?:공통|필수)\s*)?(?:지원\s*자격|응시\s*자격|자격\s*요건|필수\s*요건|필수\s*조건|지원\s*요건)\s*[:：]?\s*(.*)$/],
    ['preferred', /^(?:(?:기타|공통)\s*)?(?:우대\s*사항|우대\s*조건|우대\s*요건)\s*[:：]?\s*(.*)$/],
  ];
  for (const [kind, expression] of definitions) {
    const match = text.match(expression);
    if (match) return { kind, inline: match[1].trim(), common: /공통/.test(text) };
  }
  if (/^(?:접수기간|접수방법|지원방법|제출서류|유의사항|기타사항|전형절차|전형일정|채용절차|문의|복리후생|근무지|전공)$/.test(compact)) return { kind: 'stop' };
  return null;
}

function roleHeading(value) {
  const text = clean(value);
  let match = text.match(/^[\[【](.{1,150})[\]】]$/);
  if (match && !category(match[1])) return match[1].trim();
  match = text.match(/^(?:직무|포지션|모집\s*부문|모집\s*분야|채용\s*분야)\s*[:：]\s*(.{1,150})$/);
  if (match) return match[1].trim();
  if (/^#{1,6}\s/.test(value) && !category(text) && text.length <= 150) return text;
  return '';
}

function restriction(value) {
  const text = clean(value);
  const match = text.match(/^(.{1,60}?)\s*(?:직무|분야|부문)\s*(?:지원자|담당자|지원|에\s*한|의\s*경우)/)
    || text.match(/^(.{1,60}?)\s*지원자(?:의\s*경우|에\s*한)/);
  if (!match || /^(?:모든|전체|공통|각)/.test(match[1].trim())) return '';
  return match[1].trim();
}

function titleMatches(title, desired) {
  const stripped = normal(title).replace(/(?:모집|채용|공고|신입|경력|직원|사원|정규직|인턴|포지션)+$/g, '');
  return stripped === desired;
}

/** Local, deterministic excerpts from this posting; no network calls or generated job knowledge. */
export function buildRoleDescription(job, desiredRole) {
  if (typeof desiredRole !== 'string' || !desiredRole.trim() || desiredRole.trim().length > 150) {
    throw new Error('희망 직무를 150자 이내로 입력해 주세요.');
  }
  const desired = desiredRole.trim();
  const wanted = normal(desired);
  if (!wanted) throw new Error('희망 직무 이름을 입력해 주세요.');
  const snapshot = Object.fromEntries(['body', 'requirements', 'role', 'url'].map(key => [key, typeof job?.[key] === 'string' ? job[key] : '']));
  if (snapshot.body.length > MAX_SOURCE_LENGTH || snapshot.requirements.length > MAX_SOURCE_LENGTH) {
    throw new Error('공고 본문이나 핵심 조건이 60,000자를 넘어 직무별로 정리하지 못했어요.');
  }
  if (typeof job?.textExtraction?.extractedAt === 'string') snapshot.extractedAt = job.textExtraction.extractedAt;
  const result = {
    desiredRole: desired, duties: [], qualifications: [], preferred: [], notes: [], matched: false,
    sourceMode: 'posting-only', generatedAt: new Date().toISOString(), sourceSnapshot: snapshot,
  };
  const seen = { duties: new Set(), qualifications: new Set(), preferred: new Set() };
  const ocr = job?.textExtraction?.method === 'windows-ocr' || job?.bodyFormat === 'image-text';
  const titleRole = titleMatches(snapshot.role, wanted);
  const tables = recruitmentTables(job?.textLayout, snapshot.body);
  let otherRoleCondition = false;
  let unclearCondition = false;
  let tooLong = false;
  const add = (kind, text, evidence, scope) => {
    // JD contains only excerpts connected to the selected role. Whole-posting conditions stay in the source.
    if (scope !== 'role' || /(?:전|전체|모든)\s*직무\s*공통|(?:전체|모든)\s*지원자\s*(?:공통|대상)|공통\s*(?:지원자격|자격요건|우대사항)/.test(text)) return;
    const content = text.trim();
    if (!content || seen[kind].has(content)) return;
    if (content.length > MAX_ITEM_LENGTH || evidence.length > MAX_ITEM_LENGTH || result[kind].length >= MAX_ITEMS) {
      tooLong = true; return;
    }
    seen[kind].add(content);
    result[kind].push({ text: content, evidence, scope });
  };

  let sources = [['body', snapshot.body], ['requirements', snapshot.requirements]];
  if (tables.length) {
    // The matched table row supplies role-specific terms; text outside it does not.
    sources = [];
    for (const table of tables) for (const row of table.rows) {
      const label = row.roleLines[0];
      const exact = normal(clean(label.text)) === wanted;
      // A Korean OCR engine can read the Latin IT glyphs as 「. Require independent IT evidence in this cell.
      const latinPrefix = /^it/.test(wanted) && /^[「『┌Γ]\s*[가-힣]/.test(label.text)
        && normal(label.text.slice(1)) === wanted.slice(2) && row.roleLines.slice(1).some(line => /\bIT\b/i.test(line.text));
      if (!exact && !latinPrefix) continue;
      const evidence = `${label.text}\n${row.roleLines.slice(1).map(line => line.text).join('\n')}`;
      for (const text of cellParagraphs(row.roleLines.slice(1))) if (dutyText(text)) add('duties', text, evidence, 'role');
      if (latinPrefix && !result.notes.some(note => note.includes('직무명의 IT'))) result.notes.push('직무명의 IT가 다른 기호로 읽혀, 같은 표 칸의 IT 업무 문구와 함께 연결했습니다. 직무명은 원문 이미지에서 확인해 주세요.');
      if (row.major.length) {
        const text = row.major.map(line => line.text).join(' ');
        const uncertain = /[=「『]|또=$/.test(text);
        add('qualifications', `전공: ${text}`, `${label.text}\n전공\n${text}`, 'role');
        if (uncertain) unclearCondition = true;
      }
      let section = '';
      for (const paragraph of cellParagraphs(row.conditions)) {
        const heading = category(paragraph);
        if (heading) { section = heading.kind; if (!heading.inline) continue; }
        const text = heading?.inline || paragraph;
        if (!text || unwanted(text) || !['qualifications', 'preferred'].includes(section)) continue;
        add(section, text, `${label.text}\n${row.conditions.map(line => line.text).join('\n')}`, 'role');
      }
    }
  }

  for (const [sourceName, source] of sources) {
    let activeRole = titleRole ? desired : '';
    let activeRoleStart = null;
    let section = sourceName === 'requirements' ? 'qualifications' : '';
    let common = false;
    let sectionStart = null;
    const lines = sourceLines(source);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const namedRole = roleHeading(line.text);
      if (namedRole) {
        activeRole = namedRole; activeRoleStart = line.start; section = ''; common = false; sectionStart = null;
        continue;
      }
      // A bare role label in a linear OCR table does not establish a relationship with later cells.
      if (normal(clean(line.text)) === wanted) {
        if (!ocr) { activeRole = desired; activeRoleStart = line.start; }
        section = ''; continue;
      }
      const heading = category(line.text);
      if (heading) {
        section = heading.kind === 'stop' ? '' : heading.kind;
        sectionStart = heading.kind === 'stop' ? null : line.start;
        if (heading.kind === 'stop') { activeRole = titleRole ? desired : ''; activeRoleStart = null; common = false; }
        if (heading.common) { common = true; activeRole = ''; activeRoleStart = null; }
        if (!heading.inline) continue;
      }
      const text = heading?.inline || line.text;
      if (unwanted(text)) { section = ''; sectionStart = null; continue; }
      const limitedTo = restriction(text);
      const limitedMatches = limitedTo && (normal(limitedTo) === wanted || normal(limitedTo).includes(wanted));
      const activeMatches = activeRole && (normal(activeRole) === wanted || normal(activeRole).includes(wanted));
      const explicitlyOther = (limitedTo && !limitedMatches) || (activeRole && !activeMatches && !common);
      const isCondition = explicitCondition(text) || section === 'qualifications' || section === 'preferred';
      let evidenceStart = activeMatches && activeRoleStart !== null ? activeRoleStart : sectionStart ?? line.start;
      if (line.end - evidenceStart > MAX_ITEM_LENGTH) evidenceStart = line.start;
      const evidence = source.slice(evidenceStart, line.end).trim();

      if (isCondition && !heading?.inline && !bullet(text) && ocr && !explicitCondition(text)) {
        // An unreadable next heading or a table cell ends the OCR section.
        section = ''; sectionStart = null; continue;
      }
      if (isCondition) {
        if (explicitlyOther) { otherRoleCondition = true; continue; }
        const kind = /우대|가점|가산/.test(text) || section === 'preferred' ? 'preferred' : 'qualifications';
        const explicitlyCommon = common || /(?:전체|모든|전)\s*(?:직무|지원자|모집부문).*공통|전\s*직무\s*공통|공통\s*(?:지원자격|자격요건|우대사항)/.test(text);
        const scope = explicitlyCommon ? 'common' : limitedMatches || activeMatches ? 'role' : 'unclear';
        add(kind, text, evidence, scope);
        continue;
      }
      const directlyNamed = normal(text).includes(wanted) && normal(clean(text)) !== wanted;
      if (sourceName === 'body' && dutyText(text) && !explicitlyOther
          && ((section === 'duties' && activeMatches) || (activeMatches && bullet(text)) || directlyNamed)) {
        if (!common) add('duties', text, evidence, 'role');
      }
      if (!bullet(text) && !heading && !dutyText(text) && text.length < 80) {
        section = ''; sectionStart = null; activeRole = titleRole ? desired : ''; activeRoleStart = null; common = false;
      }
    }
  }

  // OCR coordinates may establish an explicit table row when linear text has lost the column order.
  // A refreshed layout is only evidence for words still present in the saved current body.
  const currentBodyWords = snapshot.body.replace(/\s+/g, '');
  for (const image of tables.length ? [] : Array.isArray(job?.textLayout) ? job.textLayout : []) {
    if (!Number.isFinite(image?.width) || !Number.isFinite(image?.height) || !Array.isArray(image.lines)) continue;
    const lines = image.lines.filter(line => typeof line?.text === 'string' && line.text.trim()
      && currentBodyWords.includes(line.text.replace(/\s+/g, ''))
      && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(line[key]) && line[key] >= 0)
      && line.width > 0 && line.height > 0);
    const labels = lines.filter(line => normal(clean(line.text)) === wanted);
    for (const label of labels) {
      const candidates = lines.filter(line => {
        const overlap = Math.min(label.y + label.height, line.y + line.height) - Math.max(label.y, line.y);
        const sameRow = overlap >= Math.min(label.height, line.height) * 0.5;
        return sameRow && line.x >= label.x + label.width && line.x - label.x - label.width <= image.width * 0.45
          && dutyText(line.text) && (bullet(line.text) || /[,、]/.test(line.text));
      }).sort((a, b) => a.x - b.x);
      if (!candidates.length) continue;
      const nearest = candidates[0];
      // Two independent text boxes in the same candidate column make the association uncertain.
      if (candidates.some((item, index) => index > 0 && Math.abs(item.x - nearest.x) < Math.min(item.height, nearest.height))) continue;
      add('duties', nearest.text, `${label.text}\n${nearest.text}`, 'role');
    }
  }

  result.matched = result.duties.length > 0;
  if (!snapshot.body.trim()) result.notes.push('공고 본문 글자가 없어 희망 직무의 업무를 확인하지 못했어요. 원문 이미지를 확인해 주세요.');
  if (!result.matched) result.notes.push('현재 공고에서 희망 직무에 명확히 연결되는 업무를 찾지 못했어요. 직무명만 있거나 표의 관계가 불분명한 내용은 업무로 넣지 않았습니다.');
  if (!result.qualifications.length) result.notes.push('현재 공고에서 이 직무에 별도로 명시된 자격요건을 확인하지 못했어요.');
  if (!result.preferred.length) result.notes.push('현재 공고에서 이 직무에 별도로 명시된 우대사항을 확인하지 못했어요.');
  if (otherRoleCondition) result.notes.push('다른 직무 지원자에게만 적용되는 조건은 포함하지 않았어요.');
  if (unclearCondition) result.notes.push('해당 직무의 전공 항목에 글자 인식 오류가 있어요. 정확한 글자는 원문 이미지에서 확인해 주세요.');
  if (ocr) result.notes.push('이미지에서 읽은 글자에 오인식이 있을 수 있어요. 원문 이미지와 함께 확인해 주세요.');
  if (tooLong) result.notes.push('일부 항목은 표시 가능한 길이나 개수를 넘어 발췌하지 못했어요. 공고 본문에서 전체 내용을 확인해 주세요.');
  return result;
}
