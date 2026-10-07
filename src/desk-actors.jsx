import React,{useEffect,useState} from 'react';

export const actorAssets={clean:'/office-empty-v14.png',sprites:'/office-actors-v14.png'};

// Both assets must load before replacing any part of the original illustration.
export function useActorAssets(){
  const [ready,setReady]=useState(false);
  const [hidden,setHidden]=useState(document.hidden);
  useEffect(()=>{
    let active=true;
    const images=Object.values(actorAssets).map(src=>{
      const image=new Image();
      const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
      image.src=src;
      return {image,loaded};
    });
    Promise.all(images.map(item=>item.loaded)).then(()=>{if(active)setReady(true);}).catch(()=>{});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    const update=()=>setHidden(document.hidden);
    document.addEventListener('visibilitychange',update);
    return()=>document.removeEventListener('visibilitychange',update);
  },[]);
  return {ready,hidden};
}

// Localized background repairs keep the rest of the existing room untouched.
const geometry={
  noa:{row:0,x:37.15,y:32.7,w:6.5,h:10.2,clean:[34.95,33.7,4.55,7.6]},
  daram:{row:1,x:61.9,y:32.7,w:8.0,h:10.2,clean:[58.45,33.7,6.2,8.2]},
  mori:{row:2,x:36.25,y:51.9,w:6.5,h:10.7,clean:[34.3,53.0,4.5,8.25]},
  tori:{row:3,x:64.1,y:51.8,w:6.8,h:11.0,clean:[61.7,52.9,4.5,8.9]}
};

export function DeskActor({person}){
  const actor=geometry[person.id];
  const [cx,cy,cw,ch]=actor.clean;
  const buttonLeft=person.x-9,buttonTop=person.y-6;
  const cleanStyle={
    left:`${(cx-buttonLeft)/18*100}%`,top:`${(cy-buttonTop)/19*100}%`,
    width:`${cw/18*100}%`,height:`${ch/19*100}%`,
    backgroundSize:`${100/cw*100}% ${100/ch*100}%`,
    backgroundPosition:`${cx/(100-cw)*100}% ${cy/(100-ch)*100}%`
  };
  const spriteStyle={
    left:`${(actor.x-buttonLeft)/18*100}%`,top:`${(actor.y-buttonTop)/19*100}%`,
    width:`${actor.w/18*100}%`,height:`${actor.h/19*100}%`,
    '--typing-delay':`${-actor.row*730}ms`
  };
  const cropY=[120,455,790,1120][actor.row],cropH=270,cropW=320;
  const frameStyle=column=>({backgroundSize:`${1086/cropW*100}% ${1448/cropH*100}%`,backgroundPosition:`${[35,380,730][column]/(1086-cropW)*100}% ${cropY/(1448-cropH)*100}%`});
  return <span className="desk-actor-layer" aria-hidden="true">
    <span className="actor-clean-patch" style={cleanStyle}/>
    <span className="desk-actor" style={spriteStyle}>
      <span className="actor-idle"><span className="actor-frame actor-frame-a" style={frameStyle(0)}/><span className="actor-frame actor-frame-b" style={frameStyle(1)}/></span>
      <span className="actor-frame actor-looking" style={frameStyle(2)}/>
    </span>
  </span>;
}
