/* ============================================================
   BeatVision DJ Engine  —  bv-dj.js
   2-deck player • crossfader • EQ kills • hot cues • loops
   FX (reverb/delay/filter) • BPM sync • waveform overview
   Mix recording • Web MIDI • live feed → BV analyser
   ============================================================ */

window.BVDJ = (function () {
  'use strict';

  /* ── state ─────────────────────────────────────────────── */
  let ctx = null;           // AudioContext (shared with BV when possible)
  let masterGain = null;    // final output
  let masterAnalyser = null;// feeds BV meters
  let recorderDest = null;  // MediaStreamDestination for recording
  let mediaRecorder = null;
  let recChunks = [];

  const decks = { A: null, B: null };
  let xfaderPos = 0.5;      // 0=full A, 1=full B
  let midiAccess = null;

  /* ── deck factory ──────────────────────────────────────── */
  function _makeDeck(id) {
    // Create deck gain node
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    // 3-band EQ
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 200;
    eqLow.gain.value = 0;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.8;
    eqMid.gain.value = 0;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;
    eqHigh.gain.value = 0;

    // Filter (sweep)
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'allpass';
    filterNode.frequency.value = 22050;
    filterNode.Q.value = 1;

    // Per-deck analyser for waveform strip
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;

    // Reverb
    const reverbNode = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    const reverbDry = ctx.createGain();
    reverbWet.gain.value = 0;
    reverbDry.gain.value = 1;
    _makeImpulse(reverbNode);

    // Delay
    const delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.375;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.35;
    const delayWet = ctx.createGain();
    const delayDry = ctx.createGain();
    delayWet.gain.value = 0;
    delayDry.gain.value = 1;

    // Connect: delay feedback loop
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);

    // Channel gain (post-FX, pre-crossfader)
    const channelGain = ctx.createGain();
    channelGain.gain.value = 1.0;

    // Crossfader gain for this deck
    const xfaderGain = ctx.createGain();
    xfaderGain.gain.value = 1.0;

    // Signal chain:
    // gainNode → eqLow → eqMid → eqHigh → filterNode → [dry+wet reverb] → [dry+wet delay] → analyser → channelGain → xfaderGain → masterGain
    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(filterNode);

    filterNode.connect(reverbDry);
    filterNode.connect(reverbNode);
    reverbNode.connect(reverbWet);
    reverbDry.connect(analyser);
    reverbWet.connect(analyser);

    analyser.connect(delayDry);
    analyser.connect(delayNode);
    delayNode.connect(delayWet);
    delayDry.connect(channelGain);
    delayWet.connect(channelGain);

    channelGain.connect(xfaderGain);
    xfaderGain.connect(masterGain);

    return {
      id,
      // audio nodes
      gainNode, eqLow, eqMid, eqHigh, filterNode,
      reverbNode, reverbWet, reverbDry,
      delayNode, delayFeedback, delayWet, delayDry,
      analyser, channelGain, xfaderGain,
      // playback state
      buffer: null,
      source: null,
      startTime: 0,      // ctx.currentTime when play started
      pauseOffset: 0,    // seconds into track when paused
      playing: false,
      bpm: 0,
      bpmManual: null,
      pitch: 1.0,        // playback rate
      // loop
      loopIn: null,
      loopOut: null,
      loopActive: false,
      // hot cues (4 per deck)
      cues: [null, null, null, null],
      // waveform overview (800 RMS points)
      waveformData: null,
      // EQ kill state
      killState: { low: false, mid: false, high: false },
      // FX amounts
      reverbAmount: 0,
      delayAmount: 0,
      filterFreq: 22050,
      // track info
      trackName: '',
      duration: 0,
      // VU
      vu: 0,
    };
  }

  /* ── impulse response (simple exponential decay) ───────── */
  function _makeImpulse(convolver) {
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    convolver.buffer = buf;
  }

  /* ── public init ────────────────────────────────────────── */
  function init() {
    // Reuse BV's AudioContext if available
    if (window.BV && BV.ctx) {
      ctx = BV.ctx;
    } else {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;

    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;

    // Hook into BV's analyser chain so BeatVision meters react to DJ mix
    masterGain.connect(masterAnalyser);
    if (window.BV && BV.masterIn) {
      masterGain.connect(BV.masterIn);
    } else {
      masterGain.connect(ctx.destination);
    }

    // Recorder destination
    recorderDest = ctx.createMediaStreamDestination();
    masterGain.connect(recorderDest);

    decks.A = _makeDeck('A');
    decks.B = _makeDeck('B');

    _setCrossfader(0.5);
    _initMidi();
    _startTick();

    BVDJ_UI.setMidiStatus('Waiting…');
  }

  /* ── load track ─────────────────────────────────────────── */
  function loadTrack(deckId, file) {
    if (ctx.state === 'suspended') ctx.resume();
    const deck = decks[deckId];
    const reader = new FileReader();
    reader.onload = function (e) {
      ctx.decodeAudioData(e.target.result).then(function (buffer) {
        // Stop existing source
        if (deck.source) {
          try { deck.source.stop(); } catch (_) {}
          deck.source = null;
        }
        deck.buffer = buffer;
        deck.playing = false;
        deck.pauseOffset = 0;
        deck.duration = buffer.duration;
        deck.trackName = file.name.replace(/\.[^.]+$/, '');
        deck.bpm = 0;
        deck.bpmManual = null;
        deck.loopIn = null;
        deck.loopOut = null;
        deck.loopActive = false;
        deck.cues = [null, null, null, null];

        BVDJ_UI.setTrackName(deckId, deck.trackName);
        BVDJ_UI.setDuration(deckId, deck.duration);
        BVDJ_UI.setPosition(deckId, 0);
        BVDJ_UI.setPlayState(deckId, false);
        BVDJ_UI.clearCues(deckId);

        // Build waveform overview + detect BPM in background
        _analyseTrack(deck, buffer).then(function () {
          BVDJ_UI.drawWaveformOverview(deckId, deck.waveformData);
          BVDJ_UI.setBpm(deckId, deck.bpm.toFixed(1));
        });
      }).catch(function (err) {
        console.error('DJ decode error', err);
        BVDJ_UI.setTrackName(deckId, '⚠ Decode error — try another file');
      });
    };
    reader.readAsArrayBuffer(file);
  }

  /* ── analyse track (offline) ────────────────────────────── */
  function _analyseTrack(deck, buffer) {
    return new Promise(function (resolve) {
      const sr = buffer.sampleRate;
      const ch = buffer.getChannelData(0);
      const hopSamples = Math.floor(sr * 0.05); // 50ms hops
      const totalHops = Math.floor(ch.length / hopSamples);
      const overview = new Float32Array(800);

      // Build RMS overview
      const hopsPer = Math.max(1, Math.floor(totalHops / 800));
      for (let i = 0; i < 800; i++) {
        let sum = 0, count = 0;
        for (let h = 0; h < hopsPer; h++) {
          const start = (i * hopsPer + h) * hopSamples;
          for (let s = 0; s < hopSamples && start + s < ch.length; s++) {
            sum += ch[start + s] * ch[start + s];
            count++;
          }
        }
        overview[i] = count > 0 ? Math.sqrt(sum / count) : 0;
      }
      deck.waveformData = overview;

      // BPM from bass energy spikes
      const bassHopEnergy = new Float32Array(totalHops);
      for (let h = 0; h < totalHops; h++) {
        const start = h * hopSamples;
        let sum = 0;
        for (let s = 0; s < hopSamples && start + s < ch.length; s++) {
          sum += ch[start + s] * ch[start + s];
        }
        bassHopEnergy[h] = sum / hopSamples;
      }

      // Find spikes (local maxima above mean)
      const mean = bassHopEnergy.reduce(function (a, b) { return a + b; }, 0) / totalHops;
      const threshold = mean * 1.5;
      const spikes = [];
      const minGap = Math.floor(0.25 * 1000 / 50); // 250ms minimum = max 240bpm
      let lastSpike = -minGap;
      for (let h = 1; h < totalHops - 1; h++) {
        if (bassHopEnergy[h] > threshold &&
            bassHopEnergy[h] > bassHopEnergy[h - 1] &&
            bassHopEnergy[h] > bassHopEnergy[h + 1] &&
            h - lastSpike >= minGap) {
          spikes.push(h);
          lastSpike = h;
        }
      }

      if (spikes.length > 4) {
        const intervals = [];
        for (let i = 1; i < spikes.length; i++) {
          intervals.push((spikes[i] - spikes[i - 1]) * 50); // ms
        }
        intervals.sort(function (a, b) { return a - b; });
        const med = intervals[Math.floor(intervals.length / 2)];
        let bpm = 60000 / med;
        // Snap to reasonable range 60-180
        while (bpm < 60) bpm *= 2;
        while (bpm > 180) bpm /= 2;
        deck.bpm = Math.round(bpm * 10) / 10;
      } else {
        deck.bpm = 120;
      }

      resolve();
    });
  }

  /* ── transport ──────────────────────────────────────────── */
  function play(deckId) {
    if (ctx.state === 'suspended') ctx.resume();
    const deck = decks[deckId];
    if (!deck.buffer || deck.playing) return;

    const src = ctx.createBufferSource();
    src.buffer = deck.buffer;
    src.playbackRate.value = deck.pitch;
    src.connect(deck.gainNode);

    if (deck.loopActive && deck.loopIn !== null && deck.loopOut !== null) {
      src.loop = true;
      src.loopStart = deck.loopIn;
      src.loopEnd = deck.loopOut;
    }

    const offset = Math.min(deck.pauseOffset, deck.buffer.duration);
    src.start(0, offset);

    src.onended = function () {
      if (deck.playing && !deck.loopActive) {
        deck.playing = false;
        deck.pauseOffset = 0;
        BVDJ_UI.setPlayState(deckId, false);
        BVDJ_UI.setPosition(deckId, 0);
      }
    };

    deck.source = src;
    deck.startTime = ctx.currentTime - offset;
    deck.playing = true;
    BVDJ_UI.setPlayState(deckId, true);
  }

  function pause(deckId) {
    const deck = decks[deckId];
    if (!deck.playing) return;
    deck.pauseOffset = ctx.currentTime - deck.startTime;
    deck.pauseOffset = Math.max(0, Math.min(deck.pauseOffset, deck.duration));
    try { deck.source.stop(); } catch (_) {}
    deck.source = null;
    deck.playing = false;
    BVDJ_UI.setPlayState(deckId, false);
  }

  function togglePlay(deckId) {
    decks[deckId].playing ? pause(deckId) : play(deckId);
  }

  function cue(deckId) {
    // Jump to start (or loop in point) and pause
    const deck = decks[deckId];
    if (deck.playing) pause(deckId);
    deck.pauseOffset = deck.loopIn !== null ? deck.loopIn : 0;
    BVDJ_UI.setPosition(deckId, deck.pauseOffset);
  }

  function seek(deckId, frac) {
    const deck = decks[deckId];
    if (!deck.buffer) return;
    const pos = frac * deck.duration;
    const wasPlaying = deck.playing;
    if (wasPlaying) pause(deckId);
    deck.pauseOffset = pos;
    BVDJ_UI.setPosition(deckId, pos);
    if (wasPlaying) play(deckId);
  }

  /* ── current position helper ─────────────────────────────── */
  function _position(deck) {
    if (!deck.buffer) return 0;
    if (!deck.playing) return deck.pauseOffset;
    const pos = ctx.currentTime - deck.startTime;
    return Math.min(pos, deck.duration);
  }

  /* ── hot cues ────────────────────────────────────────────── */
  function setCue(deckId, slot) {
    const deck = decks[deckId];
    const pos = _position(deck);
    deck.cues[slot] = pos;
    BVDJ_UI.setCueButton(deckId, slot, pos);
  }

  function jumpCue(deckId, slot) {
    const deck = decks[deckId];
    if (deck.cues[slot] === null) {
      // First press sets the cue
      setCue(deckId, slot);
      return;
    }
    const wasPlaying = deck.playing;
    if (wasPlaying) pause(deckId);
    deck.pauseOffset = deck.cues[slot];
    BVDJ_UI.setPosition(deckId, deck.pauseOffset);
    if (wasPlaying) play(deckId);
  }

  function clearCue(deckId, slot) {
    const deck = decks[deckId];
    deck.cues[slot] = null;
    BVDJ_UI.setCueButton(deckId, slot, null);
  }

  /* ── loops ───────────────────────────────────────────────── */
  function setLoopIn(deckId) {
    const deck = decks[deckId];
    deck.loopIn = _position(deck);
    BVDJ_UI.updateLoopDisplay(deckId, deck.loopIn, deck.loopOut, deck.loopActive);
  }

  function setLoopOut(deckId) {
    const deck = decks[deckId];
    deck.loopOut = _position(deck);
    if (deck.loopIn !== null && deck.loopOut > deck.loopIn) {
      deck.loopActive = true;
      _applyLoop(deck);
    }
    BVDJ_UI.updateLoopDisplay(deckId, deck.loopIn, deck.loopOut, deck.loopActive);
  }

  function toggleLoop(deckId) {
    const deck = decks[deckId];
    if (deck.loopIn === null || deck.loopOut === null) return;
    deck.loopActive = !deck.loopActive;
    if (deck.playing) {
      // Restart source with updated loop state
      const wasPos = _position(deck);
      pause(deckId);
      deck.pauseOffset = deck.loopActive ? deck.loopIn : wasPos;
      play(deckId);
    }
    BVDJ_UI.updateLoopDisplay(deckId, deck.loopIn, deck.loopOut, deck.loopActive);
  }

  function setQuickLoop(deckId, bars) {
    const deck = decks[deckId];
    if (!deck.bpm) return;
    const beatsPerBar = 4;
    const beatDuration = 60 / (deck.bpm * deck.pitch);
    const loopLen = beatsPerBar * bars * beatDuration;
    deck.loopIn = _position(deck);
    deck.loopOut = deck.loopIn + loopLen;
    deck.loopActive = true;
    if (deck.playing) {
      const pos = deck.loopIn;
      pause(deckId);
      deck.pauseOffset = pos;
      play(deckId);
    }
    BVDJ_UI.updateLoopDisplay(deckId, deck.loopIn, deck.loopOut, deck.loopActive);
  }

  function _applyLoop(deck) {
    if (!deck.source) return;
    deck.source.loop = deck.loopActive;
    if (deck.loopActive) {
      deck.source.loopStart = deck.loopIn;
      deck.source.loopEnd = deck.loopOut;
    }
  }

  /* ── pitch / sync ────────────────────────────────────────── */
  function setPitch(deckId, ratio) {
    const deck = decks[deckId];
    deck.pitch = Math.max(0.5, Math.min(2.0, ratio));
    if (deck.source) deck.source.playbackRate.value = deck.pitch;
    const effBpm = deck.bpmManual || deck.bpm;
    BVDJ_UI.setBpm(deckId, (effBpm * deck.pitch).toFixed(1));
  }

  function nudge(deckId, direction) {
    // Temporary 4% bend
    const deck = decks[deckId];
    const targetRate = deck.pitch * (direction > 0 ? 1.04 : 0.96);
    if (deck.source) deck.source.playbackRate.value = targetRate;
    setTimeout(function () {
      if (deck.source) deck.source.playbackRate.value = deck.pitch;
    }, 200);
  }

  function sync(deckId) {
    const thisDeck = decks[deckId];
    const otherId = deckId === 'A' ? 'B' : 'A';
    const otherDeck = decks[otherId];
    const masterBpm = (otherDeck.bpmManual || otherDeck.bpm) * otherDeck.pitch;
    const myBpm = thisDeck.bpmManual || thisDeck.bpm;
    if (!masterBpm || !myBpm) return;
    const ratio = masterBpm / myBpm;
    setPitch(deckId, ratio);
    BVDJ_UI.setBpm(deckId, masterBpm.toFixed(1));
  }

  /* ── EQ ──────────────────────────────────────────────────── */
  function setEQ(deckId, band, val) {
    // val: -12 to +12 dB
    const deck = decks[deckId];
    const node = { low: deck.eqLow, mid: deck.eqMid, high: deck.eqHigh }[band];
    if (node && !deck.killState[band]) node.gain.value = val;
  }

  function killEQ(deckId, band) {
    const deck = decks[deckId];
    deck.killState[band] = !deck.killState[band];
    const node = { low: deck.eqLow, mid: deck.eqMid, high: deck.eqHigh }[band];
    if (node) node.gain.value = deck.killState[band] ? -24 : 0;
    BVDJ_UI.setKillState(deckId, band, deck.killState[band]);
  }

  /* ── FX ──────────────────────────────────────────────────── */
  function setReverb(deckId, wet) {
    const deck = decks[deckId];
    deck.reverbAmount = wet;
    deck.reverbWet.gain.value = wet;
    deck.reverbDry.gain.value = 1 - wet * 0.7;
  }

  function setDelay(deckId, wet) {
    const deck = decks[deckId];
    deck.delayAmount = wet;
    deck.delayWet.gain.value = wet;
    deck.delayDry.gain.value = 1 - wet * 0.7;
  }

  function setDelayTime(deckId, seconds) {
    decks[deckId].delayNode.delayTime.value = seconds;
  }

  function setFilter(deckId, freq, type) {
    const deck = decks[deckId];
    deck.filterFreq = freq;
    deck.filterNode.type = type || 'allpass';
    deck.filterNode.frequency.value = freq;
    deck.filterNode.Q.value = freq < 500 || freq > 8000 ? 4 : 1;
  }

  function setGain(deckId, val) {
    decks[deckId].gainNode.gain.value = Math.max(0, Math.min(2, val));
  }

  /* ── crossfader ──────────────────────────────────────────── */
  function _setCrossfader(pos) {
    xfaderPos = Math.max(0, Math.min(1, pos));
    // Equal-power (cosine law)
    const angA = xfaderPos * Math.PI / 2;
    const angB = (1 - xfaderPos) * Math.PI / 2;
    decks.A.xfaderGain.gain.value = Math.cos(angA);
    decks.B.xfaderGain.gain.value = Math.cos(angB);
    BVDJ_UI.setCrossfaderPos(xfaderPos);
  }

  /* ── recording ───────────────────────────────────────────── */
  function startRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    recChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(recorderDest.stream, { mimeType });
    mediaRecorder.ondataavailable = function (e) {
      if (e.data.size > 0) recChunks.push(e.data);
    };
    mediaRecorder.onstop = _saveRecording;
    mediaRecorder.start(1000);
    BVDJ_UI.setRecordState(true);
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    mediaRecorder.stop();
    BVDJ_UI.setRecordState(false);
  }

  function _saveRecording() {
    const blob = new Blob(recChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = 'BeatVision-Mix-' + ts + '.webm';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ── MIDI ────────────────────────────────────────────────── */
  const MIDI_MAP = {
    // CC: [channel, cc] → action
    '0,7':  function (v) { setGain('A', v / 127 * 1.5); },
    '1,7':  function (v) { setGain('B', v / 127 * 1.5); },
    '0,8':  function (v) { _setCrossfader(v / 127); },
    '0,16': function (v) { setEQ('A', 'low',  (v / 64 - 1) * 12); },
    '0,17': function (v) { setEQ('A', 'mid',  (v / 64 - 1) * 12); },
    '0,18': function (v) { setEQ('A', 'high', (v / 64 - 1) * 12); },
    '1,16': function (v) { setEQ('B', 'low',  (v / 64 - 1) * 12); },
    '1,17': function (v) { setEQ('B', 'mid',  (v / 64 - 1) * 12); },
    '1,18': function (v) { setEQ('B', 'high', (v / 64 - 1) * 12); },
    '0,19': function (v) { setReverb('A', v / 127); },
    '1,19': function (v) { setReverb('B', v / 127); },
    '0,20': function (v) { setDelay('A', v / 127); },
    '1,20': function (v) { setDelay('B', v / 127); },
    '0,21': function (v) { setPitch('A', 0.75 + (v / 127) * 0.5); },
    '1,21': function (v) { setPitch('B', 0.75 + (v / 127) * 0.5); },
  };

  const MIDI_NOTE_MAP = {
    // Note on: [channel, note] → action (val=velocity)
    '0,36': function () { togglePlay('A'); },
    '0,37': function () { cue('A'); },
    '0,38': function () { sync('A'); },
    '0,39': function () { jumpCue('A', 0); },
    '0,40': function () { jumpCue('A', 1); },
    '0,41': function () { jumpCue('A', 2); },
    '0,42': function () { jumpCue('A', 3); },
    '0,43': function () { nudge('A', 1); },
    '0,44': function () { nudge('A', -1); },
    '1,36': function () { togglePlay('B'); },
    '1,37': function () { cue('B'); },
    '1,38': function () { sync('B'); },
    '1,39': function () { jumpCue('B', 0); },
    '1,40': function () { jumpCue('B', 1); },
    '1,41': function () { jumpCue('B', 2); },
    '1,42': function () { jumpCue('B', 3); },
    '1,43': function () { nudge('B', 1); },
    '1,44': function () { nudge('B', -1); },
  };

  function _initMidi() {
    if (!navigator.requestMIDIAccess) {
      BVDJ_UI.setMidiStatus('Not supported');
      return;
    }
    navigator.requestMIDIAccess().then(function (access) {
      midiAccess = access;
      const inputs = Array.from(access.inputs.values());
      if (inputs.length === 0) {
        BVDJ_UI.setMidiStatus('No device');
      } else {
        BVDJ_UI.setMidiStatus(inputs[0].name);
        inputs.forEach(function (input) {
          input.onmidimessage = _handleMidi;
        });
      }
      access.onstatechange = function () {
        const ins = Array.from(midiAccess.inputs.values());
        BVDJ_UI.setMidiStatus(ins.length ? ins[0].name : 'No device');
        ins.forEach(function (input) { input.onmidimessage = _handleMidi; });
      };
    }).catch(function () {
      BVDJ_UI.setMidiStatus('Denied');
    });
  }

  function _handleMidi(event) {
    const [status, data1, data2] = event.data;
    const type = status & 0xf0;
    const channel = status & 0x0f;
    if (type === 0xb0) {
      // CC
      const key = channel + ',' + data1;
      if (MIDI_MAP[key]) MIDI_MAP[key](data2);
    } else if (type === 0x90 && data2 > 0) {
      // Note on
      const key = channel + ',' + data1;
      if (MIDI_NOTE_MAP[key]) MIDI_NOTE_MAP[key](data2);
    }
  }

  /* ── tick (50ms) ─────────────────────────────────────────── */
  function _startTick() {
    setInterval(function () {
      ['A', 'B'].forEach(function (id) {
        const deck = decks[id];
        if (!deck) return;
        const pos = _position(deck);
        BVDJ_UI.setPosition(id, pos);

        // Per-deck VU
        const data = new Uint8Array(deck.analyser.frequencyBinCount);
        deck.analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs((data[i] - 128) / 128);
          if (v > peak) peak = v;
        }
        deck.vu = peak;
        BVDJ_UI.setVU(id, peak);

        // Waveform playhead
        if (deck.waveformData) {
          BVDJ_UI.setPlayhead(id, deck.duration > 0 ? pos / deck.duration : 0);
        }
      });
    }, 50);
  }

  /* ── public API ─────────────────────────────────────────── */
  return {
    init,
    loadTrack,
    play, pause, togglePlay, cue, seek,
    setCue, jumpCue, clearCue,
    setLoopIn, setLoopOut, toggleLoop, setQuickLoop,
    setPitch, nudge, sync,
    setEQ, killEQ,
    setReverb, setDelay, setDelayTime, setFilter, setGain,
    setCrossfader: _setCrossfader,
    startRecording, stopRecording,
    get xfaderPos() { return xfaderPos; },
    get decks() { return decks; },
    get ctx() { return ctx; },
  };
})();


/* ============================================================
   BeatVision DJ UI  —  BVDJ_UI
   All DOM updates & canvas drawing for the DJ tab
   ============================================================ */

window.BVDJ_UI = (function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }
  function fmt(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ── track info ──────────────────────────────────────────── */
  function setTrackName(id, name) {
    const el2 = el('dj-track-' + id);
    if (el2) el2.textContent = name || 'No track loaded';
  }

  function setDuration(id, dur) {
    const el2 = el('dj-dur-' + id);
    if (el2) el2.textContent = fmt(dur);
  }

  function setPosition(id, pos) {
    const el2 = el('dj-pos-' + id);
    if (el2) el2.textContent = fmt(pos);
  }

  function setBpm(id, bpm) {
    const el2 = el('dj-bpm-' + id);
    if (el2) el2.textContent = bpm || '--';
  }

  /* ── play state ──────────────────────────────────────────── */
  function setPlayState(id, playing) {
    const btn = el('dj-play-' + id);
    if (btn) {
      btn.textContent = playing ? '⏸' : '▶';
      btn.classList.toggle('active', playing);
    }
  }

  /* ── VU meter ────────────────────────────────────────────── */
  function setVU(id, val) {
    const bar = el('dj-vu-' + id);
    if (!bar) return;
    const pct = Math.min(100, val * 150);
    bar.style.width = pct + '%';
    bar.style.background = pct > 90 ? '#f55' : pct > 70 ? '#fa0' : '#0f8';
  }

  /* ── crossfader ──────────────────────────────────────────── */
  function setCrossfaderPos(pos) {
    const input = el('dj-xfader');
    if (input) input.value = pos * 200;
  }

  /* ── hot cues ────────────────────────────────────────────── */
  function setCueButton(id, slot, pos) {
    const btn = el('dj-cue-' + id + '-' + slot);
    if (!btn) return;
    if (pos !== null) {
      btn.classList.add('set');
      btn.title = fmt(pos);
    } else {
      btn.classList.remove('set');
      btn.title = '';
    }
  }

  function clearCues(id) {
    for (let i = 0; i < 4; i++) setCueButton(id, i, null);
  }

  /* ── loops ───────────────────────────────────────────────── */
  function updateLoopDisplay(id, loopIn, loopOut, active) {
    const el2 = el('dj-loop-' + id);
    if (!el2) return;
    if (loopIn !== null && loopOut !== null) {
      const len = loopOut - loopIn;
      el2.textContent = (active ? '🔁 ' : '○ ') + fmt(loopIn) + ' – ' + fmt(loopOut) +
                        ' (' + len.toFixed(2) + 's)';
      el2.classList.toggle('active', active);
    } else {
      el2.textContent = '–';
      el2.classList.remove('active');
    }
  }

  /* ── EQ kills ────────────────────────────────────────────── */
  function setKillState(id, band, killed) {
    const btn = el('dj-kill-' + id + '-' + band);
    if (btn) btn.classList.toggle('killed', killed);
  }

  /* ── record ──────────────────────────────────────────────── */
  function setRecordState(recording) {
    const btn = el('dj-rec-btn');
    if (btn) {
      btn.textContent = recording ? '⏹ Stop Rec' : '⏺ Record Mix';
      btn.classList.toggle('recording', recording);
    }
  }

  /* ── MIDI status ─────────────────────────────────────────── */
  function setMidiStatus(text) {
    const el2 = el('dj-midi-status');
    if (el2) el2.textContent = 'MIDI: ' + text;
  }

  /* ── waveform overview canvas ─────────────────────────────── */
  function drawWaveformOverview(id, data) {
    const canvas = el('dj-wave-' + id);
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // Waveform bars
    const barW = W / data.length;
    const max = Math.max(...data, 0.001);
    for (let i = 0; i < data.length; i++) {
      const norm = data[i] / max;
      const barH = norm * H * 0.9;
      const x = i * barW;
      // Color by energy: low=blue, mid=purple, high=magenta
      const r = Math.floor(80 + norm * 175);
      const g = Math.floor(20 + norm * 60);
      const b = Math.floor(200 - norm * 80);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(x, (H - barH) / 2, Math.max(1, barW - 0.5), barH);
    }

    // Store canvas ref for playhead
    canvas._djData = data;
  }

  /* ── waveform playhead ───────────────────────────────────── */
  function setPlayhead(id, frac) {
    const canvas = el('dj-wave-' + id);
    if (!canvas || !canvas._djData) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Redraw waveform (fast: canvas is 400x60, manageable)
    drawWaveformOverview(id, canvas._djData);

    // Playhead line
    const x = frac * W;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  /* ── public ──────────────────────────────────────────────── */
  return {
    setTrackName, setDuration, setPosition, setBpm,
    setPlayState, setVU,
    setCrossfaderPos,
    setCueButton, clearCues,
    updateLoopDisplay,
    setKillState,
    setRecordState,
    setMidiStatus,
    drawWaveformOverview,
    setPlayhead,
  };
})();
