import {useMemo,useState} from 'react';
import {Search,Shuffle,ChevronLeft,ChevronRight,SlidersHorizontal} from 'lucide-react';
import {syntheticRecords} from '../lib/synthetic';
import {rhythms,RhythmId} from '../lib/data';
export default function SyntheticCatalog({onSelect,currentVariant}:{onSelect:(rhythm:RhythmId,variant:number)=>void;currentVariant:number}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('Усі'),[page,setPage]=useState(0);
 const categories=['Усі',...new Set(Object.values(rhythms).map(r=>r.category))];
 const filtered=useMemo(()=>syntheticRecords.filter(record=>
  (category==='Усі'||rhythms[record.rhythm].category===category)&&
  (!query||`${record.id} ${record.name}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')))
 ),[category,query]);
 const totalPages=Math.max(1,Math.ceil(filtered.length/12));
 const rows=filtered.slice(Math.min(page,totalPages-1)*12,Math.min(page,totalPages-1)*12+12);
 return <section className="panel synth-catalog"><div className="panel-header"><div><span className="micro">1000 SEEDED VARIATIONS</span><h3>Каталог навчальних симуляцій</h3></div><span className="badge">1 000 SYNTHETIC</span></div><p className="muted">1 000 детермінованих варіацій на основі 24 модельних патернів: параметри ритму, амплітуди та легка зміна базової лінії. Не 1 000 різних клінічних діагнозів.</p><div className="catalog-controls"><div className="searchbox"><Search size={15}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}} placeholder="Шукай за ID або назвою..."/></div><select aria-label="Категорія синтетичного ритму" value={category} onChange={e=>{setCategory(e.target.value);setPage(0)}}>{categories.map(x=><option key={x} value={x}>{x}</option>)}</select><button className="secondary" onClick={()=>{const record=syntheticRecords[Math.floor(Math.random()*syntheticRecords.length)];onSelect(record.rhythm,record.variant)}}><Shuffle size={16}/> Випадкова</button></div><div className="catalog-table">{rows.map(x=><button key={x.id} className={`catalog-record ${currentVariant===x.variant?'current':''}`} onClick={()=>onSelect(x.rhythm,x.variant)}><span className="catalog-id">{x.id}</span><strong>{x.name}</strong><small>{x.difficulty} · #{x.variant}</small><ChevronRight size={15}/></button>)}{!rows.length&&<div className="notice">Збігів немає.</div>}</div><div className="catalog-pages"><small>Знайдено {filtered.length} · сторінка {Math.min(page,totalPages-1)+1}/{totalPages}</small><div><button onClick={()=>setPage(v=>Math.max(0,v-1))} disabled={page===0}><ChevronLeft size={18}/></button><button onClick={()=>setPage(v=>Math.min(totalPages-1,v+1))} disabled={page>=totalPages-1}><ChevronRight size={18}/></button></div></div></section>
}
