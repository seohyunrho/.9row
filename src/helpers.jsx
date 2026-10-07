import React, { useEffect } from 'react';
import { Plug } from 'lucide-react';
import { useOffice } from './ui.jsx';
export function useGuard(dirty) { const {setDirty}=useOffice();useEffect(()=>{setDirty(dirty);const listener=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>{setDirty(false);window.removeEventListener('beforeunload',listener);};},[dirty]); }
export function AiStatus({children='AI 연결 전입니다. 지금은 직접 정리하고 작성한 내용을 저장할 수 있어요.'}) {return <div className="ai-status"><Plug size={15}/><span>{children}</span></div>;}
export async function copyText(text,notify){try{await navigator.clipboard.writeText(text);notify('클립보드에 복사했어요');}catch{notify('복사 권한을 확인하거나 글을 직접 선택해 복사해 주세요');}}
export const clone=x=>structuredClone(x);
