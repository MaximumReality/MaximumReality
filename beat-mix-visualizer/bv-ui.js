// ============================================================
// BEATVISION v4 — UI (bv-ui.js)
// Canvas rendering, DOM updates, meters, spatial preview
// ============================================================

const BV_UI = window.BV_UI = {

  spectImg: null,
  lastFrameTime: performance.now(),
  masterFinalBuf: null,

  // ---- Tab switching ----
  showTab(n) {
    const names = ['analyze','master','spatial','export','report'];
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active', names[i]===n));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
    const pane = document.getElementById('pane-'+n);
    if (pane) pane.classList.add('active');
  },

  // ---- Status helpers ----
  setStatus(on) {
    const d = document.getElementById('dot'), t = document.getElementById('stxt');
    if (d) d.className = 'dot'+(on?' on':'');
    if (t) t.textContent = on ? 'ACTIVE' : 'OFFLINE';
  },

  setLoadStatus(h2, p) {
    const lz = document.getElementById('loadZone');
    if (!lz) return;
    lz.querySelector('h2').textContent = h2;
    lz.querySelector('p').textContent = p;
  },

  setScanStatus(msg) {
    const el = document.getElementById('scanStatus');
    if (el) el.textContent = msg;
  },

  setPlayState(playing) {
    const btn = document.getElementById('playBtn');
    if (btn) btn.textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
  },

  setMicState(on) {
    const btn = document.getElementById('micBtn');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.textContent = on ? '🔴 STOP' : '🎙 MIC';
  },

  onFileLoaded() {
    ['playBtn','stopBtn','procBtn','exportBtn'].forEach(id=>{
      const el = document.getElementById(id); if(el) el.disabled = false;
    });
    const dlBtn = document.getElementById('dlArea');
    if (dlBtn) dlBtn.style.display = 'none';
    this.setStatus(true);
  },

  onMasterComplete(finalBuf) {
    this.masterFinalBuf = finalBuf;
    const dlArea = document.getElementById('dlArea');
    if (dlArea) dlArea.style.display = 'block';
    // Switch to export tab
    this.showTab('export');
  },

  setBpm(bpm, groove, color) {
    const n = document.getElementById('bpmN'); if(n) n.textContent = bpm;
    if (groove !== undefined) {
      const g = document.getElementById('gV');
      if (g) { g.textContent = groove; if(color) g.style.color = color; }
    }
  },

  hideIdle() {
    ['geoI','waveI','spectI'].forEach(id=>{
      const e = document.getElementById(id); if(e) e.style.display='none';
    });
  },

  hapticPulse() {
    const r = document.getElementById('hapRing');
    if (r) { r.classList.add('beat'); if(navigator.vibrate) navigator.vibrate(25); setTimeout(()=>r.classList.remove('beat'), 90); }
  },

  setMasterProgress(pct, msg) {
    const f = document.getElementById('progF'), m = document.getElementById('masterMsg');
    const p = document.getElementById('prog');
    if (p) p.classList.add('show');
    if (f) f.style.width = pct + '%';
    if (m) m.textContent = msg;
  },

  setExportStatus(msg) {
    const el = document.getElementById('exportStatus');
    if (el) el.textContent = msg;
  },

  updateBeatFlash(kH, sH, hH, kick, snare, hat) {
    const toggle = (id, on) => { const e=document.getElementById(id); if(e) e.classList.toggle('hit',on); };
    toggle('kZ', kH); toggle('sZ', sH); toggle('hZ', hH);
    const setText = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=(val*100).toFixed(0)+'%'; };
    setText('kP', kick); setText('sP', snare); setText('hP', hat);
  },

  // ---- Canvas setup ----
  setupC(id) {
    const c = document.getElementById(id);
    if (!c) return null;
    c.width = c.parentElement.clientWidth;
    return c;
  },

  // ---- Main Viz Loop ----
  startViz() {
    const gC = this.setupC('geoC'), gX = gC ? gC.getContext('2d') : null;
    const wC = this.setupC('waveC'), wX = wC ? wC.getContext('2d') : null;
    const sC = this.setupC('spectC'), sX = sC ? sC.getContext('2d') : null;
    const stC = document.getElementById('stereoC');
    if (stC) { stC.width = stC.parentElement.clientWidth; }
    const stX = stC ? stC.getContext('2d') : null;
    this.spectImg = null;
    let ph = 0;

    const loop = () => {
      BV.animF = requestAnimationFrame(loop);
      if (!BV.anM) return;

      const now = performance.now();
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;

      BV.anM.getByteFrequencyData(BV.dM);
      BV.anM.getByteTimeDomainData(BV.tD);
      if (BV.anL) BV.anL.getByteFrequencyData(BV.dL);
      if (BV.anR) BV.anR.getByteFrequencyData(BV.dR);

      ph += 0.02;
      const bins = BV.getBinRanges();

      // Apply solo/mute to data
      const bassData = this.applyBandMask(BV.dM, bins.bassLo, bins.bassHi, 'bass');
      const midData  = this.applyBandMask(BV.dM, bins.bassHi, bins.midHi,  'mid');
      const highData = this.applyBandMask(BV.dM, bins.midHi,  bins.highHi, 'high');

      const bE = BV.binEnergy(BV.dM, bins.bassLo, bins.bassHi);
      const mE = BV.binEnergy(BV.dM, bins.bassHi, bins.midHi);
      const hE = BV.binEnergy(BV.dM, bins.midHi,  bins.highHi);
      const kE = BV.binEnergy(BV.dM, Math.floor(60/(BV.actx.sampleRate/BV.FFT)), Math.floor(120/(BV.actx.sampleRate/BV.FFT)));
      const snE = BV.binEnergy(BV.dM, Math.floor(150/(BV.actx.sampleRate/BV.FFT)), Math.floor(500/(BV.actx.sampleRate/BV.FFT)));
      const htE = BV.binEnergy(BV.dM, bins.midHi, bins.highHi);
      const totE = BV.binEnergy(BV.dM, 0, bins.highHi);

      BV.detectBeat(kE, snE, htE);
      this.updateFreqBars(bE, mE, hE);
      this.updateMeters();
      this.updateLufsShortMeter();
      this.updateCorrelationMeter();
      BV.updateBinauralMotion(dt);

      if (gX && gC) this.drawGeo(gX, gC.width, gC.height, bE, mE, hE, totE, ph);
      if (wX && wC) this.drawWave(wX, wC.width, wC.height);
      if (sX && sC) this.drawSpect(sX, sC.width, sC.height);
      if (stX && stC) this.drawStereo(stX, stC.width, stC.height);
    };
    loop();
  },

  applyBandMask(data, lo, hi, band) {
    // For solo: if any band is soloed, only that band shows
    const anySolo = BV.bassSolo || BV.midSolo || BV.highSolo;
    const masked = new Uint8Array(data.length);
    let active = true;
    if (anySolo) {
      if (band === 'bass') active = BV.bassSolo;
      else if (band === 'mid') active = BV.midSolo;
      else active = BV.highSolo;
    } else {
      if (band === 'bass') active = BV.bassActive;
      else if (band === 'mid') active = BV.midActive;
      else active = BV.highActive;
    }
    if (active) {
      for (let i = lo; i < Math.min(hi, data.length); i++) masked[i] = data[i];
    }
    return masked;
  },

  updateFreqBars(b, m, h) {
    const bp = Math.min(b*250,100), mp = Math.min(m*150,100), hp = Math.min(h*300,100);
    const s = (id, v) => { const e=document.getElementById(id); if(e) e.style.height=v+'%'; };
    s('bBar', bp); s('mBar', mp); s('hBar', hp);
    const t = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    t('bDb', this.tDb(b)); t('mDb', this.tDb(m)); t('hDb', this.tDb(h));
  },

  tDb(v) { return v > 0 ? (20*Math.log10(v)).toFixed(1)+' dB' : '—'; },

  updateMeters() {
    const pkL = Math.max(...Array.from(BV.dL))/255;
    const pkR = Math.max(...Array.from(BV.dR))/255;
    const rms = Math.sqrt(Array.from(BV.tD).reduce((s,v)=>s+((v-128)/128)**2,0)/BV.tD.length);
    const lufs = rms * 0.85;

    // Peak hold
    if (pkL > BV.peakHoldL) BV.peakHoldL = pkL;
    if (pkR > BV.peakHoldR) BV.peakHoldR = pkR;
    if (pkL >= 0.99) BV.peakClipL = true;
    if (pkR >= 0.99) BV.peakClipR = true;

    this.setMeterBar('mPL','mPLv', pkL*100, pkL, BV.peakClipL);
    this.setMeterBar('mPR','mPRv', pkR*100, pkR, BV.peakClipR);
    this.setMeterBar('mRMS','mRMSv', rms*250, rms, false);
    this.setMeterBar('mLUFS','mLUFSv', lufs*300, lufs, false);

    // Master tab mirrors
    this.setMeterBar('mmPL','mmPLv', pkL*100, pkL, BV.peakClipL);
    this.setMeterBar('mmPR','mmPRv', pkR*100, pkR, BV.peakClipR);
    this.setMeterBar('mmRMS','mmRMSv', rms*250, rms, false);
    this.setMeterBar('mmLUFS','mmLUFSv', lufs*300, lufs, false);

    // Peak clip indicators
    const showClip = (id, clipped) => {
      const el = document.getElementById(id); if(!el) return;
      el.style.color = clipped ? '#ff4d6d' : 'var(--a1)';
    };
    showClip('mPLv', BV.peakClipL); showClip('mPRv', BV.peakClipR);

    // Rolling
    BV.rPL.push(pkL); BV.rPR.push(pkR); BV.rRms.push(rms);
    if (BV.rPL.length > BV.ROLL) { BV.rPL.shift(); BV.rPR.shift(); BV.rRms.shift(); }
  },

  setMeterBar(barId, valId, pct, val, clipped) {
    const b = document.getElementById(barId);
    const v = document.getElementById(valId);
    if (b) b.style.width = Math.min(pct, 100) + '%';
    if (v) {
      v.textContent = val > 0 ? (20*Math.log10(val)).toFixed(1)+' dB' : '—';
      v.className = v.className.replace(/\s*(clip|ok)/g,'') + (clipped || pct > 92 ? ' clip' : ' ok');
    }
  },

  updateLufsShortMeter() {
    const rms = BV.rRms.length ? BV.rRms[BV.rRms.length-1] : 0;
    const lufsShort = BV.updateLufsShort(rms);
    const el = document.getElementById('lufsShortVal');
    if (el) el.textContent = lufsShort > 0 ? (20*Math.log10(lufsShort)).toFixed(1)+' dB' : '—';
    const bar = document.getElementById('lufsShortBar');
    if (bar) bar.style.width = Math.min(lufsShort*300, 100)+'%';
  },

  updateCorrelationMeter() {
    const corr = BV.calcCorrelation();
    const el = document.getElementById('corrVal');
    if (el) { el.textContent = corr.toFixed(2); el.style.color = corr < 0 ? '#ff4d6d' : corr < 0.3 ? 'var(--a3)' : 'var(--a1)'; }
    const bar = document.getElementById('corrBar');
    if (bar) { bar.style.left = ((corr+1)/2*100)+'%'; }
    const msg = document.getElementById('corrMsg');
    if (msg) {
      if (corr < -0.2) msg.textContent = '⚠ PHASE CANCEL';
      else if (corr < 0.2) msg.textContent = 'WIDE STEREO';
      else if (corr > 0.9) msg.textContent = 'NEAR MONO';
      else msg.textContent = 'BALANCED';
    }
  },

  updateSpatialPreview(az, el_deg) {
    const canvas = document.getElementById('spatialPreview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2, r = Math.min(W,H)*0.4;
    ctx.fillStyle = '#080c14'; ctx.fillRect(0,0,W,H);
    // Draw circle
    ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.stroke();
    // Label
    ctx.fillStyle='#4a5568'; ctx.font='8px Share Tech Mono';
    ctx.fillText('FRONT',cx-14,cy-r-4); ctx.fillText('L',cx-r-10,cy+3); ctx.fillText('R',cx+r+4,cy+3);
    // Source position
    const radAz = (az * Math.PI / 180);
    const x = cx + Math.sin(radAz) * r * 0.85;
    const y = cy - Math.cos(radAz) * r * 0.85;
    ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2);
    ctx.fillStyle='var(--a1)'; ctx.shadowColor='var(--a1)'; ctx.shadowBlur=12; ctx.fill();
    ctx.shadowBlur=0;
    // Elevation indicator
    ctx.fillStyle='var(--a3)'; ctx.font='8px Share Tech Mono';
    ctx.fillText(`AZ:${Math.round(az)}° EL:${Math.round(el_deg)}°`,4,H-4);
  },

  updateReportFromFullSong() {
    // Auto-populate report when scan completes
    const status = document.getElementById('reportAutoStatus');
    if (status) status.textContent = 'Full song scan ready — press CAPTURE to generate report.';
  },

  // ---- Drawing ----
  drawGeo(ctx, W, H, bass, mid, high, tot, ph) {
    ctx.fillStyle = 'rgba(6,8,16,0.3)'; ctx.fillRect(0,0,W,H);
    const cx=W/2, cy=H/2, base=Math.min(W,H)*0.23;
    // Outer ring
    ctx.beginPath();
    for (let i=0; i<BV.dM.length/4; i++) {
      const a=(i/(BV.dM.length/4))*Math.PI*2-Math.PI/2;
      const r=(base*1.5+high*base*0.85)+(BV.dM[i*4]/255)*base*0.5;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.strokeStyle=`hsla(${160+high*60},100%,70%,${0.2+high*0.5})`; ctx.lineWidth=1+high*2; ctx.stroke();
    // Mid hexagon
    ctx.beginPath();
    for (let i=0;i<=6;i++) { const a=(i/6)*Math.PI*2+ph*0.5, w=1+Math.sin(ph*3+i)*mid*0.3, r=base*(0.72+mid*0.55)*w; ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); }
    ctx.closePath(); ctx.strokeStyle=`rgba(0,245,196,${0.3+mid*0.5})`; ctx.lineWidth=1+mid*3; ctx.stroke();
    // Bass core
    const bR=base*(0.22+bass*1.05), g=ctx.createRadialGradient(cx,cy,0,cx,cy,bR);
    g.addColorStop(0,`rgba(255,77,109,${bass*0.8})`); g.addColorStop(0.5,`rgba(255,107,53,${bass*0.35})`); g.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(cx,cy,bR,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    ctx.strokeStyle=`rgba(255,77,109,${0.45+bass*0.5})`; ctx.lineWidth=2+bass*4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,3+tot*7,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
  },

  drawWave(ctx, W, H) {
    ctx.fillStyle='#080c14'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#00f5c4'; ctx.lineWidth=1.5; ctx.beginPath();
    for (let i=0;i<BV.tD.length;i++) { const x=i/BV.tD.length*W, y=((BV.tD[i]-128)/128)*(H/2)+H/2; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
    ctx.stroke();
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
  },

  drawSpect(ctx, W, H) {
    if (!this.spectImg || this.spectImg.width !== W) this.spectImg = ctx.createImageData(W,H);
    const d = this.spectImg.data;
    for (let y=0;y<H;y++) for (let x=0;x<W-1;x++) { const i=(y*W+x)*4,j=i+4; d[i]=d[j];d[i+1]=d[j+1];d[i+2]=d[j+2];d[i+3]=d[j+3]; }
    // Use smoothed FFT
    const fftData = BV.getSmoothedFFT();
    for (let y=0;y<H;y++) {
      const fi=Math.floor((1-y/H)*fftData.length*0.5);
      const v = fftData[fi] / 255;
      const i=(y*W+W-1)*4;
      if(v<0.25){d[i]=0;d[i+1]=0;d[i+2]=Math.floor(v*4*200);d[i+3]=255;}
      else if(v<0.5){const t=(v-.25)*4;d[i]=0;d[i+1]=Math.floor(t*245);d[i+2]=Math.floor(200-t*80);d[i+3]=255;}
      else if(v<0.75){const t=(v-.5)*4;d[i]=Math.floor(t*255);d[i+1]=Math.floor(245-t*80);d[i+2]=0;d[i+3]=255;}
      else{const t=(v-.75)*4;d[i]=255;d[i+1]=Math.floor(165-t*165);d[i+2]=0;d[i+3]=255;}
    }
    ctx.putImageData(this.spectImg, 0, 0);
  },

  drawStereo(ctx, W, H) {
    ctx.fillStyle='#080c14'; ctx.fillRect(0,0,W,H);
    const cx=W/2, cy=H/2;
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=1;
    [[0,H,W,0],[0,0,W,H],[cx,0,cx,H],[0,cy,W,cy]].forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();});
    ctx.fillStyle='#4a5568'; ctx.font='8px Share Tech Mono';
    ctx.fillText('L',4,cy-2); ctx.fillText('R',W-13,cy-2); ctx.fillText('MID',cx-11,10);
    for (let i=0; i<Math.min(BV.dL.length,BV.dR.length,200); i+=6) {
      const l=(BV.dL[i]-128)/128, r=(BV.dR[i]-128)/128, m=(l+r)*.5, s=(l-r)*.5;
      ctx.beginPath(); ctx.arc(cx+s*cx*.8, cy-m*cy*.8, 2, 0, Math.PI*2);
      ctx.fillStyle=`hsla(${160+i/1.5},100%,65%,${Math.sqrt(l*l+r*r)*.7+.1})`; ctx.fill();
    }
  },

  // ---- Report generator ----
  captureReport() {
    const d = BV.fullSong;
    if (!d && !BV.anM) { document.getElementById('reportTxt').textContent='// Load a file first.'; this.showTab('report'); return; }
    const now = new Date().toLocaleTimeString();
    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    const fd = d || { peakL:avg(BV.rPL), peakR:avg(BV.rPR), rms:avg(BV.rRms), lufs:avg(BV.rRms)*0.85, bass:avg(BV.rBass), mid:avg(BV.rMid), high:avg(BV.rHigh), bpm:BV.bpmEst, beats:BV.beatCnt, clip:'—', dr:'—', duration:'—', sr:'—' };
    const src = d ? 'FULL SONG SCAN' : `${(BV.rBass.length/60).toFixed(0)}s ROLLING AVG`;
    const dB = v => v > 0 ? (20*Math.log10(v)).toFixed(2)+' dB' : '—';
    const pct = v => ((v||0)*100).toFixed(1)+'%';
    const diag=[];
    if(fd.peakL>0.99||fd.peakR>0.99) diag.push('🔴 CLIPPING — reduce gain before mastering.');
    else if(fd.peakL>0.95) diag.push('🟡 NEAR-CLIP — leave 0.5–1 dB headroom.');
    if(fd.dr!=='—'&&parseFloat(fd.dr)<6) diag.push('🔴 BRICK-WALLED — DR under 6 dB. Fatiguing.');
    if(fd.dr!=='—'&&parseFloat(fd.dr)>20) diag.push('ℹ WIDE DYNAMICS — consider gentle limiting for streaming.');
    if((fd.bass||0)>0.5) diag.push('🟡 BASS HEAVY — high-pass non-bass elements; check 150–300Hz mud.');
    if((fd.bass||0)<0.2) diag.push('ℹ THIN BASS — check sub/bass levels.');
    if((fd.mid||0)<0.25) diag.push('🟡 MID SCOOP — check 1–4kHz for presence.');
    if((fd.high||0)<0.15) diag.push('🟡 DULL HIGH END — try hi-shelf at 10–16kHz.');
    if((fd.high||0)>0.5) diag.push('🟡 HARSH HIGHS — may cause ear fatigue.');
    if(Math.abs((fd.peakL||0)-(fd.peakR||0))>0.05) diag.push('🟡 STEREO IMBALANCE — L/R peaks differ.');
    const corr = BV.corrValue;
    if(corr < -0.2) diag.push('🔴 PHASE CANCELLATION — correlation '+corr.toFixed(2)+'. Check mono compatibility.');
    const ln = fd.lufs>0 ? parseFloat((20*Math.log10(fd.lufs)).toFixed(2)) : null;
    if(ln!==null) {
      if(ln>-8) diag.push('🔴 TOO LOUD — streaming will attenuate.');
      else if(ln>-11) diag.push('🟡 SLIGHTLY HOT — may get turned down on streaming.');
      else if(ln<-18) diag.push('ℹ QUIET MIX — consider makeup gain for streaming.');
      else diag.push('✅ LOUDNESS OK — good streaming range (-14 to -16 LUFS).');
    }
    if(!diag.length) diag.push('✅ No major issues detected.');

    const report =
`╔══════════════════════════════════════════╗
║  BEATVISION v4 // ANALYSIS REPORT        ║
║  ${now.padEnd(41)}║
║  SOURCE: ${src.padEnd(33)}║
╚══════════════════════════════════════════╝

── SONG INFO ────────────────────────────────
  DURATION       : ${String(fd.duration).padStart(6)}s
  SAMPLE RATE    : ${String(fd.sr).padStart(6)} Hz
  CLIPPING       : ${String(fd.clip).padStart(6)}% of samples
  DYNAMIC RANGE  : ${String(fd.dr).padStart(6)} dB
  STEREO CORR    : ${BV.corrValue.toFixed(2)} (-1=cancel, +1=mono)

── TIMING + RHYTHM ──────────────────────────
  DETECTED BPM   : ${String(fd.bpm||BV.bpmEst||'—').padStart(6)}
  GROOVE RATING  : ${(document.getElementById('gV')||{}).textContent||'—'}
  BEAT COUNT     : ${fd.beats||BV.beatCnt}

── FREQUENCY BALANCE (FFT bins) ─────────────
  BASS (20–250Hz): ${pct(fd.bass)}
  MID (250–4kHz) : ${pct(fd.mid)}
  HIGH (4k–20kHz): ${pct(fd.high)}

── DYNAMICS + LOUDNESS ──────────────────────
  PEAK L         : ${dB(fd.peakL)}FS
  PEAK R         : ${dB(fd.peakR)}FS
  AVG RMS        : ${dB(fd.rms)}
  EST. LUFS INT  : ${dB(fd.lufs)}

── DIAGNOSTICS ──────────────────────────────
${diag.map(x=>'  '+x).join('\n')}

── PROMPT FOR AI ────────────────────────────
  Based on this BeatVision v4 analysis,
  what mixing/mastering adjustments should I make?
  Genre: [GENRE]. Tool used: Suno AI.
  Hearing impaired producer — visual/data feedback preferred.
  I use BeatVision's mastering chain for finishing.
`;
    document.getElementById('reportTxt').textContent = report;
    this.showTab('report');
  },

  async copyReport() {
    const t = document.getElementById('reportTxt').textContent;
    if (!t) { alert('Capture a report first!'); return; }
    try { await navigator.clipboard.writeText(t); }
    catch(e) { const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta); }
    const b = document.querySelector('.copy-btn');
    if (b) { b.textContent='✓ COPIED!'; setTimeout(()=>b.textContent='COPY REPORT → PASTE TO AI',2000); }
  },

  // ---- Slider label helper ----
  ul(el, id, unit) {
    const v = parseFloat(el.value);
    const lbl = document.getElementById(id);
    if (lbl) lbl.textContent = v + (unit===':1' ? ':1' : ' '+unit);
  },

};
