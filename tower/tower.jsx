import { useState, useEffect, useRef, useCallback } from "react";

const TOWER_WIDTH = 9;
const CRANE_RANGE = 12;
const CRANE_SPEED_BASE = 1.4;
const MAX_FLOORS = 18;

const FLAVOR = [
  "The city hums below as another floor swings into place…",
  "Neon rain streaks the viewport. The crane does not wait.",
  "Signal locked. Drop when ready, operator.",
  "The spire rises. GRID BREACH imminent.",
  "Another floor. Another meter above the static.",
  "The tower defies physics. For now.",
  "Uplink stable. Keep stacking.",
  "Maximum Reality protocol engaged.",
  "The wobble is real. Compensate.",
  "Azul watches from the quantum layer. Impressed.",
  "Mochkil rates this stack: spicy.",
  "VOID-WALKER approves. Keep climbing.",
  "Static city below. Clarity above.",
  "The algorithm is watching your precision.",
];

const GAME_OVER_LINES = [
  "SIGNAL LOST. The block fell into the static.",
  "STRUCTURE COMPROMISED. The tower returns to the grid.",
  "ALIGNMENT FAILURE. Physics wins this round.",
  "CONNECTION TERMINATED. The spire collapses.",
];

function getFlavorText() {
  return FLAVOR[Math.floor(Math.random() * FLAVOR.length)];
}

function buildCraneVisual(cranePos, towerWidth, towerOffset) {
  const width = CRANE_RANGE * 2 + towerWidth + 4;
  const center = CRANE_RANGE + 2;
  const blockCenter = center + cranePos;
  const towerCenter = center + towerOffset;

  let line = Array(width).fill("·");

  // Tower base marker
  const towerLeft = towerCenter - Math.floor(towerWidth / 2);
  const towerRight = towerCenter + Math.floor(towerWidth / 2);
  for (let i = towerLeft; i <= towerRight; i++) {
    if (i >= 0 && i < width) line[i] = "▒";
  }

  // Crane arm (cable)
  line[blockCenter] = "│";

  // Block
  const blockLeft = blockCenter - Math.floor(towerWidth / 2);
  const blockRight = blockCenter + Math.floor(towerWidth / 2);
  let blockChars = Array(width).fill(" ");
  for (let i = blockLeft; i <= blockRight; i++) {
    if (i >= 0 && i < width) blockChars[i] = "█";
  }
  blockChars[blockCenter] = "█";

  return {
    craneRail: line.join(""),
    blockRow: blockChars.join(""),
    towerLeft,
    towerRight,
    blockLeft,
    blockRight,
    blockCenter,
    towerCenter,
  };
}

function getWobbleChar(wobble) {
  if (wobble === 0) return "█";
  if (wobble <= 1) return "▓";
  if (wobble <= 2) return "▒";
  return "░";
}

function buildTowerVisual(floors, wobble) {
  const width = TOWER_WIDTH;
  const lines = [];
  const maxDisplay = Math.min(floors.length, MAX_FLOORS);
  const startIdx = Math.max(0, floors.length - maxDisplay);

  for (let i = floors.length - 1; i >= startIdx; i--) {
    const f = floors[i];
    const char = getWobbleChar(f.wobble);
    const floorStr = char.repeat(width);
    const label = `F${String(i + 1).padStart(2, "0")}`;
    lines.push({ str: floorStr, label, wobble: f.wobble, idx: i });
  }

  // Base
  lines.push({ str: "▓".repeat(width), label: "BASE", wobble: 0, isBase: true });

  return lines;
}

function calcDrop(cranePos, towerOffset, towerWidth) {
  const off = cranePos - towerOffset;
  const absOff = Math.abs(off);
  const halfWidth = Math.floor(towerWidth / 2);

  if (absOff <= 1) return { result: "perfect", off, absOff };
  if (absOff <= 3) return { result: "good", off, absOff };
  if (absOff <= halfWidth) return { result: "wobbly", off, absOff };
  if (absOff <= halfWidth + 2) return { result: "bad", off, absOff };
  return { result: "fall", off, absOff };
}

const RESULT_META = {
  perfect: { label: "⚡ PERFECT", color: "#00ffe7", wobbleDelta: 0, msg: "Dead center. The city gasps." },
  good:    { label: "✓ GOOD",    color: "#aaff00", wobbleDelta: 0, msg: "Clean drop. Solid." },
  wobbly:  { label: "⚠ WOBBLY", color: "#ffcc00", wobbleDelta: 1, msg: "Off-center. The tower sways." },
  bad:     { label: "⚡ RISKY",  color: "#ff6600", wobbleDelta: 2, msg: "Barely caught it. Structural risk rising." },
  fall:    { label: "✗ FALL",   color: "#ff0044", wobbleDelta: 99, msg: "Too far. The block is gone." },
};

export default function TowerStack() {
  const [phase, setPhase] = useState("intro"); // intro | playing | gameover
  const [cranePos, setCranePos] = useState(0);
  const [craneDir, setCraneDir] = useState(1);
  const [craneSpeed, setCraneSpeed] = useState(CRANE_SPEED_BASE);
  const [towerOffset, setTowerOffset] = useState(0);
  const [floors, setFloors] = useState([]);
  const [totalWobble, setTotalWobble] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [flavor, setFlavor] = useState(getFlavorText());
  const [gameOverMsg, setGameOverMsg] = useState("");
  const [record, setRecord] = useState(0);
  const [animFrame, setAnimFrame] = useState(null);
  const craneRef = useRef({ pos: 0, dir: 1, speed: CRANE_SPEED_BASE });
  const animRef = useRef(null);
  const gameActiveRef = useRef(false);

  const stopCrane = useCallback(() => {
    gameActiveRef.current = false;
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  const startCrane = useCallback(() => {
    gameActiveRef.current = true;
    let last = performance.now();

    const tick = (now) => {
      if (!gameActiveRef.current) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const cr = craneRef.current;
      cr.pos += cr.dir * cr.speed * dt * 18;

      if (cr.pos >= CRANE_RANGE) { cr.pos = CRANE_RANGE; cr.dir = -1; }
      if (cr.pos <= -CRANE_RANGE) { cr.pos = -CRANE_RANGE; cr.dir = 1; }

      setCranePos(Math.round(cr.pos * 10) / 10);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
  }, []);

  const startGame = useCallback(() => {
    stopCrane();
    craneRef.current = { pos: 0, dir: 1, speed: CRANE_SPEED_BASE };
    setFloors([]);
    setTotalWobble(0);
    setTowerOffset(0);
    setLastResult(null);
    setFlavor(getFlavorText());
    setCranePos(0);
    setCraneSpeed(CRANE_SPEED_BASE);
    setPhase("playing");
    setTimeout(startCrane, 50);
  }, [stopCrane, startCrane]);

  useEffect(() => {
    return () => stopCrane();
  }, [stopCrane]);

  const handleTap = useCallback(() => {
    if (phase !== "playing") return;

    const pos = craneRef.current.pos;
    const drop = calcDrop(pos, towerOffset, TOWER_WIDTH);
    const meta = RESULT_META[drop.result];

    if (drop.result === "fall") {
      stopCrane();
      const goMsg = GAME_OVER_LINES[Math.floor(Math.random() * GAME_OVER_LINES.length)];
      setGameOverMsg(goMsg);
      setLastResult({ ...drop, meta });
      setPhase("gameover");
      setRecord(r => Math.max(r, floors.length));
      return;
    }

    const newWobble = Math.min((floors[floors.length - 1]?.wobble || 0) + meta.wobbleDelta, 4);
    const newFloor = { wobble: newWobble, off: drop.off };
    const newFloors = [...floors, newFloor];
    const newTotalWobble = totalWobble + meta.wobbleDelta;

    // Shift tower center slightly toward block on off-center drops
    const newTowerOffset = towerOffset + Math.round(drop.off * 0.15);

    setFloors(newFloors);
    setTotalWobble(newTotalWobble);
    setTowerOffset(Math.max(-6, Math.min(6, newTowerOffset)));
    setLastResult({ ...drop, meta });
    setFlavor(getFlavorText());

    // Speed up crane slightly each floor
    craneRef.current.speed = Math.min(CRANE_SPEED_BASE + newFloors.length * 0.08, 4.5);
    setCraneSpeed(craneRef.current.speed);
  }, [phase, craneRef, towerOffset, floors, totalWobble, stopCrane]);

  // Keyboard/touch tap
  useEffect(() => {
    const handler = (e) => {
      if (e.type === "keydown" && e.code !== "Space" && e.code !== "Enter") return;
      handleTap();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleTap]);

  const vis = buildCraneVisual(Math.round(cranePos), TOWER_WIDTH, towerOffset);
  const towerLines = buildTowerVisual(floors, totalWobble);

  const stabilityLabel = totalWobble === 0 ? "SOLID" :
    totalWobble <= 2 ? "STABLE" :
    totalWobble <= 5 ? "SHAKY" :
    totalWobble <= 9 ? "CRITICAL" : "COLLAPSING";

  const stabilityColor = totalWobble === 0 ? "#00ffe7" :
    totalWobble <= 2 ? "#aaff00" :
    totalWobble <= 5 ? "#ffcc00" :
    totalWobble <= 9 ? "#ff6600" : "#ff0044";

  return (
    <div
      onClick={phase === "playing" ? handleTap : undefined}
      style={{
        background: "#050510",
        minHeight: "100vh",
        fontFamily: "'Courier New', monospace",
        color: "#c0c8ff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 8px",
        cursor: phase === "playing" ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 6,
          color: "#ff0080",
          textShadow: "0 0 12px #ff0080",
          marginBottom: 2,
        }}>◈ MAXIMUM REALITY ◈</div>
        <div style={{
          fontSize: 22,
          fontWeight: "bold",
          letterSpacing: 4,
          color: "#00ffe7",
          textShadow: "0 0 18px #00ffe7, 0 0 40px #00ffe7",
        }}>SPIRE.EXE</div>
        <div style={{ fontSize: 10, color: "#4455aa", letterSpacing: 3, marginTop: 2 }}>
          TOWER STACKING // NEON DISTRICT
        </div>
      </div>

      {/* INTRO */}
      {phase === "intro" && (
        <div style={{
          maxWidth: 320,
          background: "#0a0a1a",
          border: "1px solid #1a1a4a",
          borderRadius: 4,
          padding: "20px 18px",
          marginTop: 12,
        }}>
          <div style={{ color: "#00ffe7", fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>
            // MISSION BRIEF
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.9, color: "#8899cc" }}>
            ▸ A crane swings a floor block left and right.<br/>
            ▸ Tap to drop it onto the tower below.<br/>
            ▸ Land it centered = solid stack. Off-center = wobble.<br/>
            ▸ Miss too far = block falls, game over.<br/>
            ▸ Stack as high as possible. The crane speeds up.
          </div>
          <div style={{ marginTop: 16, fontSize: 10, color: "#445588", borderTop: "1px solid #1a1a3a", paddingTop: 10 }}>
            TAP / CLICK / SPACEBAR to drop
          </div>
          <button
            onClick={startGame}
            style={{
              marginTop: 16,
              width: "100%",
              background: "transparent",
              border: "1px solid #00ffe7",
              color: "#00ffe7",
              padding: "10px 0",
              fontSize: 13,
              letterSpacing: 4,
              cursor: "pointer",
              textShadow: "0 0 8px #00ffe7",
              boxShadow: "0 0 12px #00ffe744",
            }}
          >
            INITIATE
          </button>
        </div>
      )}

      {/* PLAYING */}
      {phase === "playing" && (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Stats row */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            letterSpacing: 2,
            padding: "6px 10px",
            background: "#080818",
            border: "1px solid #1a1a3a",
          }}>
            <span>FLR <span style={{ color: "#00ffe7" }}>{String(floors.length).padStart(2, "0")}</span></span>
            <span style={{ color: stabilityColor }}>{stabilityLabel}</span>
            <span>REC <span style={{ color: "#ff0080" }}>{record}</span></span>
          </div>

          {/* Flavor */}
          <div style={{
            fontSize: 10,
            color: "#445588",
            fontStyle: "italic",
            padding: "4px 10px",
            borderLeft: "2px solid #1a1a4a",
            lineHeight: 1.5,
          }}>
            {flavor}
          </div>

          {/* Last result */}
          {lastResult && (
            <div style={{
              fontSize: 11,
              letterSpacing: 1,
              color: lastResult.meta.color,
              textShadow: `0 0 8px ${lastResult.meta.color}`,
              padding: "3px 10px",
            }}>
              {lastResult.meta.label} — {lastResult.meta.msg}
            </div>
          )}

          {/* Crane visual */}
          <div style={{
            background: "#060614",
            border: "1px solid #1a1a3a",
            padding: "8px 0 4px",
            overflowX: "auto",
          }}>
            {/* Cable row */}
            <div style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "#334477",
              whiteSpace: "pre",
              textAlign: "center",
              lineHeight: 1.2,
            }}>
              {"━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}
            </div>
            <div style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "#2244aa",
              whiteSpace: "pre",
              textAlign: "center",
              lineHeight: 1.1,
            }}>
              {vis.craneRail}
            </div>
            {/* Falling block */}
            <div style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "#00ffe7",
              textShadow: "0 0 6px #00ffe7",
              whiteSpace: "pre",
              textAlign: "center",
              lineHeight: 1.1,
            }}>
              {vis.blockRow}
            </div>
            <div style={{
              textAlign: "center",
              fontSize: 9,
              color: "#223366",
              marginTop: 4,
              letterSpacing: 1,
            }}>
              ↓ DROP ZONE ↓
            </div>
          </div>

          {/* Tower */}
          <div style={{
            background: "#060614",
            border: "1px solid #1a1a3a",
            padding: "8px 10px",
            maxHeight: 280,
            overflowY: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}>
            {towerLines.map((fl, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
              }}>
                <span style={{
                  fontSize: 9,
                  color: "#2a3366",
                  width: 28,
                  textAlign: "right",
                  letterSpacing: 0,
                }}>{fl.label}</span>
                <span style={{
                  fontFamily: "monospace",
                  fontSize: 13,
                  color: fl.isBase ? "#335588" :
                    fl.wobble === 0 ? "#00ffe7" :
                    fl.wobble <= 1 ? "#aaff00" :
                    fl.wobble <= 2 ? "#ffcc00" :
                    fl.wobble <= 3 ? "#ff6600" : "#ff0044",
                  textShadow: fl.isBase ? "none" :
                    fl.wobble === 0 ? "0 0 6px #00ffe766" : "none",
                  letterSpacing: 1,
                }}>
                  {fl.str}
                </span>
              </div>
            ))}
          </div>

          {/* Tap prompt */}
          <div style={{
            textAlign: "center",
            fontSize: 11,
            color: "#223355",
            letterSpacing: 3,
            padding: "6px 0",
            animation: "pulse 1.2s ease-in-out infinite",
          }}>
            [ TAP TO DROP ]
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {phase === "gameover" && (
        <div style={{
          maxWidth: 320,
          background: "#0a0005",
          border: "1px solid #440011",
          borderRadius: 4,
          padding: "20px 18px",
          marginTop: 8,
        }}>
          <div style={{
            color: "#ff0044",
            fontSize: 16,
            letterSpacing: 4,
            textShadow: "0 0 16px #ff0044",
            marginBottom: 8,
            textAlign: "center",
          }}>
            ✗ SIGNAL LOST
          </div>
          <div style={{ fontSize: 11, color: "#aa3344", marginBottom: 16, fontStyle: "italic" }}>
            {gameOverMsg}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 16,
          }}>
            {[
              { label: "FLOORS STACKED", val: floors.length, color: "#00ffe7" },
              { label: "ALL-TIME RECORD", val: Math.max(record, floors.length), color: "#ff0080" },
              { label: "STABILITY", val: totalWobble === 0 ? "SOLID" : totalWobble <= 3 ? "OK" : "CRITICAL", color: stabilityColor },
              { label: "LAST DROP", val: lastResult ? lastResult.meta.label : "—", color: lastResult?.meta.color || "#888" },
            ].map(s => (
              <div key={s.label} style={{
                background: "#080010",
                border: "1px solid #220011",
                padding: "8px 10px",
              }}>
                <div style={{ fontSize: 8, letterSpacing: 2, color: "#443355", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: s.color, textShadow: `0 0 8px ${s.color}` }}>{s.val}</div>
              </div>
            ))}
          </div>

          <div style={{
            fontSize: 10,
            color: "#334455",
            borderTop: "1px solid #1a0011",
            paddingTop: 10,
            marginBottom: 14,
            lineHeight: 1.7,
          }}>
            {floors.length >= 10 ? "⚡ Master-class stack. The district takes notice." :
             floors.length >= 6 ? "Respectable spire. The neon approves." :
             floors.length >= 3 ? "A start. The grid has seen worse." :
             "The crane does not judge. Try again."}
          </div>

          <button
            onClick={startGame}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid #ff0044",
              color: "#ff0044",
              padding: "10px 0",
              fontSize: 12,
              letterSpacing: 4,
              cursor: "pointer",
              textShadow: "0 0 8px #ff0044",
            }}
          >
            REINITIATE
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
