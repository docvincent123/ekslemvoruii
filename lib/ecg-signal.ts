export type Signal={name:string;sampleRate:number;unit:string;leads:{name:string;values:number[]}[];source?:string;license?:string};
export const leadNames=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
export function isValidSignal(x:unknown):x is Signal{
 if(!x||typeof x!=='object')return false;const s=x as Signal;
 if(typeof s.name!=='string'||!s.name.trim()||s.name.length>=150||!Number.isFinite(s.sampleRate)||s.sampleRate<50||s.sampleRate>2000||s.unit!=='mV'||!Array.isArray(s.leads)||s.leads.length!==12)return false;
 if(s.source!==undefined){if(typeof s.source!=='string')return false;try{const u=new URL(s.source);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false}catch{return false}}
 if(s.license!==undefined&&typeof s.license!=='string')return false;
 if(!s.leads.every(l=>l&&leadNames.includes(l.name)&&Array.isArray(l.values)&&l.values.length>=250&&l.values.length<=20000&&l.values.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<50)))return false;
 return new Set(s.leads.map(l=>l.name)).size===12&&s.leads.every(l=>l.values.length===s.leads[0].values.length);
}
