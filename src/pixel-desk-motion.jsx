import React,{useEffect,useId,useState} from 'react';

// Reuse only tiny regions of the original art, at its original scale.
// Coordinates are source-image pixels, not a replacement character illustration.
const parts={
  noa:{neck:[590,389],tilt:-5,head:'572,337 577,337 582,343 595,343 600,346 607,340 614,340 615,346 612,353 617,360 620,369 618,378 614,383 605,388 592,391 578,389 567,385 560,378 558,368 560,358 565,350 571,347',eyes:[[570,360,12,14],[588,362,14,15]],hands:[[574,392,15,11]]},
  daram:{neck:[997,391],tilt:5,head:'975,339 980,339 987,350 993,350 998,339 1003,336 1007,341 1009,353 1015,360 1019,371 1020,381 1014,387 1003,392 991,392 980,388 973,382 969,372 971,360 974,354',eyes:[[986,366,13,15],[1008,365,10,12]],hands:[[992,397,14,10]]},
  mori:{neck:[579,586],tilt:-5,head:'559,529 564,529 571,541 581,541 588,544 600,536 605,539 605,553 609,562 609,573 604,579 595,585 582,589 568,586 557,581 550,574 546,570 543,569 543,566 550,566 550,560 555,550',eyes:[[558,558,12,13],[577,561,14,14]],hands:[[567,587,17,12]]},
  tori:{neck:[1014,587],tilt:5,head:'989,526 995,527 1007,539 1017,541 1033,531 1042,531 1045,535 1044,549 1040,558 1042,566 1040,576 1032,583 1023,587 1012,590 1000,586 989,580 982,572 982,561 985,554 985,537',eyes:[[1002,557,13,13],[1024,557,11,13]],hands:[[996,590,18,14],[1017,589,11,13]]}
};

export function useRoomVisibility(){
  const [hidden,setHidden]=useState(document.hidden);
  useEffect(()=>{
    const update=()=>setHidden(document.hidden);
    document.addEventListener('visibilitychange',update);
    return()=>document.removeEventListener('visibilitychange',update);
  },[]);
  return hidden;
}

export function PixelDeskMotion({person,index}){
  const clipId=`head-${useId().replace(/:/g,'')}`;
  const [plateReady,setPlateReady]=useState(false);
  useEffect(()=>{
    let active=true;
    const plate=new Image();
    plate.onload=()=>{if(active)setPlateReady(true);};
    plate.src='/office-empty-v14.png';
    return()=>{active=false;plate.onload=null;};
  },[]);
  const left=(person.x-9)/100*1586,top=(person.y-6)/100*992;
  const {head,neck,tilt,hands}=parts[person.id];
  const clearId=`${clipId}-clear`,clearBoundsId=`${clipId}-clear-bounds`;
  const headBottom=Math.max(...head.split(' ').map(point=>Number(point.split(',')[1])))+1;
  const patch=(rect,kind,i)=><svg key={`${kind}-${i}`} x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} viewBox={rect.join(' ')} overflow="hidden">
    <image className={`pixel-${kind}`} href="/office-expanded-v06.png" width="1586" height="992" style={{animationDelay:`${-index*690-i*120}ms`}}/>
  </svg>;
  return <svg className="pixel-desk-motion" viewBox={`${left} ${top} ${1586*.18} ${992*.19}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {parts[person.id].eyes.map((rect,i)=>patch(rect,'gaze',i))}
    {hands.map((rect,i)=>patch(rect,'typing',i))}
    <defs>
      <clipPath id={clipId} clipPathUnits="userSpaceOnUse"><polygon points={head}/></clipPath>
      <clipPath id={clearBoundsId} clipPathUnits="userSpaceOnUse"><rect width="1586" height={headBottom}/></clipPath>
      {/* The repair must extend beyond the moving cutout: the source artwork
          has a thick pixel outline outside the hand-traced head polygon.
          Stop at the chin so the collar and paws are not erased. */}
      <mask id={clearId} maskUnits="userSpaceOnUse" x="0" y="0" width="1586" height="992" style={{maskType:'alpha'}}>
        <polygon points={head} fill="white" stroke="white" strokeWidth="8" strokeLinejoin="round"/>
      </mask>
    </defs>
    {/* Paint the head last, so stationary hand/eye patches cannot restore
        pieces of the old jaw on top of the tilted head. */}
    {plateReady&&<g className="pixel-head-layer">
      <image href="/office-empty-v14.png" width="1586" height="992" preserveAspectRatio="none" mask={`url(#${clearId})`} clipPath={`url(#${clearBoundsId})`}/>
      <svg x={neck[0]} y={neck[1]} width="1" height="1" viewBox="0 0 1 1" overflow="visible">
        <g className="pixel-head-tilt" style={{'--head-tilt':`${tilt}deg`}}>
          <g transform={`translate(${-neck[0]} ${-neck[1]})`}>
            <image href="/office-expanded-v06.png" width="1586" height="992" clipPath={`url(#${clipId})`}/>
          </g>
        </g>
      </svg>
    </g>}
  </svg>;
}
