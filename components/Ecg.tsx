import {useId,useMemo,useRef,useState} from 'react';
import {RhythmId,rhythms} from '../lib/data';

type Beat={at:number;type:'narrow'|'wide'|'paced';p?:number;gain?:number;st?:number};
const G=(t:number,m:number,s:number)=>Math.exp(-.5*((t-m)/s)**2);
const irregular=[.77,1.23,.69,1.29,.84,1.12,.73,1.37,.91,1.05,.66,1.16,1.31];
const waveNotes={
 P:{title:'Зубець P',description:'Деполяризація передсердь. Оціни наявність, форму та зв’язок із кожним QRS. У ФП типовий P відсутній.'},
 Q:{title:'Зубець Q',description:'Перша негативна дефлексія комплексу QRS перед R. Патологічність оцінюють за тривалістю, глибиною та відповідними відведеннями.'},
 R:{title:'Зубець R',description:'Перша позитивна дефлексія комплексу QRS — деполяризація шлуночків. Оціни амплітуду та прогресію R у грудних відведеннях.'},
 S:{title:'Зубець S',description:'Негативна дефлексія після R. Її форма й співвідношення з R допомагають у морфологічній оцінці QRS.'},
 T:{title:'Зубець T',description:'Реполяризація шлуночків. Звертай увагу на полярність, симетрію, висоту та узгодженість із QRS.'},
 PR:{title:'Інтервал PR',description:'Від початку P до початку QRS. Типова норма для дорослого: 120–200 мс; оцінюй у реальному записі.'},
 QRS:{title:'Тривалість QRS',description:'Від початку Q (або R, якщо Q немає) до кінця S. Зазвичай вузький комплекс <120 мс; широкий потребує уточнення.'},
 ST:{title:'Сегмент ST',description:'Від J-точки до початку T. Зміщення оцінюють у конкретних анатомічно суміжних відведеннях і клінічному контексті.'},
 QT:{title:'Інтервал QT',description:'Від початку QRS до кінця T; містить деполяризацію і реполяризацію шлуночків. Потрібна корекція за ЧСС (QTc).'},
 RR:{title:'Інтервал RR',description:'Час між сусідніми R. При регулярному ритмі ЧСС ≈ 60/RR (у секундах). Оціни регулярність.'},
 BASE:{title:'Ізоелектрична лінія',description:'Порівнюй сегмент ST із відповідною базовою лінією, слідкуй за артефактами та зміщенням ізолінії.'},
 NONE:{title:'Немає надійно виділених зубців',description:'Для ФШ, асистолії та хаотичних патернів схема не дозволяє надійно виділити P/Q/R/S/T. У реальній практиці потрібна клінічна оцінка й перевірка відведень.'}
} as const;
type Wave=keyof typeof waveNotes;
function hash(n:number){let x=Math.sin(n*127.1+1.93)*43758.5453;return x-Math.floor(x)}
export function makeEvents(r:RhythmId,duration:number,variant:number):Beat[]{
 const rate=(rhythms[r].rate||70)*(variant?(.87+hash(variant+19)*.27):1),period=60/rate;
 const events:Beat[]=[];
 if(r==='asystole'||r==='vfib')return events;
 if(r==='complete')for(let t=.28;t<duration+.8;t+=60/36)events.push({at:t,type:'wide',gain:.84});
 else if(r==='wenckebach')for(let n=0;n<Math.ceil(duration/.75)+3;n++){const beat=n%4,p=.08+n*.75;if(beat!==3)events.push({at:p+[.14,.20,.27][beat],type:'narrow',p});}
 else if(r==='mobitz2')for(let n=0;n<Math.ceil(duration/.72)+2;n++){const p=.08+n*.72;if(n%4!==3)events.push({at:p+.18,type:'narrow',p});}
 else if(r==='pvc'||r==='bigeminy')for(let n=0;n<Math.ceil(duration/1.75)+2;n++){const t=.35+n*1.75;events.push({at:t,type:'narrow',p:t-.18});if(r==='bigeminy'||n%2===0)events.push({at:t+.52,type:'wide',gain:1.15});else events.push({at:t+.9,type:'narrow',p:t+.72});}
 else {let t=.35,n=0;while(t<duration+.7){const absent=['afib','flutter','svt','vtach','torsades','junctional','paced'].includes(r);const p=absent?undefined:t-(r==='avblock'?.28:.17);const type:Beat['type']=['vtach','torsades','rbbb','lbbb'].includes(r)?'wide':r==='paced'?'paced':'narrow';events.push({at:t,type,p:r==='pac'&&n%5===3?t-.11:p,st:r==='stemi'?.19:0,gain:variant?.82+hash(variant+n+7)*.36:1});const variation=r==='afib'?irregular[(n+variant)%irregular.length]:r==='sinusarr'?1+.16*Math.sin(n*1.5+variant*.03):r==='pac'&&n%5===2?.62:r==='pac'&&n%5===3?1.3:1;t+=period*variation;n++;}}
 return events;
}
export function valueAt(t:number,r:RhythmId,lead:number,events:Beat[],duration:number,variant:number){
 const amplitude=variant?.78+hash(variant+33)*.47:1;const baseline=variant?.025*Math.sin(t*1.13+variant):0;
 if(r==='asystole')return .012*Math.sin(t*2.8)+.006*Math.sin(t*13)+baseline;
 if(r==='vfib')return amplitude*(.49*Math.sin(2*Math.PI*5.7*t+.3)+.32*Math.sin(2*Math.PI*7.3*t+1.3)+.21*Math.sin(2*Math.PI*3.8*t+.6))*(1+.35*Math.sin(t*3.2));
 let v=baseline;
 if(r==='afib')v+=.034*Math.sin(t*42)+.028*Math.sin(t*28.2+.3)+.018*Math.sin(t*67.4);
 if(r==='flutter')v+=.11*(2*((t*5.05)%1)-1);
 if(r==='complete')for(let p=.14;p<duration+.2;p+=.74)v+=.115*G(t,p,.031)*(lead===1?-1:1);
 if(r==='wenckebach')for(let p=.08;p<duration+.2;p+=.75)v+=.12*G(t,p,.032);
 if(r==='mobitz2')for(let p=.08;p<duration+.2;p+=.72)v+=.12*G(t,p,.032);
 for(const e of events){if(Math.abs(t-e.at)>.58)continue;const dt=t-e.at;
  if(e.p!==undefined&&r!=='wenckebach'&&r!=='mobitz2')v+=.14*G(t,e.p,.036)*(lead===1?-.8:1);
  const wide=e.type!=='narrow';const invert=lead===1&&['lbbb','vtach','torsades'].includes(r)?-.8:lead===2&&r==='rbbb'?.78:1;
  const gain=(e.gain??1)*invert*amplitude;
  if(wide){const amp=r==='torsades'?Math.sin(2*Math.PI*(e.at/2.3))*.83:1;v+=gain*amp*(-.22*G(dt,-.065,.028)+1.15*G(dt,.005,.056)-.52*G(dt,.095,.036)-.23*G(dt,.29,.1));}
  else {v+=gain*(-.16*G(dt,-.028,.009)+1.16*G(dt,.003,.011)-.28*G(dt,.03,.013));v+=gain*(r==='hyperk'?.85*G(dt,.30,.042):.29*G(dt,.29,.082));if(e.st)v+=gain*e.st*(1/(1+Math.exp(-(dt-.050)/.008))-1/(1+Math.exp(-(dt-.23)/.01)));if(r==='rbbb'&&lead===1)v+=.6*G(dt,.08,.016);if(r==='lbbb'&&lead===2)v+=.4*G(dt,.065,.023);}
  if(e.type==='paced')v+=1.35*G(dt,-.078,.0027);
 }
 return v;
}
function closestFeature(t:number,events:Beat[],r:RhythmId):{wave:Wave,at:number,span?:[number,number]}{
 if(r==='vfib'||r==='asystole')return{wave:'NONE',at:t};
 const anchors:{wave:Wave;at:number;span?:[number,number]}[]=[];
 for(const e of events){const wide=e.type!=='narrow';const width=wide?.15:.045;
  if(e.p!==undefined){anchors.push({wave:'P',at:e.p});anchors.push({wave:'PR',at:(e.p+e.at-.05)/2,span:[e.p-.03,e.at-width]});}
  anchors.push({wave:'Q',at:e.at-(wide?.065:.028)},{wave:'R',at:e.at+.003},{wave:'S',at:e.at+(wide?.095:.03)},
   {wave:'QRS',at:e.at,span:[e.at-width,e.at+width]},{wave:'ST',at:e.at+(wide?.23:.16),span:[e.at+width,e.at+.23]},
   {wave:'T',at:e.at+.29},{wave:'QT',at:e.at+.205,span:[e.at-width,e.at+.40]});
 }
 const beats=events.map(x=>x.at).sort((a,b)=>a-b);for(let i=1;i<beats.length;i++)anchors.push({wave:'RR',at:(beats[i]+beats[i-1])/2,span:[beats[i-1],beats[i]]});
 const precise=anchors.filter(a=>['P','Q','R','S','T'].includes(a.wave)).sort((a,b)=>Math.abs(a.at-t)-Math.abs(b.at-t))[0];
 if(precise&&Math.abs(precise.at-t)<.055)return precise;
 const inRange=anchors.filter(a=>a.span&&t>=a.span[0]&&t<=a.span[1]);
 const priority=['PR','ST','QRS','QT','RR'];inRange.sort((a,b)=>priority.indexOf(a.wave)-priority.indexOf(b.wave));
 return inRange[0]||{wave:'BASE',at:t};
}
export default function Ecg({rhythm='sinus',speed=25,compact=false,showMarkers=false,blind=false,variant=0,interactive=true}:{rhythm?:RhythmId;speed?:number;compact?:boolean;showMarkers?:boolean;blind?:boolean;variant?:number;interactive?:boolean}){
 const gridId=useId().replaceAll(':','');const d=rhythms[rhythm];const svgRef=useRef<SVGSVGElement|null>(null);const [selected,setSelected]=useState<{wave:Wave;t:number;x:number;y:number}|null>(null);
 const h=compact?150:300,duration=speed===50?4:8;
 const events=useMemo(()=>makeEvents(rhythm,duration,variant),[rhythm,duration,variant]);
 const paths=useMemo(()=>Array.from({length:compact?1:3},(_,lead)=>{let path='';const baseline=compact?86:78+lead*89;for(let x=0;x<=1200;x+=1.5){const t=x/1200*duration;const v=valueAt(t,rhythm,lead,events,duration,variant);const y=baseline-v*60;path+=(x===0?'M':'L')+x.toFixed(1)+','+Math.min(Math.max(y,2),h-2).toFixed(2)+' ';}return path;}),[rhythm,duration,events,compact,h,variant]);
 const hover=(clientX:number,clientY:number)=>{if(!interactive||blind||!svgRef.current)return;const rect=svgRef.current.getBoundingClientRect();const x=Math.max(0,Math.min(1200,(clientX-rect.left)/rect.width*1200)),y=Math.max(0,Math.min(h,(clientY-rect.top)/rect.height*h));const t=x/1200*duration;const match=closestFeature(t,events,rhythm);setSelected({wave:match.wave,t,x,y});};
 const note=selected&&waveNotes[selected.wave];
 return <div className="ecg" data-testid="ecg-display" data-rhythm={rhythm} data-variant={variant}><div className="ecg-top"><span className="pulse-dot"/> ECG / EDUCATION <span>{speed} мм/с · схема · {duration} с</span></div><svg ref={svgRef} viewBox={`0 0 1200 ${h}`} preserveAspectRatio="none" role="img" aria-label={blind?'Синтетична ЕКГ для самостійного розпізнавання':`Синтетична ЕКГ: ${d.name}`} onPointerMove={e=>hover(e.clientX,e.clientY)} onPointerLeave={()=>setSelected(null)} onPointerDown={e=>hover(e.clientX,e.clientY)} style={{cursor:interactive&&!blind?'crosshair':undefined,touchAction:'pan-y'}}><defs><pattern id={`${gridId}-minor`} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0 H0 V6" fill="none" stroke="#234438" strokeWidth=".65"/></pattern><pattern id={`${gridId}-major`} width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill={`url(#${gridId}-minor)`}/><path d="M30 0 H0 V30" fill="none" stroke="#365e4b" strokeWidth="1.1"/></pattern></defs><rect width="1200" height={h} fill={`url(#${gridId}-major)`}/>{paths.map((p,i)=><g key={i}><text x="10" y={compact?20:21+i*89} fill="#b5c9bc" fontSize="15" fontWeight="600">{['II','V1','V5'][i]}</text><path d={p} fill="none" stroke={blind?'#79eaba':d.accent} strokeWidth={compact?2.6:2.35} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></g>)}{showMarkers&&!compact&&events.slice(0,1).map((e,i)=><g key={i} fill="#d3f7df" fontSize="15" fontWeight="800">{e.p!==undefined&&<text x={e.p/duration*1200-8} y="43">P</text>}<text x={e.at/duration*1200-6} y="43">R</text><text x={(e.at+.29)/duration*1200-6} y="43">T</text></g>)}{selected&&<g pointerEvents="none"><line x1={selected.x} x2={selected.x} y1="0" y2={h} stroke="#fff" opacity=".55" strokeDasharray="5 6"/><circle cx={selected.x} cy={selected.y} r="7" fill="#7df0bc" stroke="#fff" strokeWidth="2"/><rect x={Math.min(selected.x+12,1040)} y={Math.max(6,selected.y-42)} rx="7" width="140" height="30" fill="#17372c" stroke="#76ebb6"/><text x={Math.min(selected.x+22,1050)} y={Math.max(26,selected.y-22)} fontSize="16" fill="#caffdf" fontWeight="800">{waveNotes[selected.wave].title}</text></g>}</svg>{note&&<div className="ecg-inspector" aria-live="polite"><strong>{note.title} <small>· {selected?.t.toFixed(2)} с</small></strong><span>{note.description}</span></div>}<div className="ecg-bottom">{interactive&&!blind?'Наведи курсор або торкнися сигналу — відкриється пояснення зубця чи інтервалу. ':''}Синтетична навчальна схема · не клінічна ЕКГ та не точна модель 12 відведень</div></div>;
}
