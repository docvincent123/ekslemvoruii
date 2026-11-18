import {rhythms, RhythmId} from './data';
export type SyntheticRecord={id:string;variant:number;rhythm:RhythmId;name:string;rate:number;difficulty:'Базовий'|'Середній'|'Складний'};
const ids=Object.keys(rhythms) as RhythmId[];
export const syntheticRecords:SyntheticRecord[]=Array.from({length:1000},(_,i)=>{
 const rhythm=ids[i%ids.length],variant=i+1;
 const offset=((i*73)%29)-14;
 return {id:`SYN-${String(i+1).padStart(4,'0')}`,variant,rhythm,name:rhythms[rhythm].name,rate:Math.max(20,(rhythms[rhythm].rate||0)+offset),difficulty:i%4===0?'Базовий':i%4===1?'Середній':'Складний'};
});
