import {isValidSignal, type Signal} from './ecg-signal';

export type Dataset = 'ptb-xl' | 'mitdb';
export const collections = {
  'ptb-xl': {name: 'PTB-XL', url: 'https://physionet.org/content/ptb-xl/1.0.3/', license: 'CC BY 4.0', attribution: 'Wagner et al. · DOI 10.13026/kfzx-aw45', count: 21799},
  mitdb: {name: 'MIT-BIH', url: 'https://physionet.org/content/mitdb/1.0.0/', license: 'ODC-BY 1.0', attribution: 'Moody & Mark · DOI 10.13026/C2F305', count: 48},
};

export function decodeWfdb(dataset: Dataset, name: string, header: string, binary: ArrayBuffer): Signal {
  const lines = header.trim().split(/\r?\n/);
  const [, channelCount, frequency] = lines[0].trim().split(/\s+/);
  const count = Number(channelCount);
  const sampleRate = Number(frequency);
  const ptb = dataset === 'ptb-xl';
  if (count !== (ptb ? 12 : 2) || sampleRate !== (ptb ? 100 : 360)) throw Error('Неочікувана структура ЕКГ');
  const samples = sampleRate * 10;
  if (binary.byteLength !== samples * (ptb ? count * 2 : 3)) throw Error('Неповний фрагмент ЕКГ');

  const specs = lines.slice(1, count + 1).map(line => {
    const fields = line.trim().split(/\s+/);
    const match = /^([\d.]+)(?:\((-?\d+)\))?(?:\/mV)?$/.exec(fields[2]);
    const gain = Number(match?.[1]);
    const baseline = Number(match?.[2] ?? fields[4]);
    if (fields[1] !== (ptb ? '16' : '212') || !(gain > 0) || !Number.isFinite(baseline) || !fields[8]) {
      throw Error('Калібрування сигналу не підтримується');
    }
    return {name: fields[8].replace(/^AV([RLF])$/i, 'aV$1'), gain, baseline};
  });
  if (specs.length !== count) throw Error('Відсутні відведення');
  const view = new DataView(binary);
  const leads = specs.map((spec, channel) => ({name: spec.name, values: Array.from({length: samples}, (_, sample) => {
    let raw: number;
    if (ptb) raw = view.getInt16((sample * count + channel) * 2, true);
    else {
      const offset = sample * 3;
      const high = view.getUint8(offset + 1);
      raw = channel === 0 ? view.getUint8(offset) | ((high & 15) << 8) : view.getUint8(offset + 2) | ((high & 240) << 4);
      if (raw & 2048) raw -= 4096;
    }
    return (raw - spec.baseline) / spec.gain;
  })}));
  return {name, sampleRate, unit: 'mV', leads};
}

export async function loadWaveform(dataset: Dataset, id: string, signal: AbortSignal): Promise<Signal> {
  const name = `${dataset}-${id}`;
  if (dataset === 'mitdb') {
    const response = await fetch(`/data/real-ecg/mitdb/${id}.json`, {signal});
    if (!response.ok) throw Error('Фрагмент MIT-BIH недоступний');
    const {header, bytes}: {header: string; bytes: string} = await response.json();
    const binary = Uint8Array.from(atob(bytes), character => character.charCodeAt(0));
    return decodeWfdb(dataset, name, header, binary.buffer);
  }

  if (dataset === 'ptb-xl' && bundledIds.has(id)) {
    const response = await fetch(`/data/real-ecg/${name}.json`, {signal});
    if (response.ok) {
      const waveform: unknown = await response.json();
      if (isValidSignal(waveform)) return waveform;
    }
  }
  const path = `/api/ecg/${dataset}/${id}`;
  const [header, binary] = await Promise.all([
    fetch(`${path}.hea`, {signal}), fetch(`${path}.dat`, {signal}),
  ]);
  if (!header.ok) throw Error('Опис запису тимчасово недоступний');
  if (!binary.ok) throw Error('Сигнал цього запису тимчасово недоступний');
  return decodeWfdb(dataset, name, await header.text(), await binary.arrayBuffer());
}

const bundledIds = new Set(["00526","01052","01578","02104","02630","03156","03682","04208","04734","05260","05786","06312","06838","07364","07890","08416","08942","09468","09994","10520","11046","11572","12098","12624"]);
