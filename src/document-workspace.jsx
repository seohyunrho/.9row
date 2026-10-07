import React,{useEffect,useRef} from 'react';
import {useOffice} from './ui.jsx';

export function DocumentWorkspace({page,children}) {
  const {selectedJob,selectedEssayId}=useOffice();
  const stageRef=useRef(null);
  useEffect(()=>{stageRef.current?.closest('.room-work-content')?.scrollTo({top:0});},[page,selectedJob,selectedEssayId]);
  return <div className="document-workspace focused-desk">
    <div ref={stageRef} className={`document-stage document-page-${page}`}>{children}</div>
  </div>;
}
