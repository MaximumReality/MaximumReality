import { useState, useRef, useCallback } from "react";

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function freqToNote(freq) {
  if (freq <= 0) return null;
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  if (midi < 0 || midi > 127) return null;
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, full: name + octave };
}

function detectPitch(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.005) return { freq: -1, confidence: 0 };

  const n = buffer.length;
  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buffer[i] * buffer[i + lag];
    c[lag] = s;
  }

  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.ceil(sampleRate / 60);
  let dipped = false, maxVal = -Infinity, bestLag = -1;
  for (let i = minLag; i < Math.min(maxLag, n); i++) {
    if (!dipped && c[i] < c[i - 1]) dipped = true;
    if (dipped && c[i] > maxVal) { maxVal = c[i]; bestLag = i; }
  }
  if (bestLag < 0) return { freq: -1, confidence: 0 };

  let refined = bestLag;
  if (bestLag > 0 && bestLag < n - 1) {
    const a = c[bestLag - 1], b = c[bestLag], cc = c[bestLag + 1];
    refined += (a - cc) / (2 * (a - 2 * b + cc)) || 0;
  }

  return { freq: sampleRate / refined, confidence: c[0] > 0 ? maxVal / c[0] : 0 };
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
}

const NOTE_COLORS = {
  C: { color: '#ff3cac', bg: 'rgba(255,60,172,0.12)', border: 'rgba(255,60,172,0.4)' },
  D: { color: '#ff7700', bg: 'rgba(255,119,0,0.12)', border: 'rgba(255,119,0,0.4)' },
  E: { color: '#ffe600', bg: 'rgba(255,230,0,0.12)', border: 'rgba(255,230,0,0.4)' },
  F: { color: '#00ff88', bg: 'rgba(0,255,136,0.12)', border: 'rgba(0,255,136,0.4)' },
  G: { color: '#00ffe7', bg: 'rgba(0,255,231,0.12)', border: 'rgba(0,255,231,0.4)' },
  A: { color: '#7b61ff', bg: 'rgba(123,97,255,0.12)', border: 'rgba(123,97,255,0.4)' },
  B: { color: '#ff3cac', bg: 'rgba(255,60,172,0.12)', border: 'rgba(255,60,172,0.4)' },
};

function getColor(noteName) {
  if (!noteName) return { color: '#556070', bg: 'transparent', border: '#1e2533' };
  return NOTE_COLORS[noteName.replace('#', '').replace('b', '')] || NOTE_COLORS['C'];
}

export default function MelodyDecoder() {
  const [fileName, setFileName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('sequence');
  const [confidence, setConfidence] = useState(0.70);
  const [windowSize, setWindowSize] = useState(4096);
  const [skipRests, setSkipRests] = useState(true);
  const fileInputRef = useRef();
  const audioCtxRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
      alert('Please upload an audio file (MP3, WAV, OGG, M4A, FLAC)');
      return;
    }
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setResults([]);
    setStats(null);

    const arrayBuf = await file.arrayBuffer();
    if (audioCtxRef.current) { try { await audioCtxRef.current.close(); } catch(e){} }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    try {
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setAudioBuffer(decoded);
    } catch(e) {
      alert('Could not decode audio. Try a different format (WAV works best).');
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const analyze = async () => {
    if (!audioBuffer) return;
    setAnalyzing(true);
    setProgress(0);
    setResults([]);
    setStats(null);

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const hop = windowSize / 2;
    const totalFrames = Math.floor((channelData.length - windowSize) / hop);
    const raw = [];

    for (let i = 0; i < totalFrames; i++) {
      if (i % 60 === 0) {
        setProgress(Math.round((i / totalFrames) * 100));
        setProgressMsg(`Frame ${i} / ${totalFrames}`);
        await new Promise(r => setTimeout(r, 0));
      }
      const start = i * hop;
      const frame = new Float32Array(windowSize);
      for (let j = 0; j < windowSize && start + j < channelData.length; j++) {
        frame[j] = channelData[start + j] * 0.5 * (1 - Math.cos(2 * Math.PI * j / (windowSize - 1)));
      }
      const { freq, confidence: conf } = detectPitch(frame, sampleRate);
      const time = start / sampleRate;
      const noteObj = freq > 0 ? freqToNote(freq) : null;
      const valid = noteObj && conf >= confidence;
      raw.push({ time, freq: valid ? freq : 0, confidence: valid ? conf : 0, note: valid ? noteObj : null });
    }

    // Consolidate consecutive same notes
    const consolidated = [];
    let prev = null;
    for (const r of raw) {
      const key = r.note ? r.note.full : 'rest';
      if (prev && prev.key === key) {
        prev.duration += hop / sampleRate;
      } else {
        prev = { key, note: r.note, time: r.time, duration: hop / sampleRate, confidence: r.confidence, freq: r.freq };
        consolidated.push(prev);
      }
    }

    // Stats
    const noteCounts = {};
    let total = 0;
    for (const r of consolidated) {
      if (r.note) { noteCounts[r.note.name] = (noteCounts[r.note.name] || 0) + 1; total++; }
    }
    const sorted = Object.entries(noteCounts).sort((a, b) => b[1] - a[1]);
    const dur = audioBuffer.duration;
    const avgDur = dur / Math.max(total, 1);
    const bpm = Math.round(60 / avgDur);

    setStats({
      key: (sorted[0]?.[0] || '?') + ' (est.)',
      total,
      unique: sorted.length,
      bpm: bpm > 20 && bpm < 400 ? bpm : '—'
    });
    setResults(consolidated);
    setProgress(100);
    setAnalyzing(false);
  };

  const exportTXT = () => {
    const lines = ['MELODY DECODER — Transcription\n'];
    lines.push('SEQUENCE: ' + results.filter(r => r.note).map(r => r.note.full).join('  ') + '\n\n');
    lines.push('TIMELINE:\n');
    for (const r of results) {
      if (skipRests && !r.note) continue;
      lines.push(`${formatTime(r.time)}  ${r.note ? r.note.full.padEnd(4) : '—   '}  ${r.freq > 0 ? r.freq.toFixed(1) + ' Hz' : ''}\n`);
    }
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(lines.join(''));
    a.download = 'melody.txt'; a.click();
  };

  const exportCSV = () => {
    let out = 'time,note,freq_hz,confidence\n';
    for (const r of results) {
      if (skipRests && !r.note) continue;
      out += `${r.time.toFixed(3)},${r.note ? r.note.full : ''},${r.freq > 0 ? r.freq.toFixed(2) : ''},${(r.confidence * 100).toFixed(1)}\n`;
    }
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(out);
    a.download = 'melody.csv'; a.click();
  };

  const filtered = results.filter(r => !skipRests || r.note);

  return (
    <div style={{ background: '#080a0e', minHeight: '100vh', color: '#c8d0e0', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #1e2533', display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, letterSpacing: '0.1em', color: '#00ffe7', textShadow: '0 0 24px rgba(0,255,231,0.4)' }}>
          MELODY DECODER
        </div>
        <div style={{ fontSize: '0.65rem', color: '#556070', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          // pitch transcription engine
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'min(340px, 100%) 1fr', minHeight: 'calc(100vh - 65px)' }}>
        {/* LEFT */}
        <div style={{ borderRight: '1px solid #1e2533', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#00ffe7' : '#1e2533'}`,
              borderRadius: 8,
              padding: '28px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'rgba(0,255,231,0.05)' : 'rgba(0,255,231,0.01)',
              transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac" onChange={onFileChange}
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎵</div>
            <div style={{ fontSize: '0.75rem', color: '#00ffe7', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {fileName || 'Tap or drop audio file'}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#556070', marginTop: 4 }}>
              MP3 · WAV · OGG · M4A · FLAC
            </div>
          </div>

          {audioUrl && (
            <audio controls src={audioUrl} style={{ width: '100%', height: 32, opacity: 0.85 }} />
          )}

          {/* Settings */}
          <div>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#556070', marginBottom: 10 }}>
              Settings
            </div>

            {[
              { label: 'Sensitivity', sub: 'Confidence threshold', el: (
                <div>
                  <input type="range" min="0.1" max="0.95" step="0.05" value={confidence}
                    onChange={e => setConfidence(parseFloat(e.target.value))}
                    style={{ width: 90, accentColor: '#00ffe7' }} />
                  <div style={{ fontSize: '0.62rem', color: '#556070', textAlign: 'right' }}>{confidence.toFixed(2)}</div>
                </div>
              )},
              { label: 'Window Size', sub: 'Frame accuracy', el: (
                <select value={windowSize} onChange={e => setWindowSize(parseInt(e.target.value))}
                  style={{ background: '#0d1117', border: '1px solid #1e2533', color: '#c8d0e0', fontFamily: 'monospace', fontSize: '0.7rem', padding: '3px 6px', borderRadius: 4 }}>
                  <option value={2048}>Fast (2048)</option>
                  <option value={4096}>Balanced (4096)</option>
                  <option value={8192}>Accurate (8192)</option>
                </select>
              )},
              { label: 'Skip Rests', sub: 'Hide silent frames', el: (
                <select value={skipRests ? '1' : '0'} onChange={e => setSkipRests(e.target.value === '1')}
                  style={{ background: '#0d1117', border: '1px solid #1e2533', color: '#c8d0e0', fontFamily: 'monospace', fontSize: '0.7rem', padding: '3px 6px', borderRadius: 4 }}>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              )},
            ].map(({ label, sub, el }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: '0.76rem' }}>{label}</div>
                  <div style={{ fontSize: '0.62rem', color: '#556070' }}>{sub}</div>
                </div>
                {el}
              </div>
            ))}
          </div>

          <button
            onClick={analyze}
            disabled={!audioBuffer || analyzing}
            style={{
              width: '100%', padding: '12px', background: 'transparent',
              border: `1px solid ${!audioBuffer || analyzing ? '#1e2533' : '#00ffe7'}`,
              color: !audioBuffer || analyzing ? '#556070' : '#00ffe7',
              fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700,
              letterSpacing: '0.12em', cursor: !audioBuffer || analyzing ? 'not-allowed' : 'pointer',
              borderRadius: 4, textTransform: 'uppercase', transition: 'all 0.2s'
            }}
          >
            {analyzing ? `⌛ ${progress}%` : '⬡ Analyze Song'}
          </button>

          {analyzing && (
            <div>
              <div style={{ background: '#1e2533', borderRadius: 2, height: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#ff3cac,#00ffe7)', width: progress + '%', transition: 'width 0.1s' }} />
              </div>
              <div style={{ fontSize: '0.65rem', color: '#556070', marginTop: 5 }}>{progressMsg}</div>
            </div>
          )}

          {stats && (
            <div style={{ background: '#0d1117', border: '1px solid #1e2533', borderRadius: 6, padding: '12px 14px' }}>
              {[
                ['DETECTED KEY', stats.key],
                ['TOTAL NOTES', stats.total],
                ['UNIQUE NOTES', stats.unique],
                ['TEMPO (est.)', stats.bpm + (typeof stats.bpm === 'number' ? ' BPM' : '')],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.62rem', color: '#556070', letterSpacing: '0.1em' }}>{k}</span>
                  <span style={{ fontSize: '0.8rem', color: '#ffe600', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportTXT} style={{ flex: 1, padding: '7px', background: 'transparent', border: '1px solid #1e2533', color: '#556070', fontFamily: 'monospace', fontSize: '0.65rem', cursor: 'pointer', borderRadius: 3, letterSpacing: '0.08em' }}>
                Export TXT
              </button>
              <button onClick={exportCSV} style={{ flex: 1, padding: '7px', background: 'transparent', border: '1px solid #1e2533', color: '#556070', fontFamily: 'monospace', fontSize: '0.65rem', cursor: 'pointer', borderRadius: 3, letterSpacing: '0.08em' }}>
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e2533' }}>
            {['sequence', 'timeline'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 18px', background: 'none',
                border: 'none', borderBottom: `2px solid ${tab === t ? '#00ffe7' : 'transparent'}`,
                color: tab === t ? '#00ffe7' : '#556070',
                fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s'
              }}>
                {t === 'sequence' ? 'Note Sequence' : 'Timeline'}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 12, color: '#556070' }}>
              <div style={{ fontSize: '3rem', opacity: 0.3 }}>♩</div>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textAlign: 'center' }}>
                Upload an audio file and click<br />Analyze Song to see notes
              </div>
            </div>
          ) : tab === 'sequence' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
              {filtered.map((r, i) => {
                const col = getColor(r.note?.name);
                return (
                  <div key={i} title={r.note ? `${r.note.full} · ${r.freq.toFixed(1)} Hz · ${(r.confidence * 100).toFixed(0)}% conf` : 'Rest'}
                    style={{
                      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                      padding: '5px 9px', borderRadius: 4, minWidth: 44,
                      border: `1px solid ${col.border}`, background: col.bg,
                      color: col.color, fontFamily: 'monospace', cursor: 'default',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{r.note ? r.note.name : '—'}</span>
                    {r.note && <span style={{ fontSize: '0.58rem', opacity: 0.7 }}>{r.note.octave}</span>}
                    <span style={{ fontSize: '0.55rem', opacity: 0.55, marginTop: 1 }}>{r.duration.toFixed(2)}s</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.7rem' }}>
              <thead>
                <tr>
                  {['Time', 'Note', 'Frequency', 'Confidence'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: '#556070', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderBottom: '1px solid #1e2533' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const col = getColor(r.note?.name);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(30,37,51,0.4)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <td style={{ padding: '4px 10px', color: '#556070' }}>{formatTime(r.time)}</td>
                      <td style={{ padding: '4px 10px', color: col.color, fontWeight: 700 }}>{r.note ? r.note.full : '—'}</td>
                      <td style={{ padding: '4px 10px', color: '#556070', fontSize: '0.64rem' }}>{r.freq > 0 ? r.freq.toFixed(1) + ' Hz' : '—'}</td>
                      <td style={{ padding: '4px 10px' }}>
                        <div style={{ background: '#1e2533', borderRadius: 2, height: 4, width: 80, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'linear-gradient(90deg,#ff3cac,#00ffe7)', width: (r.confidence * 100) + '%' }} />
                        </div>
                        <div style={{ fontSize: '0.58rem', color: '#556070', marginTop: 2 }}>{(r.confidence * 100).toFixed(0)}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
