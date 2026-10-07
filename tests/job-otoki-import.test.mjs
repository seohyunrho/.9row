import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobFromHtml } from '../lib/job-import.mjs';
import { initialState, validateState } from '../lib/domain.mjs';
import { buildRoleDescription } from '../lib/job-role-description.mjs';

const url = 'https://www.otoki.com/about/recruitment-detail?page=1&recruitmentContentIdx=64&sword=&category=';
// Minimal public structure observed on the supplied Otoki posting, 2026-10-07.
const html = `<html><head><title>오뚜기</title><meta property="og:title" content="오뚜기">
  <meta property="og:site_name" content="오뚜기"><meta name="description" content="식품 전문업체 소개"></head>
  <body><header>반복 메뉴</header><main><section class="board_detail"><div class="inner">
  <div class="tit_wrap"><h2 class="tit">(주)오뚜기 2026년 하반기 대졸신입사원 및 외국인유학생 채용</h2><div class="date">2026.10.07</div></div>
  <div class="detail_content"><div class="detail_edit" id="boardContent"><div class="recruit_wrap"><div class="inner">
  <p><img src="/pds/editor/banner.png" alt="2026년 하반기 채용"></p><p>내국인 모집부문</p>
  <table><thead><tr><th>직무</th><th>근무지</th><th>담당업무 및 비전</th><th>우대전공</th><th>자격요건</th></tr></thead><tbody>
  <tr><td>B2C영업</td><td>수도권</td><td><ul><li>거래처 대상 제품소개 및 상담, 취급 품목 확대</li><li>신규시장 개척과 시장조사, 영업 전략 수립</li></ul></td>
  <td rowspan="2">전공무관<br>* 조리/외식 경영,<br>식품 계열 우대</td><td rowspan="2"><dl><dt>[필수]</dt><dd>운전면허증 소지자</dd></dl><dl><dt>[우대]</dt><dd>지원 근무지역의<br>특성/문화/시장이해도 우수자</dd></dl></td></tr>
  <tr><td>B2B영업</td><td>수도권</td><td><ul><li>대형 식자재 및 케이터링 업체 대상 제품소개 및 상담</li><li>외식, 프랜차이즈 영업 등을 통한 신제품 개발 및 신규 시장 개척</li></ul></td></tr>
  <tr><td>B2B마케팅</td><td>안양</td><td><ul><li>B2B 전용 신제품/리뉴얼 제품 기획 및 런칭</li></ul></td><td>상경 계열<br>통계학</td>
  <td><dl><dt>[우대]</dt><dd>데이터 분석 및 시장조사 경험 보유자</dd></dl></td></tr></tbody></table>
  <p class="tit">공통지원자격</p><ul><li>4년제 대학교 2027년 2월 졸업예정자 및 기졸업자</li><li>병역필 또는 면제, 해외여행에 결격사유가 없는 자</li></ul>
  <p class="tit">서류접수기간 및 방법</p><ul><li>기간: <b>2026년 10월 7일(수) ~ 10월 15일(목) 22:00</b></li><li>방법: 지원하기 링크에서 작성</li></ul>
  <p>전형 절차</p><img src="/pds/editor/process.png?a=1&amp;b=2" alt="서류전형, 면접, 최종합격">
  </div></div></div><div class="adjacent">이전 공고 제목, 다음 공고 제목</div></div></div></section></main><footer>개인정보처리방침</footer></body></html>`;

test('오뚜기의 실제 상세 제목·회사·텍스트·원문 이미지를 가져온다', () => {
  const job = parseJobFromHtml(html, url);
  assert.equal(job.company, '오뚜기');
  assert.equal(job.role, '(주)오뚜기 2026년 하반기 대졸신입사원 및 외국인유학생 채용');
  assert.equal(job.type, '신입');
  assert.equal(job.deadline, '2026-10-15');
  assert.equal(job.url, url);
  assert.equal(job.bodyFormat, 'text');
  assert.equal(job.textExtraction, undefined);
  assert.match(job.body, /B2B 전용 신제품\/리뉴얼 제품 기획 및 런칭/);
  assert.match(job.body, /공통지원자격/);
  assert.match(job.body, /서류전형, 면접, 최종합격/);
  assert.doesNotMatch(job.body, /반복 메뉴|식품 전문업체 소개|이전 공고|다음 공고|개인정보처리방침|<td>/);
  assert.deepEqual(job.sourceImages, ['https://www.otoki.com/pds/editor/banner.png', 'https://www.otoki.com/pds/editor/process.png?a=1&b=2']);
  const state = initialState();
  state.jobs.push(job);
  assert.doesNotThrow(() => validateState(state));
});

test('두 행에 걸친 자격조건을 두 직무에 보존하며 다음 직무에 섞지 않는다', () => {
  const job = parseJobFromHtml(html, url);
  for (const role of ['B2C영업', 'B2B영업']) {
    const result = buildRoleDescription(job, role);
    assert.equal(result.matched, true);
    assert.match(result.qualifications.map(item => item.text).join('\n'), /운전면허증 소지자/);
    assert.match(result.preferred.map(item => item.text).join('\n'), /특성\/문화\/시장이해도 우수자/);
    assert.doesNotMatch(JSON.stringify([...result.duties, ...result.qualifications, ...result.preferred].map(item => item.text)), /졸업예정자|병역필|데이터 분석 및 시장조사/);
  }
  const marketing = buildRoleDescription(job, 'B2B마케팅');
  assert.equal(marketing.matched, true);
  assert.match(marketing.preferred.map(item => item.text).join('\n'), /데이터 분석 및 시장조사 경험 보유자/);
  assert.doesNotMatch(marketing.qualifications.map(item => item.text).join('\n'), /운전면허증/);
});

test('게시일·졸업일을 마감일로 쓰지 않고 누락되거나 틀린 마감일은 빈값으로 둔다', () => {
  assert.equal(parseJobFromHtml(html.replace('2026년 10월 7일(수) ~ 10월 15일(목) 22:00', '별도 공지'), url).deadline, '');
  assert.equal(parseJobFromHtml(html.replace('10월 15일', '10월 32일'), url).deadline, '');
  assert.equal(parseJobFromHtml(html.replace('10월 15일', '2027년 1월 5일'), url).deadline, '2027-01-05');
});

test('공고 제목과 게시글 영역이 확인되지 않으면 사이트 소개로 대신 저장하지 않는다', () => {
  assert.throws(() => parseJobFromHtml(html.replace('id="boardContent"', 'id="other"'), url), /공고 제목과 본문/);
  assert.throws(() => parseJobFromHtml(html.replace('class="tit"', 'class="unrelated"'), url), /공고 제목과 본문/);
  assert.throws(() => parseJobFromHtml(html, 'https://example.com/about/recruitment-detail?recruitmentContentIdx=64'), /충분히 찾지 못해/);
});

test('오뚜기 표 구조가 달라지거나 일부 칸이 없으면 조건을 추정하지 않는다', () => {
  assert.throws(() => parseJobFromHtml(html.replace('<th>우대전공</th>', '<th>다른 조건</th>'), url), /모집 표 형식/);
  assert.throws(() => parseJobFromHtml(html.replace('rowspan="2"', 'rowspan="2000"'), url), /합쳐진 칸/);
  assert.throws(() => parseJobFromHtml(html.replace('<td>안양</td>', ''), url), /일부 내용을/);
});

test('오뚜기 원문 이미지에도 같은 사이트의 공개 HTTPS 주소 기준을 적용한다', () => {
  for (const src of ['https://unrelated.example/banner.png', 'http://www.otoki.com/banner.png', 'https://user:secret@www.otoki.com/banner.png', 'data:image/png;base64,123']) {
    assert.throws(() => parseJobFromHtml(html.replace('/pds/editor/banner.png', src), url), /원문 이미지/);
  }
});
