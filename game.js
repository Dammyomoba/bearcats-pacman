// UC Bearcats Pac-Man — Human-controlled web port of bearcat_pacman_asta_radius_2.py
// All ghost AI (sector-pinned A* hidden goals) faithfully ported from Python.
// Called with: UCPacman.init({ canvas, numGhosts, speed, playerInfo, onEnd })

window.UCPacman = (function () {

// ── Board (exact copy from Python) ─────────────────────────────────────────
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

// ── Layout ──────────────────────────────────────────────────────────────────
const CELL = 20;
const MAZE_W = COLS * CELL;
const MAZE_H = ROWS * CELL;

// ── Colours (exact Python rgb values as CSS) ────────────────────────────────
const COL = {
  BLACK:    "#000000",
  GREY:     "rgb(140,140,140)",
  WHITE:    "#ffffff",
  YELLOW:   "rgb(255,215,0)",
  GOLD:     "rgb(255,185,0)",
  DARK_GREY:"rgb(60,60,60)",
  BLUE:     "rgb(30,80,220)",
  LIGHT_BLUE:"rgb(180,210,255)",
  CREAM:    "rgb(255,250,200)",
  BROWN:    "rgb(120,70,20)",
  RED:      "rgb(226,24,54)",
  GREEN_OK: "rgb(100,220,100)",
  ORANGE:   "rgb(255,160,40)",
  G1: "rgb(50,200,50)",
  G2: "rgb(20,160,20)",
  G3: "rgb(144,238,144)",
  G4: "rgb(0,200,100)",
};

// ── Constants ───────────────────────────────────────────────────────────────
const SIM_DURATION = 60.0;
const NUM_GOALS = 4;
const GOAL_MIN_SPACING = 10;
const HIDDEN_RADIUS_MIN = 4;
const HIDDEN_RADIUS_MAX = 10;
const HIDDEN_GOAL_SPACING = 6;
const LOG_INTERVAL = 0.25;
const NEAR_MISS_PX = CELL * 1.4;
const COLLISION_PX = CELL * 0.7;
const PC = CELL * 2;
const GC = Math.floor(PC * 0.75);
const S = CELL / 20; // scale from Python's CELL=20

// ── Directions ──────────────────────────────────────────────────────────────
const UP=[-1,0], DOWN=[1,0], LEFT=[0,-1], RIGHT=[0,1], IDLE_D=[0,0];
const DIRS=[UP,DOWN,LEFT,RIGHT];
const DIR_MAP={"-1,0":"UP","1,0":"DOWN","0,-1":"LEFT","0,1":"RIGHT","0,0":"IDLE"};
const dk = d => d[0]+","+d[1];
const dirName = d => DIR_MAP[dk(d)]||"IDLE";

// ── Spawns ──────────────────────────────────────────────────────────────────
const PLAYER_SPAWN = [23, 14];
const GHOST_SPAWNS = [[14,11],[14,13],[14,14],[14,16]];
const GHOST_CORNER_SECTORS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROW_MID = Math.floor(ROWS/2), COL_MID = Math.floor(COLS/2);

// ── Walkability ──────────────────────────────────────────────────────────────
function isWalkable(r,c){
  if(r<0||r>=ROWS||c<0||c>=COLS) return false;
  return BOARD[r][c] !== '#';
}
function stepWrap(r,c,dr,dc){ return [r+dr,c+dc]; } // Python version has no wrapping

const ALL_WALKABLE = [];
for(let r=0;r<ROWS;r++)
  for(let c=0;c<COLS;c++)
    if(BOARD[r][c]!=='#'&&BOARD[r][c]!==' '&&BOARD[r][c]!=='-')
      ALL_WALKABLE.push([r,c]);

const GHOST_HOUSE = new Set();
for(let r=11;r<18;r++) for(let c=10;c<18;c++)
  if(r<ROWS&&c<COLS&&BOARD[r][c]!=='#') GHOST_HOUSE.add(r*100+c);
const GOAL_FORBIDDEN = new Set([...GHOST_HOUSE, PLAYER_SPAWN[0]*100+PLAYER_SPAWN[1]]);

// ── A* Pathfinding (exact port) ──────────────────────────────────────────────
function astar(start, goal, danger) {
  danger = danger||{};
  const sk=start[0]*100+start[1], gk=goal[0]*100+goal[1];
  if(sk===gk) return [start];
  const open=[[0,start]]; const cameFrom={}; const gScore={[sk]:0};
  while(open.length){
    open.sort((a,b)=>a[0]-b[0]);
    const[,cur]=open.shift();
    const ck=cur[0]*100+cur[1];
    if(ck===gk){
      const path=[cur]; let c2=ck;
      while(cameFrom[c2]!==undefined){c2=cameFrom[c2];path.unshift([Math.floor(c2/100),c2%100]);}
      return path;
    }
    for(const d of DIRS){
      const[nr,nc]=stepWrap(cur[0],cur[1],d[0],d[1]);
      if(!isWalkable(nr,nc)) continue;
      const nk=nr*100+nc;
      const tent=(gScore[ck]||0)+1+(danger[nk]||0);
      if(gScore[nk]===undefined||tent<gScore[nk]){
        gScore[nk]=tent; cameFrom[nk]=ck;
        open.push([tent+Math.abs(nr-goal[0])+Math.abs(nc-goal[1]),[nr,nc]]);
      }
    }
  }
  return null;
}
function astarDist(a,b){const p=astar(a,b);return p?p.length-1:Infinity;}

// ── Danger map ───────────────────────────────────────────────────────────────
function buildDanger(robots, radius=3, maxPen=8){
  const d={}; const decay=Math.floor(maxPen/(radius+1));
  for(const rb of robots){
    const cells=[[rb.r,rb.c]]; if(rb.nextCell) cells.push(rb.nextCell);
    for(const[gr,gc] of cells)
      for(let dr=-radius;dr<=radius;dr++)
        for(let dc=-radius;dc<=radius;dc++){
          const md=Math.abs(dr)+Math.abs(dc); if(md>radius) continue;
          const pr=gr+dr,pc=gc+dc; if(!isWalkable(pr,pc)) continue;
          const pen=maxPen-md*decay; if(pen<=0) continue;
          const key=pr*100+pc; if((d[key]||0)<pen) d[key]=pen;
        }
  }
  return d;
}

// ── Goal placement (port of pick_random_goals with quadrant distribution) ────
function cellQuadrant([r,c]){
  return (r<ROW_MID?0:2)+(c<COL_MID?0:1);
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}

function pickRandomGoals(){
  const pool=ALL_WALKABLE.filter(c=>!GOAL_FORBIDDEN.has(c[0]*100+c[1])&&astar(PLAYER_SPAWN,c));
  const byQuad={0:[],1:[],2:[],3:[]};
  for(const c of pool) byQuad[cellQuadrant(c)].push(c);
  for(let attempt=0;attempt<200;attempt++){
    for(const q of Object.values(byQuad)) shuffle(q);
    const chosen=[];
    for(const q of[0,1,2,3]){
      let placed=null;
      for(const cand of byQuad[q])
        if(chosen.every(g=>Math.abs(cand[0]-g[0])+Math.abs(cand[1]-g[1])>=GOAL_MIN_SPACING))
          {placed=cand;break;}
      if(!placed) break;
      chosen.push(placed);
    }
    if(chosen.length===4) return chosen;
  }
  return [0,1,2,3].map(q=>byQuad[q][Math.floor(Math.random()*byQuad[q].length)]);
}

// ── Hidden-goal placement (sector-pinned, exact port) ────────────────────────
function pickSectorHiddenGoal(center, sectorSign, takenCells, exclude=null, prevGoal=null, prevMinDist=8){
  const[cr,cc]=center, [drow,dcol]=sectorSign;
  const taken=new Set(takenCells.map(c=>c[0]*100+c[1]));
  const excKey=exclude?exclude[0]*100+exclude[1]:-1;
  const ctrKey=cr*100+cc;
  function farEnough(cell){
    if([...taken].some(tk=>{const tr=Math.floor(tk/100),tc=tk%100;return Math.abs(cell[0]-tr)+Math.abs(cell[1]-tc)<HIDDEN_GOAL_SPACING;})) return false;
    if(prevGoal&&Math.abs(cell[0]-prevGoal[0])+Math.abs(cell[1]-prevGoal[1])<prevMinDist) return false;
    return true;
  }
  function collect(rMin,rMax,sectorOnly){
    const out=[];
    for(const[r,c] of ALL_WALKABLE){
      const key=r*100+c;
      if(key===ctrKey||key===excKey||taken.has(key)) continue;
      const md=Math.abs(r-cr)+Math.abs(c-cc);
      if(md<rMin||md>rMax) continue;
      if(sectorOnly&&((r-cr)*drow<0||(c-cc)*dcol<0)) continue;
      out.push([r,c]);
    }
    return out;
  }
  // Pass 1-6 (exact Python fallback chain)
  let cands=[...collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX,true)].filter(farEnough);
  if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  for(const extra of[2,4,6,10]){
    cands=[...collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+extra,true)].filter(farEnough);
    if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  }
  cands=[...collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX,true)].filter(c=>!prevGoal||Math.abs(c[0]-prevGoal[0])+Math.abs(c[1]-prevGoal[1])>=prevMinDist);
  if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  cands=[...collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+4,false)].filter(farEnough);
  if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  cands=collect(HIDDEN_RADIUS_MIN,HIDDEN_RADIUS_MAX+8,false);
  if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  const fallback=ALL_WALKABLE.filter(c=>c[0]*100+c[1]!==ctrKey&&c[0]*100+c[1]!==excKey);
  return fallback[Math.floor(Math.random()*fallback.length)];
}

function assignHiddenGoals(robots, playerGoal){
  if(!playerGoal) return;
  const taken=[];
  const usedPath={};
  for(const rb of robots){
    if(!rb.sector){const idx=robots.indexOf(rb);rb.sector=GHOST_CORNER_SECTORS[idx%4];}
    const cell=pickSectorHiddenGoal(playerGoal,rb.sector,taken,[ rb.r,rb.c]);
    const danger=Object.keys(usedPath).length?usedPath:null;
    rb.setHiddenGoal(cell,danger);
    taken.push(cell);
    for(const pc of rb.path.slice(0,12))
      usedPath[pc[0]*100+pc[1]]=(usedPath[pc[0]*100+pc[1]]||0)+3;
  }
}

// ── Actor base ───────────────────────────────────────────────────────────────
class Actor{
  constructor(r,c){
    this.r=r;this.c=c;this.px=c*CELL+CELL/2;this.py=r*CELL+CELL/2;
    this.dir=[0,0];this.nextCell=null;
  }
  advancePixels(speed){
    const[tx,ty]=[this.nextCell[1]*CELL+CELL/2,this.nextCell[0]*CELL+CELL/2];
    const dx=tx-this.px,dy=ty-this.py,dist=Math.hypot(dx,dy);
    if(dist<=speed){
      this.px=tx;this.py=ty;this.r=this.nextCell[0];this.c=this.nextCell[1];this.nextCell=null;return true;
    }
    this.px+=speed*dx/dist;this.py+=speed*dy/dist;return false;
  }
}

// ── Human Player ─────────────────────────────────────────────────────────────
class HumanPlayer extends Actor{
  constructor(r,c){super(r,c);this.queuedDir=[0,0];}
  setDir(d){if(d[0]!==0||d[1]!==0)this.queuedDir=[d[0],d[1]];}
  step(speed){
    if(this.nextCell){
      const arrived=this.advancePixels(speed);
      if(arrived)this.nextCell=null;
      return arrived;
    }
    for(const tryd of[this.queuedDir,this.dir]){
      if(tryd[0]===0&&tryd[1]===0) continue;
      const[nr,nc]=stepWrap(this.r,this.c,tryd[0],tryd[1]);
      if(isWalkable(nr,nc)){
        this.nextCell=[nr,nc];this.dir=[tryd[0],tryd[1]];
        return this.advancePixels(speed);
      }
    }
    this.dir=[0,0];return false;
  }
}

// ── Ghost (A* sector-pinned, exact port) ─────────────────────────────────────
class Robot extends Actor{
  constructor(r,c,speed){
    super(r,c);this.speed=speed;this.exiting=true;this.dir=[-1,0];
    this.mode="EXIT";this.hiddenGoal=null;this.prevHiddenGoal=null;
    this.path=[];this.arrivals=0;this.sector=null;this.nextGoalProvider=null;
  }
  setHiddenGoal(cell,danger){
    this.hiddenGoal=cell;
    if(cell&&!this.exiting){
      const p=astar([this.r,this.c],cell,danger||{});
      this.path=p?p.slice(1):[];
    } else {this.path=[];}
  }
  _replan(danger){
    if(!this.hiddenGoal||this.exiting){this.path=[];return;}
    const p=astar([this.r,this.c],this.hiddenGoal,danger||{});
    this.path=p?p.slice(1):[];
  }
  _exitStep(){
    const nr=this.r-1,nc=this.c;
    if(isWalkable(nr,nc)){
      this.nextCell=[nr,nc];this.dir=[-1,0];
      if(this.r-1<=11){this.exiting=false;this.mode="HUNT";this._replan();}
      return;
    }
    let tc=this.c<13?13:(this.c>14?14:this.c);
    if(tc===this.c){this.exiting=false;this.mode="HUNT";this._replan();this._stepAlongPath();return;}
    const d=tc>this.c?1:-1;this.nextCell=[this.r,this.c+d];this.dir=[0,d];
  }
  _stepAlongPath(){
    if(!this.path.length){this.mode="IDLE";this.nextCell=null;return;}
    const nxt=this.path.shift();
    const dr=nxt[0]-this.r,dc=nxt[1]-this.c;
    if(Math.abs(dr)>1||Math.abs(dc)>1){
      this.r=nxt[0];this.c=nxt[1];this.px=this.c*CELL+CELL/2;this.py=this.r*CELL+CELL/2;this.nextCell=null;return;
    }
    this.nextCell=[nxt[0],nxt[1]];this.dir=[dr,dc];this.mode="HUNT";
  }
  step(){
    if(!this.nextCell){if(this.exiting)this._exitStep();else this._stepAlongPath();}
    if(this.nextCell){
      const arrived=this.advancePixels(this.speed);
      if(arrived&&this.hiddenGoal&&this.r===this.hiddenGoal[0]&&this.c===this.hiddenGoal[1]){
        this.arrivals++;this.prevHiddenGoal=this.hiddenGoal;this.hiddenGoal=null;this.path=[];
        if(this.nextGoalProvider){
          const[newGoal,danger]=this.nextGoalProvider(this);
          if(newGoal){this.setHiddenGoal(newGoal,danger);this._stepAlongPath();if(this.nextCell)this.advancePixels(this.speed);}
          return;
        }
        this.mode="IDLE";
      }
    }
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────
class Game{
  constructor(numGhosts, speed){
    this.numGhosts=numGhosts; this.speed=speed;
    this.player=new HumanPlayer(PLAYER_SPAWN[0],PLAYER_SPAWN[1]);
    this.robots=GHOST_SPAWNS.slice(0,numGhosts).map(([r,c])=>new Robot(r,c,speed));
    for(let i=0;i<this.robots.length;i++) this.robots[i].sector=GHOST_CORNER_SECTORS[i%4];
    this.allGoals=pickRandomGoals();
    this.remaining=[...this.allGoals];
    this.collected=[];this.goal=null;this.activeIdx=0;
    this._pickNextTarget();
    assignHiddenGoals(this.robots,this.goal);
    for(const rb of this.robots) rb.nextGoalProvider=(r)=>this._pickSectorHiddenGoal(r);
    this.dots=new Set();
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
      if(BOARD[r][c]==='.') this.dots.add(r*100+c);
    this.initialDots=this.dots.size;
    this.dots.delete(PLAYER_SPAWN[0]*100+PLAYER_SPAWN[1]);
    this.score=0;this.goalsCollected=0;
    this.status="IN_PROGRESS";this.outcome="";
    this.startT=performance.now()/1000;this.lastLogT=0;
    this.collisions=0;this.nearMisses=0;this.log=[];
    this.prevRobotCells=this.robots.map(rb=>[rb.r,rb.c]);
  }
  _pickNextTarget(){
    if(!this.remaining.length){this.goal=null;return;}
    let best=null,bestD=Infinity;
    for(const g of this.remaining){const d=astarDist([this.player.r,this.player.c],g);if(d<bestD){bestD=d;best=g;}}
    this.goal=best;this.activeIdx=this.allGoals.findIndex(g=>g[0]===best[0]&&g[1]===best[1]);
  }
  _pickSectorHiddenGoal(rb){
    if(!this.goal) return[null,null];
    if(!rb.sector){rb.sector=GHOST_CORNER_SECTORS[this.robots.indexOf(rb)%4];}
    const others=this.robots.filter(o=>o!==rb&&o.hiddenGoal).map(o=>o.hiddenGoal);
    const cell=pickSectorHiddenGoal(this.goal,rb.sector,others,[rb.r,rb.c],rb.prevHiddenGoal);
    const danger={};
    for(const o of this.robots){if(o===rb) continue;for(const pc of o.path.slice(0,12)){const k=pc[0]*100+pc[1];danger[k]=(danger[k]||0)+3;}}
    return[cell,danger];
  }
  _refreshHiddenGoals(){
    for(const rb of this.robots){
      if(rb.exiting) continue;
      if(!rb.hiddenGoal&&this.goal){const[c,d]=this._pickSectorHiddenGoal(rb);if(c)rb.setHiddenGoal(c,d);}
    }
  }
  elapsed(){return performance.now()/1000-this.startT;}
  timeLeft(){return Math.max(0,SIM_DURATION-this.elapsed());}
  _checkProx(){
    let w="safe";
    for(const rb of this.robots){
      const d=Math.hypot(this.player.px-rb.px,this.player.py-rb.py);
      if(d<COLLISION_PX) return"collision";
      if(d<NEAR_MISS_PX&&w==="safe") w="near-miss";
    }
    return w;
  }
  update(){
    if(this.status!=="IN_PROGRESS") return;
    const pr=this.player.r,pc=this.player.c;
    this.player.step(this.speed);
    for(const rb of this.robots) rb.step();
    this._refreshHiddenGoals();
    const moved=this.player.r!==pr||this.player.c!==pc;
    const pk=this.player.r*100+this.player.c;
    if(moved&&this.dots.has(pk)){this.dots.delete(pk);this.score++;}
    if(moved&&this.goal&&this.player.r===this.goal[0]&&this.player.c===this.goal[1]){
      this.goalsCollected++;this.collected.push(this.goal);
      this.remaining=this.remaining.filter(g=>g[0]!==this.goal[0]||g[1]!==this.goal[1]);
      this.score+=5;this._log("goal-reached",true);
      if(!this.remaining.length){this.status="SUCCESS";this.outcome=`All ${NUM_GOALS} goals collected | Knowledge: ${this.score}`;return;}
      this._pickNextTarget();assignHiddenGoals(this.robots,this.goal);
      this.lastLogT=this.elapsed();this.prevRobotCells=this.robots.map(rb=>[rb.r,rb.c]);return;
    }
    const curRC=this.robots.map(rb=>[rb.r,rb.c]);
    const rMoved=curRC.some((c,i)=>c[0]!==this.prevRobotCells[i][0]||c[1]!==this.prevRobotCells[i][1]);
    if((moved||rMoved)&&this.remaining.length&&moved) this._pickNextTarget();
    if(moved||rMoved) this.prevRobotCells=curRC;
    const prox=this._checkProx();
    if(prox==="collision"){this.collisions++;this._log("collision",true);this.status="FAILURE";this.outcome=`Hit by obstacle | Goals: ${this.goalsCollected}/${NUM_GOALS} | Knowledge: ${this.score}`;return;}
    if(this.timeLeft()<=0){this._log(prox,true);this.status="FAILURE";this.outcome=`Time's up | Goals: ${this.goalsCollected}/${NUM_GOALS} | Knowledge: ${this.score}`;return;}
    if(moved){this._log(prox,true);this.lastLogT=this.elapsed();if(prox==="near-miss")this.nearMisses++;}
    else if(this.elapsed()-this.lastLogT>=LOG_INTERVAL){this._log(prox);this.lastLogT=this.elapsed();}
  }
  _log(outcome){
    let dist=0,gr=-1,gc=-1,active=0;
    if(this.goal){const p=astar([this.player.r,this.player.c],this.goal);dist=p?p.length-1:-1;gr=this.goal[0];gc=this.goal[1];active=this.activeIdx+1;}
    let chosen="IDLE";
    if(this.player.nextCell){const dr=this.player.nextCell[0]-this.player.r,dc=this.player.nextCell[1]-this.player.c;chosen=dirName([dr,dc]);}
    else if(this.player.queuedDir[0]!==0||this.player.queuedDir[1]!==0) chosen=dirName(this.player.queuedDir);
    const e={time_s:+this.elapsed().toFixed(3),player_row:this.player.r,player_col:this.player.c,player_dir:dirName(this.player.dir),robot_count:this.robots.length,robot_speed:this.speed,active_goal:active,goal_row:gr,goal_col:gc,dist_to_goal:dist,goals_collected:this.goalsCollected,chosen_dir:chosen,outcome,status:this.status,score:this.score};
    this.robots.forEach((rb,i)=>{
      e[`robot${i+1}_pos`]=`(${rb.r},${rb.c})`;e[`robot${i+1}_dir`]=dirName(rb.dir);
      e[`robot${i+1}_mode`]=rb.mode;e[`robot${i+1}_hidden`]=rb.hiddenGoal?`(${rb.hiddenGoal[0]},${rb.hiddenGoal[1]})`:"-";
      e[`robot${i+1}_arrivals`]=rb.arrivals;
    });
    this.log.push(e);return e;
  }
  buildCSV(firstName,lastName,mNumber){
    const maxR=this.robots.length;
    const rHeaders=[];
    for(let i=0;i<maxR;i++) rHeaders.push(`Robot${i+1}_Pos`,`Robot${i+1}_Dir`,`Robot${i+1}_Mode`,`Robot${i+1}_Hidden`,`Robot${i+1}_Arrivals`);
    const headers=["Time_s","Player_Row","Player_Col","Player_Dir","Robot_Count","Robot_Speed","Active_Goal","Goal_Row","Goal_Col","Dist_to_Goal","Goals_Collected","Chosen_Dir","Outcome","Status","Score",...rHeaders];
    const rows=[`First Name: ${firstName},Last Name: ${lastName},M Number: ${mNumber},Ghosts: ${this.numGhosts},Speed: ${this.speed}`,headers.join(",")];
    for(const e of this.log){
      const row=[e.time_s,e.player_row,e.player_col,e.player_dir,e.robot_count,e.robot_speed,e.active_goal,e.goal_row,e.goal_col,e.dist_to_goal,e.goals_collected,e.chosen_dir,e.outcome,e.status,e.score];
      for(let i=0;i<maxR;i++) row.push(e[`robot${i+1}_pos`]||"",e[`robot${i+1}_dir`]||"",e[`robot${i+1}_mode`]||"",e[`robot${i+1}_hidden`]||"",e[`robot${i+1}_arrivals`]||"");
      rows.push(row.join(","));
    }
    return rows.join("\n");
  }
}

// ── Canvas Rendering (pixel-accurate sprites from Python) ────────────────────
let wallCache=null;
function buildWallCache(ctx){
  const oc=document.createElement("canvas");oc.width=MAZE_W;oc.height=MAZE_H;
  const wc=oc.getContext("2d");
  wc.fillStyle=COL.BLACK;wc.fillRect(0,0,MAZE_W,MAZE_H);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const x=c*CELL,y=r*CELL,ch=BOARD[r][c];
    if(ch==='#'){wc.fillStyle=COL.GREY;wc.fillRect(x,y,CELL,CELL);}
    else if(ch==='-'){wc.fillStyle=COL.WHITE;wc.fillRect(x,y+Math.floor(CELL/2)-3,CELL,6);}
  }
  return oc;
}

function drawBook(ctx,x,y){
  const bw=12,bh=9,bx=x+(CELL-bw)/2,by=y+(CELL-bh)/2;
  ctx.fillStyle=COL.GREY;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,2);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(bx+bw/2,by);ctx.lineTo(bx+bw/2,by+bh);ctx.stroke();
  ctx.beginPath();ctx.moveTo(bx+2,by+3);ctx.lineTo(bx+bw-2,by+3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(bx+2,by+6);ctx.lineTo(bx+bw-2,by+6);ctx.stroke();
}

// Ghosts (GC x GC) — Python GC=15 at CELL=20
function drawClipboard(ctx,x,y){
  const C=GC,cx=C/2;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.CREAM;ctx.beginPath();ctx.roundRect(6,10,C-12,C-14,4);ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(6,10,C-12,C-14,4);ctx.stroke();
  ctx.fillStyle="rgb(180,180,180)";ctx.beginPath();ctx.roundRect(cx-7,3,14,11,4);ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=COL.DARK_GREY;ctx.beginPath();ctx.arc(cx,8,4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;
  for(const ly of[24,31,38,45]){const w=ly===45?C-22:C-16;ctx.beginPath();ctx.moveTo(10,ly);ctx.lineTo(w,ly);ctx.stroke();}
  ctx.strokeStyle=COL.RED;ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(14,22);ctx.lineTo(C-14,C-16);ctx.stroke();
  ctx.beginPath();ctx.moveTo(C-14,22);ctx.lineTo(14,C-16);ctx.stroke();
  ctx.restore();
}
function drawBuilding(ctx,x,y){
  const C=GC,cx=C/2;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.LIGHT_BLUE;ctx.fillRect(8,20,C-16,C-22);
  ctx.strokeStyle=COL.BLUE;ctx.lineWidth=2;ctx.strokeRect(8,20,C-16,C-22);
  ctx.fillStyle=COL.BLUE;ctx.beginPath();ctx.moveTo(4,21);ctx.lineTo(C-4,21);ctx.lineTo(cx,4);ctx.closePath();ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,21);ctx.lineTo(C-4,21);ctx.lineTo(cx,4);ctx.closePath();ctx.stroke();
  for(const wy of[Math.round(26*GC/48),Math.round(37*GC/48)])
    for(const wx of[Math.round(13*GC/48),Math.round(26*GC/48)]){
      ctx.fillStyle=COL.YELLOW;ctx.fillRect(wx,wy,Math.round(8*GC/48),Math.round(8*GC/48));
      ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=1;ctx.strokeRect(wx,wy,Math.round(8*GC/48),Math.round(8*GC/48));
    }
  ctx.fillStyle=COL.BROWN;ctx.fillRect(cx-3,C-14,6,10);
  ctx.fillStyle=COL.RED;ctx.font=`bold ${Math.round(GC*0.45)}px Courier New`;ctx.textAlign="center";ctx.fillText("$",cx,C-Math.round(GC*0.25));
  ctx.restore();
}
function drawClock(ctx,x,y){
  const C=GC,cx=C/2,cy=C/2,r=C/2-3;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.WHITE;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=1;
  for(let deg=0;deg<360;deg+=30){const a=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(cx+(r-1)*Math.cos(a),cy-(r-1)*Math.sin(a));ctx.lineTo(cx+(r-4)*Math.cos(a),cy-(r-4)*Math.sin(a));ctx.stroke();}
  ctx.strokeStyle=COL.BLACK;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx-7*Math.cos(Math.PI/3),cy+7*Math.sin(Math.PI/3));ctx.stroke();
  ctx.strokeStyle=COL.RED;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+r*0.65*Math.cos(0.1),cy-r*0.65*Math.sin(0.1));ctx.stroke();
  ctx.fillStyle=COL.RED;ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawExam(ctx,x,y){
  const C=GC,cx=C/2;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.WHITE;ctx.beginPath();ctx.roundRect(6,4,C-12,C-8,4);ctx.fill();
  ctx.strokeStyle=COL.DARK_GREY;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(6,4,C-12,C-8,4);ctx.stroke();
  ctx.fillStyle=COL.RED;ctx.fillRect(6,4,C-12,9);
  ctx.fillStyle=COL.WHITE;ctx.font=`bold ${Math.round(C*0.35)}px Courier New`;ctx.textAlign="center";ctx.fillText("EXAM",cx,4+9-1);
  ctx.strokeStyle="rgb(180,180,180)";ctx.lineWidth=1;
  for(const ly of[Math.round(C*0.5),Math.round(C*0.62),Math.round(C*0.74),Math.round(C*0.86)]){ctx.beginPath();ctx.moveTo(10,ly);ctx.lineTo(C-8,ly);ctx.stroke();}
  ctx.fillStyle=COL.RED;ctx.font=`bold ${Math.round(C*0.65)}px Courier New`;ctx.textAlign="left";ctx.fillText("F",C-Math.round(C*0.38),C-2);
  ctx.restore();
}

// Goals (PC x PC = 40x40)
function drawGradCap(ctx,x,y){
  const C=PC,cx=C/2,cy=C/2;ctx.save();ctx.translate(x,y);
  const pts=[[cx-C/3,cy-2],[cx+C/3,cy-2],[cx+C/3,cy+4],[cx-C/3,cy+4]];
  ctx.fillStyle=COL.G1;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
  const top=[[cx,cy-C/3],[cx+C/4,cy-2],[cx,cy+2],[cx-C/4,cy-2]];
  ctx.fillStyle=COL.G1;ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
  ctx.fillStyle=COL.G1;ctx.beginPath();ctx.ellipse(cx,cy+C/8+2,C/4,C/8,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle=COL.GOLD;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx+C/3,cy);ctx.lineTo(cx+C/3+7,cy+C/4);ctx.stroke();
  ctx.fillStyle=COL.GOLD;ctx.beginPath();ctx.arc(cx+C/3+7,cy+C/4,5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawDiploma(ctx,x,y){
  const C=PC,cx=C/2,cy=C/2;ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.G2;ctx.beginPath();ctx.roundRect(6,9,C-12,C-15,5);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=COL.G2;ctx.beginPath();ctx.ellipse(7,8+(C-13)/2,5,(C-13)/2,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=COL.G2;ctx.beginPath();ctx.ellipse(C-7,8+(C-13)/2,5,(C-13)/2,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,9);ctx.lineTo(cx,C-7);ctx.stroke();
  ctx.lineWidth=1;for(const ly of[16,22,28]){ctx.beginPath();ctx.moveTo(10,ly);ctx.lineTo(C-12,ly);ctx.stroke();}
  ctx.fillStyle=COL.GOLD;ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=1;ctx.stroke();ctx.restore();
}
function drawStar(ctx,x,y){
  const C=PC,cx=C/2,cy=C/2,n=5,R=C/2-3,ri=R/2;ctx.save();ctx.translate(x,y);
  ctx.fillStyle=COL.G3;ctx.beginPath();
  for(let i=0;i<n*2;i++){const a=Math.PI*i/n-Math.PI/2,rv=i%2?ri:R;i?ctx.lineTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv):ctx.moveTo(cx+Math.cos(a)*rv,cy+Math.sin(a)*rv);}
  ctx.closePath();ctx.fill();ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=1;
  for(const deg of[45,135,225,315]){const a=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*0.6*Math.cos(a),cy+R*0.6*Math.sin(a));ctx.stroke();}
  ctx.restore();
}
function drawTrophy(ctx,x,y){
  const C=PC,cx=C/2;ctx.save();ctx.translate(x,y);
  const pts=[[cx-C/4,C/8],[cx+C/4,C/8],[cx+C/5,C/2],[cx-C/5,C/2]];
  ctx.fillStyle=COL.G4;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
  ctx.strokeStyle=COL.G4;ctx.lineWidth=4;
  ctx.beginPath();ctx.ellipse(cx-C/4+C/12,C/8+C/8,C/12,C/8,0,Math.PI*1.5,Math.PI*0.5);ctx.stroke();
  ctx.beginPath();ctx.ellipse(cx+C/4-C/12,C/8+C/8,C/12,C/8,0,Math.PI*0.5,Math.PI*1.5);ctx.stroke();
  ctx.fillStyle=COL.G4;ctx.fillRect(cx-3,C/2,6,C/5);
  const bw=C/3,bx=cx-bw/2,by=C/2+C/5;
  ctx.fillStyle=COL.G4;ctx.beginPath();ctx.roundRect(bx,by,bw,C/8,3);ctx.fill();
  ctx.strokeStyle=COL.WHITE;ctx.lineWidth=2;ctx.stroke();
  const n=5,R2=C/9,ri2=R2/2,sc=C/2;
  ctx.fillStyle=COL.GOLD;ctx.beginPath();
  for(let i=0;i<n*2;i++){const a=Math.PI*i/n-Math.PI/2,rv=i%2?ri2:R2;i?ctx.lineTo(cx+Math.cos(a)*rv,sc/2+Math.sin(a)*rv):ctx.moveTo(cx+Math.cos(a)*rv,sc/2+Math.sin(a)*rv);}
  ctx.closePath();ctx.fill();ctx.restore();
}

const GOAL_FNS=[drawGradCap,drawDiploma,drawStar,drawTrophy];
const goalSpriteIdx=g=>(g[0]*31+g[1])%4;

// Bearcat (loaded from PNG, white→transparent)
let bearcatCanvas=null;
function loadBearcat(){
  const img=new Image();img.crossOrigin="anonymous";
  img.onload=()=>{
    const oc=document.createElement("canvas");oc.width=img.width;oc.height=img.height;
    const oc2=oc.getContext("2d");oc2.drawImage(img,0,0);
    const id=oc2.getImageData(0,0,img.width,img.height),d=id.data;
    for(let i=0;i<d.length;i+=4) if(d[i]>200&&d[i+1]>200&&d[i+2]>200)d[i+3]=0;
    oc2.putImageData(id,0,0);bearcatCanvas=oc;
  };
  img.onerror=()=>{bearcatCanvas="fallback";};
  img.src="bearcat.png";
}
loadBearcat();

function drawBearcat(ctx,px,py){
  const s=GC;
  if(bearcatCanvas&&bearcatCanvas!=="fallback"){ctx.drawImage(bearcatCanvas,px-s/2,py-s/2,s,s);return;}
  // Fallback: UC C ring
  ctx.save();ctx.translate(px,py);
  ctx.fillStyle="#1a0800";ctx.beginPath();ctx.arc(0,0,s/2-1,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=COL.GOLD;ctx.lineWidth=s*0.18;ctx.beginPath();ctx.arc(0,s*0.15,s*0.22,Math.PI*0.2,Math.PI*1.8);ctx.stroke();
  ctx.restore();
}

function drawScene(ctx,game,nowMs){
  if(!wallCache) wallCache=buildWallCache(ctx);
  ctx.drawImage(wallCache,0,0);
  // dots
  for(const dk of game.dots){const dr=Math.floor(dk/100),dc=dk%100;drawBook(ctx,dc*CELL,dr*CELL);}
  // power pellets
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
    if(BOARD[r][c]==='o'&&game.dots.has(r*100+c)){ctx.fillStyle=COL.GOLD;ctx.beginPath();ctx.arc(c*CELL+CELL/2,r*CELL+CELL/2,4,0,Math.PI*2);ctx.fill();}
  // goals
  const off=CELL/2;
  for(const g of game.remaining) GOAL_FNS[goalSpriteIdx(g)](ctx,g[1]*CELL-off,g[0]*CELL-off);
  // pulsing ring on active goal
  if(game.goal){
    const[gr,gc]=game.goal,pulse=0.92+0.18*Math.sin(nowMs*4.5/1000);
    ctx.strokeStyle=COL.GOLD;ctx.lineWidth=4;ctx.beginPath();ctx.arc(gc*CELL+CELL/2,gr*CELL+CELL/2,CELL*1.05*pulse,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=COL.YELLOW;ctx.lineWidth=2;ctx.beginPath();ctx.arc(gc*CELL+CELL/2,gr*CELL+CELL/2,CELL*1.05*pulse-6,0,Math.PI*2);ctx.stroke();
  }
  // ghosts
  const gfns=[drawClipboard,drawBuilding,drawClock,drawExam];
  for(let i=0;i<game.robots.length;i++){const rb=game.robots[i];gfns[i%4](ctx,rb.px-GC/2,rb.py-GC/2);}
  // player
  drawBearcat(ctx,game.player.px,game.player.py);
}

// ── Public API ───────────────────────────────────────────────────────────────
function init({canvas, numGhosts, speed, playerInfo, onEnd}){
  wallCache=null; // reset cache for each new game
  const ctx=canvas.getContext("2d");
  canvas.width=MAZE_W; canvas.height=MAZE_H;
  const game=new Game(numGhosts,speed);
  const heldKeys=new Set();
  let raf=null,ended=false;

  function keydown(e){
    const prevent=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "];
    if(prevent.includes(e.key))e.preventDefault();
    heldKeys.add(e.key);
  }
  function keyup(e){heldKeys.delete(e.key);}
  window.addEventListener("keydown",keydown);
  window.addEventListener("keyup",keyup);

  function loop(nowMs){
    // Feed held direction
    let hdir=[0,0];
    if(heldKeys.has("ArrowUp")||heldKeys.has("w")||heldKeys.has("W")) hdir=[-1,0];
    else if(heldKeys.has("ArrowDown")||heldKeys.has("s")||heldKeys.has("S")) hdir=[1,0];
    else if(heldKeys.has("ArrowLeft")||heldKeys.has("a")||heldKeys.has("A")) hdir=[0,-1];
    else if(heldKeys.has("ArrowRight")||heldKeys.has("d")||heldKeys.has("D")) hdir=[0,1];
    if(hdir[0]!==0||hdir[1]!==0) game.player.setDir(hdir);

    game.update();
    drawScene(ctx,game,nowMs);
    // HUD
    if(window._ucHUDUpdate) window._ucHUDUpdate(game);

    if(game.status!=="IN_PROGRESS"&&!ended){
      ended=true;
      window.removeEventListener("keydown",keydown);
      window.removeEventListener("keyup",keyup);
      setTimeout(()=>onEnd&&onEnd(game),700);
      return;
    }
    raf=requestAnimationFrame(loop);
  }
  raf=requestAnimationFrame(loop);
  canvas.focus();
  return {game, stop:()=>{if(raf)cancelAnimationFrame(raf);window.removeEventListener("keydown",keydown);window.removeEventListener("keyup",keyup);}};
}

return { init, MAZE_W, MAZE_H, COL };
})();
