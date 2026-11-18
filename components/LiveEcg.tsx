import {Localized,useLanguage} from '../lib/language';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw} from 'lucide-react';
import {rhythms, type RhythmId} from '../lib/data';
import {type Signal} from '../lib/ecg-signal';
import {makeEvents, valueAt} from './Ecg';

const windows = [10, 6, 4, 2, 1];
const colors = ['#ddf872', '#91e9d3', '#f0cc9a'];
type Props = {
  rhythm?: RhythmId;
  variant?: number;
  record?: {signal: Signal; source: string};
  compact?: boolean;
  blind?: boolean;
  initiallyPaused?: boolean;
  allLeads?: boolean;
};

export default function LiveEcg({rhythm='sinus', variant=0, record, compact=false, blind=false, initiallyPaused=false, allLeads=false}: Props) {
  const {language}=useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLElement>(null);
  const time = useRef(0);
  const drag = useRef<{x: number; time: number} | null>(null);
  const [playing, setPlaying] = useState(() => !initiallyPaused && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [gain, setGain] = useState(1);
  const [count, setCount] = useState(allLeads ? 12 : compact ? 1 : 6);
  const [position, setPosition] = useState(0);
  const [full, setFull] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const recordedSignal = record?.signal;
  const signal = useMemo((): Signal => {
    if (recordedSignal) return recordedSignal;
    const sampleRate = 100;
    const duration = 30;
    const events = makeEvents(rhythm, duration, variant);
    return {name: rhythms[rhythm].name, sampleRate, unit: 'mV', leads: ['II', 'V1', 'V5'].map((name, lead) => ({
      name, values: Array.from({length: sampleRate * duration}, (_, i) => valueAt(i / sampleRate, rhythm, lead, events, duration, variant)),
    }))};
  }, [recordedSignal, rhythm, variant]);
  const duration = signal.leads[0].values.length / signal.sampleRate;
  const windowSec = Math.min(windows[zoom], duration);
  const maxStart = duration - windowSec;
  const showPlayhead = maxStart === 0;
  const maxPosition = showPlayhead ? duration : maxStart;
  const visible = useMemo(() => signal.leads.slice(0, count), [signal, count]);
  const formattedTime = (value: number) => value.toLocaleString(language, {minimumFractionDigits:1, maximumFractionDigits:1});

  useEffect(() => {time.current = 0; setPosition(0)}, [signal]);
  useEffect(() => {
    setCount(allLeads ? 12 : compact ? 1 : 6);
    if (allLeads) setPlaying(false);
  }, [allLeads, compact]);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key !== 'Tab') return;
      const controls = container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
    };
  }, [expanded]);
  async function toggleFullscreen() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenElement === container.current) {
      await document.exitFullscreen();
      return;
    }
    const monitor = container.current;
    if (monitor?.requestFullscreen && document.fullscreenEnabled) {
      try {
        await monitor.requestFullscreen();
        return;
      } catch {}
    }
    setExpanded(true);
  }
  function seek(value: number) {
    time.current = Math.max(0, Math.min(maxPosition, value));
    setPosition(time.current);
  }
  function changeZoom(index: number) {
    const nextZoom = Math.max(0, Math.min(windows.length - 1, index));
    const nextMaxStart = Math.max(0, duration - windows[nextZoom]);
    time.current = Math.min(time.current, nextMaxStart || duration);
    setPosition(time.current);
    setZoom(nextZoom);
  }
  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    let frame = 0;
    let last = 0;
    let reported = 0;
    let width = 0;
    let height = 0;
    function resize() {
      if (!node || !ctx) return;
      ({width, height} = node.getBoundingClientRect());
      const scale = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.round(width * scale);
      node.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    function draw() {
      if (!ctx || width < 65 || height < 1) return;
      ctx.fillStyle = '#101514';
      ctx.fillRect(0, 0, width, height);
      const left = 49;
      const right = width - 10;
      const windowStart = showPlayhead ? 0 : time.current;
      const pixelsPerSecond = (right - left) / windowSec;
      const tick = windowSec <= 2 ? .1 : .5;
      ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, monospace';
      const firstTick = Math.ceil(windowStart / tick) * tick;
      for (let t = firstTick; t <= windowStart + windowSec + .0001; t += tick) {
        const x = left + (t - windowStart) * pixelsPerSecond;
        ctx.strokeStyle = '#2a372e';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height - 20); ctx.stroke();
        if (x < right - 20 && (windowSec <= 2 || Math.abs(t - Math.round(t)) < .001)) {
          ctx.fillStyle = '#a8b8a7';
          ctx.fillText(t.toFixed(windowSec <= 2 ? 1 : 0), x + 3, height - 6);
        }
      }
      const rowHeight = (height - 20) / visible.length;
      visible.forEach((lead, index) => {
        const baseline = rowHeight * (index + .53);
        const color = colors[index % colors.length];
        ctx.strokeStyle = '#2a372e';
        ctx.beginPath(); ctx.moveTo(left, baseline); ctx.lineTo(right, baseline); ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(lead.name, 8, baseline + 4);
        ctx.save();
        ctx.beginPath(); ctx.rect(left, rowHeight * index, right - left, rowHeight); ctx.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        const firstSample = Math.floor(windowStart * signal.sampleRate);
        const endSample = Math.min(lead.values.length - 1, Math.ceil((windowStart + windowSec) * signal.sampleRate));
        const scale = Math.min(44, rowHeight * .28) * gain;
        ctx.beginPath();
        for (let sample = firstSample; sample <= endSample; sample++) {
          const x = left + (sample / signal.sampleRate - windowStart) * pixelsPerSecond;
          const y = baseline - lead.values[sample] * scale;
          if (sample === firstSample) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      });
      if (showPlayhead) {
        const x = left + time.current * pixelsPerSecond;
        ctx.strokeStyle = '#b9d7ff';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height - 20); ctx.stroke();
      }
    }
    function animate(stamp: number) {
      if (last) {
        time.current += Math.min((stamp - last) / 1000, .1) * rate;
        if (time.current > maxPosition) time.current = 0;
      }
      last = stamp;
      if (stamp - reported >= 110) {setPosition(time.current); reported = stamp}
      draw();
      frame = requestAnimationFrame(animate);
    }
    const observer = new ResizeObserver(() => {resize(); draw()});
    observer.observe(node);
    resize(); draw();
    if (playing) frame = requestAnimationFrame(animate);
    return () => {cancelAnimationFrame(frame); observer.disconnect()};
  }, [playing, rate, windowSec, maxPosition, showPlayhead, gain, visible, signal.sampleRate, playing ? 0 : position]);

  const description = blind ? 'Навчальний сигнал' : signal.name;
  const plot = <canvas ref={canvas} className={compact?'':'seekable-ecg'} style={{height:compact?160:visible.length===12?650:visible.length===6?420:250}} aria-label={description}
    onPointerDown={event=>{
      if (compact || event.button !== 0) return;
      setPlaying(false);
      if (showPlayhead) {
        const bounds = event.currentTarget.getBoundingClientRect();
        seek((event.clientX - bounds.left - 49) * windowSec / Math.max(1, bounds.width - 59));
      }
      drag.current = {x:event.clientX,time:time.current};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event=>{
      if (!drag.current) return;
      const plotWidth = event.currentTarget.clientWidth - 59;
      const delta = event.clientX - drag.current.x;
      if (plotWidth > 0) seek(drag.current.time + (showPlayhead ? delta : -delta) * windowSec / plotWidth);
    }}
    onLostPointerCapture={()=>{drag.current=null}}/>;
  return <Localized><section className={'live-monitor '+(compact?'compact':expanded?'expanded':'')} ref={container} aria-label="Переглядач ЕКГ" role={expanded?'dialog':undefined} aria-modal={expanded||undefined}>
    <div className="live-header"><div><span className={'live-dot '+(!playing?'paused':'')}/><span>{record?record.source+' · РЕАЛЬНИЙ ЗАПИС':'НАВЧАЛЬНИЙ СИМУЛЯТОР'}</span></div><span>{description}</span>{!compact&&<button aria-label={full||expanded?'Вийти з повного екрана':'На повний екран'} onClick={toggleFullscreen}>{full||expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>}</div>
    {compact&&plot}
    <div className="live-controls">
      <button className="live-play" aria-label={playing?'Зупинити стрічку':'Відтворити стрічку'} onClick={()=>{if(playing)seek(time.current);setPlaying(!playing)}}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?'Пауза':'Відтворити'}</button>
      <button aria-label="На початок" onClick={()=>{setPlaying(false);seek(0)}}><RotateCcw size={14}/></button>
      {!compact&&<>
        <button aria-label="Зменшити ЕКГ" disabled={zoom===0} onClick={()=>changeZoom(zoom-1)}><Minus size={15}/></button>
        <button aria-label="Збільшити ЕКГ" disabled={zoom===windows.length-1} onClick={()=>changeZoom(zoom+1)}><Plus size={15}/></button>
        <label>Вікно <select aria-label="Часове вікно" value={zoom} onChange={event=>changeZoom(Number(event.target.value))}>{windows.map((seconds,index)=><option key={seconds} value={index}>{seconds} с</option>)}</select></label>
        <label>Темп <select aria-label="Темп відтворення" value={rate} onChange={event=>setRate(Number(event.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
        <label>Амплітуда <select aria-label="Масштаб амплітуди" value={gain} onChange={event=>setGain(Number(event.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option></select></label>
        {signal.leads.length>3&&<label>Відведення <select aria-label="Кількість відведень" value={count} onChange={event=>setCount(Number(event.target.value))}><option value={3}>3</option><option value={6}>6</option>{signal.leads.length===12&&<option value={12}>12</option>}</select></label>}
      </>}
      <span className="live-footer">{record?'Реальний сигнал':'Синтетична схема'} · екранна шкала</span>
    </div>
    {!compact&&<>
      <div className="ecg-timeline"><label>{showPlayhead?'Курсор':'Початок вікна'} <strong>{formattedTime(Math.min(position,maxPosition))} с</strong><input type="range" aria-label="Позиція на стрічці" min={0} max={maxPosition} step={.01} value={Math.min(position,maxPosition)} onChange={event=>{setPlaying(false);seek(Number(event.target.value))}}/></label><span>{formattedTime(duration)} с запису</span></div>
      {plot}
    </>}
  </section></Localized>;
}
