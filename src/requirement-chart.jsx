import React from 'react';
import {summarizeRequirements} from '../lib/requirements.mjs';
const colors=['#3b5c94','#597bb0','#7697c3','#96afd0','#b3c5de','#d1ddec'];
export function RequirementChart({jobs}) {
  const {entries,total,slices,jobCount}=summarizeRequirements(jobs);
  if(!total)return <p className="muted-copy">아직 정리한 조건이 없어요. 공고에 핵심 조건을 한 줄씩 적으면 차트가 채워집니다.</p>;
  let offset=0;
  const gradient=slices.map((item,i)=>{const start=offset;offset+=item.count/total*100;return `${colors[i]} ${start}% ${offset}%`;}).join(',');
  return <><p className="helper">전체 조건 언급 {total}건 중 각 조건이 차지하는 비율입니다.</p><div className="requirement-chart"><div className="condition-donut" style={{background:`conic-gradient(${gradient})`}} role="img" aria-label={`조건 언급 총 ${total}건. 항목별 비율과 건수는 옆 목록에서 확인할 수 있습니다.`}><div><strong>{total}</strong><span>조건 언급</span></div></div><ol className="condition-legend">{slices.map((item,i)=><li key={item.text}><i style={{background:colors[i]}} aria-hidden="true"/><span>{item.text}</span><strong>{(item.count/total*100).toFixed(1)}%<small>{item.count}건</small></strong></li>)}</ol></div><small className="helper">한 공고 안의 같은 조건은 한 번만 셉니다. 채용 중요도나 나의 역량 점수는 아닙니다.</small><details className="condition-details"><summary>전체 조건 {entries.length}개 · 출처 보기</summary>{entries.map(item=><div className="requirement-row" key={item.text}><div><strong>{item.text}</strong><small>{item.companies.join(' · ')}</small></div><span>{item.count}<small>/{jobCount}개 공고</small></span></div>)}</details></>;
}
