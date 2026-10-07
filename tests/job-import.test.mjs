import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobFromHtml } from '../lib/job-import.mjs';
import { initialState, validateState } from '../lib/domain.mjs';

const url = 'https://s-oil.recruiter.co.kr/career/jobs/128790';
const image = 'https://s-oil.recruiter.co.kr/upload/255006/image/202609/f242422a-a985-4221-8da6-58df47f27c0a.jpg';
// Minimal public fields observed on the supplied page on 2026-10-07; no user data.
const html = `<html><head><title>에쓰오일 채용 | 2026년 S-OIL 사무직 신입사원 채용</title>
  <meta name="author" content="S-OIL"><meta property="og:title" content="2026년 S-OIL 사무직 신입사원 채용">
  <meta name="description" content="S-OIL에서 2026년 S-OIL 사무직 신입사원 채용 지원자를 모집하고 있어요.">
  <meta property="og:description" content="2026년 S-OIL 사무직 신입사원 채용"></head>
  <body><div id="loading-root"></div><script>window.placeholder = '본문은 별도 공개 요청으로 불러옵니다';</script></body></html>`;
const recruiterData = {
  title: '2026년 S-OIL 사무직 신입사원 채용',
  jobDescription: `<p><img src="${image}"><br></p><p><br></p>`,
  jobDescriptionType: 'HTML', careerType: 'NEW',
  endDateTime: '2026-10-14T23:59:59',
  tagList: [{ tagName: '홍보 · 마케팅' }, { tagName: '신입' }, { tagName: '생산 · 유통 · 품질' },
    { tagName: '경영기획 · 지원' }, { tagName: '신입' }],
};

test('S-OIL 이미지 공고는 원문 주소와 공개 필드를 보존하고 본문·조건을 만들어 넣지 않는다', () => {
  const job = parseJobFromHtml(html, url, recruiterData);
  assert.equal(job.company, 'S-OIL');
  assert.equal(job.role, recruiterData.title);
  assert.equal(job.type, '신입');
  assert.equal(job.deadline, '2026-10-14');
  assert.deepEqual(job.sourceImages, [image]);
  assert.equal(job.bodyFormat, 'image');
  assert.equal(job.body, '');
  assert.equal(job.requirements, '');
  assert.deepEqual(job.sourceTags, ['홍보 · 마케팅', '신입', '생산 · 유통 · 품질', '경영기획 · 지원']);
  assert.equal(job.url, url);
  const state = initialState();
  state.jobs.push(job);
  assert.doesNotThrow(() => validateState(state));
});

test('공개 API 텍스트 본문과 자격요건을 분리하고 메타 요약으로 대체하지 않는다', () => {
  const job = parseJobFromHtml(html, url, {
    ...recruiterData,
    jobDescription: '<h2>담당 업무</h2><p>국내 마케팅 기획과 운영 및 고객 조사 업무를 담당합니다.</p><h2>지원자격</h2><p>관련 전공의 학사 학위 보유자이며 자료 분석 도구를 사용할 수 있어야 합니다.</p><h2>우대사항</h2><p>관련 업무 경험</p>',
  });
  assert.equal(job.bodyFormat, 'text');
  assert.deepEqual(job.sourceImages, []);
  assert.match(job.body, /국내 마케팅 기획과 운영/);
  assert.match(job.requirements, /관련 전공의 학사 학위/);
  assert.match(job.requirements, /관련 업무 경험/);
  assert.doesNotMatch(job.body, /지원자를 모집하고 있어요/);
});

test('서버가 초기 제목과 미리보기 요약만 보낸 경우 성공 처리하지 않는다', () => {
  assert.throws(() => parseJobFromHtml(html, url), /충분히 찾지 못해/);
});

test('공고 구조화 본문은 짧은 SNS 요약보다 우선하고 HTML을 글자로 변환한다', () => {
  const schema = {
    '@type': 'JobPosting', title: '기획자 모집', hiringOrganization: { name: '가상회사' },
    description: '<p>주요 업무</p><p>사용자 조사와 제품 기획 및 서비스 운영 개선 업무를 담당합니다.</p><p>지원자격</p><p>문제를 분석하고 팀과 협업한 경험이 있어야 합니다.</p>',
    validThrough: '2026-10-14T01:00:00+09:00',
  };
  const job = parseJobFromHtml(`<meta property="og:description" content="짧은 홍보 문구"><script type="application/ld+json">${JSON.stringify(schema)}</script>`, 'https://example.com/jobs/1');
  assert.equal(job.deadline, '2026-10-14');
  assert.match(job.body, /사용자 조사와 제품 기획/);
  assert.doesNotMatch(job.body, /<p>|짧은 홍보/);
});

test('일반 페이지 본문은 SNS 요약보다 우선하고 메뉴·푸터 문구를 제외한다', () => {
  const textHtml = '<html><head><title>개발자 모집</title><meta property="og:description" content="미리보기"></head><body><header>반복 메뉴 문구</header><main><p>회사명: 가상회사</p><p>직무에 관한 자세한 안내입니다. 주요 업무는 서비스 개선과 운영이며 지원자격은 협업 및 문제 해결 경험입니다.</p></main><footer>페이지 바닥 문구</footer></body></html>';
  const job = parseJobFromHtml(textHtml, 'https://example.com/jobs/1');
  assert.equal(job.company, '가상회사');
  assert.match(job.body, /서비스 개선과 운영/);
  assert.doesNotMatch(job.body, /미리보기|반복 메뉴|바닥 문구/);
});

test('원문 이미지에 외부 사이트·HTTP·내부 주소·인증 주소를 허용하지 않는다', () => {
  for (const src of ['https://unrelated.example/image.jpg', 'http://s-oil.recruiter.co.kr/image.jpg',
    'https://127.0.0.1/image.jpg', 'https://local.invalid/image.jpg', 'https://user:secret@s-oil.recruiter.co.kr/image.jpg', 'javascript:alert(1)', 'data:image/png;base64,123']) {
    assert.throws(() => parseJobFromHtml(html, url, { ...recruiterData, jobDescription: `<img src="${src}">` }), /원문 이미지/);
  }
});

test('같은 출처 상대 이미지 주소와 HTML 특수문자를 해석하고 중복은 제거한다', () => {
  const job = parseJobFromHtml(html, url, { ...recruiterData,
    jobDescription: '<img src="/upload/poster.jpg?a=1&amp;b=2"><img src="/upload/poster.jpg?a=1&amp;b=2">' });
  assert.deepEqual(job.sourceImages, ['https://s-oil.recruiter.co.kr/upload/poster.jpg?a=1&b=2']);
});

test('이미지 개수 제한으로 원문의 일부가 조용히 누락되지 않는다', () => {
  assert.throws(() => parseJobFromHtml(html, url, { ...recruiterData,
    jobDescription: Array.from({ length: 13 }, (_, i) => `<img src="/upload/${i}.jpg">`).join('') }), /이미지가 너무 많아/);
});

test('공개 API의 지원하지 않는 형식과 잘못된 필드를 저장하지 않는다', () => {
  for (const override of [{ title: [] }, { title: '' }, { jobDescription: {} }, { jobDescriptionType: 'JSON' }]) {
    assert.throws(() => parseJobFromHtml(html, url, { ...recruiterData, ...override }), /본문 형식/);
  }
  assert.throws(() => parseJobFromHtml(html, url, { ...recruiterData, jobDescription: '<p></p>' }), /공고 본문/);
});

test('없는 마감 날짜는 만들지 않고 잘못된 태그 필드는 무시한다', () => {
  const job = parseJobFromHtml(html, url, { ...recruiterData, endDateTime: '2026-02-31T23:59:59',
    tagList: [null, { tagName: {} }, { tagName: '정상 분류' }, { tagName: '정상 분류' }] });
  assert.equal(job.deadline, '');
  assert.deepEqual(job.sourceTags, ['정상 분류']);
});
