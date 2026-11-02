/* ============================================================
   BeatVision Vocoder Engine  —  bv-vocoder.js
   Real-time band-vocoder using Web Audio API.

   Signal flow
   ───────────
   Modulator (uploaded audio)
     └→ [N band-pass filters] → full-wave rectifier (WaveShaper) → [LP envelope follower]
                                                                         ↓ gain.gain
   Carrier (oscillator / noise)
     └→ [N band-pass filters] → GainNode (driven by envelope) ─┐
                                                                 ↓
                                               summing merge → limiter → wet/dry mix → destination

   ============================================================ */

window.BVVocoder = (function () {
  'use strict';

  // ── state ────────────────────────────────────────────────
  let ctx       = null;
  let modBuf    = null;   // decoded AudioBuffer for modulator
  let modSrc    = null;   // currently playing modulator source
  let carrier   = null;   // { osc, osc2, noise, gainNode } — active carrier nodes
  let bands     = [];     // array of { modBP, carBP, rect, envLP, envGain } per band
  let merger    = null;
  let limiter   = null;   // DynamicsCompressorNode — prevents summed-band clipping
  let wetGain   = null;
  let dryGain   = null;
  let masterOut = null;
  let isPlaying       = false;
  let _restartPending = false; // guard against overlapping async restarts

  // ── default params ───────────────────────────────────────
  const params = {
    nBands:       16,
    carrierType:  'sawtooth',   // 'sawtooth' | 'square' | 'noise' | 'pulse' | 'harmonic'
    carrierFreq:  150,
    envSpeed:     12,           // LP cutoff for envelope follower (Hz) — lower = smoother
    wetMix:       0.9,
    dryMix:       0.0,
  };

  // ── helpers ──────────────────────────────────────────────

  // Logarithmically spaced centre frequencies from fLow to fHigh.
  function _bandFreqs(n, fLow, fHigh) {
    const freqs = [];
    for (let i = 0; i < n; i++) {
      freqs.push(fLow * Math.pow(fHigh / fLow, i / (n - 1)));
    }
    return freqs;
  }

  // Full-wave rectifier curve stored in a WaveShaperNode.
  // |x| produces a steadier envelope than half-wave rectification because
  // both the positive and negative half-cycles of each band contribute energy,
  // reducing ripple at the envelope follower input — especially useful for
  // voiced consonants and complex vocal signals.
  function _makeRectifier(audioCtx) {
    const ws = audioCtx.createWaveShaper();
    const n = 4096;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1; // -1 → 1
      curve[i] = Math.abs(x);           // full-wave rectify: |x|
    }
    ws.curve = curve;
    ws.oversample = 'none';
    return ws;
  }

  // ── carrier builder ──────────────────────────────────────
  function _buildCarrier(type, freq) {
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    const nodes = { gainNode: gain };

    if (type === 'noise') {
      // White noise via ScriptProcessor (small buffer, simple)
      const bufLen = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      src.connect(gain);
      src.start();
      nodes.noise = src;

    } else if (type === 'harmonic') {
      // Additive: fundamental + harmonics 2–8 with 1/n amplitude
      const merge = ctx.createGain();
      merge.gain.value = 0.6;
      merge.connect(gain);
      nodes.harmonics = [];
      for (let h = 1; h <= 8; h++) {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        g.gain.value = 1 / h;
        osc.connect(g);
        g.connect(merge);
        osc.start();
        nodes.harmonics.push(osc);
      }

    } else if (type === 'pulse') {
      // Pulse: two detuned square waves → richer, less buzzy than plain square
      const merge = ctx.createGain();
      merge.gain.value = 0.5;
      merge.connect(gain);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = o2.type = 'square';
      o1.frequency.value = freq;
      o2.frequency.value = freq * 1.008; // slight detune for width
      o1.connect(merge); o2.connect(merge);
      o1.start(); o2.start();
      nodes.osc = o1; nodes.osc2 = o2;

    } else {
      // 'sawtooth' | 'square'
      const osc = ctx.createOscillator();
      osc.type = type === 'square' ? 'square' : 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      nodes.osc = osc;
    }

    return nodes;
  }

  // ── teardown ─────────────────────────────────────────────
  function _stopCarrier() {
    if (!carrier) return;
    try {
      if (carrier.osc)    { carrier.osc.stop();  carrier.osc.disconnect(); }
      if (carrier.osc2)   { carrier.osc2.stop(); carrier.osc2.disconnect(); }
      if (carrier.noise)  { carrier.noise.stop();carrier.noise.disconnect(); }
      if (carrier.harmonics) carrier.harmonics.forEach(function(o){try{o.stop();o.disconnect();}catch(_){}});
      if (carrier.gainNode) carrier.gainNode.disconnect();
    } catch (_) {}
    carrier = null;
  }

  function _stopMod() {
    if (modSrc) { try { modSrc.stop(); } catch (_) {} modSrc = null; }
  }

  function _teardownGraph() {
    _stopCarrier();
    _stopMod();
    bands.forEach(function (b) {
      try {
        b.modBP.disconnect(); b.carBP.disconnect();
        b.rect.disconnect();  b.envLP.disconnect();
        b.envGain.disconnect();
      } catch (_) {}
    });
    bands = [];
    if (merger)    { try { merger.disconnect();    } catch (_) {} merger    = null; }
    if (wetGain)   { try { wetGain.disconnect();   } catch (_) {} wetGain   = null; }
    if (dryGain)   { try { dryGain.disconnect();   } catch (_) {} dryGain   = null; }
    if (masterOut) { try { masterOut.disconnect();  } catch (_) {} masterOut = null; }
  }

  // ── graph builder ────────────────────────────────────────
  function _buildGraph() {
    const n     = params.nBands;
    const freqs = _bandFreqs(n, 80, 16000);
    const dest  = ctx.destination;

    merger    = ctx.createGain(); // summing bus
    limiter   = ctx.createDynamicsCompressor();
    wetGain   = ctx.createGain();
    dryGain   = ctx.createGain();
    masterOut = ctx.createGain();

    // Scale the summing bus down proportionally to band count.
    // N equal-amplitude band-pass signals sum to roughly sqrt(N) times the
    // amplitude of one band, so dividing by sqrt(N) keeps the limiter input
    // near 0 dBFS before it does any work.
    merger.gain.value = 1 / Math.sqrt(params.nBands);

    // Gentle brickwall limiter: fast attack, slow release, high ratio.
    // This catches any residual peaks without audible pumping on normal signals.
    limiter.threshold.value = -3;   // dBFS — start limiting 3 dB below full scale
    limiter.knee.value      =  3;   // soft knee width in dB
    limiter.ratio.value     = 20;   // hard-limit above threshold
    limiter.attack.value    = 0.003; // 3 ms — catches transients
    limiter.release.value   = 0.25;  // 250 ms — inaudible on normal vocals

    wetGain.gain.value = params.wetMix;
    dryGain.gain.value = params.dryMix;

    merger.connect(limiter);
    limiter.connect(wetGain);
    wetGain.connect(masterOut);
    dryGain.connect(masterOut);
    masterOut.connect(dest);

    // Build carrier
    carrier = _buildCarrier(params.carrierType, params.carrierFreq);

    // Build per-band nodes
    const Q = 3.5; // moderate Q — tight enough for clarity, not so tight it rings
    for (let i = 0; i < n; i++) {
      const fc = freqs[i];

      // Modulator band-pass
      const modBP = ctx.createBiquadFilter();
      modBP.type            = 'bandpass';
      modBP.frequency.value = fc;
      modBP.Q.value         = Q;

      // Half-wave rectifier (acts as envelope detector input)
      const rect = _makeRectifier(ctx);

      // Low-pass envelope follower
      const envLP = ctx.createBiquadFilter();
      envLP.type            = 'lowpass';
      envLP.frequency.value = params.envSpeed;
      envLP.Q.value         = 0.5;

      // Carrier band-pass
      const carBP = ctx.createBiquadFilter();
      carBP.type            = 'bandpass';
      carBP.frequency.value = fc;
      carBP.Q.value         = Q;

      // GainNode whose gain is controlled by the envelope
      const envGain = ctx.createGain();
      envGain.gain.value = 0;

      // Modulator path: modBP → rect → envLP → envGain.gain (AudioParam)
      modBP.connect(rect);
      rect.connect(envLP);
      envLP.connect(envGain.gain); // AudioParam automation from envelope signal

      // Carrier path: carrier gainNode → carBP → envGain → merger
      carrier.gainNode.connect(carBP);
      carBP.connect(envGain);
      envGain.connect(merger);

      bands.push({ modBP, carBP, rect, envLP, envGain });
    }

    return bands;
  }

  // ── audio context init ───────────────────────────────────
  async function _initCtx() {
    if (!ctx) {
      // Prefer BV's shared AudioContext to avoid a second context
      ctx = (window.BV && BV.actx) ? BV.actx
          : new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }

  // ── public: load modulator file ──────────────────────────
  async function loadModulator(file) {
    BVVC_UI.setStatus('⏳ Decoding modulator...');
    await _initCtx();
    const ab = await file.arrayBuffer();
    try {
      modBuf = await ctx.decodeAudioData(ab);
      BVVC_UI.setStatus('✓ ' + file.name.slice(0, 32) + ' loaded  (' + modBuf.duration.toFixed(1) + 's)');
      BVVC_UI.enablePlay(true);
    } catch (e) {
      BVVC_UI.setStatus('⚠ Could not decode file — try MP3 or WAV');
    }
  }

  // ── public: start vocoder ────────────────────────────────
  async function start() {
    if (isPlaying) stop();
    if (!modBuf)   { BVVC_UI.setStatus('⚠ Load a modulator file first'); return; }
    await _initCtx();
    _buildGraph();

    // Modulator source
    modSrc = ctx.createBufferSource();
    modSrc.buffer = modBuf;
    modSrc.loop   = false;
    modSrc.onended = function () { if (isPlaying) stop(); };

    // Connect modulator to all modBP inputs
    bands.forEach(function (b) { modSrc.connect(b.modBP); });

    // Always connect dry path — dryGain.gain.value = 0 keeps it silent by default.
    // This lets the dry knob take effect during playback without requiring a restart.
    modSrc.connect(dryGain);

    modSrc.start(0);
    isPlaying = true;
    BVVC_UI.setPlayState(true);
    BVVC_UI.setStatus('▶ Vocoding...');
  }

  // ── public: stop ─────────────────────────────────────────
  function stop() {
    _teardownGraph();
    isPlaying = false;
    BVVC_UI.setPlayState(false);
    BVVC_UI.setStatus('◼ Stopped');
  }

  // ── public: update a parameter live ──────────────────────
  function setParam(key, value) {
    params[key] = value;
    if (!isPlaying) return;

    switch (key) {
      case 'wetMix':
        if (wetGain) wetGain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
        break;
      case 'dryMix':
        if (dryGain) dryGain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
        break;
      case 'carrierFreq':
        // Update oscillator frequency live without rebuilding
        if (carrier) {
          if (carrier.osc)  carrier.osc.frequency.setTargetAtTime(value, ctx.currentTime, 0.01);
          if (carrier.osc2) carrier.osc2.frequency.setTargetAtTime(value * 1.008, ctx.currentTime, 0.01);
          if (carrier.harmonics) {
            carrier.harmonics.forEach(function (o, i) {
              o.frequency.setTargetAtTime(value * (i + 1), ctx.currentTime, 0.01);
            });
          }
        }
        break;
      case 'envSpeed':
        // Update all envelope LP cutoffs live
        bands.forEach(function (b) {
          b.envLP.frequency.setTargetAtTime(value, ctx.currentTime, 0.02);
        });
        break;
      case 'carrierType':
      case 'nBands':
        // These require a full graph rebuild — restart if playing.
        // Guard with _restartPending so rapid parameter changes don't stack up
        // overlapping async start() calls (start() awaits audio context init).
        if (isPlaying && !_restartPending) {
          _restartPending = true;
          stop();
          start().finally(function () { _restartPending = false; });
        }
        break;
    }
  }

  // ── offline render to AudioBuffer ────────────────────────
  async function renderOffline() {
    if (!modBuf) return null;
    const sr  = 44100;
    const len = Math.floor(modBuf.duration * sr);
    const oCtx = new OfflineAudioContext(2, len, sr);

    const n     = params.nBands;
    const freqs = _bandFreqs(n, 80, 16000);
    const Q     = 3.5;

    // Resample modBuf to 44.1k if needed
    let srcBuf = modBuf;
    if (modBuf.sampleRate !== sr) {
      const tmpCtx = new OfflineAudioContext(2, len, sr);
      const tmpSrc = tmpCtx.createBufferSource();
      tmpSrc.buffer = modBuf.numberOfChannels > 1 ? modBuf : (() => {
        const b = tmpCtx.createBuffer(2, modBuf.length, modBuf.sampleRate);
        b.getChannelData(0).set(modBuf.getChannelData(0));
        b.getChannelData(1).set(modBuf.getChannelData(0));
        return b;
      })();
      tmpSrc.connect(tmpCtx.destination);
      tmpSrc.start(0);
      srcBuf = await tmpCtx.startRendering();
    }

    // Carrier
    const offCarrier = _buildOfflineCarrier(oCtx, params.carrierType, params.carrierFreq);
    const modNode    = oCtx.createBufferSource();
    modNode.buffer   = srcBuf.numberOfChannels > 1 ? srcBuf : (() => {
      const b = oCtx.createBuffer(2, srcBuf.length, sr);
      b.getChannelData(0).set(srcBuf.getChannelData(0));
      b.getChannelData(1).set(srcBuf.getChannelData(0));
      return b;
    })();

    const merger2  = oCtx.createGain();
    const limiter2 = oCtx.createDynamicsCompressor();
    limiter2.threshold.value = -3; limiter2.knee.value = 3;
    limiter2.ratio.value = 20; limiter2.attack.value = 0.003; limiter2.release.value = 0.25;
    merger2.gain.value = 1 / Math.sqrt(params.nBands);
    const wetG     = oCtx.createGain(); wetG.gain.value = params.wetMix;
    const dryG     = oCtx.createGain(); dryG.gain.value = params.dryMix;
    merger2.connect(limiter2); limiter2.connect(wetG); wetG.connect(oCtx.destination);
    // Always connect dry path — dryG.gain.value = 0 makes it silent when not wanted
    modNode.connect(dryG); dryG.connect(oCtx.destination);

    for (let i = 0; i < n; i++) {
      const fc = freqs[i];
      const modBP = oCtx.createBiquadFilter(); modBP.type='bandpass'; modBP.frequency.value=fc; modBP.Q.value=Q;
      const rect  = _makeOfflineRectifier(oCtx);
      const envLP = oCtx.createBiquadFilter(); envLP.type='lowpass'; envLP.frequency.value=params.envSpeed; envLP.Q.value=0.5;
      const carBP = oCtx.createBiquadFilter(); carBP.type='bandpass'; carBP.frequency.value=fc; carBP.Q.value=Q;
      const envG  = oCtx.createGain(); envG.gain.value=0;

      modNode.connect(modBP);
      modBP.connect(rect); rect.connect(envLP); envLP.connect(envG.gain);
      offCarrier.connect(carBP); carBP.connect(envG); envG.connect(merger2);
    }

    modNode.start(0);
    return await oCtx.startRendering();
  }

  // Offline clones of carrier / rectifier builders
  function _buildOfflineCarrier(oCtx, type, freq) {
    const gain = oCtx.createGain(); gain.gain.value = 1.0;
    if (type === 'noise') {
      const bufLen = oCtx.sampleRate * Math.ceil(modBuf.duration + 1);
      const nb = oCtx.createBuffer(1, bufLen, oCtx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
      const s = oCtx.createBufferSource(); s.buffer = nb; s.loop = true; s.connect(gain); s.start();
    } else if (type === 'harmonic') {
      const m = oCtx.createGain(); m.gain.value = 0.6; m.connect(gain);
      for (let h = 1; h <= 8; h++) {
        const o = oCtx.createOscillator(); const g = oCtx.createGain();
        o.type = 'sine'; o.frequency.value = freq * h; g.gain.value = 1/h;
        o.connect(g); g.connect(m); o.start();
      }
    } else if (type === 'pulse') {
      const m = oCtx.createGain(); m.gain.value = 0.5; m.connect(gain);
      const o1 = oCtx.createOscillator(); const o2 = oCtx.createOscillator();
      o1.type = o2.type = 'square';
      o1.frequency.value = freq; o2.frequency.value = freq * 1.008;
      o1.connect(m); o2.connect(m); o1.start(); o2.start();
    } else {
      const o = oCtx.createOscillator();
      o.type = type === 'square' ? 'square' : 'sawtooth';
      o.frequency.value = freq; o.connect(gain); o.start();
    }
    return gain;
  }

  function _makeOfflineRectifier(oCtx) {
    const ws = oCtx.createWaveShaper();
    const n = 4096; const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i/(n-1))*2-1; curve[i] = Math.abs(x); } // full-wave
    ws.curve = curve; ws.oversample = 'none';
    return ws;
  }

  // ── export rendered vocoded audio ────────────────────────
  async function exportVocoded() {
    if (!modBuf) { BVVC_UI.setStatus('⚠ Load a modulator file first'); return; }
    BVVC_UI.setStatus('⏳ Rendering offline...');
    try {
      const rendered = await renderOffline();
      if (!rendered) { BVVC_UI.setStatus('⚠ Render failed'); return; }
      // Encode to WAV
      const wav = _encodeWAV(rendered);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'BV-Vocoded-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.wav';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      BVVC_UI.setStatus('✅ Exported WAV');
    } catch (e) {
      console.error('Vocoder export error:', e);
      BVVC_UI.setStatus('⚠ Export error: ' + e.message);
    }
  }

  function _encodeWAV(buf) {
    const sr = buf.sampleRate, len = buf.length, nCh = 2;
    const bySamp = 2, blk = nCh * bySamp, byRate = sr * blk;
    const dataSz = len * blk;
    const ab = new ArrayBuffer(44 + dataSz), v = new DataView(ab);
    const ws = function(o, s){ for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4,36+dataSz,true); ws(8,'WAVE');
    ws(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true);
    v.setUint16(22,nCh,true); v.setUint32(24,sr,true); v.setUint32(28,byRate,true);
    v.setUint16(32,blk,true); v.setUint16(34,16,true);
    ws(36,'data'); v.setUint32(40,dataSz,true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        const ch = c < buf.numberOfChannels ? buf.getChannelData(c) : buf.getChannelData(0);
        const s  = Math.max(-1, Math.min(1, ch[i]));
        v.setInt16(off, Math.round(s * 32767), true); off += 2;
      }
    }
    return ab;
  }

  // ── public API ───────────────────────────────────────────
  return {
    loadModulator,
    start,
    stop,
    setParam,
    exportVocoded,
    get isPlaying() { return isPlaying; },
    get params()    { return params; },
  };

})();

/* ============================================================
   BeatVision Vocoder UI  —  BVVC_UI
   ============================================================ */
window.BVVC_UI = (function () {
  'use strict';

  function setStatus(msg) {
    const el = document.getElementById('vc-status');
    if (el) el.textContent = msg;
  }

  function enablePlay(on) {
    const btn = document.getElementById('vc-play-btn');
    if (btn) btn.disabled = !on;
    const exp = document.getElementById('vc-export-btn');
    if (exp) exp.disabled = !on;
  }

  function setPlayState(playing) {
    const btn = document.getElementById('vc-play-btn');
    if (btn) btn.textContent = playing ? '◼ STOP' : '▶ START';
  }

  return { setStatus, enablePlay, setPlayState };
})();
