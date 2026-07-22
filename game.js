// UC Bearcats Pac-Man — game engine
// Human-controlled port of bearcat_pacman_asta_radius_2.py
// UCPacman.init({ canvas, numGhosts, speed, onEnd })

window.UCPacman = (function () {

// ── Board ────────────────────────────────────────────────────────────────────
const BOARD_RAW = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.#####.##.#####.######",
  "######.#####.##.#####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "######.## #      # ##.######",
  "######.## #      # ##.######",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];
const COLS = 28, ROWS = 31;
const BOARD = BOARD_RAW.map(r => r.padEnd(COLS, ' '));

// ── Sizes ────────────────────────────────────────────────────────────────────
const CELL   = 20;
const MAZE_W = COLS * CELL;   // 560
const MAZE_H = ROWS * CELL;   // 620
const PC     = CELL * 2;      // 40  — goal sprite size
const GC     = Math.floor(PC * 0.75); // 30 — ghost/player sprite size

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  BLACK:     '#000',
  GREY:      'rgb(140,140,140)',
  WHITE:     '#fff',
  YELLOW:    'rgb(255,215,0)',
  GOLD:      'rgb(255,185,0)',
  DGREY:     'rgb(60,60,60)',
  BLUE:      'rgb(30,80,220)',
  LBLUE:     'rgb(180,210,255)',
  CREAM:     'rgb(255,250,200)',
  BROWN:     'rgb(120,70,20)',
  RED:       'rgb(226,24,54)',
  GREEN:     'rgb(100,220,100)',
  G1:        'rgb(50,200,50)',
  G2:        'rgb(20,160,20)',
  G3:        'rgb(144,238,144)',
  G4:        'rgb(0,200,100)',
};

// ── Game constants ───────────────────────────────────────────────────────────
const SIM_DURATION       = 60.0;
const NUM_GOALS          = 4;
const GOAL_MIN_SPACING   = 10;
const HIDDEN_RADIUS_MIN  = 4;
const HIDDEN_RADIUS_MAX  = 10;
const HIDDEN_SPACING     = 6;
const LOG_INTERVAL       = 0.25;
const NEAR_MISS_PX       = CELL * 1.4;
const COLLISION_PX       = CELL * 0.7;

// ── Directions ───────────────────────────────────────────────────────────────
const UP=[-1,0], DOWN=[1,0], LEFT=[0,-1], RIGHT=[0,1];
const DIRS = [UP, DOWN, LEFT, RIGHT];
const DNAME = {'-1,0':'UP','1,0':'DOWN','0,-1':'LEFT','0,1':'RIGHT','0,0':'IDLE'};
const dkey  = d => d[0]+','+d[1];
const dname = d => DNAME[dkey(d)] || 'IDLE';

// ── Cell key (unique integer per cell, safe for r<100,c<100) ─────────────────
const ck = (r, c) => r * 100 + c;

// ── Walkability ───────────────────────────────────────────────────────────────
function walkable(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  return BOARD[r][c] !== '#';
}

// ── A* (returns array of [r,c] cells, null if unreachable) ───────────────────
function astar(sr, sc, gr, gc, danger) {
  danger = danger || {};
  const startK = ck(sr,sc), goalK = ck(gr,gc);
  if (startK === goalK) return [[sr,sc]];
  // open list: [f, r, c]
  const open = [[0, sr, sc]];
  const gScore = { [startK]: 0 };
  const from = {};
  while (open.length) {
    open.sort((a,b) => a[0]-b[0]);
    const [, r, col] = open.shift();
    const k = ck(r,col);
    if (k === goalK) {
      // reconstruct
      const path = [[r,col]];
      let cur = k;
      while (from[cur] !== undefined) {
        cur = from[cur];
        path.unshift([Math.floor(cur/100), cur%100]);
      }
      return path;
    }
    for (const [dr,dc] of DIRS) {
      const nr=r+dr, nc=col+dc;
      if (!walkable(nr,nc)) continue;
      const nk = ck(nr,nc);
      const tent = (gScore[k]||0) + 1 + (danger[nk]||0);
      if (gScore[nk] === undefined || tent < gScore[nk]) {
        gScore[nk] = tent;
        from[nk] = k;
        open.push([tent + Math.abs(nr-gr) + Math.abs(nc-gc), nr, nc]);
      }
    }
  }
  return null;
}
function astarDist(sr,sc,gr,gc) {
  const p = astar(sr,sc,gr,gc);
  return p ? p.length-1 : Infinity;
}

// ── Danger map ────────────────────────────────────────────────────────────────
function buildDanger(robots) {
  const d={}, R=3, maxP=8, decay=Math.floor(maxP/(R+1));
  for (const rb of robots) {
    const cells = [[rb.r,rb.c]];
    if (rb.nextCell) cells.push(rb.nextCell);
    for (const [gr,gc] of cells)
      for (let dr=-R;dr<=R;dr++)
        for (let dc=-R;dc<=R;dc++) {
          const md=Math.abs(dr)+Math.abs(dc); if(md>R) continue;
          const pr=gr+dr, pc=gc+dc; if(!walkable(pr,pc)) continue;
          const pen=maxP-md*decay; if(pen<=0) continue;
          const k=ck(pr,pc); if((d[k]||0)<pen) d[k]=pen;
        }
  }
  return d;
}

// ── Walkable cells & forbidden zones ─────────────────────────────────────────
const ALL_WALKABLE = [];
for (let r=0;r<ROWS;r++)
  for (let c=0;c<COLS;c++)
    if (BOARD[r][c]!=='#' && BOARD[r][c]!==' ' && BOARD[r][c]!=='-')
      ALL_WALKABLE.push([r,c]);

const PLAYER_SPAWN   = [23,14];
const GHOST_SPAWNS   = [[14,11],[14,13],[14,14],[14,16]];
const CORNER_SECTORS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROW_MID = Math.floor(ROWS/2), COL_MID = Math.floor(COLS/2);

const GHOST_HOUSE = new Set();
for (let r=11;r<18;r++) for (let c=10;c<18;c++)
  if (BOARD[r][c]!=='#') GHOST_HOUSE.add(ck(r,c));
const FORBIDDEN = new Set([...GHOST_HOUSE, ck(PLAYER_SPAWN[0],PLAYER_SPAWN[1])]);

// ── Goal placement ────────────────────────────────────────────────────────────
function quadrant([r,c]) { return (r<ROW_MID?0:2)+(c<COL_MID?0:1); }
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} }

function pickGoals() {
  const pool = ALL_WALKABLE.filter(c => !FORBIDDEN.has(ck(c[0],c[1])) && astar(PLAYER_SPAWN[0],PLAYER_SPAWN[1],c[0],c[1]));
  const byQ = {0:[],1:[],2:[],3:[]};
  for (const c of pool) byQ[quadrant(c)].push(c);
  for (let att=0;att<200;att++) {
    for (const q of Object.values(byQ)) shuffle(q);
    const chosen=[];
    for (const q of [0,1,2,3]) {
      let placed=null;
      for (const cand of byQ[q])
        if (chosen.every(g=>Math.abs(cand[0]-g[0])+Math.abs(cand[1]-g[1])>=GOAL_MIN_SPACING))
          { placed=cand; break; }
      if (!placed) break;
      chosen.push(placed);
    }
    if (chosen.length===4) return chosen;
  }
  return [0,1,2,3].map(q => byQ[q][0] || ALL_WALKABLE[0]);
}

// ── Hidden-goal placement (sector-pinned, exact Python port) ──────────────────
function pickSectorGoal(center, sector, taken, exclude, prevGoal, prevMinD=8) {
  const [cr,cc]=center, [drow,dcol]=sector;
  const takenSet = new Set((taken||[]).map(c=>ck(c[0],c[1])));
  const excK = exclude ? ck(exclude[0],exclude[1]) : -1;
  const ctrK = ck(cr,cc);

  function farEnough(cell) {
    for (const tk of takenSet) {
      const tr=Math.floor(tk/100), tc=tk%100;
      if (Math.abs(cell[0]-tr)+Math.abs(cell[1]-tc) < HIDDEN_SPACING) return false;
    }
    if (prevGoal && Math.abs(cell[0]-prevGoal[0])+Math.abs(cell[1]-prevGoal[1]) < prevMinD) return false;
    return true;
  }
  function collect(rMin, rMax, sectOnly) {
    const out=[];
    for (const [r,c] of ALL_WALKABLE) {
      const k=ck(r,c);
      if (k===ctrK||k===excK||takenSet.has(k)) continue;
      const md=Math.abs(r-cr)+Math.abs(c-cc);
      if (md<rMin||md>rMax) continue;
      if (sectOnly && ((r-cr)*drow<0||(c-cc)*dcol<0)) continue;
      out.push([r,c]);
    }
    return out;
  }
  function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  let cands = collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX,true).filter(farEnough);
  if (cands.length) return pick(cands);
  for (const extra of [2,4,6,10]) {
    cands = collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+extra,true).filter(farEnough);
    if (cands.length) return pick(cands);
  }
  cands = collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX,true).filter(c=>!prevGoal||Math.abs(c[0]-prevGoal[0])+Math.abs(c[1]-prevGoal[1])>=prevMinD);
  if (cands.length) return pick(cands);
  cands = collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+4,false).filter(farEnough);
  if (cands.length) return pick(cands);
  cands = collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+8,false);
  if (cands.length) return pick(cands);
  const fb = ALL_WALKABLE.filter(c=>ck(c[0],c[1])!==ctrK&&ck(c[0],c[1])!==excK);
  return fb[Math.floor(Math.random()*fb.length)] || ALL_WALKABLE[0];
}

function assignHiddenGoals(robots, goal) {
  if (!goal) return;
  const taken=[], usedPath={};
  for (const rb of robots) {
    const cell = pickSectorGoal(goal, rb.sector, taken, [rb.r,rb.c]);
    const danger = Object.keys(usedPath).length ? {...usedPath} : null;
    rb.setHiddenGoal(cell, danger);
    taken.push(cell);
    for (const [pr,pc] of rb.path.slice(0,12))
      usedPath[ck(pr,pc)] = (usedPath[ck(pr,pc)]||0)+3;
  }
}

// ── Actor ─────────────────────────────────────────────────────────────────────
class Actor {
  constructor(r,c) {
    this.r=r; this.c=c;
    this.px=c*CELL+CELL/2; this.py=r*CELL+CELL/2;
    this.dir=[0,0]; this.nextCell=null;
  }
  advance(speed) {
    const [nr,nc] = this.nextCell;
    const tx=nc*CELL+CELL/2, ty=nr*CELL+CELL/2;
    const dx=tx-this.px, dy=ty-this.py, dist=Math.hypot(dx,dy);
    if (dist<=speed) {
      this.px=tx; this.py=ty; this.r=nr; this.c=nc; this.nextCell=null; return true;
    }
    this.px+=speed*dx/dist; this.py+=speed*dy/dist; return false;
  }
}

// ── Human player ──────────────────────────────────────────────────────────────
class Player extends Actor {
  constructor(r,c) {
    super(r,c);
    this.heldDir  = null;   // direction currently held down (null = no key held)
    this.queuedDir = null;  // direction pressed while mid-glide, applied on arrival
  }

  // Called on keydown (including first press)
  pressDir(d) {
    this.heldDir   = [d[0], d[1]];   // update current held direction
    this.queuedDir = [d[0], d[1]];   // also queue it for mid-glide changes
  }

  // Called on keyup — if the released key matches held, stop after current cell
  releaseDir(d) {
    if (this.heldDir && this.heldDir[0]===d[0] && this.heldDir[1]===d[1]) {
      this.heldDir = null;
    }
  }

  step(speed) {
    // Still gliding to the next cell — keep animating, do not chain yet
    if (this.nextCell) {
      this.advance(speed);
      return;
    }
    // Arrived at cell centre — decide whether to keep moving or stop
    // Use queued direction first (last key pressed), fall back to held direction
    const moveDir = this.queuedDir || this.heldDir;
    this.queuedDir = null;   // queued is consumed each cell
    if (!moveDir) return;    // no key held — stand still
    const [dr, dc] = moveDir;
    const nr = this.r + dr, nc = this.c + dc;
    if (walkable(nr, nc)) {
      this.nextCell = [nr, nc];
      this.dir      = [dr, dc];
      this.advance(speed);
    }
    // Blocked — stop; if key is still held, next frame will try again
  }
}

// ── Ghost (A* sector-pinned) ──────────────────────────────────────────────────
class Ghost extends Actor {
  constructor(r,c,speed) {
    super(r,c); this.speed=speed;
    this.exiting=true; this.dir=[-1,0]; this.mode='EXIT';
    this.hiddenGoal=null; this.prevHiddenGoal=null;
    this.path=[]; this.arrivals=0; this.sector=null;
    this.goalProvider=null;
  }
  setHiddenGoal(cell, danger) {
    this.hiddenGoal=cell;
    if (cell && !this.exiting) {
      const p=astar(this.r,this.c,cell[0],cell[1],danger||{});
      this.path = p ? p.slice(1) : [];
    } else { this.path=[]; }
  }
  _replan(danger) {
    if (!this.hiddenGoal||this.exiting){this.path=[];return;}
    const p=astar(this.r,this.c,this.hiddenGoal[0],this.hiddenGoal[1],danger||{});
    this.path = p ? p.slice(1) : [];
  }
  _exitStep() {
    const nr=this.r-1, nc=this.c;
    if (walkable(nr,nc)) {
      this.nextCell=[nr,nc]; this.dir=[-1,0];
      if (this.r-1<=11) { this.exiting=false; this.mode='HUNT'; this._replan(); }
      return;
    }
    const tc = this.c<13?13:(this.c>14?14:this.c);
    if (tc===this.c) { this.exiting=false; this.mode='HUNT'; this._replan(); this._stepPath(); return; }
    const d=tc>this.c?1:-1; this.nextCell=[this.r,this.c+d]; this.dir=[0,d];
  }
  _stepPath() {
    if (!this.path.length) { this.mode='IDLE'; this.nextCell=null; return; }
    const [nr,nc]=this.path.shift();
    this.nextCell=[nr,nc]; this.dir=[nr-this.r,nc-this.c]; this.mode='HUNT';
  }
  step() {
    if (!this.nextCell) {
      if (this.exiting) this._exitStep(); else this._stepPath();
    }
    if (this.nextCell) {
      const arrived = this.advance(this.speed);
      if (arrived && this.hiddenGoal &&
          this.r===this.hiddenGoal[0] && this.c===this.hiddenGoal[1]) {
        this.arrivals++; this.prevHiddenGoal=this.hiddenGoal;
        this.hiddenGoal=null; this.path=[];
        if (this.goalProvider) {
          const [ng,dan] = this.goalProvider(this);
          if (ng) { this.setHiddenGoal(ng,dan); this._stepPath(); if(this.nextCell) this.advance(this.speed); return; }
        }
        this.mode='IDLE';
      }
    }
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────
class Game {
  constructor(numGhosts, speed) {
    this.numGhosts=numGhosts; this.speed=speed;
    this.player = new Player(PLAYER_SPAWN[0],PLAYER_SPAWN[1]);
    this.robots = GHOST_SPAWNS.slice(0,numGhosts).map(([r,c])=>new Ghost(r,c,speed));
    for (let i=0;i<this.robots.length;i++) this.robots[i].sector=CORNER_SECTORS[i%4];

    this.allGoals = pickGoals();
    this.remaining = [...this.allGoals];
    this.collected = [];
    this.goal = null; this.activeIdx = 0;
    this._pickTarget();
    assignHiddenGoals(this.robots, this.goal);
    for (const rb of this.robots) rb.goalProvider = rb2 => this._ghostGoal(rb2);

    this.dots = new Set();
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
      if (BOARD[r][c]==='.') this.dots.add(ck(r,c));
    this.initialDots = this.dots.size;
    this.dots.delete(ck(PLAYER_SPAWN[0],PLAYER_SPAWN[1]));
    this.score=0; this.goalsCollected=0;
    this.status='IN_PROGRESS'; this.outcome='';
    this.startT=performance.now()/1000; this.lastLogT=0;
    this.collisions=0; this.nearMisses=0; this.log=[];
    this.prevRC = this.robots.map(rb=>[rb.r,rb.c]);
  }

  _pickTarget() {
    if (!this.remaining.length){this.goal=null;return;}
    let best=null, bd=Infinity;
    for (const g of this.remaining) {
      const d=astarDist(this.player.r,this.player.c,g[0],g[1]);
      if (d<bd){bd=d;best=g;}
    }
    this.goal=best;
    this.activeIdx=this.allGoals.findIndex(g=>g[0]===best[0]&&g[1]===best[1]);
  }

  _ghostGoal(rb) {
    if (!this.goal) return [null,null];
    const others = this.robots.filter(o=>o!==rb&&o.hiddenGoal).map(o=>o.hiddenGoal);
    const cell = pickSectorGoal(this.goal, rb.sector, others, [rb.r,rb.c], rb.prevHiddenGoal);
    const danger={};
    for (const o of this.robots) { if(o===rb) continue; for(const [pr,pc] of o.path.slice(0,12)){const k=ck(pr,pc);danger[k]=(danger[k]||0)+3;} }
    return [cell,danger];
  }

  _refreshGhosts() {
    for (const rb of this.robots) {
      if (rb.exiting) continue;
      if (!rb.hiddenGoal && this.goal) {
        const [c,d]=this._ghostGoal(rb); if(c) rb.setHiddenGoal(c,d);
      }
    }
  }

  elapsed()  { return performance.now()/1000 - this.startT; }
  timeLeft() { return Math.max(0, SIM_DURATION - this.elapsed()); }

  _prox() {
    let w='safe';
    for (const rb of this.robots) {
      const d=Math.hypot(this.player.px-rb.px,this.player.py-rb.py);
      if (d<COLLISION_PX) return 'collision';
      if (d<NEAR_MISS_PX && w==='safe') w='near-miss';
    }
    return w;
  }

  update() {
    if (this.status!=='IN_PROGRESS') return;
    const pr=this.player.r, pc=this.player.c;
    this.player.step(this.speed);
    for (const rb of this.robots) rb.step();
    this._refreshGhosts();

    const moved = this.player.r!==pr || this.player.c!==pc;
    const dk2 = ck(this.player.r, this.player.c);
    if (moved && this.dots.has(dk2)) { this.dots.delete(dk2); this.score++; }

    if (moved && this.goal && this.player.r===this.goal[0] && this.player.c===this.goal[1]) {
      this.goalsCollected++;
      this.collected.push(this.goal);
      this.remaining = this.remaining.filter(g=>g[0]!==this.goal[0]||g[1]!==this.goal[1]);
      this.score+=5;
      this._logSample('goal-reached');
      if (!this.remaining.length) {
        this.status='SUCCESS';
        this.outcome=`All ${NUM_GOALS} goals collected! Knowledge: ${this.score}`;
        return;
      }
      this._pickTarget();
      assignHiddenGoals(this.robots, this.goal);
      this.lastLogT=this.elapsed();
      this.prevRC=this.robots.map(rb=>[rb.r,rb.c]);
      return;
    }

    const curRC=this.robots.map(rb=>[rb.r,rb.c]);
    const rMoved=curRC.some((c,i)=>c[0]!==this.prevRC[i][0]||c[1]!==this.prevRC[i][1]);
    if ((moved||rMoved) && this.remaining.length && moved) this._pickTarget();
    if (moved||rMoved) this.prevRC=curRC;

    const prox=this._prox();
    if (prox==='collision') {
      this.collisions++;
      this._logSample('collision');
      this.status='FAILURE';
      this.outcome=`Hit by obstacle | Goals: ${this.goalsCollected}/${NUM_GOALS} | Knowledge: ${this.score}`;
      return;
    }
    if (this.timeLeft()<=0) {
      this._logSample(prox);
      this.status='FAILURE';
      this.outcome=`Time\'s up | Goals: ${this.goalsCollected}/${NUM_GOALS} | Knowledge: ${this.score}`;
      return;
    }
    if (moved) {
      this._logSample(prox); this.lastLogT=this.elapsed();
      if (prox==='near-miss') this.nearMisses++;
    } else if (this.elapsed()-this.lastLogT>=LOG_INTERVAL) {
      this._logSample(prox); this.lastLogT=this.elapsed();
    }
  }

  _logSample(outcome) {
    let dist=0,gr=-1,gc=-1,active=0;
    if (this.goal) {
      const p=astar(this.player.r,this.player.c,this.goal[0],this.goal[1]);
      dist=p?p.length-1:-1; gr=this.goal[0]; gc=this.goal[1]; active=this.activeIdx+1;
    }
    let chosen='IDLE';
    if (this.player.nextCell) {
      chosen=dname([this.player.nextCell[0]-this.player.r, this.player.nextCell[1]-this.player.c]);
    } else if (this.player.pending) {
      chosen=dname(this.player.pending);
    }
    const e={
      time_s:+this.elapsed().toFixed(3), player_row:this.player.r, player_col:this.player.c,
      player_dir:dname(this.player.dir), robot_count:this.robots.length, robot_speed:this.speed,
      active_goal:active, goal_row:gr, goal_col:gc, dist_to_goal:dist,
      goals_collected:this.goalsCollected, chosen_dir:chosen, outcome, status:this.status, score:this.score
    };
    this.robots.forEach((rb,i)=>{
      e[`robot${i+1}_pos`]=`(${rb.r},${rb.c})`;
      e[`robot${i+1}_dir`]=dname(rb.dir);
      e[`robot${i+1}_mode`]=rb.mode;
      e[`robot${i+1}_hidden`]=rb.hiddenGoal?`(${rb.hiddenGoal[0]},${rb.hiddenGoal[1]})`:'-';
      e[`robot${i+1}_arrivals`]=rb.arrivals;
    });
    this.log.push(e);
  }

  buildCSV(firstName, lastName, mNumber) {
    const n=this.robots.length;
    const rH=[];
    for(let i=0;i<n;i++) rH.push(`Ghost${i+1}_Pos`,`Ghost${i+1}_Dir`,`Ghost${i+1}_Mode`,`Ghost${i+1}_Hidden`,`Ghost${i+1}_Arrivals`);
    const headers=['Time_s','Player_Row','Player_Col','Player_Dir','Ghost_Count','Speed',
      'Active_Goal','Goal_Row','Goal_Col','Dist_to_Goal','Goals_Collected',
      'Chosen_Dir','Outcome','Status','Score',...rH];
    const safe=s=>String(s).replace(/,/g,';');
    const lines=[
      `First Name: ${firstName}, Last Name: ${lastName}, M Number: ${mNumber}, Ghosts: ${this.numGhosts}, Speed: ${this.speed}`,
      headers.join(',')
    ];
    for (const e of this.log) {
      const row=[e.time_s,e.player_row,e.player_col,safe(e.player_dir),e.robot_count,e.robot_speed,
        e.active_goal,e.goal_row,e.goal_col,e.dist_to_goal,e.goals_collected,
        safe(e.chosen_dir),safe(e.outcome),safe(e.status),e.score];
      for(let i=0;i<n;i++) row.push(safe(e[`robot${i+1}_pos`]||''),safe(e[`robot${i+1}_dir`]||''),safe(e[`robot${i+1}_mode`]||''),safe(e[`robot${i+1}_hidden`]||''),e[`robot${i+1}_arrivals`]||0);
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────
// polyfill roundRect for older browsers
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w,y, x+w,y+h, r);
  ctx.arcTo(x+w,y+h, x,y+h, r);
  ctx.arcTo(x,y+h, x,y, r);
  ctx.arcTo(x,y, x+w,y, r);
  ctx.closePath();
}

let wallCache = null;
function buildWalls() {
  const oc=document.createElement('canvas'); oc.width=MAZE_W; oc.height=MAZE_H;
  const wc=oc.getContext('2d');
  wc.fillStyle=C.BLACK; wc.fillRect(0,0,MAZE_W,MAZE_H);
  for (let r=0;r<ROWS;r++) for (let col=0;col<COLS;col++) {
    const x=col*CELL, y=r*CELL, ch=BOARD[r][col];
    if (ch==='#') { wc.fillStyle=C.GREY; wc.fillRect(x,y,CELL,CELL); }
    else if (ch==='-') { wc.fillStyle=C.WHITE; wc.fillRect(x,y+Math.floor(CELL/2)-3,CELL,6); }
  }
  return oc;
}

function drawBook(ctx,x,y){
  const bw=12,bh=9,bx=x+(CELL-bw)/2,by=y+(CELL-bh)/2;
  ctx.fillStyle=C.GREY; roundRect(ctx,bx,by,bw,bh,2); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1; roundRect(ctx,bx,by,bw,bh,2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+bw/2,by); ctx.lineTo(bx+bw/2,by+bh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+2,by+3); ctx.lineTo(bx+bw-2,by+3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+2,by+6); ctx.lineTo(bx+bw-2,by+6); ctx.stroke();
}

// ── Ghost sprites (GC=30) ─────────────────────────────────────────────────────
function drawClipboard(ctx,x,y){
  const C2=GC,cx=C2/2; ctx.save(); ctx.translate(x,y);
  // body
  ctx.fillStyle=C.CREAM; roundRect(ctx,3,6,C2-6,C2-9,3); ctx.fill();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1.5; roundRect(ctx,3,6,C2-6,C2-9,3); ctx.stroke();
  // clip
  ctx.fillStyle='#b4b4b4'; roundRect(ctx,cx-5,1,10,8,3); ctx.fill();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1.5; roundRect(ctx,cx-5,1,10,8,3); ctx.stroke();
  ctx.fillStyle=C.DGREY; ctx.beginPath(); ctx.arc(cx,5,3,0,Math.PI*2); ctx.fill();
  // lines
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1.5;
  for (const ly of [13,17,21,25]) {
    ctx.beginPath(); ctx.moveTo(6,ly); ctx.lineTo(ly===25?C2-8:C2-6,ly); ctx.stroke();
  }
  // X
  ctx.strokeStyle=C.RED; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(8,12); ctx.lineTo(C2-8,C2-9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(C2-8,12); ctx.lineTo(8,C2-9); ctx.stroke();
  ctx.restore();
}
function drawBuilding(ctx,x,y){
  const C2=GC,cx=C2/2; ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=C.LBLUE; ctx.fillRect(4,12,C2-8,C2-14);
  ctx.strokeStyle=C.BLUE; ctx.lineWidth=1.5; ctx.strokeRect(4,12,C2-8,C2-14);
  ctx.fillStyle=C.BLUE; ctx.beginPath(); ctx.moveTo(2,13); ctx.lineTo(C2-2,13); ctx.lineTo(cx,3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(2,13); ctx.lineTo(C2-2,13); ctx.lineTo(cx,3); ctx.closePath(); ctx.stroke();
  ctx.fillStyle='#FFD700';
  for (const wy of [16,22]) for (const wx of [6,14]) { ctx.fillRect(wx,wy,5,5); ctx.strokeStyle=C.DGREY; ctx.lineWidth=0.5; ctx.strokeRect(wx,wy,5,5); }
  ctx.fillStyle=C.BROWN; ctx.fillRect(cx-2,C2-9,4,8);
  ctx.fillStyle=C.RED; ctx.font=`bold ${Math.round(C2*0.38)}px sans-serif`; ctx.textAlign='center'; ctx.fillText('$',cx,C2-12);
  ctx.restore();
}
function drawClock(ctx,x,y){
  const C2=GC,cx=C2/2,cy=C2/2,r=C2/2-2; ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=C.WHITE; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=2; ctx.stroke();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1;
  for (let deg=0;deg<360;deg+=30){const a=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(cx+(r-1)*Math.cos(a),cy-(r-1)*Math.sin(a));ctx.lineTo(cx+(r-4)*Math.cos(a),cy-(r-4)*Math.sin(a));ctx.stroke();}
  ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-r*0.5*Math.cos(Math.PI/3),cy+r*0.5*Math.sin(Math.PI/3)); ctx.stroke();
  ctx.strokeStyle=C.RED; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+r*0.6*Math.cos(0.1),cy-r*0.6*Math.sin(0.1)); ctx.stroke();
  ctx.fillStyle=C.RED; ctx.beginPath(); ctx.arc(cx,cy,2.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawExam(ctx,x,y){
  const C2=GC,cx=C2/2; ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=C.WHITE; roundRect(ctx,3,2,C2-6,C2-4,3); ctx.fill();
  ctx.strokeStyle=C.DGREY; ctx.lineWidth=1.5; roundRect(ctx,3,2,C2-6,C2-4,3); ctx.stroke();
  ctx.fillStyle=C.RED; ctx.fillRect(3,2,C2-6,8);
  ctx.fillStyle=C.WHITE; ctx.font=`bold ${Math.round(C2*0.28)}px sans-serif`; ctx.textAlign='center'; ctx.fillText('EXAM',cx,9);
  ctx.strokeStyle='#aaa'; ctx.lineWidth=1;
  for (const ly of [14,18,22,26]){ctx.beginPath();ctx.moveTo(6,ly);ctx.lineTo(C2-6,ly);ctx.stroke();}
  ctx.fillStyle=C.RED; ctx.font=`bold ${Math.round(C2*0.55)}px sans-serif`; ctx.textAlign='left'; ctx.fillText('F',C2-12,C2-2);
  ctx.restore();
}
const GHOST_FNS = [drawClipboard, drawBuilding, drawClock, drawExam];

// ── Goal sprites (PC=40) ──────────────────────────────────────────────────────
function drawGradCap(ctx,x,y){
  const S=PC,cx=S/2,cy=S/2; ctx.save(); ctx.translate(x,y);
  // brim
  const bpts=[[cx-S/3,cy-1],[cx+S/3,cy-1],[cx+S/3,cy+3],[cx-S/3,cy+3]];
  ctx.fillStyle=C.G1; ctx.beginPath(); bpts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.beginPath(); bpts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.stroke();
  // top
  const tpts=[[cx,cy-S/3],[cx+S/4,cy-1],[cx,cy+2],[cx-S/4,cy-1]];
  ctx.fillStyle=C.G1; ctx.beginPath(); tpts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.beginPath(); tpts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.stroke();
  // tassel
  ctx.strokeStyle=C.GOLD; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(cx+S/3,cy); ctx.lineTo(cx+S/3+5,cy+S/4); ctx.stroke();
  ctx.fillStyle=C.GOLD; ctx.beginPath(); ctx.arc(cx+S/3+5,cy+S/4,4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawDiploma(ctx,x,y){
  const S=PC,cx=S/2,cy=S/2; ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=C.G2; roundRect(ctx,4,6,S-8,S-10,4); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; roundRect(ctx,4,6,S-8,S-10,4); ctx.stroke();
  // rolls
  ctx.fillStyle=C.G2; ctx.beginPath(); ctx.ellipse(6,(S-10)/2+6,4,(S-10)/2,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle=C.G2; ctx.beginPath(); ctx.ellipse(S-6,(S-10)/2+6,4,(S-10)/2,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.stroke();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx,6); ctx.lineTo(cx,S-5); ctx.stroke();
  ctx.lineWidth=1; for(const ly of[12,17,22]){ctx.beginPath();ctx.moveTo(8,ly);ctx.lineTo(S-8,ly);ctx.stroke();}
  ctx.fillStyle=C.GOLD; ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();
}
function drawStar(ctx,x,y){
  const S=PC,cx=S/2,cy=S/2,n=5,R=S/2-3,ri=R/2; ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=C.G3; ctx.beginPath();
  for(let i=0;i<n*2;i++){const a=Math.PI*i/n-Math.PI/2,rv=i%2?ri:R; i?ctx.lineTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv):ctx.moveTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv);}
  ctx.closePath(); ctx.fill(); ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
}
function drawTrophy(ctx,x,y){
  const S=PC,cx=S/2; ctx.save(); ctx.translate(x,y);
  const pts=[[cx-S/4,S/8],[cx+S/4,S/8],[cx+S/5,S/2],[cx-S/5,S/2]];
  ctx.fillStyle=C.G4; ctx.beginPath(); pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.beginPath(); pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath(); ctx.stroke();
  // handles
  ctx.strokeStyle=C.G4; ctx.lineWidth=3;
  ctx.beginPath(); ctx.ellipse(cx-S/4+S/12,S/8+S/8,S/12,S/8,0,Math.PI*1.5,Math.PI*0.5); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx+S/4-S/12,S/8+S/8,S/12,S/8,0,Math.PI*0.5,Math.PI*1.5); ctx.stroke();
  ctx.fillStyle=C.G4; ctx.fillRect(cx-2,S/2,4,S/5);
  const bw=S/3,bx=cx-bw/2,by=S/2+S/5;
  ctx.fillStyle=C.G4; roundRect(ctx,bx,by,bw,S/8,2); ctx.fill(); ctx.strokeStyle=C.WHITE; ctx.lineWidth=1.5; ctx.stroke();
  // star on cup
  const R2=S/9,ri2=R2/2,scY=S/4,n2=5;
  ctx.fillStyle=C.GOLD; ctx.beginPath();
  for(let i=0;i<n2*2;i++){const a=Math.PI*i/n2-Math.PI/2,rv=i%2?ri2:R2;i?ctx.lineTo(cx+Math.cos(a)*rv,scY+Math.sin(a)*rv):ctx.moveTo(cx+Math.cos(a)*rv,scY+Math.sin(a)*rv);}
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
const GOAL_FNS = [drawGradCap, drawDiploma, drawStar, drawTrophy];
const goalIdx = g => (g[0]*31+g[1])%4;

// ── Bearcat ───────────────────────────────────────────────────────────────────
let bearcatImg = null;
(function loadBearcat(){
  const img=new Image(); img.crossOrigin='anonymous';
  img.onload=()=>{
    const oc=document.createElement('canvas'); oc.width=img.width; oc.height=img.height;
    const o=oc.getContext('2d'); o.drawImage(img,0,0);
    const id=o.getImageData(0,0,img.width,img.height), d=id.data;
    for(let i=0;i<d.length;i+=4) if(d[i]>200&&d[i+1]>200&&d[i+2]>200) d[i+3]=0;
    o.putImageData(id,0,0); bearcatImg=oc;
  };
  img.onerror=()=>{bearcatImg='fallback';};
  img.src='bearcat.png';
})();

function drawBearcat(ctx,px,py){
  const s=GC;
  if (bearcatImg && bearcatImg!=='fallback') { ctx.drawImage(bearcatImg,px-s/2,py-s/2,s,s); return; }
  ctx.save(); ctx.translate(px,py);
  ctx.fillStyle='#1a0800'; ctx.beginPath(); ctx.arc(0,0,s/2-1,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=C.GOLD; ctx.lineWidth=s*0.18;
  ctx.beginPath(); ctx.arc(0,s*0.1,s*0.2,Math.PI*0.25,Math.PI*1.75); ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, game, nowMs) {
  if (!wallCache) wallCache = buildWalls();
  ctx.drawImage(wallCache, 0, 0);

  // dots
  for (const k of game.dots) { const r=Math.floor(k/100),col=k%100; drawBook(ctx,col*CELL,r*CELL); }

  // power pellets
  ctx.fillStyle=C.GOLD;
  for(let r=0;r<ROWS;r++) for(let col=0;col<COLS;col++)
    if(BOARD[r][col]==='o'&&game.dots.has(ck(r,col)))
      {ctx.beginPath();ctx.arc(col*CELL+CELL/2,r*CELL+CELL/2,4,0,Math.PI*2);ctx.fill();}

  // goals (PC×PC, top-left at col*CELL - CELL/2)
  const off=CELL/2;
  for (const g of game.remaining) GOAL_FNS[goalIdx(g)](ctx, g[1]*CELL-off, g[0]*CELL-off);

  // pulsing ring on active goal
  if (game.goal) {
    const [gr,gc]=game.goal, pulse=0.92+0.18*Math.sin(nowMs*4.5/1000);
    ctx.strokeStyle=C.GOLD; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(gc*CELL+CELL/2,gr*CELL+CELL/2,CELL*1.05*pulse,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle=C.YELLOW; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(gc*CELL+CELL/2,gr*CELL+CELL/2,CELL*1.05*pulse-6,0,Math.PI*2); ctx.stroke();
  }

  // ghosts
  for (let i=0;i<game.robots.length;i++) {
    const rb=game.robots[i]; GHOST_FNS[i%4](ctx, rb.px-GC/2, rb.py-GC/2);
  }

  // player
  drawBearcat(ctx, game.player.px, game.player.py);
}

// ── Public init ───────────────────────────────────────────────────────────────
function init({canvas, numGhosts, speed, onEnd}) {
  wallCache = null;
  const ctx = canvas.getContext('2d');
  canvas.width = MAZE_W; canvas.height = MAZE_H;
  const game = new Game(numGhosts, speed);
  let raf=null, ended=false;

  const KEY_DIR = {
    ArrowUp:[-1,0], w:[-1,0], W:[-1,0],
    ArrowDown:[1,0], s:[1,0], S:[1,0],
    ArrowLeft:[0,-1], a:[0,-1], A:[0,-1],
    ArrowRight:[0,1], d:[0,1], D:[0,1],
  };

  function kdown(e){
    if(KEY_DIR[e.key]) e.preventDefault();
    if(game.status !== 'IN_PROGRESS') return;
    // pressDir on EVERY keydown (including repeats) so held direction stays current
    if(KEY_DIR[e.key]) game.player.pressDir(KEY_DIR[e.key]);
  }
  function kup(e){
    // Tell player the key was released — it will stop after finishing current cell
    if(KEY_DIR[e.key]) game.player.releaseDir(KEY_DIR[e.key]);
  }
  window.addEventListener('keydown', kdown);
  window.addEventListener('keyup',   kup);

  function loop(nowMs){
    game.update();
    drawScene(ctx, game, nowMs);
    if(window._ucHUD) window._ucHUD(game);

    if(game.status!=='IN_PROGRESS'&&!ended){
      ended=true;
      window.removeEventListener('keydown',kdown);
      window.removeEventListener('keyup',   kup);
      setTimeout(()=>onEnd&&onEnd(game), 700);
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  canvas.focus();
  return {
    game,
    stop(){
      if(raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown',kdown);
      window.removeEventListener('keyup',  kup);
    }
  };
}

return { init, MAZE_W, MAZE_H };
})();
