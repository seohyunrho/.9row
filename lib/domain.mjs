import { randomUUID } from 'node:crypto';
import {normalizeProfile,profileErrors} from './profile.mjs';

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const dateAfter = (days) => { const d = new Date(`${today()}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + days); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d); };
export const initialState = (demo = false) => ({
  schemaVersion: 1,
  profile: { name: '', email: '', phone: '', school: '', major: '', target: demo ? '서비스 기획 · 신입' : '', source: '', confirmed: false },
  experiences: demo ? [
    { id: 'exp-survey', title: '동아리 행사 참여 경험 개선', category: '동아리', period: '2025.03 – 2025.06', description: '행사 참여 후 의견을 모으기 위해 설문을 만들고 응답을 정리했습니다. 참여자들이 신청 절차를 어려워한다는 점을 발견했습니다.', role: '설문 설계와 응답 정리', action: '응답을 유형별로 정리하고, 팀원들과 신청 안내를 수정했습니다.', result: '다음 행사에서 수정한 안내를 사용했습니다. 만족도 수치는 측정하지 않았습니다.', confirmed: true, updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'exp-team', title: '팀 프로젝트의 일정과 역할 정리', category: '프로젝트', period: '2025.09 – 2025.12', description: '수업 팀 프로젝트에서 할 일이 겹쳐 일정이 늦어지는 문제를 정리했습니다.', role: '작업 일정 조율', action: '작업 목록과 담당자를 정리하고 주간 진행 상황을 공유했습니다.', result: '', confirmed: false, updatedAt: '2026-10-02T00:00:00Z' },
    { id: 'exp-research', title: '일상 서비스 사용성 관찰', category: '개인 활동', period: '2026.01 – 2026.02', description: '자주 사용하는 서비스의 가입 과정을 비교하고 불편한 지점을 메모했습니다.', role: '사용 흐름 조사', action: '화면별로 필요한 입력과 이탈할 만한 지점을 기록했습니다.', result: '서비스 개선 아이디어를 문서로 정리했습니다.', confirmed: true, updatedAt: '2026-10-03T00:00:00Z' },
  ] : [],
  jobs: demo ? [
    { id: 'job-onul', company: '오늘의생활', role: '서비스 기획', type: '신입', deadline: dateAfter(7), url: '', body: '[가상 공고 · 체험용]\n담당 업무: 고객 의견을 바탕으로 서비스 이용 경험을 개선합니다.\n필수 조건: 문제를 구조화하고 팀과 논의한 경험\n우대 사항: 설문 또는 사용성 조사 경험, 개선안을 문서로 정리한 경험', requirements: '고객의 불편 파악\n협업을 통한 문제 해결\n조사 내용을 개선안으로 연결', stage: 'writing', color: 'green', createdAt: new Date().toISOString() },
    { id: 'job-paper', company: '페이퍼랩', role: '콘텐츠 마케팅', type: '신입', deadline: dateAfter(12), url: '', body: '[가상 공고 · 체험용]\n담당 업무: 브랜드 콘텐츠를 기획하고 운영합니다.\n필수 조건: 대상 독자를 고려한 글쓰기 경험\n우대 사항: 콘텐츠 반응을 기록하고 개선한 경험', requirements: '독자를 고려한 글쓰기\n콘텐츠 기획\n운영 결과의 개선', stage: 'saved', color: 'blue', createdAt: new Date().toISOString() },
    { id: 'job-podo', company: '포도스튜디오', role: '프로덕트 운영', type: '신입', deadline: dateAfter(18), url: '', body: '[가상 공고 · 체험용]\n담당 업무: 사용자 문의를 정리하고 운영 절차를 개선합니다.\n필수 조건: 꼼꼼한 자료 정리와 의사소통\n우대 사항: 협업 프로젝트 경험', requirements: '자료 정리\n의사소통\n협업 경험', stage: 'saved', color: 'purple', createdAt: new Date().toISOString() },
  ] : [],
  essays: demo ? [{ id: 'essay-demo', jobId: 'job-onul', question: '문제를 발견하고 개선한 경험을 소개해 주세요.', limit: 800, includeSpaces: true, experienceIds: ['exp-survey'], outline: '문제 발견 → 설문으로 확인 → 팀과 개선 → 배운 점', draft: '', versions: [], updatedAt: new Date().toISOString() }] : [],
  applications: [],
  prompts: [],
  preferences: { reducedMotion: false },
});

export function validateState(data) {
  if (!data || data.schemaVersion !== 1 || !data.profile || typeof data.profile !== 'object' || !data.preferences || typeof data.preferences.reducedMotion !== 'boolean') throw new Error('자료 형식이 올바르지 않습니다.');
  const strings = (object,keys) => { for(const key of keys) if(typeof object[key] !== 'string' || object[key].length>300_000) throw new Error(`${key}: 글자 형식의 자료가 필요합니다.`); };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  strings(data.profile,['name','email','phone','school','major','target','source']);
  if(typeof data.profile.confirmed !== 'boolean')throw new Error('프로필 확인 상태가 올바르지 않습니다.');
  const detailErrors=profileErrors(normalizeProfile(data.profile));
  if(Object.keys(detailErrors).length)throw new Error(Object.values(detailErrors)[0]);
  for (const key of ['experiences', 'jobs', 'essays', 'applications', 'prompts']) {
    if (!Array.isArray(data[key]) || data[key].length > 3000) throw new Error(`${key}: 허용되지 않는 자료 형식입니다.`);
    const ids = new Set();
    for (const item of data[key]) {
      if (!item || typeof item.id !== 'string' || item.id.length > 150 || ids.has(item.id)) throw new Error(`${key}: 기록 식별자가 중복되거나 없습니다.`);
      ids.add(item.id);
    }
  }
  const jobIds = new Set(data.jobs.map(j => j.id));
  const expIds = new Set(data.experiences.map(e => e.id));
  for (const job of data.jobs) {
    strings(job,['company','role','type','deadline','url','body','requirements','stage','color','createdAt']);
    if(job.deadline&&!validDate(job.deadline))throw new Error('마감 날짜를 확인해 주세요.');
    if (!String(job.company || '').trim() || !String(job.role || '').trim()) throw new Error('회사와 직무를 입력해 주세요.');
    if (job.url && !/^https?:\/\//i.test(job.url)) throw new Error('공고 주소는 http 또는 https 주소여야 합니다.');
    if (job.desiredRole !== undefined && (typeof job.desiredRole !== 'string' || job.desiredRole.length > 150)) throw new Error('희망 직무는 150자 이내의 글자로 입력해 주세요.');
    if (job.roleDescription !== undefined && job.roleDescription !== null) {
      const description = job.roleDescription;
      const shortText = (value, limit) => typeof value === 'string' && value.length <= limit;
      if (!description || typeof description !== 'object' || Array.isArray(description)
          || !shortText(description.desiredRole, 150) || !description.desiredRole.trim()
          || description.sourceMode !== 'posting-only' || typeof description.matched !== 'boolean'
          || !shortText(description.generatedAt, 100) || !Number.isFinite(Date.parse(description.generatedAt))) {
        throw new Error('직무별 공고 정리의 형식이 올바르지 않습니다.');
      }
      for (const key of ['duties', 'qualifications', 'preferred']) {
        if (!Array.isArray(description[key]) || description[key].length > 100) throw new Error('직무별 발췌 항목은 종류별 100개까지 저장할 수 있습니다.');
        for (const item of description[key]) {
          if (!item || typeof item !== 'object' || Array.isArray(item) || !shortText(item.text, 6000) || !item.text.trim()
              || !shortText(item.evidence, 6000) || !item.evidence.trim()
              || (item.scope !== undefined && !['common', 'role', 'unclear'].includes(item.scope))) {
            throw new Error('직무별 발췌 내용과 근거 형식을 확인해 주세요.');
          }
        }
      }
      if (!Array.isArray(description.notes) || description.notes.length > 30 || description.notes.some(note => !shortText(note, 1000))) throw new Error('직무별 공고 정리 안내 형식을 확인해 주세요.');
      const snapshot = description.sourceSnapshot;
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
          || !shortText(snapshot.body, 60000) || !shortText(snapshot.requirements, 60000)
          || !shortText(snapshot.role, 300000) || !shortText(snapshot.url, 300000)
          || (snapshot.extractedAt !== undefined && !shortText(snapshot.extractedAt, 100))) {
        throw new Error('직무별 정리에 사용한 공고 원문 형식을 확인해 주세요.');
      }
    }
    if (job.textLayout !== undefined) {
      if (!Array.isArray(job.textLayout) || job.textLayout.length > 12) throw new Error('공고 이미지의 글자 위치 정보는 12장까지 저장할 수 있습니다.');
      const imageIndexes = new Set();
      for (const layout of job.textLayout) {
        if (!layout || typeof layout !== 'object' || Array.isArray(layout) || !Number.isInteger(layout.imageIndex)
            || layout.imageIndex < 0 || layout.imageIndex > 11 || imageIndexes.has(layout.imageIndex)
            || !Number.isFinite(layout.width) || !Number.isFinite(layout.height)
            || layout.width < 1 || layout.height < 1 || layout.width > 100000 || layout.height > 100000
            || !Array.isArray(layout.lines) || layout.lines.length > 5000) {
          throw new Error('공고 이미지의 글자 위치 정보 형식을 확인해 주세요.');
        }
        imageIndexes.add(layout.imageIndex);
        if (layout.rules !== undefined && (!Array.isArray(layout.rules) || layout.rules.length > 1000 || layout.rules.some(rule =>
          !rule || ['x','y','width','height'].some(key => !Number.isFinite(rule[key]) || rule[key] < 0)
          || rule.width <= 0 || rule.height <= 0 || rule.x + rule.width > layout.width + 1 || rule.y + rule.height > layout.height + 1))) {
          throw new Error('공고 표의 구분선 정보가 올바르지 않습니다.');
        }
        for (const line of layout.lines) {
          if (!line || typeof line !== 'object' || Array.isArray(line) || typeof line.text !== 'string' || line.text.length > 6000
              || ['x', 'y', 'width', 'height'].some(key => !Number.isFinite(line[key]) || line[key] < 0)
              || line.x + line.width > layout.width + 1 || line.y + line.height > layout.height + 1) {
            throw new Error('공고 이미지의 글자 좌표가 올바르지 않습니다.');
          }
        }
      }
    }
  }
  for (const exp of data.experiences) {
    strings(exp,['title','description','category','period','role','action','result','updatedAt']);
    if(typeof exp.confirmed !== 'boolean')throw new Error('경험 확인 상태가 올바르지 않습니다.');
    if (!exp.title.trim() || !exp.description.trim()) throw new Error('경험 제목과 내용을 입력해 주세요.');
  }
  for (const essay of data.essays) {
    strings(essay,['question','outline','draft','updatedAt']);
    if(!Number.isInteger(essay.limit)||essay.limit<1||essay.limit>50_000||typeof essay.includeSpaces!=='boolean')throw new Error('글자 수 조건이 올바르지 않습니다.');
    if (!jobIds.has(essay.jobId)) throw new Error('자소서에 연결된 공고가 없습니다.');
    if (!Array.isArray(essay.versions) || !Array.isArray(essay.experienceIds)) throw new Error('자소서 버전 또는 경험 형식이 올바르지 않습니다.');
    if (essay.experienceIds.some(id => !expIds.has(id))) throw new Error('선택한 경험을 찾을 수 없습니다.');
    if (!String(essay.question || '').trim()) throw new Error('자소서 문항을 입력해 주세요.');
    if(essay.reviews!==undefined) {
      if(!Array.isArray(essay.reviews)||essay.reviews.length>300)throw new Error('피드백은 문항당 300개까지 저장할 수 있습니다.');
      const reviewIds=new Set();
      for(const review of essay.reviews) {
        if(!review||typeof review!=='object')throw new Error('피드백 형식이 올바르지 않습니다.');
        strings(review,['id','text','model','createdAt','draftSnapshot','questionSnapshot']);
        if(!review.id||reviewIds.has(review.id)||!review.text.trim())throw new Error('피드백 내용이나 식별값을 확인해 주세요.');
        reviewIds.add(review.id);
      }
    }
    for(const version of essay.versions) {strings(version,['id','text','outline','question','createdAt','source']);if(!Array.isArray(version.experienceIds)||version.experienceIds.some(id=>!expIds.has(id)))throw new Error('이전 버전의 경험 연결이 올바르지 않습니다.');}
  }
  for (const record of data.applications) {
    strings(record,['company','role','status','appliedAt','source']);
    if(!['지원 완료','확인 필요','제출 실패','서류 검토 중','면접','합격','불합격','지원 취소'].includes(record.status))throw new Error('지원 상태를 확인해 주세요.');
    if (!String(record.company || '').trim() || !String(record.role || '').trim()) throw new Error('지원 기록에 회사와 직무가 필요합니다.');
    if ((record.status === '지원 완료' || record.appliedAt) && !validDate(record.appliedAt)) throw new Error('지원 완료 날짜를 확인해 주세요.');
  }
  for(const prompt of data.prompts) {strings(prompt,['stage','name','content','createdAt']);if(!prompt.content.trim()||!prompt.name.trim()||!Number.isInteger(prompt.version)||typeof prompt.active!=='boolean')throw new Error('프롬프트 내용을 확인해 주세요.');}
  if (JSON.stringify(data).length > 3_000_000) throw new Error('자료 크기가 너무 큽니다.');
  return data;
}

export function applyCapture(state, event) {
  const allowed = new Set(['eventId', 'company', 'role', 'status', 'appliedAt']);
  if (!event || Object.keys(event).some(k => !allowed.has(k))) throw new Error('회사·직무·지원일·시험 상태 외 정보는 수집하지 않습니다.');
  for (const key of ['eventId', 'company', 'role']) if (typeof event[key] !== 'string' || !event[key].trim() || event[key].length > 150) throw new Error('시험 기록의 필수 항목을 확인해 주세요.');
  if (!['confirmed', 'failed', 'unknown'].includes(event.status)) throw new Error('제출 상태가 올바르지 않습니다.');
  if (event.status === 'confirmed' && !/^\d{4}-\d{2}-\d{2}$/.test(event.appliedAt || '')) throw new Error('접수 확인 날짜가 없습니다.');
  const record = state.applications.find(a => a.eventId === event.eventId);
  const status = { confirmed: '지원 완료', failed: '제출 실패', unknown: '확인 필요' }[event.status];
  if (record) {
    if (record.status !== '지원 완료') Object.assign(record, { status, appliedAt: event.status === 'confirmed' ? event.appliedAt : '' });
    return record.id;
  }
  const id = randomUUID();
  state.applications.unshift({ id, eventId: event.eventId, company: event.company, role: event.role, status, appliedAt: event.status === 'confirmed' ? event.appliedAt : '', source: '확장 프로그램 시험', note: '로컬 시험 페이지에서 감지한 가상 지원입니다.' });
  return id;
}
