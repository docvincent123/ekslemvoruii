import {useId} from 'react';
import type {DiagramKind} from '../lib/articles';

const cycle = 'M18 88H64 Q84 52 104 88 H151 L164 97 L181 30 L197 111 L211 88 H246 Q276 46 307 88 H370';
const captions: Record<DiagramKind, string> = {
  cycle:'Межі PR, QRS і QT на схемі одного циклу.',
  grid:'П’ять малих клітинок дорівнюють одній великій. Час наведено для 25 мм/с.',
  leads:'Групи відведень і порядок грудних позицій. Схема показує взаємне розміщення.',
  workflow:'Послідовність опису від якості запису до комплексу QRS.',
  regularity:'Рівні та різні проміжки RR. Форма ліній умовна.',
  artifact:'Один і той самий умовний сигнал із різними перешкодами.',
};
const workflow = [['01','Якість','Шум, калібрування'],['02','RR','Частота й регулярність'],['03','P','Активність передсердь'],['04','QRS','Ширина й форма']];

export default function TeachingDiagram({kind}:{kind:DiagramKind}) {
  const grid = useId();
  const caption = captions[kind];
  return <figure className="teaching-figure">
    <div className="micro">НАВЧАЛЬНА СХЕМА</div>
    {kind==='workflow'?<ol className="diagram-steps">{workflow.map(([n,title,detail])=><li key={n}><span>{n}</span><strong>{title}</strong><small>{detail}</small></li>)}</ol>:
      <svg viewBox="0 0 390 198" role="img" aria-label={caption}>
        <defs><pattern id={grid} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#314137" strokeWidth=".6"/></pattern></defs>
        <rect width="390" height="198" fill={`url(#${grid})`}/>
        {kind==='cycle'&&<>
          <path d={cycle} className="diagram-trace"/>
          <text x="80" y="54">P</text><text x="177" y="20">R</text><text x="152" y="115">Q</text><text x="194" y="127">S</text><text x="268" y="52">T</text>
          <path d="M64 134v8h87v-8 M151 134v8h60v-8 M151 161v8h156v-8" className="diagram-measure"/>
          <text x="97" y="155">PR</text><text x="168" y="155">QRS</text><text x="218" y="186">QT</text>
        </>}
        {kind==='grid'&&<>
          {Array.from({length:5},(_,i)=><rect key={i} x={43+i*34} y="48" width="34" height="47" fill="#283e2c" stroke="#adc672"/>)}
          <path className="diagram-measure" d="M43 106v10h34v-10 M43 144v10h170v-10"/>
          <text x="43" y="134">40 мс</text><text x="97" y="175">200 мс</text>
          <text x="231" y="65">25 мм/с</text><text x="231" y="89">1 мала клітинка</text><text x="231" y="108">= 0,04 с</text>
        </>}
        {kind==='leads'&&<>
          <text x="16" y="28">Фронтальна площина</text><text x="16" y="55" className="diagram-accent">I · II · III · aVR · aVL · aVF</text>
          <path d="M16 75H374" className="diagram-measure"/>
          <text x="16" y="101">Грудні позиції · напрямок до лівого боку →</text>
          <path d="M35 130H93L137 149L182 166H347" className="diagram-measure"/>
          {[['V1',35,130],['V2',93,130],['V3',137,149],['V4',182,166],['V5',260,166],['V6',347,166]].map(([lead,x,y])=><g key={lead}><circle cx={x} cy={y} r="4" fill="#dff880"/><text x={Number(x)-8} y={Number(y)-11}>{lead}</text></g>)}
        </>}
        {(kind==='regularity'||kind==='artifact')&&<>
          <text x="16" y="23">{kind==='regularity'?'Приблизно рівні RR':'Чиста лінія'}</text>
          <text x="16" y="114">{kind==='regularity'?'Різні RR':'Базова лінія зміщується'}</text>
          {[0,1].map(row=>{
            const times = row===1&&kind==='regularity'?[54,105,202,264,350]:[54,126,198,270,342];
            const y = 68+row*90;
            const baseline = (x:number) => row===1&&kind==='artifact'?y+Math.sin(x/28)*9:y;
            return <path key={row} className={row?'diagram-trace alternate':'diagram-trace'} d={`M18 ${baseline(18)} ${times.map(x=>`L${x-10} ${baseline(x-10)} l5 5 5 -32 6 39 6 -12`).join(' ')} L375 ${baseline(375)}`}/>;
          })}
        </>}
      </svg>}
    <figcaption>{caption}</figcaption>
  </figure>;
}
