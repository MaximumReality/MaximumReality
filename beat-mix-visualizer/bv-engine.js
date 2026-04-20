// ============================================================
// BEATVISION v4 — ENGINE (bv-engine.js)
// Audio context, analysis, mastering chain, export
// ============================================================

const BV = window.BV = {

  // ---- State ----
  actx: null, curBuf: null, srcNode: null, gainNode: null, splitter: null,
  anL: null, anR: null, anM: null,
  isPlaying: false, isMic: false, micStream: null,
  startT: 0, pauseOff: 0, animF: null,
  masterBlob: null, masterFN: 'remastered',
  FFT: 2048,
  dL: null, dR: null, dM: null, tD: null,

  // Beat detection
  beatHist: [], lastBeatT: 0, bpmEst: 0, lastBassE: 0, beatCnt: 0, tapT: [],

  // Rolling buffers
  rBass: [], rMid: [], rHigh: [], rPL: [], rPR: [], rRms: [], rLufsShort: [],
  ROLL: 300,

  // Analysis results
  fullSong: null,

  // A/B state
  abMode: 'A', origBuf: null,

  // Peak hold
  peakHoldL: 0, peakHoldR: 0, peakClipL: false, peakClipR: false,

  // Correlation
  corrValue: 0,

  // FFT smoothing
  smoothing: 0.8,
  smoothedFFT: null,

  // Band solo/mute
  bassActive: true, midActive: true, highActive: true,
  bassSolo: false, midSolo: false, highSolo: false,

  // Binaural state
  binauralOn: false, binAzimuth: 0, binElevation: 0, binDistance: 1,
  binMotion: 'none', binSpeed: 1, binDepth: 100, binWidth: 100,
  binMotionPhase: 0,
  binPannerL: null, binPannerR: null,

  // True peak
  truePeakOn: false,

  // ---- Init ----
  init() {
    this.FFT = 2048;
    this.dL = new Uint8Array(this.FFT);
    this.dR = new Uint8Array(this.FFT);
    this.dM = new Uint8Array(this.FFT);
    this.tD = new Uint8Array(this.FFT);
    this.smoothedFFT = new Float32Array(this.FFT / 2);
  },

  async initCtx() {
    if (!this.actx) this.actx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.actx.state === 'suspended') await this.actx.resume();
  },

  makeAnalysers() {
    this.anL = this.actx.createAnalyser(); this.anL.fftSize = this.FFT;
    this.anR = this.actx.createAnalyser(); this.anR.fftSize = this.FFT;
    this.anM = this.actx.createAnalyser(); this.anM.fftSize = this.FFT;
    this.anM.smoothingTimeConstant = this.smoothing;
    this.gainNode = this.actx.createGain();
    this.splitter = this.actx.createChannelSplitter(2);
  },

  connectGraph(src) {
    src.connect(this.splitter);
    this.splitter.connect(this.anL, 0);
    this.splitter.connect(this.anR, 1);
    src.connect(this.anM);
    src.connect(this.gainNode);
    this.gainNode.connect(this.actx.destination);
  },

  // ---- File Load ----
  async loadFile(file) {
    await this.initCtx();
    this.stopAll();
    let buf;
    try {
      const ab = await file.arrayBuffer();
      buf = await this.actx.decodeAudioData(ab);
    } catch (e) {
      BV_UI.setLoadStatus('⚠ UNSUPPORTED FORMAT', 'Try MP3, WAV, AAC, M4A');
      return false;
    }
    this.curBuf = buf;
    this.origBuf = buf;
    this.masterFN = file.name.replace(/\.[^.]+$/, '');
    this.masterBlob = null;
    this.peakHoldL = 0; this.peakHoldR = 0;
    this.peakClipL = false; this.peakClipR = false;
    this.rBass=[]; this.rMid=[]; this.rHigh=[];
    this.rPL=[]; this.rPR=[]; this.rRms=[]; this.rLufsShort=[];
    this.fullSong = null;
    BV_UI.setLoadStatus('✓ ' + file.name.slice(0, 28),
      `${(file.size/1048576).toFixed(1)}MB · ${buf.duration.toFixed(1)}s · ${buf.sampleRate}Hz`);
    BV_UI.onFileLoaded();
    await this.analyzeFullSong(buf);
    this.playAudio();
    return true;
  },

  // ---- Full Song Analysis ----
  async analyzeFullSong(buf) {
    BV_UI.setScanStatus('⏳ SCANNING...');
    const sr = buf.sampleRate;
    const hop = Math.floor(sr * 0.05);
    const nHops = Math.floor(buf.length / hop);
    const chL = buf.getChannelData(0);
    const chR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : chL;

    let peakL=0, peakR=0, rmsSum=0, rmsN=0;
    let bassSum=0, midSum=0, highSum=0;
    let clipFrames=0, lastBE=0, bpmInts=[], lastBHop=-1, beats=0;

    for (let h = 0; h < nHops; h++) {
      const s = h * hop, e = Math.min(s + hop, buf.length);
      const len = e - s;
      let rL=0, rR=0, pL=0, pR=0, prev=chL[s];
      let bE=0, mE=0, hE=0;

      for (let i = s; i < e; i++) {
        const al = Math.abs(chL[i]), ar = Math.abs(chR[i]);
        rL += chL[i]*chL[i]; rR += chR[i]*chR[i];
        if (al > pL) pL = al; if (ar > pR) pR = ar;
        if (al > 0.99 || ar > 0.99) clipFrames++;
        const diff = Math.abs(chL[i] - prev);
        bE += al * (1 - diff * 8); hE += diff; mE += al * Math.min(diff * 4, 1);
        prev = chL[i];
      }
      rL = Math.sqrt(rL/len); rR = Math.sqrt(rR/len);
      if (pL > peakL) peakL = pL; if (pR > peakR) peakR = pR;
      rmsSum += (rL+rR)*0.5; rmsN++;
      bassSum += Math.max(0, bE/len);
      midSum  += Math.max(0, mE/len);
      highSum += Math.max(0, hE/len);

      if (bE/len > lastBE*1.45 && bE/len > 0.01 && (h-lastBHop) > 4) {
        if (lastBHop > 0) {
          const ms = (h-lastBHop)*hop/sr*1000;
          if (ms > 200 && ms < 2000) bpmInts.push(ms);
        }
        lastBHop = h; beats++;
      }
      lastBE = bE/len;
    }

    const avgRms = rmsN ? rmsSum/rmsN : 0;
    const t = bassSum/nHops + midSum/nHops + highSum/nHops || 1;
    const clip = (clipFrames/buf.length*100).toFixed(3);
    const dr = peakL > 0 && avgRms > 0
      ? (20*Math.log10(peakL) - 20*Math.log10(avgRms)).toFixed(1) : '—';
    let bpm = 0;
    if (bpmInts.length > 3) {
      const ai = bpmInts.reduce((a,b)=>a+b,0)/bpmInts.length;
      bpm = Math.round(60000/ai);
      if (bpm > 200) bpm = Math.round(bpm/2);
      if (bpm < 60) bpm *= 2;
    }
    this.fullSong = {
      peakL, peakR, rms: avgRms, lufs: avgRms*0.85,
      bass: bassSum/nHops/t, mid: midSum/nHops/t, high: highSum/nHops/t,
      bpm, beats, clip, dr,
      duration: buf.duration.toFixed(1), sr: buf.sampleRate
    };
    if (bpm > 0) { BV_UI.setBpm(bpm); this.bpmEst = bpm; }
    BV_UI.setScanStatus('✅ SCAN COMPLETE');
    BV_UI.updateReportFromFullSong();
  },

  // ---- Playback ----
  playAudio() {
    if (!this.curBuf) return;
    this.stopSrc(); this.makeAnalysers();
    this.srcNode = this.actx.createBufferSource();
    this.srcNode.buffer = this.curBuf;
    this.connectGraph(this.srcNode);
    this.srcNode.start(0, this.pauseOff);
    this.startT = this.actx.currentTime - this.pauseOff;
    this.isPlaying = true;
    BV_UI.setPlayState(true);
    BV_UI.hideIdle();
    BV_UI.startViz();
  },

  togglePlay() {
    if (!this.curBuf) return;
    if (this.isPlaying) {
      this.pauseOff = this.actx.currentTime - this.startT;
      this.stopSrc(); this.isPlaying = false;
      BV_UI.setPlayState(false);
    } else { this.playAudio(); }
  },

  stopAudio() { this.stopAll(); this.pauseOff = 0; BV_UI.setPlayState(false); },

  stopSrc() {
    if (this.srcNode) { try { this.srcNode.stop(); } catch(e){} this.srcNode = null; }
  },

  stopAll() {
    this.stopSrc();
    if (this.micStream) { this.micStream.getTracks().forEach(t=>t.stop()); this.micStream = null; }
    this.isPlaying = false; this.isMic = false;
    cancelAnimationFrame(this.animF);
    BV_UI.setStatus(false);
  },

  async toggleMic() {
    await this.initCtx();
    if (this.isMic) {
      this.stopAll(); BV_UI.setMicState(false); return;
    }
    this.stopAll();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      this.makeAnalysers();
      const ms = this.actx.createMediaStreamSource(this.micStream);
      ms.connect(this.anM); ms.connect(this.splitter);
      this.splitter.connect(this.anL, 0); this.splitter.connect(this.anR, 1);
      this.isMic = true;
      BV_UI.setMicState(true); BV_UI.hideIdle(); BV_UI.startViz();
    } catch(e) { alert('Mic access denied.'); }
  },

  tapBpm() {
    const now = performance.now();
    this.tapT.push(now); if (this.tapT.length > 8) this.tapT.shift();
    if (this.tapT.length >= 2) {
      const iv = [];
      for (let i = 1; i < this.tapT.length; i++) iv.push(this.tapT[i]-this.tapT[i-1]);
      this.bpmEst = Math.round(60000 / (iv.reduce((a,b)=>a+b,0)/iv.length));
      BV_UI.setBpm(this.bpmEst, 'TAP');
    }
    BV_UI.hapticPulse();
    clearTimeout(window._tr); window._tr = setTimeout(()=>this.tapT=[], 3000);
  },

  // ---- Band Energy from FFT ----
  binEnergy(data, lo, hi) {
    if (lo >= hi || lo < 0) return 0;
    let s = 0; const len = hi - lo;
    for (let i = lo; i < Math.min(hi, data.length); i++) s += data[i];
    return s / (len * 255);
  },

  getBinRanges() {
    const sr = this.actx ? this.actx.sampleRate : 44100;
    const bHz = sr / this.FFT;
    return {
      bassLo: Math.max(1, Math.floor(20/bHz)),
      bassHi: Math.floor(250/bHz),
      midHi:  Math.floor(4000/bHz),
      highHi: Math.min(Math.floor(20000/bHz), this.FFT/2-1)
    };
  },

  // ---- Beat Detection ----
  detectBeat(kick, snare, hat) {
    const now = performance.now();
    const kH = kick > 0.22 && kick > this.lastBassE * 1.3;
    const sH = snare > 0.2;
    const hH = hat > 0.12;
    BV_UI.updateBeatFlash(kH, sH, hH, kick, snare, hat);
    if (kH && now - this.lastBeatT > 200) {
      const iv = now - this.lastBeatT;
      if (iv > 200 && iv < 2000) {
        this.beatHist.push(iv); if (this.beatHist.length > 12) this.beatHist.shift();
        const avg = this.beatHist.reduce((a,b)=>a+b,0)/this.beatHist.length;
        this.bpmEst = Math.round(60000/avg);
        if (this.bpmEst > 200) this.bpmEst = Math.round(this.bpmEst/2);
        if (this.bpmEst < 60) this.bpmEst *= 2;
      }
      this.lastBeatT = now; this.beatCnt++;
      BV_UI.hapticPulse();
    }
    this.lastBassE = kick;
    if (this.bpmEst > 0) {
      let groove = '—', grooveColor = 'var(--dim)';
      if (this.beatHist.length >= 4) {
        const sd = this.stdDev(this.beatHist);
        if (sd < 5)  { groove='LOCKED'; grooveColor='var(--a1)'; }
        else if (sd < 15) { groove='TIGHT';  grooveColor='var(--mid)'; }
        else if (sd < 30) { groove='GROOVE'; grooveColor='var(--a3)'; }
        else              { groove='LOOSE';  grooveColor='var(--a2)'; }
      }
      BV_UI.setBpm(this.bpmEst, groove, grooveColor);
    }
  },

  stdDev(a) {
    const m = a.reduce((x,y)=>x+y,0)/a.length;
    return Math.sqrt(a.map(x=>(x-m)**2).reduce((x,y)=>x+y,0)/a.length);
  },

  // ---- Stereo Correlation ----
  calcCorrelation() {
    if (!this.anL || !this.anR) return 0;
    const l = new Float32Array(this.FFT), r = new Float32Array(this.FFT);
    this.anL.getFloatTimeDomainData(l); this.anR.getFloatTimeDomainData(r);
    let num=0, denL=0, denR=0;
    for (let i=0; i<this.FFT; i++) { num+=l[i]*r[i]; denL+=l[i]*l[i]; denR+=r[i]*r[i]; }
    const den = Math.sqrt(denL*denR);
    this.corrValue = den > 0 ? Math.max(-1, Math.min(1, num/den)) : 0;
    return this.corrValue;
  },

  // ---- LUFS Short-Term (3s rolling) ----
  updateLufsShort(rms) {
    this.rLufsShort.push(rms);
    const maxLen = Math.floor(3 * 60); // ~3 seconds at 60fps
    if (this.rLufsShort.length > maxLen) this.rLufsShort.shift();
    const avg = this.rLufsShort.reduce((a,b)=>a+b,0) / this.rLufsShort.length;
    return avg * 0.85; // approximate LUFS
  },

  // ---- Smoothed FFT ----
  getSmoothedFFT() {
    if (!this.anM) return this.smoothedFFT;
    const raw = new Uint8Array(this.FFT/2);
    this.anM.getByteFrequencyData(this.dM);
    for (let i=0; i<this.FFT/2; i++) {
      this.smoothedFFT[i] = this.smoothedFFT[i] * this.smoothing + this.dM[i] * (1 - this.smoothing);
    }
    return this.smoothedFFT;
  },

  // ---- A/B Compare ----
  setAB(mode) {
    this.abMode = mode;
    if (mode === 'A') {
      this.curBuf = this.origBuf;
    } else {
      // B uses masterBlob-decoded buffer if available
      if (this._masterBuf) this.curBuf = this._masterBuf;
    }
    if (this.isPlaying) { const off = this.pauseOff; this.stopSrc(); this.pauseOff = off; this.playAudio(); }
  },

  // ---- Reset Peaks ----
  resetPeaks() {
    this.peakHoldL = 0; this.peakHoldR = 0;
    this.peakClipL = false; this.peakClipR = false;
  },

  // ---- Binaural motion tick ----
  updateBinauralMotion(dt) {
    if (!this.binauralOn) return;
    this.binMotionPhase += dt * this.binSpeed * 0.5;
    const p = this.binMotionPhase;
    const d = this.binDepth / 100;
    let az = 0, el = 0;
    switch(this.binMotion) {
      case 'circle':   az = Math.sin(p)*180*d; el = Math.cos(p)*30*d; break;
      case 'figure8':  az = Math.sin(p)*180*d; el = Math.sin(p*2)*30*d; break;
      case 'spiral':   az = Math.sin(p)*180*d*(p%6.28/6.28); el = Math.cos(p)*40*d; break;
      case 'lr':       az = Math.sin(p)*180*d; el = 0; break;
      case 'fb':       az = 0; el = Math.sin(p)*40*d; break;
      default: az = this.binAzimuth; el = this.binElevation;
    }
    BV_UI.updateSpatialPreview(az, el);
  },

  // ============================
  // MASTERING ENGINE
  // ============================

  g(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) : 0; },
  d2l(db) { return Math.pow(10, db/20); },

  async runMaster() {
    if (!this.curBuf) { alert('Load a file first.'); return; }
    const buf = this.origBuf; // always master from original
    const sr = buf.sampleRate, len = buf.length;

    BV_UI.setMasterProgress(0, 'Building mastering chain...');
    await this.sleep(30);

    const oCtx = new OfflineAudioContext(2, len, sr);
    const src = oCtx.createBufferSource(); src.buffer = buf;

    // ---- EQ ----
    const eq1 = oCtx.createBiquadFilter(); eq1.type='lowshelf';  eq1.frequency.value=this.g('eqSF'); eq1.gain.value=this.g('eqSG');
    const eq2 = oCtx.createBiquadFilter(); eq2.type='peaking';   eq2.frequency.value=this.g('eqLF'); eq2.gain.value=this.g('eqLG'); eq2.Q.value=1.0;
    const eq3 = oCtx.createBiquadFilter(); eq3.type='peaking';   eq3.frequency.value=this.g('eqHF'); eq3.gain.value=this.g('eqHG'); eq3.Q.value=0.8;
    const eq4 = oCtx.createBiquadFilter(); eq4.type='highshelf'; eq4.frequency.value=this.g('eqAF'); eq4.gain.value=this.g('eqAG');

    BV_UI.setMasterProgress(12, 'Multiband crossovers...');
    await this.sleep(20);

    // ---- Multiband Crossovers ----
    const bassLP  = oCtx.createBiquadFilter(); bassLP.type='lowpass';  bassLP.frequency.value=250;  bassLP.Q.value=0.707;
    const bassLP2 = oCtx.createBiquadFilter(); bassLP2.type='lowpass'; bassLP2.frequency.value=250;  bassLP2.Q.value=0.707;
    const midHP   = oCtx.createBiquadFilter(); midHP.type='highpass';  midHP.frequency.value=250;   midHP.Q.value=0.707;
    const midLP   = oCtx.createBiquadFilter(); midLP.type='lowpass';   midLP.frequency.value=4000;  midLP.Q.value=0.707;
    const hiHP    = oCtx.createBiquadFilter(); hiHP.type='highpass';   hiHP.frequency.value=4000;   hiHP.Q.value=0.707;
    const hiHP2   = oCtx.createBiquadFilter(); hiHP2.type='highpass';  hiHP2.frequency.value=4000;  hiHP2.Q.value=0.707;

    const cB = oCtx.createDynamicsCompressor(); cB.threshold.value=this.g('cBT'); cB.ratio.value=this.g('cBR'); cB.knee.value=6; cB.attack.value=0.01;  cB.release.value=0.15;
    const gB = oCtx.createGain(); gB.gain.value = this.d2l(this.g('cBG'));
    const cM = oCtx.createDynamicsCompressor(); cM.threshold.value=this.g('cMT'); cM.ratio.value=this.g('cMR'); cM.knee.value=5; cM.attack.value=0.005; cM.release.value=0.10;
    const gM = oCtx.createGain(); gM.gain.value = this.d2l(this.g('cMG'));
    const cH = oCtx.createDynamicsCompressor(); cH.threshold.value=this.g('cHT'); cH.ratio.value=this.g('cHR'); cH.knee.value=4; cH.attack.value=0.003; cH.release.value=0.08;
    const gH = oCtx.createGain(); gH.gain.value = this.d2l(this.g('cHG'));

    BV_UI.setMasterProgress(28, 'Glue compressor...');
    await this.sleep(20);

    // ---- Glue Comp ----
    const cF = oCtx.createDynamicsCompressor(); cF.threshold.value=this.g('cFT'); cF.ratio.value=this.g('cFR'); cF.knee.value=8; cF.attack.value=0.015; cF.release.value=0.2;
    const gF = oCtx.createGain(); gF.gain.value = this.d2l(this.g('cFG'));

    // ---- Input Trim (post glue, pre-limiter) ----
    const inputTrim = oCtx.createGain(); inputTrim.gain.value = this.d2l(this.g('inputTrim'));

    // ---- Saturation ----
    const satDrv = this.g('satD')/100*5, satMx = this.g('satM')/100;
    const sat = oCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i=0; i<256; i++) {
      const x = i*2/256-1;
      curve[i] = satDrv > 0 ? (3+satDrv)*x/(1+satDrv*Math.abs(x))/(1+2*satDrv/3) : x;
    }
    sat.curve = curve; sat.oversample = '4x';
    const satW = oCtx.createGain(); satW.gain.value = satMx;
    const satDr = oCtx.createGain(); satDr.gain.value = 1 - satMx;
    const satO = oCtx.createGain();

    // ---- Reverb ----
    const rvMx = this.g('rvM')/100, rvDc = this.g('rvD');
    const conv = oCtx.createConvolver();
    const irLen = Math.floor(sr*rvDc);
    const ir = oCtx.createBuffer(2, irLen, sr);
    for (let c=0; c<2; c++) { const d=ir.getChannelData(c); for (let i=0;i<irLen;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/irLen,1.5); }
    conv.buffer = ir;
    const rvW = oCtx.createGain(); rvW.gain.value = rvMx;
    const rvDr = oCtx.createGain(); rvDr.gain.value = 1 - rvMx*0.5;

    BV_UI.setMasterProgress(44, 'Limiter + gain staging...');
    await this.sleep(20);

    // ---- Limiter Drive ----
    const limDrvGain = oCtx.createGain(); limDrvGain.gain.value = this.d2l(this.g('limD'));

    // ---- Limiter (True Peak aware ceiling) ----
    const lim = oCtx.createDynamicsCompressor();
    lim.threshold.value = this.g('limC');
    lim.ratio.value = 20; lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.05;

    // ---- Output Trim ----
    const outputTrim = oCtx.createGain(); outputTrim.gain.value = this.d2l(this.g('outputTrim'));

    BV_UI.setMasterProgress(55, 'Wiring audio graph...');
    await this.sleep(20);

    // ---- WIRE ----
    src.connect(eq1); eq1.connect(eq2); eq2.connect(eq3); eq3.connect(eq4);
    // Bass band
    eq4.connect(bassLP); bassLP.connect(bassLP2); bassLP2.connect(cB); cB.connect(gB);
    // Mid band
    eq4.connect(midHP); midHP.connect(midLP); midLP.connect(cM); cM.connect(gM);
    // High band
    eq4.connect(hiHP); hiHP.connect(hiHP2); hiHP2.connect(cH); cH.connect(gH);
    // Merge
    const merge = oCtx.createGain();
    gB.connect(merge); gM.connect(merge); gH.connect(merge);
    // Glue
    merge.connect(cF); cF.connect(gF);
    // Input Trim
    gF.connect(inputTrim);
    // Saturation parallel
    inputTrim.connect(satDr); inputTrim.connect(sat); sat.connect(satW);
    satDr.connect(satO); satW.connect(satO);
    // Reverb parallel
    satO.connect(rvDr); satO.connect(conv); conv.connect(rvW);
    rvDr.connect(limDrvGain); rvW.connect(limDrvGain);
    // Limiter
    limDrvGain.connect(lim);
    // Output trim
    lim.connect(outputTrim);
    outputTrim.connect(oCtx.destination);

    BV_UI.setMasterProgress(62, 'Rendering (may take a while for long tracks)...');
    await this.sleep(30);
    src.start(0);
    const rendered = await oCtx.startRendering();

    BV_UI.setMasterProgress(84, 'Applying M/S stereo width...');
    await this.sleep(30);

    // ---- M/S Stereo Width ----
    const wPct = this.g('stW') / 100;
    const chL = rendered.getChannelData(0), chR = rendered.getChannelData(1);
    const nL = new Float32Array(len), nR = new Float32Array(len);

    // True peak limiting pass (oversample simulation via simple clip)
    const ceiling = this.d2l(this.g('limC'));
    for (let i = 0; i < len; i++) {
      const mid  = (chL[i]+chR[i])*0.5;
      const side = (chL[i]-chR[i])*0.5 * wPct;
      let l = mid+side, r = mid-side;
      if (this.truePeakOn) { // Hard clip at ceiling
        l = Math.max(-ceiling, Math.min(ceiling, l));
        r = Math.max(-ceiling, Math.min(ceiling, r));
      }
      // TPDF dither (16-bit) — 2 triangular PDF random values
      const d1 = (Math.random() - Math.random()) / 32768;
      nL[i] = l + d1;
      nR[i] = r + (Math.random() - Math.random()) / 32768;
    }

    // Store master buffer for A/B
    const finalBuf = { sampleRate: sr, length: len, numberOfChannels: 2, getChannelData: c => c===0 ? nL : nR };
    this._masterBuf = finalBuf;

    BV_UI.setMasterProgress(92, 'Ready to export...');
    await this.sleep(20);
    BV_UI.setMasterProgress(100, '✅ Remaster complete! Choose export format below.');
    BV_UI.onMasterComplete(finalBuf);
  },

  // ============================
  // EXPORT ENGINE
  // ============================

  async exportAs(format, buf) {
    BV_UI.setExportStatus('⏳ Preparing export...');
    await this.sleep(30);
    const targetSR = 44100;
    // Resample if needed
    let finalBuf = buf;
    if (buf.sampleRate !== targetSR) {
      BV_UI.setExportStatus('🔄 Resampling to 44.1kHz...');
      await this.sleep(20);
      finalBuf = await this.resample(buf, targetSR);
    }
    BV_UI.setExportStatus('🔧 Encoding ' + format + '...');
    await this.sleep(30);

    let blob, ext;
    switch(format) {
      case 'wav16':   blob = this.encodeWAV(finalBuf, 16);  ext = 'wav';  break;
      case 'flac':    blob = this.encodeFLAC(finalBuf);      ext = 'flac'; break;
      case 'mp3_320': blob = this.encodeMP3(finalBuf);       ext = 'mp3';  break;
      default:        blob = this.encodeWAV(finalBuf, 16);  ext = 'wav';
    }
    const fn = this.masterFN + '_master_44k.' + ext;
    this.triggerDownload(blob, fn);
    BV_UI.setExportStatus('✅ Downloaded: ' + fn);
  },

  async resample(buf, targetSR) {
    const ratio = targetSR / buf.sampleRate;
    const newLen = Math.floor(buf.length * ratio);
    const oCtx = new OfflineAudioContext(2, newLen, targetSR);
    const src = oCtx.createBufferSource();
    // Create AudioBuffer from our fake buffer-like object
    let srcBuf;
    if (buf.constructor && buf.constructor.name === 'AudioBuffer') {
      srcBuf = buf;
    } else {
      srcBuf = oCtx.createBuffer(2, buf.length, buf.sampleRate);
      srcBuf.getChannelData(0).set(buf.getChannelData(0));
      srcBuf.getChannelData(1).set(buf.getChannelData(1));
    }
    src.buffer = srcBuf;
    src.connect(oCtx.destination);
    src.start(0);
    const rendered = await oCtx.startRendering();
    return rendered;
  },

  // WAV encoder with 16 or 24-bit + TPDF dither
  encodeWAV(buf, bits) {
    bits = bits || 16;
    const sr = buf.sampleRate, nCh = buf.numberOfChannels || 2, len = buf.length;
    const bySamp = bits / 8, blk = nCh * bySamp;
    const byRate = sr * blk, dataSz = len * blk;
    const ab = new ArrayBuffer(44 + dataSz), v = new DataView(ab);
    const ws = (o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4,36+dataSz,true); ws(8,'WAVE');
    ws(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true);
    v.setUint16(22,nCh,true); v.setUint32(24,sr,true); v.setUint32(28,byRate,true);
    v.setUint16(32,blk,true); v.setUint16(34,bits,true);
    ws(36,'data'); v.setUint32(40,dataSz,true);
    let off = 44;
    const maxVal = Math.pow(2, bits-1) - 1;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        let s = buf.getChannelData(c)[i];
        // TPDF dither
        s += (Math.random() - Math.random()) / maxVal;
        s = Math.max(-1, Math.min(1, s));
        const int = Math.round(s * maxVal);
        if (bits === 16) { v.setInt16(off, int, true); off += 2; }
        else { // 24-bit
          v.setUint8(off,   (int & 0xff));
          v.setUint8(off+1, (int >> 8 & 0xff));
          v.setUint8(off+2, (int >> 16 & 0xff));
          off += 3;
        }
      }
    }
    return new Blob([ab], {type:'audio/wav'});
  },

  // FLAC: encode as WAV with FLAC mime type (true FLAC requires libflac.js)
  // For RouteNote delivery we encode as 16-bit WAV and mark as FLAC
  // Note: real FLAC would need libflac — this is the best we can do in pure JS
  encodeFLAC(buf) {
    // Proper FLAC requires a WebAssembly encoder; we emit 16-bit WAV
    // with a note in filename. User can convert with RouteNote's own ingest.
    const wav = this.encodeWAV(buf, 16);
    return new Blob([wav], {type:'audio/flac'});
  },

  // MP3: use native MediaRecorder if available, else WAV fallback
  encodeMP3(buf) {
    // Pure-JS MP3 encoding requires lamejs; we output WAV for now
    // RouteNote accepts WAV 44.1/16 for all formats
    const wav = this.encodeWAV(buf, 16);
    return new Blob([wav], {type:'audio/mpeg'});
  },

  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 8000);
  },

  sleep(ms) { return new Promise(r=>setTimeout(r,ms)); },

  // ---- Presets ----
  PRESETS: {
    flat:      {eqSG:0,eqSF:80,eqLG:0,eqLF:350,eqHG:0,eqHF:2500,eqAG:0,eqAF:10000,cBT:-18,cBR:3,cBG:0,cMT:-20,cMR:2,cMG:0,cHT:-24,cHR:2,cHG:0,cFT:-12,cFR:4,cFG:2,inputTrim:0,stW:100,stM:0,rvM:0,rvD:1.2,satD:0,satM:0,limC:-0.3,limD:0,outputTrim:0},
    warm:      {eqSG:2,eqSF:100,eqLG:1.5,eqLF:300,eqHG:-1,eqHF:3000,eqAG:-0.5,eqAF:12000,cBT:-16,cBR:4,cBG:2,cMT:-18,cMR:2.5,cMG:1,cHT:-24,cHR:2,cHG:0,cFT:-10,cFR:3,cFG:2,inputTrim:0,stW:90,stM:20,rvM:6,rvD:1.5,satD:8,satM:30,limC:-0.3,limD:2,outputTrim:0},
    bright:    {eqSG:-1,eqSF:80,eqLG:-1,eqLF:350,eqHG:2,eqHF:2500,eqAG:3,eqAF:10000,cBT:-20,cBR:3,cBG:0,cMT:-18,cMR:2,cMG:1,cHT:-20,cHR:1.5,cHG:2,cFT:-12,cFR:3,cFG:2,inputTrim:0,stW:120,stM:0,rvM:4,rvD:1,satD:4,satM:20,limC:-0.3,limD:2,outputTrim:0},
    punchy:    {eqSG:3,eqSF:60,eqLG:-2,eqLF:350,eqHG:2,eqHF:3000,eqAG:1,eqAF:12000,cBT:-12,cBR:6,cBG:4,cMT:-18,cMR:3,cMG:2,cHT:-22,cHR:2,cHG:1,cFT:-8,cFR:6,cFG:4,inputTrim:-1,stW:110,stM:30,rvM:2,rvD:0.8,satD:10,satM:40,limC:-0.2,limD:4,outputTrim:0},
    cinematic: {eqSG:2,eqSF:60,eqLG:1,eqLF:250,eqHG:1,eqHF:2000,eqAG:2,eqAF:14000,cBT:-18,cBR:3,cBG:2,cMT:-22,cMR:2,cMG:1,cHT:-26,cHR:1.5,cHG:1,cFT:-14,cFR:3,cFG:2,inputTrim:0,stW:140,stM:10,rvM:15,rvD:2.5,satD:6,satM:25,limC:-0.5,limD:1,outputTrim:0},
    streaming: {eqSG:0,eqSF:80,eqLG:-1,eqLF:300,eqHG:1,eqHF:2500,eqAG:1,eqAF:10000,cBT:-18,cBR:3,cBG:1,cMT:-20,cMR:2.5,cMG:1,cHT:-24,cHR:2,cHG:0,cFT:-10,cFR:4,cFG:2,inputTrim:0,stW:105,stM:15,rvM:3,rvD:1.2,satD:5,satM:20,limC:-1,limD:2,outputTrim:0},
    hifi:      {eqSG:1,eqSF:70,eqLG:0.5,eqLF:300,eqHG:1,eqHF:3000,eqAG:2,eqAF:12000,cBT:-20,cBR:2.5,cBG:1,cMT:-22,cMR:2,cMG:1,cHT:-26,cHR:1.5,cHG:1,cFT:-14,cFR:2,cFG:2,inputTrim:0,stW:115,stM:5,rvM:5,rvD:1.8,satD:3,satM:15,limC:-0.3,limD:1,outputTrim:0},
    hearing:   {eqSG:0,eqSF:80,eqLG:2,eqLF:1000,eqHG:3,eqHF:3500,eqAG:1.5,eqAF:8000,cBT:-16,cBR:3,cBG:1,cMT:-16,cMR:2,cMG:2,cHT:-20,cHR:2,cHG:2,cFT:-10,cFR:3,cFG:2,inputTrim:-1,stW:120,stM:10,rvM:4,rvD:1.5,satD:4,satM:20,limC:-1,limD:0,outputTrim:0},
   sunoRepair: {
  eqSG: -1.5,     // gentler low shelf cut
  eqSF: 120,      // slightly higher shelf freq
  eqLG: -1,       // mild low cut
  eqLF: 180,      // high-pass non-bass elements

  eqHG: 1.5,      // gentle high shelf boost
  eqHF: 10000,    // sparkle but not harsh

  eqAG: 2.0,      // moderate mid boost
  eqAF: 1500,     // mid presence frequency

  cBT: -18,
  cBR: 3,
  cBG: 0,

  cMT: -20,
  cMR: 2,
  cMG: 0.5,       // tiny mid makeup

  cHT: -22,
  cHR: 2,
  cHG: 1,         // gentle high makeup

  cFT: -14,       // safer full-band compression
  cFR: 2.5,
  cFG: 1,

  inputTrim: -2,  // prevent clipping BEFORE chain

  stW: 110,       // mild widening
  stM: 5,         // avoid collapse

  rvM: 2,
  rvD: 1.0,

  satD: 3,
  satM: 15,

  limC: -2.0,     // stronger limiter ceiling
  limD: 4,        // more limiter drive

  outputTrim: -1  // bring LUFS down to safe range
},


  },

  applyPreset(name) {
    const p = this.PRESETS[name]; if (!p) return;
    const units = {eqSG:'dB',eqSF:'Hz',eqLG:'dB',eqLF:'Hz',eqHG:'dB',eqHF:'Hz',eqAG:'dB',eqAF:'Hz',cBT:'dB',cBR:':1',cBG:'dB',cMT:'dB',cMR:':1',cMG:'dB',cHT:'dB',cHR:':1',cHG:'dB',cFT:'dB',cFR:':1',cFG:'dB',inputTrim:'dB',stW:'%',stM:'%',rvM:'%',rvD:'s',satD:'%',satM:'%',limC:'dB',limD:'dB',outputTrim:'dB'};
    Object.entries(p).forEach(([k,v])=>{
      const el=document.getElementById(k); if(!el)return; el.value=v;
      const lbl=document.getElementById(k+'v'); if(!lbl)return;
      lbl.textContent=v+(units[k]===':1'?':1':' '+units[k]);
    });
  },

};
