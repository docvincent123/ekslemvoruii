import {Localized} from '../lib/language';
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, Database, Dices, Search, Star} from 'lucide-react';
import LiveEcg from './LiveEcg';
import {scpLabels} from '../lib/scp-labels';
import {collections, loadWaveform, type Dataset} from '../lib/wfdb';
import {type Signal} from '../lib/ecg-signal';

type RecordItem = {key: string; id: string; dataset: Dataset; labels: string[]};
type Catalog = {'ptb-xl': [string, string[]][]; mitdb: string[]};
const pageSize = 12;
const quickFilters = ['NORM', 'AFIB', 'PVC', 'CLBBB', 'CRBBB', '1AVB'];
const formatter = new Intl.NumberFormat('uk-UA');

export default function RealDatasetLibrary({practice=false,onOpenCase}:{practice?:boolean;onOpenCase?:(key:string)=>void}) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [query, setQuery] = useState('');
  const [dataset, setDataset] = useState<Dataset | 'all'>('all');
  const [page, setPage] = useState(0);
  const [leadFilter,setLeadFilter]=useState('all');
  const [group,setGroup]=useState('all');
  const [label,setLabel]=useState('all');
  const [sort,setSort]=useState('asc');
  const [labeledOnly,setLabeledOnly]=useState(false);
  const labels=useMemo(()=>Array.from(new Set(records.flatMap(item=>item.labels))).sort(),[records]);
  const [selected, setSelected] = useState(()=>new URLSearchParams(location.search).get('record')||'ptb-xl-00526');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedWaveform, setWaveform] = useState<Signal | null>(null);
  const [signalError, setSignalError] = useState('');
  const [staticView,setStaticView]=useState(false);
  const player = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('lemvori-favorites') || '[]');
      if (Array.isArray(saved)) setFavorites(saved.filter((item): item is string => typeof item === 'string'));
    } catch {}
    const controller = new AbortController();
    fetch('/data/real-ecg/catalog.json', {signal: controller.signal}).then(async response => {
      if (!response.ok) throw Error('Каталог недоступний');
      const data: Catalog = await response.json();
      const loaded = [
        ...data['ptb-xl'].map(([id, labels]): RecordItem => ({key: `ptb-xl-${id}`, id, dataset: 'ptb-xl', labels})),
        ...data.mitdb.map((id): RecordItem => ({key: `mitdb-${id}`, id, dataset: 'mitdb', labels: []})),
      ];
      if(controller.signal.aborted)return;
      setRecords(loaded);
      setSelected(key=>loaded.some(item=>item.key===key)?key:'ptb-xl-00526');
    }).catch(error => {if (error.name !== 'AbortError') setCatalogError(true)});
    return () => controller.abort();
  }, []);
  const active = useMemo(() => records.find(item => item.key === selected), [records, selected]);
  const collection = active ? collections[active.dataset] : null;
  const waveform = loadedWaveform?.name === active?.key ? loadedWaveform : null;
  useEffect(() => {
    setWaveform(null);
    setSignalError('');
    if (!active) return;
    const controller = new AbortController();
    loadWaveform(active.dataset, active.id, controller.signal).then(value => {
      if (!controller.signal.aborted) setWaveform(value);
    }).catch(error => {if (!controller.signal.aborted) setSignalError(error.message)});
    return () => controller.abort();
  }, [active, retry]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter(item => (dataset === 'all' || dataset === item.dataset) &&
      (!onlyFavorite || favorites.includes(item.key)) &&
      (leadFilter==='all'||(item.dataset==='ptb-xl'?'12':'2')===leadFilter) &&
      (group==='all'||item.labels.some(code=>scpLabels[code]?.group===group)) &&
      (label==='all'||item.labels.includes(label)) &&
      (!labeledOnly||item.labels.length>0) &&
      `${item.key} ${collections[item.dataset].name} ${item.labels.join(' ')}`.toLowerCase().includes(term)).sort((a,b)=>(sort==='asc'?1:-1)*(Number(a.id)-Number(b.id))||a.key.localeCompare(b.key));
  }, [records, dataset, onlyFavorite, favorites, query,leadFilter,group,label,sort,labeledOnly]);
  useEffect(()=>{
    if(!filtered.length||filtered.some(item=>item.key===selected))return;
    const first=filtered[0];setSelected(first.key);setStaticView(false);setSignalError('');
    const address=new URL(location.href);address.searchParams.set('record',first.key);history.replaceState(null,'',address.pathname+address.search);
  },[filtered,selected]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function select(item: RecordItem) {
    if (item.key !== selected) {
      setStaticView(false);
      setSignalError('');
    }
    setSelected(item.key);
    const url = new URL(location.href);
    url.searchParams.set('record', item.key);
    history.replaceState(null, '', url.pathname + url.search);
    player.current?.scrollIntoView({block: 'start'});
  }
  function toggleFavorite(key: string) {
    const next = favorites.includes(key) ? favorites.filter(item => item !== key) : [...favorites, key];
    setFavorites(next);
    try {localStorage.setItem('lemvori-favorites', JSON.stringify(next))} catch {}
  }
  function search(value: string) {setQuery(value); setPage(0)}
  function resetFilters(){setDataset('all');setQuery('');setLeadFilter('all');setGroup('all');setLabel('all');setSort('asc');setLabeledOnly(false);setOnlyFavorite(false);setPage(0)}
  function changeDataset(value:Dataset|'all'){setDataset(value);setPage(0);setGroup('all');setLabel('all');setLeadFilter('all');setLabeledOnly(false)}

  return <Localized><section className="ecg-library">
    <div className="library-controls panel">
      <div className="library-summary"><Database size={18}/><strong>{records.length ? formatter.format(records.length) : '…'} записів</strong><span>PhysioNet</span></div>
      <div className="dataset-tabs" aria-label="База ЕКГ">
        <button aria-pressed={dataset==='all'} onClick={()=>changeDataset('all')}>Усі бази</button>
        {(Object.keys(collections) as Dataset[]).map(key=><button key={key} aria-pressed={dataset===key} onClick={()=>changeDataset(key)}>{collections[key].name}<small>{formatter.format(collections[key].count)}</small></button>)}
      </div>
      <div className="catalog-controls"><div className="searchbox"><Search size={17}/><input aria-label="Пошук реальних ЕКГ" value={query} onChange={event=>search(event.target.value)} placeholder="Номер запису або мітка, наприклад AFIB"/></div>
        <button className="secondary" aria-pressed={onlyFavorite} onClick={()=>{setOnlyFavorite(!onlyFavorite);setPage(0)}}><Star size={15}/> Обрані</button>
        <button className="secondary" disabled={!filtered.length} onClick={()=>select(filtered[Math.floor(Math.random()*filtered.length)])}><Dices size={17}/> Випадкова ЕКГ</button>
      </div>
      <div className="advanced-filters">
        <label>Кількість відведень<select value={leadFilter} onChange={event=>{setLeadFilter(event.target.value);setPage(0)}}><option value="all">Будь-яка</option><option value="12">12</option><option value="2">2</option></select></label>
        <label>Діагностична група<select value={group} onChange={event=>{setGroup(event.target.value);setPage(0)}}>{[['all','Усі групи'],['NORM','Норма'],['MI','Інфарктні патерни'],['STTC','Зміни ST–T'],['CD','Порушення провідності'],['HYP','Гіпертрофія']].map(([value,name])=><option value={value} key={value}>{name}</option>)}</select></label>
        <label>Мітка запису<select value={label} onChange={event=>{setLabel(event.target.value);setPage(0)}}><option value="all">Усі мітки</option>{labels.map(code=><option value={code} key={code}>{code}</option>)}</select></label>
        <label>Сортування<select value={sort} onChange={event=>{setSort(event.target.value);setPage(0)}}><option value="asc">Номер за зростанням</option><option value="desc">Номер за спаданням</option></select></label>
      </div>
      <div className="filter-options"><label><input type="checkbox" checked={labeledOnly} onChange={event=>{setLabeledOnly(event.target.checked);setPage(0)}}/> Лише з мітками</label><button className="text-button" onClick={resetFilters}>Скинути фільтри</button><span>{formatter.format(filtered.length)} / {formatter.format(records.length)}</span></div>
      {label!=='all'&&scpLabels[label]&&<p className="label-description"><strong>{label}</strong> · {scpLabels[label].description}</p>}
      {dataset!=='mitdb'&&<div className="filter-tags">{quickFilters.map(code=><button key={code} aria-pressed={label===code} onClick={()=>{setLabel(label===code?'all':code);setPage(0)}}>{code}</button>)}</div>}
    </div>
    {catalogError&&<p role="alert" className="feedback negative">Каталог не завантажився. Онови сторінку.</p>}
    <div className="library-grid">
      <div className="library-records panel">
        <div className="record-list-title"><h2>{practice?'Записи для розбору':'Записи'}</h2><span>{formatter.format(filtered.length)}</span></div>
        {!records.length&&!catalogError&&<p role="status" className="muted">Завантажуємо каталог…</p>}
        {!!records.length&&!rows.length&&<p className="muted">За цим фільтром записів немає.</p>}
        {rows.map(item=><button key={item.key} className="record-row" aria-current={selected===item.key?'true':undefined} onClick={()=>select(item)}>
          <span><strong>#{item.id}</strong><small>{practice?(item.dataset==='ptb-xl'?'12 відведень':'Два канали'):(item.labels.slice(0,4).join(' · ') || 'Два канали')}</small></span><span>{collections[item.dataset].name}<ArrowUpRight size={14}/></span>
        </button>)}
        <div className="catalog-pages"><span>{currentPage+1} / {formatter.format(pages)}</span><div><button aria-label="Попередня сторінка" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={18}/></button><button aria-label="Наступна сторінка" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}><ChevronRight size={18}/></button></div></div>
      </div>
      <section className="library-player panel" ref={player} aria-label="Перегляд запису">
        {!!records.length&&!filtered.length&&<p className="muted">За цим фільтром записів немає.</p>}
        {filtered.length>0&&active&&collection&&<><div className="record-heading"><div><span className="micro">{collection.name}</span><h2>Запис #{active.id}</h2></div><button className="secondary" aria-pressed={favorites.includes(active.key)} onClick={()=>toggleFavorite(active.key)}><Star size={16} fill={favorites.includes(active.key)?'currentColor':'none'}/> {favorites.includes(active.key)?'В обраному':'В обране'}</button></div>
          <p className="record-metadata">{active.dataset==='ptb-xl'?'12 відведень · 100 Гц':'2 відведення · 360 Гц'} · фрагмент 10 с</p>
          {waveform&&<>
            <LiveEcg key={active.key} record={{signal:waveform,source:collection.name}} initiallyPaused={practice} allLeads={staticView}/>
            <div className="record-actions"><button className="secondary" aria-pressed={staticView} onClick={()=>setStaticView(!staticView)}>{staticView?'Вийти з огляду всіх відведень':'Огляд усіх відведень із паузою'}</button>{onOpenCase&&<button className="primary" onClick={()=>onOpenCase(active.key)}>Розібрати як кейс <ArrowUpRight size={16}/></button>}</div>
            {practice&&<RealCaseReview key={active.key} labels={active.labels} source={collection.name}/>}
          </>}
          {!waveform&&!signalError&&<div role="status" className="signal-placeholder">Завантажуємо сигнал…</div>}
          {signalError&&<div role="alert" className="signal-placeholder"><p>{signalError}</p><button className="secondary" onClick={()=>setRetry(retry+1)}>Спробувати ще раз</button></div>}
          {!practice&&!!active.labels.length&&<p className="record-labels">Мітки джерела <strong>{active.labels.join(' · ')}</strong></p>}
          <p className="source-attribution">{collection.attribution} · <a href={collection.url} target="_blank" rel="noreferrer">PhysioNet · {collection.license} <ArrowUpRight size={13}/></a></p>
        </>}
      </section>
    </div>
  </section></Localized>;
}

function RealCaseReview({labels,source}:{labels:string[];source:string}) {
  const [revealed,setRevealed]=useState(false);
  return <Localized><div className="real-case-review">
    <h3>Опиши цю ЕКГ</h3>
    <ol><li>Оціни якість запису й вибери відведення, де найкраще видно комплекси.</li><li>Порівняй кілька RR. Оціни частоту й регулярність.</li><li>Знайди передсердну активність і її зв’язок із QRS. Опиши форму комплексів.</li></ol>
    <label className="case-notes">Твій опис<textarea rows={3} placeholder="Частота, регулярність, P і QRS…"/></label>
    <button className="secondary" aria-expanded={revealed} onClick={()=>setRevealed(!revealed)}>{revealed?'Сховати мітки джерела':'Звірити з джерелом'}</button>
    {revealed&&<div className="notice">{labels.length?<><strong>Мітки {source}: {labels.join(' · ')}</strong><p>Зістав кожну мітку з видимими ознаками. Мітки джерела описують запис і можуть стосуватися кількох різних ознак.</p></>:<p>Для цього фрагмента немає міток у каталозі академії. Анотації повного запису доступні за посиланням на {source}.</p>}</div>}
  </div></Localized>;
}
