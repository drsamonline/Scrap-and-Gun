
(()=>{'use strict';
// Guard browser storage: private browsing, quota limits, or malformed persisted values must not prevent boot.
const safeStore=(()=>{let backing=null;try{backing=globalThis.localStorage;}catch(_){}return{
 getItem(k){try{return backing?backing.getItem(k):null;}catch(_){return null;}},
 setItem(k,v){try{if(backing){backing.setItem(k,String(v));return true;}}catch(err){try{console.warn('Storage write unavailable:',err);}catch(_){}}return false;},
 removeItem(k){try{if(backing){backing.removeItem(k);return true;}}catch(err){try{console.warn('Storage removal unavailable:',err);}catch(_){}}return false;}
};})();
function readStoredJSON(key,fallback){try{const raw=safeStore.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch(_){return fallback;}}
/* SCRAP & GUN enhanced package. FEAT F73-F77: roguelite draft, time-loop rewind, bullet-hell boss, rhythm bonus, local co-op. */
// ===== SETUP =====
const cv=document.getElementById('game');
let g=cv.getContext('2d');
const visibleG=g,offscreenCanvas=document.createElement('canvas');
const W=960,PH=640,GY=40,TILE=40,COLS=24,ROWS=16;
let BH=40,hudScale=1,hudCompact=false,buildRects=[],nextRect=null;
cv.width=W;cv.height=GY+PH+BH;offscreenCanvas.width=W;offscreenCanvas.height=GY+PH+BH;
const offscreenG=offscreenCanvas.getContext('2d');g.imageSmoothingEnabled=false;offscreenG.imageSmoothingEnabled=false;

const C={bg:'#0a0f16',grid:'#121b26',line:'#182634',player:'#3ee6c4',
  core:'#ff4fa3',coreD:'#5c1038',turret:'#4dc3ff',turretD:'#123a4e',
  wall:'#8b9bad',wallD:'#3d4855',gen:'#ffcc33',genD:'#4a3a0c',
  text:'#c8d6e5',dim:'#5a6b80',panel:'#0d141d',edge:'#1c2a3a',bullet:'#ffe066'};

// ===== SETTINGS =====
const SK='sg_set';
const META_KEY='sg_meta_v1';
let meta=readStoredJSON(META_KEY,{});if(!meta||typeof meta!=='object'||Array.isArray(meta))meta={};
meta={cores:Number.isFinite(+meta.cores)?Math.max(0,+meta.cores):0,tree:{turret:0,scrap:0,smg:0,dash:0,shield:0,...(meta.tree&&typeof meta.tree==='object'?meta.tree:{})},codex:Array.isArray(meta.codex)?meta.codex:[],bestEndless:+(safeStore.getItem('sg_best_endless')||0)};
function saveMeta(){safeStore.setItem(META_KEY,JSON.stringify(meta));}
let selectedMap='arena',selectedMode='normal',activeMutators=[],dailySeed=new Date().toDateString(),waveRng=1;
function seededRand(){waveRng=(waveRng*1664525+1013904223)>>>0;return waveRng/4294967296;}
// Gameplay randomness is seeded in Daily mode; cosmetic randomness remains independent.
function gameplayRand(){return selectedMode==='daily'?seededRand():Math.random();}
function seedFromString(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mutatorScoreMult(){return activeMutators.reduce((m,k)=>m*(({noTurrets:1.25,oneLife:1.5,pistolOnly:2,speedrun:1.5,glassCannon:1.5})[k]||1),1);}
function isMutator(k){return activeMutators.includes(k);}
let settings=readStoredJSON(SK,{});if(!settings||typeof settings!=='object'||Array.isArray(settings))settings={};
settings={volume:settings.volume??.7,shake:settings.shake??true,scan:settings.scan??true,scanIntensity:settings.scanIntensity??35,palette:settings.palette||'default',theme:settings.theme||'default',reducedMotion:settings.reducedMotion??false,musicEnabled:settings.musicEnabled??true,announcer:settings.announcer??true,curvature:settings.curvature??false,chromatic:settings.chromatic??false,pixelFont:settings.pixelFont??true,showFps:settings.showFps??false,muted:settings.muted??false,keybinds:{up:'w',down:'s',left:'a',right:'d',prev:'q',next:'e',bomb:'f',dash:'shift',wave:' ',...(settings.keybinds&&typeof settings.keybinds==='object'?settings.keybinds:{})}};
const DEFAULT_BINDS={up:'w',down:'s',left:'a',right:'d',prev:'q',next:'e',bomb:'f',dash:'shift',wave:' '};
let bossIntro=null,frameTimes=[],fpsValue=0,saveAvailable=!!safeStore.getItem('sg_run_save'),fixedAccumulator=0;
let P2=null,coopEnabled=false,rhythmBeatFlash=0,rogueDraft=null,timeLoopSnapshot=null,timeLoopUsed=false,timeLoopDeclined=false;
let waitingForBind=null,settingsScroll=0,settingsRows=[],sellTarget=null,sellHold=0,sellPreview=0,spaceHold=0,hitMarkers=[],runHistory=readStoredJSON('sg_history',[]),achievements=readStoredJSON('sg_achievements',[]),achievementToast=null,runStats={shots:0,playerDamage:0,coreStart:1200,buildings:0,killPoints:0,comboPoints:0,wavePoints:0};
if(!Array.isArray(runHistory))runHistory=[];if(!Array.isArray(achievements))achievements=[];
const ACHIEVEMENTS=[['firstBlood','First Blood'],['spree','Spree'],['bossSlayer','Boss Slayer'],['wave10','Wave 10'],['wave25','Wave 25'],['wave50','Wave 50'],['architect','Architect'],['hoarder','Hoarder'],['demolisher','Demolisher'],['fatStack','Fat Stack'],['survivor','Survivor'],['flawless','Flawless Wave'],['pacifist','Pacifist Wave'],['speedrun','Speedrun'],['untouchable','Untouchable'],['completionist','Completionist'],['mutatorMaster','Mutator Master']];
const ROGUE_CARDS=[
{id:'turretRate',name:'Overclocked Servos',desc:'Turrets fire 15% faster.',color:'#4dc3ff'}, {id:'killHeal',name:'Blood Dividend',desc:'Heal 10 HP per kill.',color:'#3ee6c4'}, {id:'dashHalf',name:'Phase Capacitor',desc:'Dash cooldown is halved.',color:'#b06bff'}, {id:'genDouble',name:'Resource Surge',desc:'Generators produce double scrap for 1 wave.',color:'#ffcc33'}, {id:'shotgunPellet',name:'Scatter Matrix',desc:'Shotgun fires +1 pellet.',color:'#ff9f43'}, {id:'damage',name:'Hot Loads',desc:'All player weapons deal +12% damage.',color:'#ff5d5d'}, {id:'maxHp',name:'Reinforced Suit',desc:'Maximum HP +20; heal 20 HP.',color:'#3ee6c4'}, {id:'speed',name:'Kinetic Weave',desc:'Movement speed +8%.',color:'#4dc3ff'}, {id:'scrap',name:'Salvage Magnet',desc:'Gain 40 scrap immediately.',color:'#ffcc33'}, {id:'turretDamage',name:'Dense Ammunition',desc:'Turrets deal +15% damage.',color:'#4dc3ff'}, {id:'wallHp',name:'Fortified Alloy',desc:'Current and future walls gain +25% HP.',color:'#8b9bad'}, {id:'coreRegen',name:'Core Nanites',desc:'Restore 50 core HP.',color:'#ff4fa3'}, {id:'pickupRadius',name:'Magnetic Field',desc:'Power-up attraction radius doubled.',color:'#b06bff'}, {id:'rapidStart',name:'Trigger Discipline',desc:'Start each wave with 3s rapid fire.',color:'#ff9f43'}, {id:'shield',name:'Emergency Shield',desc:'Gain one shield charge.',color:'#4dc3ff'}, {id:'bulletSpeed',name:'Hypervelocity',desc:'Player bullets travel 15% faster.',color:'#ffe066'}, {id:'bombDamage',name:'Volatile Payload',desc:'Bomb damage +25%.',color:'#ff9f43'}, {id:'enemySlow',name:'Gravitic Pulse',desc:'Enemies move 5% slower.',color:'#b06bff'}, {id:'comboTime',name:'Combo Memory',desc:'Combo timer lasts twice as long.',color:'#ffcc33'}, {id:'waveHeal',name:'Field Medic',desc:'Heal 15 HP after each cleared wave.',color:'#3ee6c4'}, {id:'crit',name:'Weakpoint Finder',desc:'10% chance for double damage.',color:'#ff5d5d'}, {id:'playerShield',name:'Reactive Plating',desc:'Take 8% less player damage.',color:'#4dc3ff'}
];
function rogueCount(id){return S?.rogue?.[id]||0;}
// [FEAT-F73] Three-card draft drawn from 22 stacking run-only upgrades.
function pickRogueDraft(){const pool=ROGUE_CARDS.filter(c=>c.id!=='genDouble'||!S.genDoubleWave);const chosen=[];while(chosen.length<3&&pool.length){const i=Math.floor(gameplayRand()*pool.length);chosen.push(pool.splice(i,1)[0]);}rogueDraft=chosen;S.rogueDraft=chosen.map(c=>c.id);S.screen='draft';}
const paletteColors={default:{red:'#ff5d5d',green:'#3ee6c4',blue:'#4dc3ff'},deuteranopia:{red:'#e69f00',green:'#56b4e9',blue:'#0072b2'},protanopia:{red:'#cc79a7',green:'#56b4e9',blue:'#0072b2'}};
// [FEAT-F60] Four selectable palettes applied to field, HUD, buildings and enemy colors.
const THEMES={
 default:{bg:'#0a0f16',grid:'#121b26',line:'#182634',player:'#3ee6c4',core:'#ff4fa3',coreD:'#5c1038',turret:'#4dc3ff',turretD:'#123a4e',wall:'#8b9bad',wallD:'#3d4855',gen:'#ffcc33',genD:'#4a3a0c',text:'#c8d6e5',dim:'#5a6b80',panel:'#0d141d',edge:'#1c2a3a',bullet:'#ffe066',red:'#ff5d5d',orange:'#ff9f43',purple:'#b06bff'},
 gameboy:{bg:'#0f380f',grid:'#306230',line:'#0f380f',player:'#8bac0f',core:'#306230',coreD:'#0f380f',turret:'#9bbc0f',turretD:'#306230',wall:'#8bac0f',wallD:'#306230',gen:'#9bbc0f',genD:'#306230',text:'#9bbc0f',dim:'#306230',panel:'#0f380f',edge:'#306230',bullet:'#c4f000',red:'#306230',orange:'#8bac0f',purple:'#306230'},
 amber:{bg:'#120d05',grid:'#211707',line:'#392607',player:'#ffbd45',core:'#ff8c00',coreD:'#4b2600',turret:'#ffcc66',turretD:'#4b2600',wall:'#b38a45',wallD:'#4a3514',gen:'#ffd27a',genD:'#4b2600',text:'#ffdca0',dim:'#98703a',panel:'#171005',edge:'#4a3514',bullet:'#fff0b0',red:'#ff8c00',orange:'#d97706',purple:'#e6a23c'},
 cyberpunk:{bg:'#09051a',grid:'#160d2b',line:'#2c1644',player:'#00f5ff',core:'#ff2bd6',coreD:'#4b0c4d',turret:'#00f5ff',turretD:'#10354a',wall:'#8d7cff',wallD:'#30245b',gen:'#ff4fd8',genD:'#4a1240',text:'#e8d9ff',dim:'#8b72b9',panel:'#110a20',edge:'#35204c',bullet:'#f8ff66',red:'#ff4f9a',orange:'#ff9f43',purple:'#b06bff'}
};
function applyTheme(){spriteVersion++;const t=THEMES[settings.theme]||THEMES.default;for(const k of Object.keys(t))if(k in C)C[k]=t[k];ENM.grunt.color=t.red;ENM.runner.color=t.orange;ENM.tank.color=t.purple;ENM.boss.color=t.gen;ENM.healer.color=t.player;ENM.shooter.color=t.turret;ENM.splitter.color=t.core;ENM.bomber.color=t.orange;ENM.shielded.color=t.wall;ENM.flyer.color=t.turret;for(const k of Object.keys(BLD))if(BLD[k]){if(k==='turret'||k==='sniper'||k==='tesla'||k==='mortar')BLD[k].color=k==='sniper'?t.text:k==='tesla'?t.purple:k==='mortar'?t.orange:t.turret;else if(k==='wall')BLD[k].color=t.wall;else if(k==='gen')BLD[k].color=t.gen;}if(typeof E!=='undefined'&&Array.isArray(E))for(const e of E){e.color=e.type==='boss'?(e.bossKind==='charger'?t.orange:e.bossKind==='summoner'?t.turret:e.bossKind==='splitter-boss'?t.purple:e.bossKind==='bullet-hell'?'#ff2bd6':t.gen):(ENM[e.type]?.color||e.color);}}
function applyPalette(){applyTheme();const pal=paletteColors[settings.palette]||paletteColors.default;if(settings.palette==='default')return;ENM.grunt.color=pal.red;ENM.runner.color=pal.red;ENM.healer.color=pal.green;ENM.flyer.color=pal.blue;C.player=pal.green;C.turret=pal.blue;}
function unlockAchievement(id,label){if(achievements.includes(id))return;achievements.push(id);safeStore.setItem('sg_achievements',JSON.stringify(achievements));achievementToast={label:label||id,life:3};sfx(900,.12,'triangle',.05,1300);}
function saveRun(){const rec={wave:S.wave,score:S.score,kills:S.kills,date:new Date().toISOString(),mode:selectedMode};runHistory.unshift(rec);runHistory=runHistory.slice(0,10);safeStore.setItem('sg_history',JSON.stringify(runHistory));}
function pollGamepad(){if(!navigator.getGamepads)return;const gp=Array.from(navigator.getGamepads()).find(Boolean);if(!gp)return;const dz=v=>Math.abs(v)<.2?0:v;const lx=dz(gp.axes[0]||0),ly=dz(gp.axes[1]||0);keys.gamepadX=lx;keys.gamepadY=ly;if(gp.buttons[7]?.value>.25)mouse.down=true;else if(gp.buttons[7]?._sgWas&& !touchFire)mouse.down=false;if(gp.buttons[0]?.pressed&&!gp.buttons[0]._sgWas)tryDash();if(gp.buttons[1]?.pressed&&!gp.buttons[1]._sgWas)tryBomb();if(gp.buttons[4]?.pressed&&!gp.buttons[4]._sgWas)cycleWeapon(-1);if(gp.buttons[5]?.pressed&&!gp.buttons[5]._sgWas)cycleWeapon(1);gp.buttons.forEach(b=>{if(b)b._sgWas=b.pressed;});if(Math.hypot(dz(gp.axes[2]||0),dz(gp.axes[3]||0))>.2){const ax=dz(gp.axes[2]),ay=dz(gp.axes[3]);mouse.x=P.x+ax*300;mouse.y=GY+P.y+ay*300;}}
let touchFire=false,touchAim=null,touchMove=null,touchAction=null,pendingPlace=null,pendingTap=null,wpnRect=null,portraitDismissed=false;
function isTouchDevice(){return ('ontouchstart' in window)||navigator.maxTouchPoints>0;}
function sellBuilding(b){if(!b||b===core||b.type==='rock')return;S.scrap+=Math.floor((BLD[b.type]?.cost||0)*.5);S.demolitions=(S.demolitions||0)+1;if(S.demolitions>=20)unlockAchievement('demolisher','DEMOLISHER');removeBuilding(b);sellTarget=null;sellHold=0;sellPreview=0;}
const saveSettings=()=>safeStore.setItem(SK,JSON.stringify(settings));
const scanEl=document.getElementById('scan');
scanEl.style.display=settings.scan?'block':'none';scanEl.style.opacity=String(settings.scanIntensity/100);applyCRTOptions();
// [FEAT-F78] Portrait gate + mobile controls. The rotate overlay and its dismiss button are optional DOM elements.
const rotateEl=document.getElementById('rotate');const rotateSkipEl=document.getElementById('rotateSkip');
if(rotateSkipEl)rotateSkipEl.addEventListener('click',e=>{e.preventDefault();portraitDismissed=true;if(rotateEl)rotateEl.hidden=true;});

// ===== AUDIO =====
// [FEAT-F46] Procedural 8-bar chiptune tracks; [F47] boss variant and crossfade.
let actx=null,muted=!!settings.muted,musicBus=null,musicNode=null,musicTrack='off',musicStep=0,musicNextAt=0,musicTimer=null,duckTimer=null,footstepT=0,lastFootX=0,lastFootY=0,hurtVariant=0,uiLastAt=0;
const MUSIC={
 build:{tempo:90,lead:[0,392,0,440,0,523,0,440,0,392,0,330,0,392,0,330,0,392,0,440,0,523,0,587,0,523,0,440,0,392,0,330],bass:[110,0,110,0,130.81,0,130.81,0,146.83,0,146.83,0,98,0,98,0,110,0,110,0,130.81,0,130.81,0,146.83,0,146.83,0,98,0,98,0]},
 combat:{tempo:140,lead:[0,0,392,0,0,466,0,392,0,0,349,0,0,392,0,311,0,0,392,0,0,466,0,523,0,0,466,0,0,392,0,311],bass:[82.41,0,82.41,0,98,0,98,0,73.42,0,73.42,0,82.41,0,82.41,0,65.41,0,65.41,0,73.42,0,73.42,0,82.41,0,82.41,0,61.74,0,61.74,0]},
 boss:{tempo:160,lead:[0,311,0,370,0,415,0,311,0,277,0,370,0,415,0,466,0,311,0,370,0,415,0,311,0,277,0,233,0,277,0,311],bass:[77.78,0,77.78,0,92.5,0,92.5,0,69.3,0,69.3,0,77.78,0,77.78,0,58.27,0,58.27,0,69.3,0,69.3,0,77.78,0,77.78,0,55,0,55,0]}
};
function initAudio(){
  if(!actx){try{actx=new(window.AudioContext||window.webkitAudioContext)();musicBus=actx.createGain();musicBus.gain.value=.22*settings.volume;musicBus.connect(actx.destination);}catch(e){return;}}
  if(actx.state==='suspended')actx.resume();
  if(!musicTimer)musicTimer=setInterval(tickMusic,25);
  if(settings.musicEnabled&&!muted&&musicTrack==='off')setMusicTrack('build');
}
function makeNoiseBuffer(duration=.05){const length=Math.max(1,Math.floor(actx.sampleRate*duration)),buffer=actx.createBuffer(1,length,actx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);return buffer;}
function routeSpatial(sourceX,center=false){if(!actx)return actx?.destination; if(center||sourceX==null)return actx.destination;const pan=clamp(((sourceX-(P?.x??W/2))/W),-1,1)*.6;if(actx.createStereoPanner){const p=actx.createStereoPanner();p.pan.value=pan;return p;}const split=actx.createChannelSplitter(2),merger=actx.createChannelMerger(2),lg=actx.createGain(),rg=actx.createGain();lg.gain.value=Math.sqrt((1-pan)/2);rg.gain.value=Math.sqrt((1+pan)/2);split.connect(lg,0);split.connect(rg,1);lg.connect(merger,0,0);rg.connect(merger,0,1);merger.connect(actx.destination);return {input:split};}
function sfx(f,d,t='square',v=.05,st,sourceX,center=false){
  if(!actx||muted||settings.volume<=0)return;
  const tm=actx.currentTime,o=actx.createOscillator(),gn=actx.createGain();
  o.type=t;const jitter=1+(Math.random()-.5)*.1;o.frequency.setValueAtTime(Math.max(20,f*jitter),tm);
  if(st)o.frequency.exponentialRampToValueAtTime(Math.max(20,st*jitter),tm+d);
  const vol=v*settings.volume;gn.gain.setValueAtTime(vol,tm);gn.gain.exponentialRampToValueAtTime(.0001,tm+d);
  let target=actx.destination;if(sourceX!=null&&!center){const panValue=clamp((sourceX-(P?.x??W/2))/W,-1,1)*.6;o.connect(gn);if(actx.createStereoPanner){const pan=actx.createStereoPanner();pan.pan.value=panValue;gn.connect(pan);pan.connect(actx.destination);}else{const merger=actx.createChannelMerger(2),left=actx.createGain(),right=actx.createGain();left.gain.value=Math.sqrt((1-panValue)/2);right.gain.value=Math.sqrt((1+panValue)/2);gn.connect(left);gn.connect(right);left.connect(merger,0,0);right.connect(merger,0,1);merger.connect(actx.destination);}}else{o.connect(gn);gn.connect(target);}
  o.start(tm);o.stop(tm+d+.03);
}
function noiseSfx(d=.06,vol=.03,sourceX){if(!actx||muted||settings.volume<=0)return;const src=actx.createBufferSource(),gn=actx.createGain(),filter=actx.createBiquadFilter();src.buffer=makeNoiseBuffer(d);filter.type='highpass';filter.frequency.value=700;gn.gain.setValueAtTime(vol*settings.volume,actx.currentTime);gn.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+d);src.connect(filter);filter.connect(gn);if(sourceX!=null){const panValue=clamp((sourceX-(P?.x??W/2))/W,-1,1)*.6;if(actx.createStereoPanner){const pan=actx.createStereoPanner();pan.pan.value=panValue;gn.connect(pan);pan.connect(actx.destination);}else{const merger=actx.createChannelMerger(2),left=actx.createGain(),right=actx.createGain();left.gain.value=Math.sqrt((1-panValue)/2);right.gain.value=Math.sqrt((1+panValue)/2);gn.connect(left);gn.connect(right);left.connect(merger,0,0);right.connect(merger,0,1);merger.connect(actx.destination);}}else gn.connect(actx.destination);src.start();src.stop(actx.currentTime+d+.01);}
function playNote(freq,when,duration,type,volume,node){if(!freq||!node||!actx)return;const o=actx.createOscillator(),gn=actx.createGain();o.type=type;o.frequency.setValueAtTime(freq,when);gn.gain.setValueAtTime(.0001,when);gn.gain.linearRampToValueAtTime(volume,when+.015);gn.gain.exponentialRampToValueAtTime(.0001,when+duration);o.connect(gn);gn.connect(node.gain);o.start(when);o.stop(when+duration+.02);}
function scheduleMusicStep(when){if(!musicNode||!actx||!settings.musicEnabled||muted)return;const tr=MUSIC[musicTrack];if(!tr)return;const i=musicStep%tr.lead.length,beat=60/tr.tempo;playNote(tr.lead[i],when,beat*.72,'square',.095,musicNode);playNote(tr.bass[i],when,beat*.82,'triangle',.11,musicNode);if(i%2===0){const src=actx.createBufferSource(),filter=actx.createBiquadFilter(),gn=actx.createGain();src.buffer=makeNoiseBuffer(.045);filter.type='highpass';filter.frequency.value=6500;gn.gain.setValueAtTime(.025,when);gn.gain.exponentialRampToValueAtTime(.0001,when+.045);src.connect(filter);filter.connect(gn);gn.connect(musicNode.gain);src.start(when);src.stop(when+.05);}musicStep=(musicStep+1)%tr.lead.length;musicNextAt=when+beat;}
function tickMusic(){if(!actx||!musicNode||!settings.musicEnabled||muted||musicTrack==='off'||actx.state!=='running')return;const now=actx.currentTime;if(!musicNextAt||musicNextAt<now-.2)musicNextAt=now+.02;let n=0;while(musicNextAt<now+.09&&n++<4)scheduleMusicStep(musicNextAt);}
function setMusicTrack(name){if(name!=='off'&&!MUSIC[name])return;if(name===musicTrack&&musicNode)return;const now=actx?.currentTime||0;if(musicNode&&actx){const old=musicNode;old.gain.gain.cancelScheduledValues(now);old.gain.gain.setTargetAtTime(.0001,now,.18);setTimeout(()=>{try{old.gain.disconnect();}catch(e){}},900);}musicNode=null;musicTrack=name;musicStep=0;musicNextAt=now+.04;if(name==='off'||!actx||!settings.musicEnabled||muted)return;const gain=actx.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.setTargetAtTime(.7,now,.22);gain.connect(musicBus||actx.destination);musicNode={gain};}
function syncMusicTrack(){if(!actx||!settings.musicEnabled||muted){if(musicNode)setMusicTrack('off');return;}let desired='build';if(S?.screen==='gameover')desired='off';else if(S?.screen==='playing'&&S.phase==='combat')desired=E?.some(e=>e.type==='boss')?'boss':'combat';else if(S?.screen==='paused')desired='off';if(desired!==musicTrack)setMusicTrack(desired);}
function duckMusic(){if(!actx||!musicBus)return;const now=actx.currentTime;musicBus.gain.cancelScheduledValues(now);musicBus.gain.setTargetAtTime(.22*settings.volume*.3,now,.04);clearTimeout(duckTimer);duckTimer=setTimeout(()=>{if(!actx||!musicBus)return;const t=actx.currentTime;musicBus.gain.cancelScheduledValues(t);musicBus.gain.setTargetAtTime(.22*settings.volume,t,.3);},1500);}
// [FEAT-F54] Optional robotic announcer synthesized with oscillator, formant filter and waveshaper.
function announce(label){if(!settings.announcer||!actx||muted||settings.volume<=0)return;const now=actx.currentTime,phrase=String(label).toUpperCase(),syllables=Math.min(10,phrase.length);const shaper=actx.createWaveShaper(),curve=new Float32Array(256);for(let i=0;i<256;i++){const x=i*2/255-1;curve[i]=Math.tanh(4*x);}shaper.curve=curve;const master=actx.createGain();master.gain.value=.045*settings.volume;shaper.connect(master);master.connect(actx.destination);for(let i=0;i<syllables;i++){if(phrase[i]===' ')continue;const o=actx.createOscillator(),filter=actx.createBiquadFilter(),gate=actx.createGain(),start=now+i*.052;o.type='sawtooth';o.frequency.setValueAtTime(95+(phrase.charCodeAt(i)%13)*7,start);o.frequency.linearRampToValueAtTime(130+(phrase.charCodeAt(i)%9)*9,start+.04);filter.type='bandpass';filter.frequency.setValueAtTime(550+(phrase.charCodeAt(i)%5)*240,start);filter.Q.value=5;gate.gain.setValueAtTime(.0001,start);gate.gain.linearRampToValueAtTime(.8,start+.008);gate.gain.setValueAtTime(.8,start+.034);gate.gain.exponentialRampToValueAtTime(.0001,start+.05);o.connect(filter);filter.connect(gate);gate.connect(shaper);o.start(start);o.stop(start+.055);}setTimeout(()=>{try{shaper.disconnect();master.disconnect();}catch(e){}},900);}
// [FEAT-F55] Distinct confirm/back menu blips.
function uiClick(kind='confirm'){const now=performance.now();if(now-uiLastAt<35)return;uiLastAt=now;if(kind==='back'){sfx(360,.07,'square',.035,220);}else{sfx(680,.055,'square',.035,920);}}
// [FEAT-F48] Movement-triggered footsteps with randomized pitch.
function footstep(){sfx(150+Math.random()*80,.035,'square',.012,70+Math.random()*40,P?.x);}
// [FEAT-F49] Distinct placement timbres; [F50] rotating hurt cues; [F51] jitter is applied in sfx().
function placementSfx(type){if(type==='wall'){sfx(130,.1,'triangle',.05,60);noiseSfx(.07,.035);}else if(type==='gen'){sfx(180,.14,'sine',.035,520);sfx(440,.11,'triangle',.018,620);}else{sfx(280,.09,'square',.04,120);setTimeout(()=>sfx(680,.06,'sawtooth',.025,360),100);}}
function hurtSfx(){hurtVariant=(hurtVariant+1+Math.floor(Math.random()*2))%3;if(hurtVariant===0)sfx(180,.13,'sawtooth',.065,420,P?.x);else if(hurtVariant===1)sfx(260,.16,'triangle',.065,70,P?.x);else{noiseSfx(.12,.06,P?.x);sfx(110,.14,'sawtooth',.04,45,P?.x);}}
// ===== DEFS =====
const BLD={
  turret:{name:'TURRET',cost:55,hp:130,range:180,rate:.48,dmg:16,color:C.turret},
  wall:{name:'WALL',cost:25,hp:300,color:C.wall},
  gen:{name:'GEN',cost:70,hp:90,rate:3,color:C.gen},
  sniper:{name:'SNIPER',cost:120,hp:80,range:350,rate:1.5,dmg:55,color:'#d8efff'},
  tesla:{name:'TESLA',cost:140,hp:100,range:140,rate:1.0,dmg:12,color:'#9f8bff'},
  mortar:{name:'MORTAR',cost:100,hp:70,range:260,rate:2.0,dmg:30,color:'#ff9f43'}
};
const ENM={
  grunt:{hp:34,speed:54,dmg:9,scrap:8,r:11,color:'#ff5d5d'},
  runner:{hp:20,speed:102,dmg:6,scrap:7,r:9,color:'#ff9f43'},
  tank:{hp:150,speed:32,dmg:22,scrap:28,r:16,color:'#b06bff'},
  boss:{hp:350,speed:24,dmg:35,scrap:100,r:26,color:'#ffcc33'},
  healer:{hp:50,speed:45,dmg:5,scrap:18,r:12,color:'#4dc3ff'},
  shooter:{hp:45,speed:40,dmg:6,scrap:15,r:12,color:'#9fe6ff'},
  splitter:{hp:80,speed:50,dmg:12,scrap:20,r:14,color:'#ff4fa3'},
  bomber:{hp:25,speed:130,dmg:40,scrap:12,r:10,color:'#ff6b35'},
  shielded:{hp:60,speed:40,dmg:10,scrap:20,r:13,color:'#8b9bad'},
  flyer:{hp:40,speed:70,dmg:10,scrap:15,r:11,color:'#4dc3ff'}
};
const WPN={
  pistol:{name:'PISTOL',dmg:18,rate:.145,spread:.07,speed:920,count:1,color:'#ffe066'},
  shotgun:{name:'SHOTGUN',dmg:10,rate:.55,spread:.32,speed:800,count:5,color:'#ff9f43'},
  smg:{name:'SMG',dmg:7,rate:.07,spread:.14,speed:1050,count:1,color:'#4dc3ff'}
};
const WO=['pistol','shotgun','smg'];
const PWR={health:{color:'#3ee6c4',icon:'+'},rapid:{color:'#ff5d5d',icon:'\u26A1'},
  damage:{color:'#b06bff',icon:'\u2694'},shield:{color:'#4dc3ff',icon:'\u25C6'}};
const KILL={5:'SPREE',10:'RAMPAGE',20:'UNSTOPPABLE',30:'GODLIKE'};

// [FEAT-F02] Array-compatible pools recycle object identities while retaining push/splice loops.
class PooledArray extends Array{
  static get [Symbol.species](){return Array;}
  constructor(capacity){super();this.capacity=capacity;this.pool=Array.from({length:capacity},()=>({}));}
  push(...items){for(const item of items){if(this.length>=this.capacity){const oldest=super.splice(0,1)[0];if(oldest)this.pool.push(oldest);}
    const obj=this.pool.pop()||{};for(const k of Object.keys(obj))delete obj[k];Object.assign(obj,item);super.push(obj);}return this.length;}
  splice(start,deleteCount,...items){const removed=super.splice(start,deleteCount,...items);for(const obj of removed){if(this.pool.length<this.capacity)this.pool.push(obj);}return removed;}
  clear(){this.splice(0,this.length);}
}
// ===== STATE =====
let grid,B,E,Bu,Pt,PU,deco,decals,threats,P,core,S,keys,mouse,buildSel,flow,flowDirty;

function addRock(c,r){if(c<0||r<0||c>=COLS||r>=ROWS||grid[r][c])return;const rock={type:'rock',hp:Infinity,maxHp:Infinity,x:c*TILE+TILE/2,y:r*TILE+TILE/2,cx:c,cy:r,indestructible:true};grid[r][c]=rock;B.push(rock);}
// [FEAT-F67] Versioned resumable snapshots. Grid references and pooled arrays are rebuilt on restore.
const RUN_SAVE_KEY='sg_run_save',RUN_SAVE_VERSION=2;
const finiteIn=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
function validPoint(p){return !!p&&typeof p==='object'&&finiteIn(p.x,-W,W*2)&&finiteIn(p.y,-PH,PH*2);}
function validRunState(d){
  if(!d||typeof d!=='object'||![1,RUN_SAVE_VERSION].includes(d.version)||!d.S||typeof d.S!=='object'||!['playing','draft'].includes(d.S.screen)||!d.P||!validPoint(d.P)||!finiteIn(d.P.hp,0,1e9)||!finiteIn(d.P.maxHp,1,1e9)||!d.core||!validPoint(d.core))return false;
  if(!finiteIn(d.S.wave,0,100000)||!finiteIn(d.S.score,0,1e12)||!finiteIn(d.core.hp,0,1e9)||!finiteIn(d.core.maxHp,1,1e9))return false;
  if(!Array.isArray(d.B)||!Array.isArray(d.E)||!Array.isArray(d.Bu)||!Array.isArray(d.Pt)||!Array.isArray(d.PU)||!Array.isArray(d.decals)||!Array.isArray(d.threats))return false;
  if(d.B.length>1000||d.E.length>2000||d.Bu.length>500||d.Pt.length>800||d.PU.length>500||d.decals.length>500||d.threats.length>12)return false;
  if(!['arena','cross','maze'].includes(d.selectedMap||'arena'))return false;
  if(!['normal','daily','endless','rhythm','coop'].includes(d.selectedMode||'normal'))return false;
  if(d.P2!==null&&d.P2!==undefined&&(!validPoint(d.P2)||!finiteIn(d.P2.hp,0,1e9)||!finiteIn(d.P2.maxHp,1,1e9)))return false;
  if(!d.B.every(b=>b&&typeof b==='object'&&validPoint(b)&&Number.isInteger(b.cx)&&Number.isInteger(b.cy)&&b.cx>=0&&b.cx<COLS&&b.cy>=0&&b.cy<ROWS))return false;
  for(const k of ['E','Bu','Pt','PU','decals','threats'])if(!d[k].every(validPoint))return false;
  return true;
}
function saveMidRun(){
  if(!S||!['playing','draft'].includes(S.screen))return false;
  try{
    const data={version:RUN_SAVE_VERSION,S:{...S,screen:S.screen},P,P2,core,B,E,Bu:Array.from(Bu||[]),Pt:Array.from(Pt||[]),PU,decals,threats,runStats,selectedMap,selectedMode,dailySeed,activeMutators,waveRng,coopEnabled,timeLoopSnapshot,timeLoopUsed,timeLoopDeclined};
    const ok=safeStore.setItem(RUN_SAVE_KEY,JSON.stringify(data));saveAvailable=ok;return ok;
  }catch(err){console.warn('Could not save run:',err);saveAvailable=false;return false;}
}
function clearMidRun(){safeStore.removeItem(RUN_SAVE_KEY);saveAvailable=false;}
function loadMidRun(){
  try{
    const d=readStoredJSON(RUN_SAVE_KEY,null);if(!validRunState(d)){clearMidRun();return false;}
    selectedMap=d.selectedMap||'arena';selectedMode=d.selectedMode||'normal';if(typeof d.dailySeed==='string'&&d.dailySeed.length<80)dailySeed=d.dailySeed;P2=d.P2||null;coopEnabled=!!P2;activeMutators=Array.isArray(d.activeMutators)?d.activeMutators.filter(x=>['noTurrets','oneLife','pistolOnly','speedrun','glassCannon'].includes(x)):[];waveRng=finiteIn(d.waveRng,0,4294967295)?d.waveRng:1;
    S={...d.S,screen:d.S.screen==='draft'?'draft':'playing'};rogueDraft=Array.isArray(S.rogueDraft)?S.rogueDraft.map(id=>ROGUE_CARDS.find(c=>c.id===id)).filter(Boolean):null;P=d.P;core=d.core;B=d.B;E=d.E;Bu=new PooledArray(500);for(const v of d.Bu)Bu.push(v);Pt=new PooledArray(800);for(const v of d.Pt)Pt.push(v);PU=d.PU;decals=d.decals;threats=d.threats;runStats=d.runStats&&typeof d.runStats==='object'?d.runStats:runStats;
    // Version 1 saves remain loadable, but did not persist the wave-start rewind snapshot.
    timeLoopSnapshot=d.version>=2&&d.timeLoopSnapshot&&validRunState({...d.timeLoopSnapshot,version:2})?d.timeLoopSnapshot:null;
    timeLoopUsed=!!d.timeLoopUsed;timeLoopDeclined=!!d.timeLoopDeclined;
    grid=Array.from({length:ROWS},()=>new Array(COLS).fill(null));for(const b of B){if(b.type==='rock'||b.type)grid[b.cy][b.cx]=b;}const cc=Math.floor(core.x/TILE),cr=Math.floor(core.y/TILE);for(let r=cr;r<cr+2;r++)for(let c=cc;c<cc+2;c++)if(grid[r]&&c>=0&&c<COLS)grid[r][c]=core;
    keys={};buildSel=null;mouse={x:P.x,y:GY+P.y,down:false};flowDirty=true;flow=null;saveAvailable=true;applyPalette();return true;
  }catch(err){console.warn('Could not restore run:',err);clearMidRun();return false;}
}

function resetGame(){
  applyPalette();P2=null;coopEnabled=selectedMode==='coop';rogueDraft=null;timeLoopSnapshot=null;timeLoopUsed=false;timeLoopDeclined=false;
  grid=Array.from({length:ROWS},()=>new Array(COLS).fill(null));
  B=[];E=[];Bu=new PooledArray(500);Pt=new PooledArray(800);PU=[];decals=[];threats=[];keys={};buildSel=null;flowDirty=true;
  const corePos=selectedMap==='cross'?{x:480,y:320}:selectedMap==='maze'?{x:720,y:320}:{x:480,y:320};
  P={x:corePos.x,y:corePos.y+160,r:10,hp:100,maxHp:100,ang:-Math.PI/2,cd:0,hurt:0,speed:215,
    weapon:'pistol',invuln:0,dashCd:0,dashT:0,bombCd:0,rapidT:0,damageT:0,shield:0,recoil:0,muzzleFlash:0,crossKick:0};
  if(coopEnabled)P2={x:corePos.x+48,y:corePos.y+160,r:10,hp:100,maxHp:100,ang:-Math.PI/2,cd:0,hurt:0,speed:205,invuln:0,dashCd:0,dashT:0,weapon:'pistol',color:'#ffcc33'};
  core={type:'core',hp:1200,maxHp:1200,x:corePos.x,y:corePos.y};
  const cc=Math.floor(core.x/TILE),cr=Math.floor(core.y/TILE);for(let r=cr;r<cr+2;r++)for(let c=cc;c<cc+2;c++)grid[r][c]=core;
  if(selectedMap==='cross'){for(const [c,r] of [[10,5],[11,5],[12,5],[13,5],[10,6],[13,6],[10,9],[13,9],[10,10],[11,10],[12,10],[13,10]])addRock(c,r);}
  if(selectedMap==='maze'){for(const [c,r] of [[4,3],[5,3],[6,3],[6,4],[6,5],[9,6],[10,6],[11,6],[15,3],[15,4],[15,5],[20,7],[20,8],[20,9],[4,11],[5,11],[6,11],[9,12],[10,12],[11,12]])addRock(c,r);}
  S={screen:'title',scrap:180+50*(meta.tree.scrap||0),wave:0,phase:'build',timer:20,spawnQueue:[],
    nextQueue:null,nextMod:'',spawnCd:0,shake:0,flash:0,msg:'',msgT:0,t:0,
    kills:0,overT:0,combo:0,comboT:0,score:0,mod:'',best:+(safeStore.getItem('sg_best')||0),pathVersion:0,hitStop:0,coreHitT:0,buildingsBuilt:0,runSeed:selectedMode==='daily'?dailySeed:'',endless:selectedMode==='endless',startTime:0,runStartWave:0};
  if(isMutator('oneLife')){P.maxHp=core.maxHp;P.hp=core.hp;if(P2){P2.maxHp=core.maxHp;P2.hp=core.hp;}}
  if(isMutator('glassCannon')){P.maxHp=Math.max(1,Math.floor(P.maxHp/3));P.hp=P.maxHp;if(P2){P2.maxHp=Math.max(1,Math.floor(P2.maxHp/3));P2.hp=P2.maxHp;}}
  if((meta.tree.smg||0)>0&&!isMutator('pistolOnly'))P.weapon='smg';
  if((meta.tree.shield||0)>0)P.shield=1;
  if(selectedMode==='daily')waveRng=seedFromString(dailySeed);else waveRng=(Date.now()>>>0)||1;
  runStats={shots:0,playerDamage:0,coreStart:core.maxHp,buildings:0,killPoints:0,comboPoints:0,wavePoints:0};S.rogue={};S.genDoubleWave=0;hitMarkers=[];sellTarget=null;sellHold=0;spaceHold=0;applyPalette();deco=[];for(let i=0;i<60;i++)deco.push({x:Math.random()*W,y:Math.random()*PH,s:Math.random()<.75?2:4});decoStamp++;
  mouse={x:480,y:200,down:false};
  prepNextWave();
}

// ===== HELPERS =====
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
// [FEAT-F61] Compact procedural 5x7 bitmap font. Canvas fillText calls route through this renderer.
const PIXEL_GLYPHS={
' ':['00000','00000','00000','00000','00000','00000','00000'],
'A':['01110','10001','10001','11111','10001','10001','10001'],'B':['11110','10001','10001','11110','10001','10001','11110'],'C':['01111','10000','10000','10000','10000','10000','01111'],'D':['11110','10001','10001','10001','10001','10001','11110'],'E':['11111','10000','10000','11110','10000','10000','11111'],'F':['11111','10000','10000','11110','10000','10000','10000'],'G':['01111','10000','10000','10111','10001','10001','01111'],'H':['10001','10001','10001','11111','10001','10001','10001'],'I':['11111','00100','00100','00100','00100','00100','11111'],'J':['00111','00010','00010','00010','10010','10010','01100'],'K':['10001','10010','10100','11000','10100','10010','10001'],'L':['10000','10000','10000','10000','10000','10000','11111'],'M':['10001','11011','10101','10101','10001','10001','10001'],'N':['10001','11001','10101','10011','10001','10001','10001'],'O':['01110','10001','10001','10001','10001','10001','01110'],'P':['11110','10001','10001','11110','10000','10000','10000'],'Q':['01110','10001','10001','10001','10101','10010','01101'],'R':['11110','10001','10001','11110','10100','10010','10001'],'S':['01111','10000','10000','01110','00001','00001','11110'],'T':['11111','00100','00100','00100','00100','00100','00100'],'U':['10001','10001','10001','10001','10001','10001','01110'],'V':['10001','10001','10001','10001','10001','01010','00100'],'W':['10001','10001','10001','10101','10101','10101','01010'],'X':['10001','10001','01010','00100','01010','10001','10001'],'Y':['10001','10001','01010','00100','00100','00100','00100'],'Z':['11111','00001','00010','00100','01000','10000','11111'],
'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
'.':['00000','00000','00000','00000','00000','00110','00110'],',':['00000','00000','00000','00000','00110','00110','00100'],':':['00000','00110','00110','00000','00110','00110','00000'],';':['00000','00110','00110','00000','00110','00110','00100'],'-':['00000','00000','00000','11111','00000','00000','00000'],'_':['00000','00000','00000','00000','00000','00000','11111'],'+':['00000','00100','00100','11111','00100','00100','00000'],'/':['00001','00010','00010','00100','01000','01000','10000'],'\\':['10000','01000','01000','00100','00010','00010','00001'],'!':['00100','00100','00100','00100','00100','00000','00100'],'?':['01110','10001','00001','00010','00100','00000','00100'],'(':['00010','00100','01000','01000','01000','00100','00010'],')':['01000','00100','00010','00010','00010','00100','01000'],'[':['01110','01000','01000','01000','01000','01000','01110'],']':['01110','00010','00010','00010','00010','00010','01110'],'=':['00000','11111','00000','11111','00000','00000','00000'],'%':['11001','11010','00100','01000','10110','00110','00000'],'#':['01010','11111','01010','01010','11111','01010','00000'],'*':['00000','10101','01110','11111','01110','10101','00000'],'\'':['00100','00100','00010','00000','00000','00000','00000'],'"':['01010','01010','00100','00000','00000','00000','00000'],'|':['00100','00100','00100','00100','00100','00100','00100'],'<':['00010','00100','01000','10000','01000','00100','00010'],'>':['01000','00100','00010','00001','00010','00100','01000'],'&':['01100','10010','10010','01100','10101','10010','01101'],'\u00D7':['00000','10001','01010','00100','01010','10001','00000'],'\u25C8':['00100','01110','11111','11111','01110','00100','00000'],'\u25C6':['00100','01110','11111','11111','11111','01110','00100'],'\u26A1':['00011','00110','01100','11111','00110','01100','11000'],'\u2694':['10001','01010','00100','01010','10001','00100','00100']
};
function drawText(ctx,text,x,y,maxWidth){
  const original=ctx.__originalFillText||ctx.fillText;const str=String(text);if(!settings.pixelFont){original.call(ctx,str,x,y,maxWidth);return;}
  const m=(ctx.font||'12px monospace').match(/([0-9.]+)px/),fontPx=m?+m[1]:12;let scale=Math.max(.8,fontPx/8);const cell=6*scale;let width=Math.max(0,str.length*cell-scale);if(maxWidth&&width>maxWidth)scale*=maxWidth/width;const cw=6*scale;const total=Math.max(0,str.length*cw-scale);let left=x;if(ctx.textAlign==='center')left-=total/2;else if(ctx.textAlign==='right'||ctx.textAlign==='end')left-=total;let top=y-3.5*scale;if(ctx.textBaseline==='top'||ctx.textBaseline==='hanging')top=y;else if(ctx.textBaseline==='alphabetic'||ctx.textBaseline==='ideographic')top=y-7*scale;else if(ctx.textBaseline==='bottom')top=y-7*scale;
  if(!str.length)return;
  const ink=ctx.fillStyle;
  if(typeof ink!=='string'){paintGlyphs(ctx,str,left,top,cw,scale);return;}
  const key=str+'|'+scale.toFixed(2)+'|'+ink+'|'+(ctx.textAlign||'left');
  let sc=textCache.get(key);
  if(!sc){
    const px=Math.max(1,Math.ceil(scale));
    sc=document.createElement('canvas');
    sc.width=Math.max(1,Math.ceil(total)+px+1);sc.height=Math.max(1,Math.ceil(7*scale)+px+1);
    const s2=sc.getContext('2d');s2.imageSmoothingEnabled=false;s2.fillStyle=ink;
    paintGlyphs(s2,str,0,0,cw,scale);
    if(textCache.size>420)textCache.clear();
    textCache.set(key,sc);
  }
  ctx.drawImage(sc,Math.round(left),Math.round(top));
}
function paintGlyphs(ctx,str,left,top,cw,scale){
  for(let i=0;i<str.length;i++){let ch=str[i].toUpperCase();if(ch==='·')ch='.';else if(ch==='—'||ch==='–')ch='-';else if(ch==='→')ch='>';else if(ch==='←')ch='<';const rows=PIXEL_GLYPHS[ch]||PIXEL_GLYPHS['?'];for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)if(rows[ry][rx]==='1')ctx.fillRect(Math.round(left+i*cw+rx*scale),Math.round(top+ry*scale),Math.max(1,Math.ceil(scale)),Math.max(1,Math.ceil(scale)));}
}
for(const ctx of [visibleG,offscreenG]){ctx.__originalFillText=ctx.fillText.bind(ctx);ctx.fillText=function(text,x,y,maxWidth){drawText(this,text,x,y,maxWidth);};}

function solidAt(x,y,r){
  const c0=Math.floor((x-r)/TILE),c1=Math.floor((x+r)/TILE);
  const r0=Math.floor((y-r)/TILE),r1=Math.floor((y+r)/TILE);
  for(let rr=r0;rr<=r1;rr++)for(let cc=c0;cc<=c1;cc++){
    if(rr<0||cc<0||rr>=ROWS||cc>=COLS)continue;
    const b=grid[rr][cc];if(b)return b;
  }
  return null;
}
function moveEnt(e,dx,dy,r){
  if(!solidAt(e.x+dx,e.y,r))e.x+=dx;
  if(!solidAt(e.x,e.y+dy,r))e.y+=dy;
  e.x=clamp(e.x,r,W-r);e.y=clamp(e.y,r,PH-r);
}
function burst(x,y,n,color,spd=140){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,s=30+Math.random()*spd;
    Pt.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.4,max:.65,color,size:2+Math.random()*3});
  }
}
function dmgNum(x,y,d){Pt.push({x,y,vx:(Math.random()-.5)*30,vy:-55,life:.6,max:.6,color:'#ffe066',text:String(Math.round(d))});}
function ring(x,y,color,maxR=100){Pt.push({x,y,r:4,life:.5,max:.5,color,ring:true,maxR});}
// [FEAT-F04] Directional edge threat pips fade after one second.
function addThreat(x,y){threats.push({x,y,life:1,max:1});if(threats.length>12)threats.shift();}
// [FEAT-F08] Small impact marks are FIFO-capped and cleared at wave transitions.
function addDecal(x,y,angle=0){decals.push({x,y,angle,life:1});if(decals.length>60)decals.shift();}

// ===== FLOW FIELD =====
function computeFlow(){
  flow=Array.from({length:ROWS},()=>new Int16Array(COLS).fill(-1));
  const q=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(grid[r][c]===core){flow[r][c]=0;q.push([c,r]);}
  let h=0;
  while(h<q.length){
    const [c,r]=q[h++],d=flow[r][c]+1;
    for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nc=c+dc,nr=r+dr;
      if(nc<0||nr<0||nc>=COLS||nr>=ROWS)continue;
      if(flow[nr][nc]!==-1)continue;
      const b=grid[nr][nc];if(b&&b!==core)continue;
      flow[nr][nc]=d;q.push([nc,nr]);
    }
  }
  flowDirty=false;
}
// [FEAT-F01] Budgeted per-enemy A* path cache; flow field remains the fallback.
function findPathAStar(e){
  const sx=clamp(Math.floor(e.x/TILE),0,COLS-1),sy=clamp(Math.floor(e.y/TILE),0,ROWS-1);
  const goals=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(grid[r][c]===core)goals.push([c,r]);
  const goalSet=new Set(goals.map(([c,r])=>r*COLS+c)),start=sy*COLS+sx;
  if(goalSet.has(start))return [];
  const open=[{id:start,g:0,f:Math.abs(sx-12)+Math.abs(sy-8)}],came=new Map(),cost=new Map([[start,0]]),closed=new Set();let budget=180;
  while(open.length&&budget--){open.sort((a,b)=>a.f-b.f);const cur=open.shift();if(closed.has(cur.id))continue;closed.add(cur.id);
    if(goalSet.has(cur.id)){const path=[];let id=cur.id;while(came.has(id)){path.push([id%COLS,Math.floor(id/COLS)]);id=came.get(id);}path.reverse();return path;}
    const x=cur.id%COLS,y=Math.floor(cur.id/COLS);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;const id=ny*COLS+nx,b=grid[ny][nx];if(b&&b!==core)continue;const ng=cur.g+1;if(ng>=(cost.get(id)??Infinity))continue;cost.set(id,ng);came.set(id,cur.id);open.push({id,g:ng,f:ng+Math.min(...goals.map(([gc,gr])=>Math.abs(nx-gc)+Math.abs(ny-gr)))});}
  }return null;
}
function moveEnemy(e,dt){
  // [FEAT-F77] Nearby co-op enemies split pursuit between the two active players.
  const coopTarget=P2&&(e.targetP2?P2:P);if(coopTarget&&Math.hypot(coopTarget.x-e.x,coopTarget.y-e.y)<220){const dx=coopTarget.x-e.x,dy=coopTarget.y-e.y,dl=Math.hypot(dx,dy)||1,nx=e.x+dx/dl*e.speed*dt,ny=e.y+dy/dl*e.speed*dt,blk=solidAt(nx,ny,e.r*.8);if(!blk){e.x=nx;e.y=ny;}else if(e.atkCd<=0){e.atkCd=.65;damageBuilding(blk,e.dmg);}return;}
  if(flowDirty)computeFlow();
  if(e.type==='flyer'){const dx=core.x-e.x,dy=core.y-e.y,dl=Math.hypot(dx,dy)||1;e.x+=dx/dl*e.speed*dt;e.y+=dy/dl*e.speed*dt;return;}
  const cell=Math.floor(e.y/TILE)*COLS+Math.floor(e.x/TILE);
  if(!e.path||e.pathDirty||e.pathVersion!==S.pathVersion||e.pathCell!==cell){e.path=findPathAStar(e);e.pathDirty=false;e.pathVersion=S.pathVersion;e.pathCell=cell;e.pathIndex=0;}
  let best=null;
  if(e.path&&e.path.length){while(e.pathIndex<e.path.length&&Math.hypot((e.path[e.pathIndex][0]+.5)*TILE-e.x,(e.path[e.pathIndex][1]+.5)*TILE-e.y)<7)e.pathIndex++;best=e.path[e.pathIndex];}
  if(!best){const ec=clamp(Math.floor(e.x/TILE),0,COLS-1),er=clamp(Math.floor(e.y/TILE),0,ROWS-1);let bd=flow[er][ec]<0?9999:flow[er][ec];for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){const nc=ec+dc,nr=er+dr;if(nc<0||nr<0||nc>=COLS||nr>=ROWS)continue;const d=flow[nr][nc];if(d>=0&&d<bd){bd=d;best=[nc,nr];}}}

  let tx,ty;
  if(best){tx=best[0]*TILE+TILE/2;ty=best[1]*TILE+TILE/2;}
  else{tx=core.x;ty=core.y;}
  const dx=tx-e.x,dy=ty-e.y,dl=Math.hypot(dx,dy)||1,step=e.speed*dt;
  const nx=e.x+dx/dl*step,ny=e.y+dy/dl*step;
  const blk=solidAt(nx,ny,e.r*.8);
  if(blk){if(e.atkCd<=0){e.atkCd=.65;if(blk.type==='core')addThreat(e.x,e.y);damageBuilding(blk,e.dmg);e.pathDirty=true;}}
  else{e.x=nx;e.y=ny;}
  e.x=clamp(e.x,e.r,W-e.r);e.y=clamp(e.y,e.r,PH-e.r);
}

// [FEAT-F74] Snapshot run state at wave start; references are JSON-safe game data.
function captureWaveSnapshot(){try{timeLoopSnapshot=JSON.parse(JSON.stringify({S:{...S,screen:'playing'},P,P2,core,B,E,Bu:Array.from(Bu||[]),Pt:Array.from(Pt||[]),PU,decals,threats,runStats,selectedMap,selectedMode,dailySeed,activeMutators,waveRng}));}catch(err){timeLoopSnapshot=null;console.warn('Time-loop snapshot failed',err);}}
function restoreWaveSnapshot(){if(!timeLoopSnapshot)return false;try{const d=JSON.parse(JSON.stringify(timeLoopSnapshot));if(!validRunState({...d,version:2}))return false;S={...d.S,screen:d.S.screen==='draft'?'draft':'playing'};rogueDraft=Array.isArray(S.rogueDraft)?S.rogueDraft.map(id=>ROGUE_CARDS.find(c=>c.id===id)).filter(Boolean):null;P=d.P;P2=d.P2||null;core=d.core;B=d.B||[];E=d.E||[];Bu=new PooledArray(500);for(const v of d.Bu||[])Bu.push(v);Pt=new PooledArray(800);for(const v of d.Pt||[])Pt.push(v);PU=d.PU||[];decals=d.decals||[];threats=d.threats||[];runStats=d.runStats||runStats;selectedMap=d.selectedMap||'arena';selectedMode=d.selectedMode||'normal';if(typeof d.dailySeed==='string'&&d.dailySeed.length<80)dailySeed=d.dailySeed;coopEnabled=!!P2;activeMutators=d.activeMutators||[];waveRng=finiteIn(d.waveRng,0,4294967295)?d.waveRng:1;grid=Array.from({length:ROWS},()=>new Array(COLS).fill(null));for(const b of B)if(Number.isInteger(b.cx)&&Number.isInteger(b.cy)&&b.cx>=0&&b.cy>=0&&b.cx<COLS&&b.cy<ROWS)grid[b.cy][b.cx]=b;const cc=Math.floor(core.x/TILE),cr=Math.floor(core.y/TILE);for(let r=cr;r<cr+2;r++)for(let c=cc;c<cc+2;c++)if(grid[r]&&c>=0&&c<COLS)grid[r][c]=core;keys={};mouse={x:P.x,y:GY+P.y,down:false};buildSel=null;flow=null;flowDirty=true;S.msg='TIME LOOP — WAVE RESTORED';S.msgT=2;return true;}catch(err){console.error('Time-loop restore failed',err);return false;}}
// [FEAT-F74] First rewind per run is free; subsequent rewinds spend a persistent boss core.
function resolveTimeLoop(accept){if(accept&&timeLoopSnapshot&&(!timeLoopUsed||meta.cores>0)){const paid=timeLoopUsed;if(restoreWaveSnapshot()){if(paid)meta.cores=Math.max(0,meta.cores-1);else timeLoopUsed=true;saveMeta();saveMidRun();return;}}timeLoopDeclined=true;finishGameOver(S.reason||'YOU WERE DESTROYED');}
function finishGameOver(reason){S.screen='gameover';S.overT=0;S.reason=reason;clearMidRun();if(S.endless){const be=+(safeStore.getItem('sg_best_endless')||0);if(S.wave>be)safeStore.setItem('sg_best_endless',String(S.wave));}else if(S.wave>S.best){S.best=S.wave;safeStore.setItem('sg_best',String(S.best));}saveRun();if(S.wave>=10)unlockAchievement('wave10','WAVE 10');if(S.wave>=25)unlockAchievement('wave25','WAVE 25');if(S.wave>=50)unlockAchievement('wave50','WAVE 50');if(S.buildingsBuilt>=50)unlockAchievement('architect','ARCHITECT');if(S.wave>=30)unlockAchievement('survivor','SURVIVOR');if(S.wave>=20&&runStats.playerDamage===0)unlockAchievement('untouchable','UNTOUCHABLE');if(activeMutators.length===3)unlockAchievement('mutatorMaster','MUTATOR MASTER');sfx(160,.9,'sawtooth',.09,40,null,true);announce('GAME OVER');setMusicTrack('off');}

// ===== PLAYER =====
function updatePlayer(dt){
  if(P.invuln>0)P.invuln-=dt;
  if(P.dashCd>0)P.dashCd-=dt;
  if(P.dashT>0)P.dashT-=dt;
  if(P.bombCd>0)P.bombCd-=dt;
  if(P.rapidT>0)P.rapidT-=dt;
  if(P.damageT>0)P.damageT-=dt;
  if(P.recoil>0)P.recoil=Math.max(0,P.recoil-dt);if(P.muzzleFlash>0)P.muzzleFlash=Math.max(0,P.muzzleFlash-dt);if(P.crossKick>0)P.crossKick=Math.max(0,P.crossKick-dt*24);
  let dx=0,dy=0;
  if(keys.w||keys.arrowup||keys.up||keys.gamepadY<-.2)dy--;
  if(keys.s||keys.arrowdown||keys.down||keys.gamepadY>.2)dy++;
  if(keys.a||keys.arrowleft||keys.left||keys.gamepadX<-.2)dx--;
  if(keys.d||keys.arrowright||keys.right||keys.gamepadX>.2)dx++;
  if(dx||dy){
    const l=Math.hypot(dx,dy),spd=P.speed*(1+rogueCount('speed')*.08)*(P.dashT>0?3:1);
    const ox=P.x,oy=P.y;moveEnt(P,dx/l*spd*dt,dy/l*spd*dt,P.r);
    footstepT+=dt;const moved=Math.hypot(P.x-ox,P.y-oy);if(footstepT>=.3||moved>=40){footstepT=0;footstep();}
  }else footstepT=0;
  if(touchAim){mouse.x=P.x+touchAim.x*300;mouse.y=GY+P.y+touchAim.y*300;}P.ang=Math.atan2(mouse.y-GY-P.y,mouse.x-P.x);
  P.cd-=dt;
  if(mouse.down&&!buildSel&&P.cd<=0)shoot();
  if(sellTarget&&mouse.rightDown){sellHold+=dt;if(sellHold>=.4)sellBuilding(sellTarget);}
  if(keys.spaceHold){spaceHold+=dt;if(spaceHold>=.5&&!keys.spaceHandled){keys.spaceHandled=true;if(S.phase==='build'){if(S.endless)startWave();else S.timer=Math.min(S.timer,.01);}}}else{spaceHold=0;keys.spaceHandled=false;}
  if(P2&&S.screen==='playing')updatePlayer2(dt);
  pollGamepad();
  if(P.hurt>0)P.hurt-=dt*3;
  if(S.phase==='build')P.hp=Math.min(P.maxHp,P.hp+dt*7);if(rhythmBeatFlash>0)rhythmBeatFlash=Math.max(0,rhythmBeatFlash-dt);
}
// [FEAT-F77] Local co-op: P2 moves with IJKL and uses numpad 0/1 for fire/dash.
function updatePlayer2(dt){if(P2.invuln>0)P2.invuln-=dt;if(P2.dashCd>0)P2.dashCd-=dt;if(P2.dashT>0)P2.dashT-=dt;let dx=0,dy=0;if(keys.i)dy--;if(keys.k)dy++;if(keys.j)dx--;if(keys.l)dx++;if(dx||dy){const n=Math.hypot(dx,dy),spd=P2.speed*(P2.dashT>0?3:1);moveEnt(P2,dx/n*spd*dt,dy/n*spd*dt,P2.r);}const p2Target=E.reduce((best,e)=>!best||Math.hypot(e.x-P2.x,e.y-P2.y)<Math.hypot(best.x-P2.x,best.y-P2.y)?e:best,null);if(p2Target)P2.ang=Math.atan2(p2Target.y-P2.y,p2Target.x-P2.x);else if(dx||dy)P2.ang=Math.atan2(dy,dx);P2.cd-=dt;if(keys.p2fire&&P2.cd<=0){P2.cd=.22;const a=P2.ang;Bu.push({x:P2.x+Math.cos(a)*14,y:P2.y+Math.sin(a)*14,vx:Math.cos(a)*520,vy:Math.sin(a)*520,dmg:12*(1+rogueCount('damage')*.12),r:3,life:.85,f:'player2',color:'#ffcc33',wColor:'#ffcc33'});sfx(700,.045,'square',.025,330);}if(keys.p2dash&&!keys.p2DashHandled){keys.p2DashHandled=true;if(P2.dashCd<=0){P2.dashCd=1.5;P2.dashT=.18;P2.invuln=.2;}}if(!keys.p2dash)keys.p2DashHandled=false;}
function shoot(){
  if(isMutator('pistolOnly'))P.weapon='pistol';
  const w=WPN[P.weapon];
  P.cd=P.rapidT>0?w.rate*.4:w.rate;runStats.shots++;P.recoil=.08;P.muzzleFlash=.05;P.crossKick=4;
  const beatDelta=Math.min(S.t%0.5,0.5-(S.t%0.5)),rhythmHit=selectedMode==='rhythm'&&beatDelta<=.1;if(rhythmHit)rhythmBeatFlash=.16;
  const crit=gameplayRand()<rogueCount('crit')*.1;const dm=(P.damageT>0?2:1)*(1+rogueCount('damage')*.12)*(rhythmHit?1.5:1)*(crit?2:1);
  const count=w.count+(P.weapon==='shotgun'?rogueCount('shotgunPellet'):0);
  for(let i=0;i<count;i++){
    const a=P.ang+(gameplayRand()-.5)*w.spread;
    const bx=P.x+Math.cos(a)*16,by=P.y+Math.sin(a)*16;
    Bu.push({x:bx,y:by,vx:Math.cos(a)*w.speed*(1+rogueCount('bulletSpeed')*.15),vy:Math.sin(a)*w.speed*(1+rogueCount('bulletSpeed')*.15),
      dmg:w.dmg*dm*(isMutator('glassCannon')?2:1),r:3,life:.85,f:'player',color:w.color,wColor:w.color,crit});
  }
  S.shake=Math.max(S.shake,P.weapon==='shotgun'?4:1.8);if(rhythmHit){S.msg=crit?'PERFECT BEAT · CRITICAL':'PERFECT BEAT · 1.5×';S.msgT=.45;sfx(1040,.07,'sine',.04,1400);} 
  burst(P.x+Math.cos(P.ang)*16,P.y+Math.sin(P.ang)*16,2,w.color,70);
  sfx(P.weapon==='shotgun'?180:P.weapon==='smg'?880:680,.05,'square',.035,320);
}
function cycleWeapon(d){
  if(isMutator('pistolOnly')){P.weapon='pistol';return;}
  const available=WO.filter(w=>w!=='smg'||(meta.tree.smg||0)>0);
  const i=available.indexOf(P.weapon);
  P.weapon=available[(i+d+available.length)%available.length];
  S.msg=WPN[P.weapon].name;S.msgT=1;
  sfx(440,.06,'square',.04,660);
}
function tryDash(){
  if(P.dashCd>0||S.screen!=='playing')return;
  P.dashCd=Math.max(.7,1.5-.3*(meta.tree.dash||0))*Math.pow(.5,rogueCount('dashHalf'));P.dashT=.18;P.invuln=.2;
  sfx(600,.1,'sawtooth',.05,900);
  burst(P.x,P.y,10,'#3ee6c4',180);
}
function tryBomb(){
  if(P.bombCd>0||S.screen!=='playing')return;
  P.bombCd=8;const r=120;
  ring(P.x,P.y,'rgba(255,200,80,.9)',r);
  for(let i=E.length-1;i>=0;i--){
    const e=E[i];
    if(Math.hypot(e.x-P.x,e.y-P.y)<r+e.r){
      e.hp-=80*(1+rogueCount('bombDamage')*.25);e.hitFlash=1;e.hitFlashKind='crit';burst(e.x,e.y,6,'#ffcc33',200);
      if(e.hp<=0)killEnemy(i);
    }
  }
  S.shake=8;S.flash=.4;
  sfx(100,.4,'sawtooth',.1,40);
}
function hurtPlayer(dmg,target=P){
  if(target.invuln>0)return;runStats.playerDamage+=dmg;dmg*=Math.max(.1,1-rogueCount('playerShield')*.08);
  if(target.shield>0){
    target.shield--;burst(target.x,target.y,10,'#4dc3ff',120);
    ring(target.x,target.y,'rgba(77,195,255,.8)',40);
    sfx(600,.1,'square',.05,900);return;
  }
  target.hp-=dmg;target.hurt=1;
  S.shake=Math.max(S.shake,5);S.flash=Math.max(S.flash,.6);
  burst(target.x,target.y,5,'#ff5d5d',100);
  hurtSfx();
  if(target.hp<=0){if(target===P2){P2=null;S.msg='PLAYER 2 DOWN';S.msgT=1.5;if(!P)gameOver('YOU WERE DESTROYED');}else gameOver('YOU WERE DESTROYED');}
}

// ===== BUILDINGS =====
function updateBuildings(dt){
  for(const b of B){
    if(['turret','sniper','tesla','mortar'].includes(b.type)){
      b.cd-=dt;
      if(b.flash>0)b.flash-=dt*10;
      let tg=null,bd=b.range*b.range;
      for(const e of E){
        const d=(e.x-b.x)**2+(e.y-b.y)**2;
        if(d<bd){bd=d;tg=e;}
      }
      if(tg){
        const a=Math.atan2(tg.y-b.y,tg.x-b.x);
        b.ang=b.ang+(((a-b.ang+Math.PI*3)%(Math.PI*2))-Math.PI)*Math.min(1,dt*14);
        if(b.cd<=0){
          b.cd=b.rate/(1+rogueCount('turretRate')*.15);b.flash=1;
          if(b.type==='tesla'){for(const e of E.slice().sort((u,v)=>Math.hypot(u.x-b.x,u.y-b.y)-Math.hypot(v.x-b.x,v.y-b.y)).slice(0,3)){const td=b.dmg*(1+rogueCount('turretDamage')*.15);e.hp-=td;e.hitFlash=.4;e.hitFlashKind='normal';dmgNum(e.x,e.y,td);if(e.hp<=0){const ix=E.indexOf(e);if(ix>=0)killEnemy(ix);}}burst(tg.x,tg.y,8,'#9f8bff',120);}
          else if(b.type==='mortar'){Bu.push({x:b.x+Math.cos(a)*14,y:b.y+Math.sin(a)*14,vx:Math.cos(a)*300,vy:Math.sin(a)*300,dmg:b.dmg*(1+rogueCount('turretDamage')*.15),r:5,life:1.2,f:'mortar',color:'#ff9f43',aoe:50});}
          else Bu.push({x:b.x+Math.cos(a)*16,y:b.y+Math.sin(a)*16,vx:Math.cos(a)*(b.type==='sniper'?850:600),vy:Math.sin(a)*(b.type==='sniper'?850:600),dmg:b.dmg*(1+rogueCount('turretDamage')*.15),r:b.type==='sniper'?4:3.5,life:1.1,f:'turret',color:b.type==='sniper'?'#d8efff':'#9fe6ff'});
          sfx(b.type==='sniper'?520:880,.04,'square',.02,500);
        }
      }
    } else if(b.type==='gen')S.scrap+=b.rate*dt*(S.phase==='combat'&&S.genDoubleWave>0?2:1);
  }
}
function damageBuilding(b,dmg){
  if(b.indestructible)return;
  b.hp-=dmg;S.shake=Math.max(S.shake,2.5);
  burst(b.x,b.y,3,'#ffb066',90);
  if(b.type==='core'){
    S.flash=Math.max(S.flash,.4);S.coreHitT=.8;const threat=E.reduce((best,e)=>!best||Math.hypot(e.x-core.x,e.y-core.y)<Math.hypot(best.x-core.x,best.y-core.y)?e:best,null);if(threat)addThreat(threat.x,threat.y);
    if(b.hp<=0){b.hp=0;gameOver('THE CORE WAS DESTROYED');}
  } else if(b.hp<=0)removeBuilding(b);
}
function removeBuilding(b){
  if(b.indestructible)return;
  if(grid[b.cy]&&grid[b.cy][b.cx]===b)grid[b.cy][b.cx]=null;S.pathVersion=(S.pathVersion||0)+1;
  const i=B.indexOf(b);if(i>=0)B.splice(i,1);
  burst(b.x,b.y,14,'#9aa8b8',170);
  S.shake=Math.max(S.shake,5);flowDirty=true;
  sfx(110,.18,'sawtooth',.06,45);
}
function canPlace(c,r){
  if(isMutator('noTurrets')&&['turret','sniper','tesla','mortar'].includes(buildSel))return false;
  if(!buildSel||c<0||r<0||c>=COLS||r>=ROWS)return false;
  if(grid[r][c]||S.scrap<BLD[buildSel].cost)return false;
  const px=c*TILE+TILE/2,py=r*TILE+TILE/2;
  if(Math.abs(px-P.x)<TILE/2+P.r+2&&Math.abs(py-P.y)<TILE/2+P.r+2)return false;
  for(const e of E)if(Math.abs(px-e.x)<TILE/2+e.r&&Math.abs(py-e.y)<TILE/2+e.r)return false;
  return true;
}
function tryPlace(c,r){
  if(!canPlace(c,r)){sfx(160,.06,'square',.03,90);return;}
  const def=BLD[buildSel];S.scrap-=def.cost;S.buildingsBuilt=(S.buildingsBuilt||0)+1;
  const hp=def.hp*(buildSel==='turret'?1+.2*(meta.tree.turret||0):1)*(buildSel==='wall'?1+rogueCount('wallHp')*.25:1);
  const b={type:buildSel,hp,maxHp:hp,cx:c,cy:r,level:1,
    x:c*TILE+TILE/2,y:r*TILE+TILE/2,ang:-Math.PI/2,cd:0,flash:0,
    range:def.range||0,rate:def.rate||0,dmg:def.dmg||0};
  grid[r][c]=b;B.push(b);flowDirty=true;S.pathVersion=(S.pathVersion||0)+1;
  burst(b.x,b.y,8,def.color,110);
  placementSfx(buildSel);
}
function upgradeCost(b){return Math.floor(BLD[b.type].cost*(.6+.25*b.level));}
function tryUpgrade(c,r){
  const b=grid[r]?.[c];
  if(!b||b===core||b.indestructible||b.level>=3)return;
  const cost=upgradeCost(b);
  if(S.scrap<cost){sfx(160,.06,'square',.03,90);return;}
  S.scrap-=cost;b.level++;
  const L=b.level;
  if(b.type==='turret'){b.dmg=BLD.turret.dmg*(1+.5*(L-1));b.range=BLD.turret.range*(1+.2*(L-1));b.rate=BLD.turret.rate*(1-.15*(L-1));}
  else if(b.type==='wall'){b.maxHp=BLD.wall.hp*(1+.8*(L-1));b.hp=b.maxHp;}
  else if(b.type==='gen')b.rate=BLD.gen.rate*(1+.5*(L-1));
  burst(b.x,b.y,15,'#ffe066',180);
  ring(b.x,b.y,'rgba(255,224,102,.8)',60);
  sfx(660,.12,'square',.06,1100);
  S.msg='LV '+L+' UPGRADED';S.msgT=1;S.score+=50;
}

// ===== POWERUPS =====
function tryDrop(e){
  const ch=e.type==='boss'?1:e.type==='tank'?.4:e.type==='splitter'?.25:.08;
  if(gameplayRand()>ch)return;
  const types=['health','rapid','damage','shield'];
  let t=types[Math.floor(gameplayRand()*types.length)];
  if(P.hp>=P.maxHp&&t==='health')t='rapid';
  PU.push({type:t,x:e.x,y:e.y,life:14,bob:gameplayRand()*Math.PI*2,vy:-40});
}
function updatePU(dt){
  for(let i=PU.length-1;i>=0;i--){
    const p=PU[i];
    p.life-=dt;p.bob+=dt*5;p.vy*=.9;p.y+=p.vy*dt;
    const d=Math.hypot(P.x-p.x,P.y-p.y),d2=P2?Math.hypot(P2.x-p.x,P2.y-p.y):Infinity,attractor=d2<d&&P2?P2:P,near=Math.min(d,d2);
    if(near<(rogueCount('pickupRadius')?120:60)){const a=Math.atan2(attractor.y-p.y,attractor.x-p.x);p.x+=Math.cos(a)*dt*300;p.y+=Math.sin(a)*dt*300;}
    if(near<20){pickup(p);PU.splice(i,1);continue;}
    if(p.life<=0)PU.splice(i,1);
  }
}
function pickup(p){
  sfx(880,.15,'square',.05,1200);
  burst(p.x,p.y,10,PWR[p.type].color,150);
  ring(p.x,p.y,'rgba(255,255,255,.6)',40);
  if(p.type==='health'){P.hp=Math.min(P.maxHp,P.hp+35);S.msg='+35 HP';}
  else if(p.type==='rapid'){P.rapidT=8;S.msg='RAPID FIRE';}
  else if(p.type==='damage'){P.damageT=8;S.msg='DOUBLE DAMAGE';}
  else if(p.type==='shield'){P.shield=3;S.msg='SHIELD x3';}
  S.msgT=1.2;
}

// ===== ENEMIES =====
function spawnEnemy(type){
  const d=ENM[type],side=Math.floor(gameplayRand()*4);let x,y;
  if(side===0){x=40+gameplayRand()*(W-80);y=24;}
  else if(side===1){x=W-24;y=40+gameplayRand()*(PH-80);}
  else if(side===2){x=40+gameplayRand()*(W-80);y=PH-24;}
  else{x=24;y=40+gameplayRand()*(PH-80);}
  let hpMul=1,dmgMul=1;
  if(S.mod==='swarm')hpMul=.5;
  if(S.mod==='elite'){hpMul=2;dmgMul=1.8;}
  const mul=1+(S.wave-1)*.12;
  let bossKind='';if(type==='boss'){bossKind=['charger','summoner','splitter-boss','juggernaut','bullet-hell'][((Math.floor(S.wave/5)-1)%5+5)%5];}
  const baseHp=type==='boss'?(bossKind==='summoner'?300:bossKind==='splitter-boss'?500:bossKind==='juggernaut'?620:bossKind==='bullet-hell'?430:350):d.hp;
  const hp=Math.round(baseHp*mul*hpMul);
  const bossColor=bossKind==='charger'?'#ff6b35':bossKind==='summoner'?'#4dc3ff':bossKind==='splitter-boss'?'#b06bff':bossKind==='juggernaut'?'#9aa8b8':bossKind==='bullet-hell'?'#ff2bd6':d.color;
  if(type==='boss'){bossIntro={life:2.4,max:2.4,name:'THE '+(bossKind==='splitter-boss'?'SPLITTER':bossKind==='bullet-hell'?'BULLET HELL':bossKind).toUpperCase()};S.shake=Math.max(S.shake,5);sfx(95,.6,'sawtooth',.07,38,null,true);}
  E.push({type,bossKind,x,y,r:d.r,color:bossColor,hp,maxHp:hp,hitFlashKind:'normal',introScale:type==='boss'?0.08:1,
    speed:d.speed*(1+(S.wave-1)*.015)*(1-rogueCount('enemySlow')*.05),dmg:Math.round(d.dmg*dmgMul),
    scrap:d.scrap,atkCd:.6,hitFlash:0,shootCd:1,healCd:1.5,bossTimer:4,patternT:2,laserT:8,patternAngle:0,chargeT:0,chargeCd:2.5,chargeVx:0,chargeVy:0,telegraph:0,armT:0,targetP2:!!(P2&&gameplayRand()<.5),path:null,pathDirty:true,pathVersion:-1,pathIndex:0});
  ring(x,y,'rgba(255,80,80,.7)',30);
  burst(x,y,6,d.color,90);
  if(type==='boss'){announce('BOSS INCOMING');setMusicTrack('boss');sfx(95,.32,'sawtooth',.075,45,null,true);}
}
function updateEnemies(dt){
  // [FEAT-F03] Uniform spatial grid limits separation checks to nearby cells.
  const cellSize=TILE*2,spatial=new Map();
  for(const e of E){const gx=Math.floor(e.x/cellSize),gy=Math.floor(e.y/cellSize),key=gx+','+gy;if(!spatial.has(key))spatial.set(key,[]);spatial.get(key).push(e);}
  const sepIndex=new Map(E.map((e,i)=>[e,i]));
  for(let ai=0;ai<E.length;ai++){const a=E[ai],gx=Math.floor(a.x/cellSize),gy=Math.floor(a.y/cellSize);
    for(let yy=gy-1;yy<=gy+1;yy++)for(let xx=gx-1;xx<=gx+1;xx++)for(const b of spatial.get(xx+','+yy)||[]){if(sepIndex.get(b)<=ai)continue;const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,md=a.r+b.r;if(d2>0&&d2<md*md){const d=Math.sqrt(d2),p=(md-d)/d*.125;a.x-=dx*p;a.y-=dy*p;b.x+=dx*p;b.y+=dy*p;}}
    a.x=clamp(a.x,a.r,W-a.r);a.y=clamp(a.y,a.r,PH-a.r);
  }
  for(let i=E.length-1;i>=0;i--){
    const e=E[i];
    if(e.hitFlash>0)e.hitFlash-=dt*4;
    if(e.telegraph>0){e.telegraph-=dt;if(e.telegraph<=0&&e.type==='shooter'){const target=e.targetP2&&P2?P2:P;const a=Math.atan2(target.y-e.y,target.x-e.x);Bu.push({x:e.x,y:e.y,vx:Math.cos(a)*380,vy:Math.sin(a)*380,dmg:e.dmg,r:4,life:2.5,f:'enemy',color:'#9fe6ff',targetP2:target===P2});e.shootCd=1.6;sfx(340,.08,'sawtooth',.03,180,e.x);}else if(e.telegraph<=0&&e.type==='boss'&&e.bossKind==='charger'){e.chargeT=.6;}}
    if(e.type==='shooter'&&e.telegraph<=0){e.shootCd-=dt;const target=e.targetP2&&P2?P2:P;if(e.shootCd<=.4&&Math.hypot(target.x-e.x,target.y-e.y)<420)e.telegraph=.4;}
    // [FEAT-F09] Rotating boss archetypes: charger, summoner, splitter-boss, juggernaut and bullet-hell.
    if(e.type==='boss'){
      // [FEAT-F75] Spiral volley every 2s and a five-shot sweeping laser volley every 8s.
      if(e.bossKind==='bullet-hell'){e.patternT=(e.patternT??2)-dt;e.laserT=(e.laserT??8)-dt;e.patternAngle=(e.patternAngle||0)+dt*1.8;if(e.patternT<=0){e.patternT=2;for(let q=0;q<12;q++){const a=(Math.PI*2*q/12)+e.patternAngle;Bu.push({x:e.x,y:e.y,vx:Math.cos(a)*185,vy:Math.sin(a)*185,dmg:11,r:4,life:3.2,f:'enemy',color:'#ff63dc',targetP2:!!(P2&&q%2)});}sfx(260,.18,'sawtooth',.045,120,e.x);}if(e.laserFlash>0)e.laserFlash=Math.max(0,e.laserFlash-dt);if(e.laserT<=0){e.laserT=8;e.laserFlash=.55;const laserTarget=P2&&gameplayRand()<.5?P2:P;const a=Math.atan2(laserTarget.y-e.y,laserTarget.x-e.x);e.laserAngle=a;for(let q=-4;q<=4;q++){const aa=a+q*.085;Bu.push({x:e.x,y:e.y,vx:Math.cos(aa)*330,vy:Math.sin(aa)*330,dmg:18,r:5,life:2.5,f:'enemy',color:'#ff2bd6',targetP2:!!(P2&&q%2===0)});}S.msg='LASER SWEEP!';S.msgT=1.2;}}
      if(e.bossKind==='summoner'){e.bossTimer-=dt;if(e.bossTimer<=0){e.bossTimer=4;for(let k=0;k<3;k++){const a=k*Math.PI*2/3;E.push({type:'grunt',x:clamp(e.x+Math.cos(a)*36,12,W-12),y:clamp(e.y+Math.sin(a)*36,12,PH-12),r:11,color:ENM.grunt.color,hp:34,maxHp:34,speed:54,dmg:9,scrap:8,atkCd:.6,hitFlash:0,shootCd:1,healCd:1.5,path:null,pathDirty:true,pathVersion:-1,pathIndex:0,telegraph:0,armT:0});}burst(e.x,e.y,16,e.color,160);}}
      if(e.bossKind==='charger'){e.chargeCd-=dt;if(e.chargeT>0){e.x+=e.chargeVx*dt;e.y+=e.chargeVy*dt;e.chargeT-=dt;if(solidAt(e.x,e.y,e.r*.8)){e.chargeT=0;e.stunT=.65;S.shake=Math.max(S.shake,5);burst(e.x,e.y,16,'#ff9f43',200);}}else if(e.chargeCd<=0){e.chargeCd=2.8;e.telegraph=.6;const a=Math.atan2(core.y-e.y,core.x-e.x);e.chargeVx=Math.cos(a)*300;e.chargeVy=Math.sin(a)*300;}}
      if(e.stunT>0)e.stunT-=dt;
    }
    const tankTarget=e.targetP2&&P2?P2:P;if(e.type==='tank'&&Math.hypot(tankTarget.x-e.x,tankTarget.y-e.y)<100&&e.atkCd<.25)e.armT=.2;else if(e.armT>0)e.armT=Math.max(0,e.armT-dt);
    if(e.type==='healer'){
      e.healCd-=dt;
      if(e.healCd<=0){
        e.healCd=1.5;
        for(const o of E){
          if(o===e)continue;
          if(Math.hypot(o.x-e.x,o.y-e.y)<110&&o.hp<o.maxHp){
            o.hp=Math.min(o.maxHp,o.hp+12);
            Pt.push({x:o.x+(Math.random()-.5)*20,y:o.y-10,vx:0,vy:-40,life:.5,max:.5,color:'#3ee6c4',size:3});
          }
        }
        ring(e.x,e.y,'rgba(62,230,196,.5)',110);
      }
    }
    e.atkCd-=dt;
    const target=e.targetP2&&P2?P2:P;if(Math.hypot(target.x-e.x,target.y-e.y)<e.r+target.r+1){
      if(e.type==='bomber'&&e.atkCd<=0){const ex=e.x,ey=e.y;hurtPlayer(40,target);for(let q=E.length-1;q>=0;q--){if(E[q]!==e&&Math.hypot(E[q].x-ex,E[q].y-ey)<70+E[q].r){E[q].hp-=40;if(E[q].hp<=0)killEnemy(q);}}burst(ex,ey,24,'#ff6b35',240);const bi=E.indexOf(e);if(bi>=0)E.splice(bi,1);continue;}
      if(e.atkCd<=0){
        e.atkCd=.8;hurtPlayer(e.dmg,target);
        const a=Math.atan2(target.y-e.y,target.x-e.x);
        moveEnt(target,Math.cos(a)*14,Math.sin(a)*14,target.r);
      }
    } else {
      if(e.type==='boss'&&e.bossKind==='charger'&&(e.chargeT>0||e.stunT>0)){}else moveEnemy(e,dt);
    }
  }
}
function killEnemy(idx){
  const e=E[idx];
  S.combo++;S.comboT=2*(1+rogueCount('comboTime'));
  if(KILL[S.combo]){S.msg=KILL[S.combo];S.msgT=1.8;sfx(720,.15,'square',.07,1200);}
  const mult=1+Math.min(S.combo,10)*.1;
  S.scrap+=Math.round(e.scrap*mult*(isMutator('noTurrets')?1.5:1));if(rogueCount('killHeal')){P.hp=Math.min(P.maxHp,P.hp+10*rogueCount('killHeal'));if(P2)P2.hp=Math.min(P2.maxHp,P2.hp+5*rogueCount('killHeal'));}
  const basePoints=Math.round(10*(e.type==='boss'?20:e.type==='tank'?5:e.type==='splitter'?3:1)*mutatorScoreMult());const earned=Math.round(basePoints*mult);S.score+=earned;runStats.killPoints+=basePoints;runStats.comboPoints+=earned-basePoints;if(S.kills===0)unlockAchievement('firstBlood','FIRST BLOOD');if(S.combo>=10)unlockAchievement('spree','SPREE');if(S.combo>=10)unlockAchievement('fatStack','FAT STACK');if(e.type==='boss')unlockAchievement('bossSlayer','BOSS SLAYER');if(S.wave>=10&&performance.now()-S.startTime<180000)unlockAchievement('speedrun','SPEEDRUN');
  if(!meta.codex.includes(e.type)){meta.codex.push(e.type);saveMeta();if(meta.codex.length>=Object.keys(ENM).length)unlockAchievement('completionist','COMPLETIONIST');}
  if(e.type==='boss'){meta.cores++;saveMeta();S.msg='CORE SHARD +1';S.msgT=1.2;}
  S.kills++;if(S.scrap>=1000)unlockAchievement('hoarder','HOARDER');
  burst(e.x,e.y,e.type==='boss'?40:14,e.color,e.type==='boss'?300:190);
  S.shake=Math.max(S.shake,e.type==='boss'?8:3);
  ring(e.x,e.y,'rgba(255,255,255,'+(e.type==='boss'?.7:.4)+')',e.type==='boss'?120:50);
  if(e.type==='boss'){S.msg=(e.bossKind||'boss').toUpperCase()+' DOWN';S.msgT=1.8;sfx(180,.5,'sawtooth',.08,60,null,true);duckMusic();S.hitStop=Math.max(S.hitStop,.12);}
  if(e.type==='boss'&&e.bossKind==='splitter-boss'){for(let k=0;k<2;k++){const a=k*Math.PI;const hp=90;E.push({type:'tank',x:clamp(e.x+Math.cos(a)*32,18,W-18),y:clamp(e.y+Math.sin(a)*32,18,PH-18),r:16,color:ENM.tank.color,hp,maxHp:hp,speed:32,dmg:22,scrap:14,atkCd:.6,hitFlash:0,shootCd:1,healCd:1.5,path:null,pathDirty:true,pathVersion:-1,pathIndex:0,telegraph:0,armT:0});}}
  else sfx(200,.14,'sawtooth',.05,60);
  if(e.type==='splitter'){
    for(let k=0;k<2;k++){
      const a=gameplayRand()*Math.PI*2,hp=Math.max(8,Math.round(e.maxHp*.15));
      E.push({type:'grunt',x:e.x+Math.cos(a)*22,y:e.y+Math.sin(a)*22,r:8,color:'#ff5d5d',
        hp,maxHp:hp,speed:85,dmg:5,scrap:4,atkCd:.6,hitFlash:0,shootCd:1,healCd:1.5});
    }
  }
  tryDrop(e);
  E.splice(idx,1);
}

// ===== BULLETS =====
function updateBullets(dt){
  for(let i=Bu.length-1;i>=0;i--){
    const b=Bu[i];
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    if(b.life<=0||b.x<-30||b.x>W+30||b.y<-30||b.y>PH+30){Bu.splice(i,1);continue;}
    if(b.f==='enemy'){
      const target=b.targetP2&&P2?P2:P;if(Math.hypot(target.x-b.x,target.y-b.y)<target.r+b.r){
        hurtPlayer(b.dmg,target);burst(b.x,b.y,4,'#9fe6ff',100);Bu.splice(i,1);continue;
      }
      const bc=Math.floor(b.x/TILE),br=Math.floor(b.y/TILE);
      if(bc>=0&&br>=0&&bc<COLS&&br<ROWS&&grid[br][bc]){
        damageBuilding(grid[br][bc],b.dmg);Bu.splice(i,1);continue;
      }
    } else {
      for(let j=E.length-1;j>=0;j--){
        const e=E[j];
        if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.r){
          if(e.type==='shielded'){const face=Math.atan2(core.y-e.y,core.x-e.x),hit=Math.atan2(b.y-e.y,b.x-e.x);if(Math.abs(Math.atan2(Math.sin(hit-face),Math.cos(hit-face)))<Math.PI/2){burst(b.x,b.y,2,'#8b9bad',45);Bu.splice(i,1);break;}}
          if(b.f==='mortar'){for(let q=E.length-1;q>=0;q--){const v=E[q];if(Math.hypot(v.x-b.x,v.y-b.y)<(b.aoe||50)+v.r){v.hp-=b.dmg;v.hitFlash=.6;dmgNum(v.x,v.y,b.dmg);if(v.hp<=0)killEnemy(q);}}burst(b.x,b.y,18,'#ff9f43',180);Bu.splice(i,1);break;}
          e.hp-=b.dmg;e.hitFlash=1;e.hitFlashKind=b.crit?'crit':'normal';if(b.f==='player'){hitMarkers.push({x:b.x,y:b.y,color:WPN[P.weapon].color,life:.08});if(hitMarkers.length>30)hitMarkers.shift();}addDecal(b.x,b.y,Math.atan2(b.vy,b.vx));
          if(P.weapon==='shotgun'&&b.f==='player')S.hitStop=Math.max(S.hitStop,.02);
          dmgNum(b.x,b.y,b.dmg);
          burst(b.x,b.y,4,'#ffe9a0',120);
          sfx(300,.05,'square',.025,180);
          Bu.splice(i,1);
          if(e.hp<=0)killEnemy(j);
          break;
        }
      }
    }
  }
}
function updateParticles(dt){
  for(let i=Pt.length-1;i>=0;i--){
    const p=Pt[i];
    if(p.ring)p.r+=dt*(p.maxR||100)/.5;
    else if(p.text){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=dt*30;}
    else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.92;p.vy*=.92;}
    p.life-=dt;
    if(p.life<=0)Pt.splice(i,1);
  }
}

// ===== WAVES =====
function pickTypeForWave(w){
  const r=gameplayRand();
  if(w>=8&&r<.08)return'flyer';
  if(w>=7&&r<.15)return'bomber';
  if(w>=7&&r<.21)return'shielded';
  if(w>=6&&r<.10)return'shooter';
  if(w>=5&&r<.18)return'healer';
  if(w>=4&&r<.28)return'splitter';
  if(w>=3&&r<.40)return'tank';
  if(w>=2&&r<.62)return'runner';
  return'grunt';
}
function prepNextWave(){
  const w=S.wave+1;S.nextMod='';
  if(w%4===0&&w%5!==0)S.nextMod=['fog','swarm','elite'][Math.floor(gameplayRand()*3)];
  S.nextQueue=[];
  if(w%5===0)S.nextQueue.push('boss');
  let n=5+w*2;
  if(S.nextMod==='swarm')n*=2;
  if(S.nextMod==='elite')n=Math.max(3,Math.floor(n/2));
  for(let i=0;i<n;i++)S.nextQueue.push(pickTypeForWave(w));
}
function startWave(){
  if(S.wave>0&&S.coreStart===core.hp)unlockAchievement('flawless','FLAWLESS WAVE');S.coreStart=core.hp;S.wave++;runStats.wavePoints+=100;S.score+=100;if(S.wave>=10)unlockAchievement('wave10','WAVE 10');if(S.wave>=25)unlockAchievement('wave25','WAVE 25');if(S.wave>=50)unlockAchievement('wave50','WAVE 50');S.phase='combat';S.timer=0;S.mod=S.nextMod;
  S.spawnQueue=S.nextQueue.slice();S.spawnCd=0;if(rogueCount('rapidStart'))P.rapidT=Math.max(P.rapidT,3);
  S.msg='WAVE '+S.wave+(S.mod?' \u2014 '+S.mod.toUpperCase():'');S.msgT=2.2;
  sfx(300,.25,'square',.06,600);announce('WAVE '+S.wave);captureWaveSnapshot();
}
function updateWave(dt){
  if(S.phase==='build'){
    if(!settings.reducedMotion&&S.timer>0&&S.timer<3){const cd=Math.ceil(S.timer);if(S.lastCountdown!==cd){S.lastCountdown=cd;sfx(760,.045,'square',.04,520);}}else S.lastCountdown=null;
    if(S.endless){return;}
    if(isMutator('speedrun')){S.timer-=dt;if(S.timer<=0)startWave();return;}
    S.timer-=dt;if(S.timer<=0)startWave();
  } else if(S.spawnQueue.length>0){
    S.spawnCd-=dt;
    if(S.spawnCd<=0){S.spawnCd=Math.max(.16,.72-S.wave*.04);spawnEnemy(S.spawnQueue.shift());}
  } else if(E.length===0){
    S.phase='build';S.timer=S.endless?0:(isMutator('speedrun')?10:20);
    const bonus=Math.round((50+S.wave*10)*(isMutator('noTurrets')?1.5:1));
    S.scrap+=bonus;S.genDoubleWave=0;if(rogueCount('waveHeal'))P.hp=Math.min(P.maxHp,P.hp+15);if(P2&&rogueCount('waveHeal'))P2.hp=Math.min(P2.maxHp,P2.hp+15);S.score+=100*S.wave;
    S.msg='WAVE CLEARED  +'+bonus;S.msgT=2.4;decals.length=0;
    if(S.endless){S.bestEndless=Math.max(S.bestEndless||0,S.wave);safeStore.setItem('sg_best_endless',String(S.bestEndless));}
    sfx(520,.14,'square',.05,780);
    setTimeout(()=>sfx(780,.16,'square',.05,1040),120);
    prepNextWave();
    pickRogueDraft();saveMidRun();
  }
}

// ===== GAME OVER =====
function gameOver(reason){
  if(S.screen!=='playing')return;
  S.reason=reason;
  if(!timeLoopDeclined&&timeLoopSnapshot&&(!timeLoopUsed||meta.cores>0)){S.screen='timeloop';return;}
  finishGameOver(reason);
}

// ===== UPDATE =====
function update(dt){
  syncMusicTrack();S.t+=dt;if(bossIntro){bossIntro.life=Math.max(0,bossIntro.life-dt);if(bossIntro.life<=0)bossIntro=null;}
  for(let i=threats.length-1;i>=0;i--){threats[i].life-=dt;if(threats[i].life<=0)threats.splice(i,1);}
  if(S.coreHitT>0)S.coreHitT-=dt;
  if(S.shake>0)S.shake=Math.max(0,S.shake-dt*22);
  if(S.flash>0)S.flash=Math.max(0,S.flash-dt*2.5);
  if(S.msgT>0)S.msgT-=dt;
  if(S.comboT>0){S.comboT-=dt;if(S.comboT<=0)S.combo=0;}
  try{updatePlayer(dt);updateBuildings(dt);updateEnemies(dt);updateBullets(dt);updateParticles(dt);updatePU(dt);updateWave(dt);}catch(err){console.error('SCRAP & GUN update error:',err);S.screen='paused';S.msg='ENGINE ERROR — PRESS R TO RESTART';S.msgT=99;}
}

// ===== RENDER =====
// [FEAT-F80] Pre-rendered art: the static field and every entity body are baked into offscreen
// canvases once, so a frame is a handful of drawImage calls instead of hundreds of path operations.
// Rebuilt only when the theme, map or decal set changes.
let spriteVersion=0,decoStamp=0,fieldCanvas=null,fieldKey='';
const spriteCache=new Map(),textCache=new Map();
function shade(hex,amt){
  let h=String(hex||'#ffffff').replace('#','');
  if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if(h.length!==6)h='ffffff';
  const n=parseInt(h,16);let r=(n>>16)&255,gg=(n>>8)&255,b=n&255;
  if(amt>=0){r+=(255-r)*amt;gg+=(255-gg)*amt;b+=(255-b)*amt;}else{r*=1+amt;gg*=1+amt;b*=1+amt;}
  return 'rgb('+(r|0)+','+(gg|0)+','+(b|0)+')';
}
function sprite(key,w,h,draw){
  const k=key+'@'+spriteVersion;let c=spriteCache.get(k);
  if(c)return c;
  c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;draw(x,c.width,c.height);spriteCache.set(k,c);return c;
}
function buildField(){
  const key=C.bg+'|'+C.grid+'|'+C.line+'|'+C.core+'|'+selectedMap+'|'+decoStamp;
  if(fieldCanvas&&fieldKey===key)return fieldCanvas;
  const c=document.createElement('canvas');c.width=W;c.height=PH;
  const f=c.getContext('2d');f.imageSmoothingEnabled=false;
  f.fillStyle=C.bg;f.fillRect(0,0,W,PH);
  f.fillStyle=C.grid;
  for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++)if((r+cc)%2===0)f.fillRect(cc*TILE,r*TILE,TILE,TILE);
  f.fillStyle='rgba(255,255,255,.02)';
  for(let r=0;r<ROWS;r++)for(let cc=0;cc<COLS;cc++)if((r+cc)%2===0)f.fillRect(cc*TILE,r*TILE,TILE,1);
  f.strokeStyle=C.line;f.lineWidth=1;f.beginPath();
  for(let cc=0;cc<=COLS;cc++){f.moveTo(cc*TILE+.5,0);f.lineTo(cc*TILE+.5,PH);}
  for(let r=0;r<=ROWS;r++){f.moveTo(0,r*TILE+.5);f.lineTo(W,r*TILE+.5);}
  f.stroke();
  f.fillStyle='rgba(80,150,200,.05)';
  for(const d of deco)f.fillRect(d.x,d.y,d.s,d.s);
  const vg=f.createRadialGradient(W/2,PH/2,PH*.34,W/2,PH/2,PH*.86);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.30)');
  f.fillStyle=vg;f.fillRect(0,0,W,PH);
  f.strokeStyle='rgba(62,230,196,.09)';f.lineWidth=2;f.strokeRect(1,1,W-2,PH-2);
  fieldCanvas=c;fieldKey=key;return c;
}
function drawField(){g.drawImage(buildField(),0,0);}
function coreGlowSprite(){
  return sprite('coreglow|'+C.core,176,176,(x,w,h)=>{
    const c=w/2,gr=x.createRadialGradient(c,c,3,c,c,c);
    gr.addColorStop(0,'rgba(255,255,255,.5)');
    gr.addColorStop(.28,C.core);
    gr.addColorStop(.62,'rgba(255,79,163,.16)');
    gr.addColorStop(1,'rgba(255,79,163,0)');
    x.fillStyle=gr;x.beginPath();x.arc(c,c,c,0,Math.PI*2);x.fill();
  });
}
function playerGlowSprite(hurt){
  const col=hurt?'#ff4d6d':C.player;
  return sprite('pglow|'+col,52,52,(x,w,h)=>{
    const c=w/2,gr=x.createRadialGradient(c,c,2,c,c,c);
    gr.addColorStop(0,'rgba(255,255,255,.35)');
    gr.addColorStop(.45,col);
    gr.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=gr;x.beginPath();x.arc(c,c,c,0,Math.PI*2);x.fill();
  });
}
function bulletSprite(col){
  return sprite('bullet|'+col,20,20,(x,w,h)=>{
    const c=w/2,gr=x.createRadialGradient(c,c,0,c,c,c);
    gr.addColorStop(0,'#ffffff');gr.addColorStop(.34,col);gr.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=gr;x.beginPath();x.arc(c,c,c,0,Math.PI*2);x.fill();
  });
}
function enemySprite(e){
  const r=e.r,pad=Math.ceil(r*.6)+3,size=Math.ceil((r+pad)*2);
  return sprite('enemy|'+e.type+'|'+r+'|'+e.color,size,size,(x,w,h)=>{
    const cx=w/2,cy=h/2;
    const grd=x.createRadialGradient(cx-r*.42,cy-r*.46,r*.12,cx,cy,r*1.08);
    grd.addColorStop(0,shade(e.color,.55));
    grd.addColorStop(.55,e.color);
    grd.addColorStop(1,shade(e.color,-.52));
    x.fillStyle=grd;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
    x.fillStyle=e.type==='tank'?'#e0d4ff':e.type==='boss'?'#fff0a6':'#180b13';
    if(e.type==='grunt'||e.type==='runner'||e.type==='bomber'){
      x.fillRect(cx-r*.6,cy+r*.35,r*.55,4);x.fillRect(cx+r*.05,cy+r*.35,r*.55,4);
      x.fillRect(cx-r*.35,cy-r*.2,4,4);x.fillRect(cx+r*.15,cy-r*.2,4,4);
    }else if(e.type==='tank'||e.type==='shielded'){
      x.fillRect(cx-r*.65,cy-r*.7,r*1.3,5);x.fillRect(cx-r*.7,cy+r*.45,r*1.4,5);
      x.fillRect(cx-r*.25,cy-3,5,6);x.fillRect(cx+r*.05,cy-3,5,6);
    }else if(e.type==='boss'){
      x.fillRect(cx-r*.65,cy-r*.25,r*1.3,5);x.fillRect(cx-r*.45,cy+r*.3,5,8);
      x.fillRect(cx+r*.25,cy+r*.3,5,8);x.fillRect(cx-4,cy-4,8,8);
    }else{
      x.fillRect(cx-r*.55,cy+r*.3,5,5);x.fillRect(cx+r*.15,cy+r*.3,5,5);
      x.fillRect(cx-r*.35,cy-r*.15,4,4);x.fillRect(cx+r*.15,cy-r*.15,4,4);
    }
    x.fillStyle='#140608';const er=Math.max(2,r*.22);
    x.fillRect(cx-r*.45,cy-r*.28,er,er);x.fillRect(cx+r*.16,cy-r*.28,er,er);
    x.strokeStyle='rgba(255,255,255,.32)';x.lineWidth=1.5;
    x.beginPath();x.arc(cx,cy,r-1,Math.PI*1.03,Math.PI*1.73);x.stroke();
    x.strokeStyle='rgba(0,0,0,.55)';x.lineWidth=2;
    x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.stroke();
  });
}
// [FEAT-F58] Cheap additive bloom approximation for bright pixel elements.
function drawGlowPixel(x,y,r,color,alpha=.4){g.save();g.globalCompositeOperation='lighter';g.globalAlpha=alpha;g.fillStyle=color;g.beginPath();g.arc(x,y,r*2.3,0,Math.PI*2);g.fill();g.globalAlpha=1;g.fillStyle=color;g.fillRect(Math.round(x-r/2),Math.round(y-r/2),Math.max(2,r),Math.max(2,r));g.restore();}
// [FEAT-F08] Floor decals render beneath gameplay entities.
function drawDamageDecals(){for(const d of decals){g.save();g.translate(d.x,d.y);g.rotate(d.angle);g.globalAlpha=.55;g.fillStyle='#6e1825';g.fillRect(-4,-2,8,4);g.fillRect(-2,-5,3,3);g.fillRect(1,2,3,2);g.restore();}g.globalAlpha=1;}
// [FEAT-F04] Directional arrows point toward active threats at the nearest canvas edge.
// [FEAT-F76] Rhythm mode rewards shots fired within 100ms of a 120 BPM beat.
function drawRhythmIndicator(){if(selectedMode!=='rhythm'||S.screen!=='playing')return;const phase=(S.t%0.5)/0.5,beat=Math.min(phase,1-phase);g.save();g.globalAlpha=beat<.2?1:.25;g.fillStyle=beat<.2?'#ffcc33':'#6c526e';g.fillRect(W/2-34,6,68,5);g.fillRect(8,cv.height/2-34,5,68);g.fillRect(W-13,cv.height/2-34,5,68);g.fillStyle='#ffcc33';g.font='bold 10px monospace';g.textAlign='center';g.fillText('120 BPM',W/2,24);if(rhythmBeatFlash>0){g.globalAlpha=Math.min(1,rhythmBeatFlash/.16);g.strokeStyle='#ffcc33';g.lineWidth=4;g.strokeRect(3,GY+3,W-6,PH-6);}g.restore();}
function drawThreatIndicators(){for(const t of threats){const dx=t.x-W/2,dy=t.y-PH/2,ang=Math.atan2(dy,dx),pad=22;let x=W/2,y=PH/2;const tx=dx===0?Infinity:(W/2-pad)/Math.abs(dx),ty=dy===0?Infinity:(PH/2-pad)/Math.abs(dy),scale=Math.min(tx,ty);x+=dx*scale;y+=dy*scale;g.save();g.globalAlpha=Math.max(0,t.life/t.max);g.translate(x,y+GY);g.rotate(ang);g.fillStyle='#ff3b55';g.beginPath();g.moveTo(10,0);g.lineTo(-6,-6);g.lineTo(-3,0);g.lineTo(-6,6);g.closePath();g.fill();g.restore();}}
function drawEntityShadow(x,y,r){g.save();g.globalAlpha=.28;g.fillStyle='#000';g.beginPath();g.ellipse(x,y+r*.82,Math.max(5,r*1.15),Math.max(2,r*.38),0,0,Math.PI*2);g.fill();g.restore();}
function drawCore(){
  drawEntityShadow(core.x,core.y,30);
  const x=core.x,y=core.y,p=.5+.5*Math.sin(S.t*3),hpF=Math.max(0,core.hp/core.maxHp);
  const cg=coreGlowSprite(),cgs=.9+p*.2;g.drawImage(cg,x-cg.width/2*cgs,y-cg.height/2*cgs,cg.width*cgs,cg.height*cgs);
  g.fillStyle=C.coreD;g.fillRect(x-36,y-36,72,72);
  g.fillStyle='#2a0c1c';g.fillRect(x-34,y-34,68,68);
  g.strokeStyle=C.core;g.lineWidth=3;g.strokeRect(x-32,y-32,64,64);
  g.fillStyle=C.core;g.globalAlpha=.55+p*.45;g.beginPath();g.arc(x,y,14+p*5,0,Math.PI*2);g.fill();g.globalAlpha=1;
  g.fillStyle='#fff';g.beginPath();g.arc(x,y,5+p*2,0,Math.PI*2);g.fill();drawGlowPixel(x,y,5+p*2,C.core,.32);
  if(hpF<1){g.fillStyle='#1a0d14';g.fillRect(x-38,y-44,76,5);g.fillStyle=hpF>.5?C.core:hpF>.25?'#ff9f43':'#ff3b3b';g.fillRect(x-38,y-44,76*hpF,5);}
}
function drawBuildings(){
  for(const b of B.slice().sort((a,b)=>a.y-b.y)){
    const x=b.x,y=b.y,L=b.level||1;
    if(b.type!=='rock')drawEntityShadow(x,y,Math.max(9,b.type==='core'?28:16));
    if(b.type==='rock'){g.fillStyle='#202a35';g.fillRect(x-20,y-20,40,40);g.fillStyle='#354454';g.beginPath();g.moveTo(x-16,y+12);g.lineTo(x-11,y-13);g.lineTo(x+5,y-17);g.lineTo(x+17,y-4);g.lineTo(x+13,y+15);g.closePath();g.fill();g.strokeStyle='#536273';g.stroke();continue;}
    if(b.type==='wall'){
      g.fillStyle=C.wallD;g.fillRect(x-17,y-17,34,34);
      g.fillStyle=C.wall;g.fillRect(x-14,y-14,28,28);
      g.fillStyle=C.wallD;g.fillRect(x-14,y-2,28,3);g.fillRect(x-2,y-14,3,12);
      // [FEAT-F57] Four-neighbour wall autotiling draws exposed edges only.
      const n=grid[b.cy-1]?.[b.cx]?.type==='wall',e=grid[b.cy]?.[b.cx+1]?.type==='wall',so=grid[b.cy+1]?.[b.cx]?.type==='wall',w=grid[b.cy]?.[b.cx-1]?.type==='wall';
      g.fillStyle=C.wall; if(n)g.fillRect(x-12,y-20,24,8);if(e)g.fillRect(x+12,y-12,8,24);if(so)g.fillRect(x-12,y+12,24,8);if(w)g.fillRect(x-20,y-12,8,24);
      g.strokeStyle=C.wallD;g.lineWidth=1;if(!n){g.beginPath();g.moveTo(x-14,y-14);g.lineTo(x+14,y-14);g.stroke();}if(!e){g.beginPath();g.moveTo(x+14,y-14);g.lineTo(x+14,y+14);g.stroke();}if(!so){g.beginPath();g.moveTo(x-14,y+14);g.lineTo(x+14,y+14);g.stroke();}if(!w){g.beginPath();g.moveTo(x-14,y-14);g.lineTo(x-14,y+14);g.stroke();}
    } else if(['turret','sniper','tesla','mortar'].includes(b.type)){
      g.fillStyle=C.turretD;g.fillRect(x-17,y-17,34,34);
      g.fillStyle='#1b4157';g.fillRect(x-14,y-14,28,28);
      g.save();g.translate(x,y);g.rotate(b.ang);
      const bc=BLD[b.type].color;g.fillStyle=bc;g.fillRect(0,b.type==='sniper'?-2:-4,b.type==='sniper'?27:19,b.type==='sniper'?4:8);
      g.fillStyle='#fff';g.fillRect(14,-2,5,4);g.restore();
      g.fillStyle=bc;g.beginPath();g.arc(x,y,b.type==='tesla'?10:8,0,Math.PI*2);g.fill();
      g.fillStyle='#08222e';g.beginPath();g.arc(x,y,4,0,Math.PI*2);g.fill();
      if(b.flash>0){
        g.save();g.shadowColor='#fff';g.shadowBlur=15;
        g.fillStyle='rgba(255,255,220,'+b.flash+')';
        g.beginPath();g.arc(x+Math.cos(b.ang)*17,y+Math.sin(b.ang)*17,4+b.flash*4,0,Math.PI*2);
        g.fill();g.restore();
      }
    } else if(b.type==='gen'){
      const p=.5+.5*Math.sin(S.t*5+x*.05);
      g.fillStyle=C.genD;g.fillRect(x-16,y-16,32,32);
      g.fillStyle='#6b5410';g.fillRect(x-13,y-13,26,26);
      g.globalAlpha=.4+p*.6;g.fillStyle=C.gen;g.fillRect(x-6,y-6,12,12);
      g.globalAlpha=1;g.fillStyle='#fff7cc';g.fillRect(x-2,y-2,4,4);
    }
    if(L>1){
      for(let i=0;i<L-1;i++){g.fillStyle=L>=3?'#ffcc33':'#ffe066';g.fillRect(x-6+i*6,y-20,4,4);}
      if(L>=3){g.strokeStyle='#ffcc33';g.lineWidth=2;g.strokeRect(x-17,y-17,34,34);}
    }
    if(b.hp<b.maxHp){
      const f=Math.max(0,b.hp/b.maxHp);
      g.fillStyle='rgba(0,0,0,.65)';g.fillRect(x-15,y-27,30,4);
      g.fillStyle=f>.5?'#6ee7a8':f>.25?'#ffcc33':'#ff4d4d';
      g.fillRect(x-15,y-27,30*f,4);
    }
  }
}
function drawEnemies(){
  for(const e of E.slice().sort((a,b)=>a.y-b.y)){
    const bob=Math.sin(S.t*10+e.x*.08)*1.5;
    drawEntityShadow(e.x,e.y+ bob,Math.max(8,e.r*.9));
    const introFactor=e.type==='boss'&&bossIntro?Math.min(1,(bossIntro.max-bossIntro.life)/.5):1;
    g.save();if(e.type==='boss'&&introFactor<1){g.translate(e.x,e.y);g.scale(Math.max(.08,introFactor),Math.max(.08,introFactor));g.translate(-e.x,-e.y);g.globalAlpha=Math.max(.25,introFactor);}
    if(e.type==='boss'&&bossIntro&&bossIntro.life>1.9){const q=(2.4-bossIntro.life)/.5;g.save();g.globalAlpha=Math.max(0,1-q);g.fillStyle='rgba(220,245,255,.5)';g.beginPath();g.moveTo(e.x-7,-20);g.lineTo(e.x+7,-20);g.lineTo(e.x+e.r+18,e.y+e.r);g.lineTo(e.x-e.r-18,e.y+e.r);g.closePath();g.fill();g.restore();}
    if(e.type==='boss'){
      const rot=S.t*2,sp=6;
      g.strokeStyle=e.color;g.lineWidth=2;g.beginPath();
      for(let i=0;i<sp;i++){
        const a=rot+i*Math.PI*2/sp;
        g.moveTo(e.x+Math.cos(a)*e.r,e.y+bob+Math.sin(a)*e.r);
        g.lineTo(e.x+Math.cos(a)*(e.r+6),e.y+bob+Math.sin(a)*(e.r+6));
      }
      g.stroke();
    }
    if(e.type==='healer'){
      const p=.5+.5*Math.sin(S.t*4);
      g.strokeStyle='rgba(62,230,196,'+(.15+p*.15)+')';
      g.lineWidth=1;g.beginPath();g.arc(e.x,e.y,110,0,Math.PI*2);g.stroke();
    }
    if(e.type==='shooter'&&e.telegraph>0){g.strokeStyle='#fff2a8';g.lineWidth=2;g.beginPath();g.arc(e.x,e.y,e.r+5+(0.4-e.telegraph)*18,0,Math.PI*2);g.stroke();g.fillStyle='#fff2a8';g.beginPath();g.arc(e.x+Math.cos(Math.atan2(P.y-e.y,P.x-e.x))*e.r,e.y+Math.sin(Math.atan2(P.y-e.y,P.x-e.x))*e.r,2+(0.4-e.telegraph)*5,0,Math.PI*2);g.fill();}
    if(e.type==='boss'&&e.bossKind==='bullet-hell'&&e.laserFlash>0){g.save();g.globalAlpha=Math.min(1,e.laserFlash/.55);g.strokeStyle='#ff2bd6';g.lineWidth=8;g.beginPath();g.moveTo(e.x,e.y);g.lineTo(e.x+Math.cos(e.laserAngle||0)*1200,e.y+Math.sin(e.laserAngle||0)*1200);g.stroke();g.strokeStyle='#fff';g.lineWidth=2;g.stroke();g.restore();}
    if(e.type==='boss'&&e.bossKind==='charger'&&(e.telegraph>0||e.chargeT>0)){g.strokeStyle='#ff9f43';g.lineWidth=2;g.beginPath();g.moveTo(e.x-18,e.y+e.r+5);g.lineTo(e.x-7,e.y+e.r+13);g.lineTo(e.x+2,e.y+e.r+5);g.lineTo(e.x+13,e.y+e.r+14);g.stroke();}
    const esp=enemySprite(e),by=e.y+bob;
    g.save();
    if(e.hitFlash>0){g.globalCompositeOperation='lighter';g.globalAlpha=e.hitFlashKind==='crit'?.95:.85;}
    g.drawImage(esp,e.x-esp.width/2,by-esp.height/2);
    g.restore();
    if(e.type==='shooter'){g.fillStyle='#08222e';g.fillRect(e.x-2,by+e.r*.3,4,4);}
    if(e.type==='tank'&&e.armT>0){g.fillStyle='#d9c6ff';g.fillRect(e.x+e.r-1,by-5,10+20*(e.armT/.2),6);}
    if(e.type==='healer'){g.fillStyle='#fff';g.fillRect(e.x-1,by-4,2,8);g.fillRect(e.x-4,by-1,8,2);}
    if(e.type==='splitter'){g.fillStyle='#140608';g.beginPath();
      g.moveTo(e.x,by+e.r*.3);g.lineTo(e.x-e.r*.4,by-e.r*.1);g.lineTo(e.x+e.r*.4,by-e.r*.1);g.fill();}
    if(e.hp<e.maxHp&&e.type!=='boss'){
      const w=e.r*2;
      g.fillStyle='rgba(0,0,0,.6)';g.fillRect(e.x-w/2,by-e.r-9,w,3);
      g.fillStyle='#ff5d5d';g.fillRect(e.x-w/2,by-e.r-9,w*Math.max(0,e.hp/e.maxHp),3);
    }
    g.restore();
  }
}
function drawBossBar(){
  const boss=E.find(e=>e.type==='boss');if(!boss)return;
  const w=400,h=18,x=(W-w)/2,y=GY+10;
  g.fillStyle='rgba(20,4,10,.85)';g.fillRect(x-2,y-2,w+4,h+4);
  g.fillStyle='#3a0a18';g.fillRect(x,y,w,h);
  g.fillStyle='#ffcc33';g.fillRect(x,y,w*Math.max(0,boss.hp/boss.maxHp),h);
  g.fillStyle='#fff';g.font='bold 12px "Courier New",monospace';
  g.textAlign='center';g.textBaseline='middle';
  g.fillText((boss.bossKind||'BOSS').toUpperCase()+'  '+Math.ceil(boss.hp)+'/'+boss.maxHp,W/2,y+h/2+1);
}
function drawPlayer(){
  drawEntityShadow(P.x,P.y,P.r);
  if(P.dashT>0){
    g.globalAlpha=.4;g.fillStyle='#3ee6c4';
    g.beginPath();g.arc(P.x-Math.cos(P.ang)*10,P.y-Math.sin(P.ang)*10,P.r,0,Math.PI*2);g.fill();
    g.globalAlpha=1;
  }
  g.save();g.translate(P.x,P.y);g.rotate(P.ang);
  const recoil=P.recoil>0?3*(P.recoil/.08):0;g.fillStyle='#243a48';g.fillRect(4-recoil,-4,18,8);
  g.fillStyle=WPN[P.weapon].color;g.fillRect(18-recoil,-3,5,6);if(P.muzzleFlash>0){g.fillStyle='#fff4a8';g.fillRect(24-recoil,-5,7,10);g.fillStyle='#fff';g.fillRect(27-recoil,-3,5,6);}g.restore();
  const walk=(Math.sin(S.t*18)>0?2:-2)*(Math.abs(keys.left||keys.right||keys.up||keys.down||keys.gamepadX||keys.gamepadY)?1:0);
  g.fillStyle='#172a35';g.fillRect(P.x-7,P.y+5+walk,5,7);g.fillRect(P.x+2,P.y+5-walk,5,7);
  const pg=playerGlowSprite(P.hurt>0);
  g.drawImage(pg,P.x-pg.width/2,P.y-pg.height/2);
  g.fillStyle=P.hurt>0?'#ff8098':C.player;g.fillRect(P.x-7,P.y-7,14,13);
  g.fillStyle='#d6fff5';g.fillRect(P.x-4,P.y-5,3,3);g.fillRect(P.x+2,P.y-5,3,3);
  g.fillStyle='#062420';g.fillRect(P.x-2,P.y+1,4,3);
  if(P.shield>0){
    g.strokeStyle='#4dc3ff';g.lineWidth=2;
    g.beginPath();g.arc(P.x,P.y,P.r+6+Math.sin(S.t*8)*2,0,Math.PI*2);g.stroke();
  }
  if(P.hp<P.maxHp){
    const w=28,x=P.x-w/2,y=P.y-P.r-11;
    g.fillStyle='rgba(0,0,0,.65)';g.fillRect(x,y,w,4);
    g.fillStyle='#3ee6c4';g.fillRect(x,y,w*Math.max(0,P.hp/P.maxHp),4);
  }
}
function drawPlayer2(){g.save();g.translate(P2.x,P2.y);g.rotate(P2.ang);g.fillStyle='#ffcc33';g.fillRect(-7,-7,14,14);g.fillStyle='#fff2b0';g.fillRect(-4,-5,3,3);g.fillRect(2,-5,3,3);g.fillStyle='#3b2a08';g.fillRect(3,-2,12,4);g.restore();g.fillStyle='#ffcc33';g.font='bold 9px monospace';g.textAlign='center';g.fillText('P2',P2.x,P2.y-P2.r-8);g.fillStyle='#351d05';g.fillRect(P2.x-13,P2.y+P2.r+4,26,3);g.fillStyle='#ffcc33';g.fillRect(P2.x-13,P2.y+P2.r+4,26*Math.max(0,P2.hp/P2.maxHp),3);}
function drawBullets(){
  for(const b of Bu){
    const col=b.color||(b.f==='player'?C.bullet:'#9fe6ff');
    g.strokeStyle=b.f==='player'?'rgba(255,224,102,.30)':b.f==='enemy'?'rgba(159,230,255,.45)':'rgba(120,220,255,.3)';
    g.lineWidth=3;g.beginPath();
    g.moveTo(b.x-b.vx*.016,b.y-b.vy*.016);g.lineTo(b.x,b.y);g.stroke();
    const bs=bulletSprite(col);
    g.drawImage(bs,b.x-bs.width/2,b.y-bs.height/2);
  }
}
function drawParticles(){
  for(const p of Pt){
    const a=Math.max(0,p.life/p.max);g.globalAlpha=a;
    if(p.ring){
      g.strokeStyle=p.color;g.lineWidth=2;
      g.beginPath();g.arc(p.x,p.y,p.r,0,Math.PI*2);g.stroke();
    } else if(p.text){
      g.fillStyle=p.color;g.font='bold 13px "Courier New",monospace';
      g.textAlign='center';g.textBaseline='middle';
      g.fillText(p.text,p.x,p.y);
    } else {
      g.fillStyle=p.color;g.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
    }
  }
  g.globalAlpha=1;
}
function drawPU(){
  for(const p of PU){
    const bob=Math.sin(p.bob)*4,col=PWR[p.type].color;
    g.save();g.shadowColor=col;g.shadowBlur=12;g.fillStyle=col;
    g.beginPath();g.arc(p.x,p.y+bob,9,0,Math.PI*2);g.fill();g.restore();
    g.fillStyle='#000';g.font='bold 12px monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.fillText(PWR[p.type].icon,p.x,p.y+bob+1);
    if(p.life<3){
      g.globalAlpha=.5+.5*Math.sin(S.t*12);
      g.strokeStyle=col;g.lineWidth=1;
      g.beginPath();g.arc(p.x,p.y+bob,12,0,Math.PI*2);g.stroke();
      g.globalAlpha=1;
    }
  }
}
function drawGhost(){
  if(!buildSel)return;
  const c=Math.floor(mouse.x/TILE),r=Math.floor((mouse.y-GY)/TILE);
  if(c<0||r<0||c>=COLS||r>=ROWS)return;
  const ok=canPlace(c,r),cx=c*TILE+TILE/2,cy=r*TILE+TILE/2;
  g.globalAlpha=.28;g.fillStyle=ok?'#3ee6c4':'#ff3b3b';
  g.fillRect(c*TILE+2,r*TILE+2,TILE-4,TILE-4);g.globalAlpha=1;
  g.strokeStyle=ok?'#3ee6c4':'#ff3b3b';g.lineWidth=2;
  g.strokeRect(c*TILE+2.5,r*TILE+2.5,TILE-5,TILE-5);
  if(ok&&buildSel==='turret'){
    g.strokeStyle='rgba(77,195,255,.35)';g.lineWidth=1.5;
    g.beginPath();g.arc(cx,cy,BLD.turret.range,0,Math.PI*2);g.stroke();
  }
}
function drawFog(){
  if(S.mod!=='fog')return;
  const grd=g.createRadialGradient(P.x,P.y,50,P.x,P.y,260);
  grd.addColorStop(0,'rgba(0,0,0,0)');grd.addColorStop(1,'rgba(0,0,0,.93)');
  g.fillStyle=grd;g.fillRect(0,0,W,PH);
}
// [FEAT-F79] Responsive HUD. Sizes are expressed in CSS pixels and multiplied by 1/scale, so the
// HUD keeps a readable physical size on small screens. Small viewports also switch to a compact
// layout with a taller build bar and a two-row slot grid.
function hudFont(cssPx){return Math.max(8,Math.round(cssPx*hudScale));}
function hudTextW(text,fontPx){const sc=fontPx/8;return Math.max(0,text.length*6*sc-sc);}
function computeBuildLayout(){
  const by0=GY+PH;buildRects=[];nextRect=null;
  const touchUI=isTouchDevice();
  if(hudCompact){
    const pad=10,gap=8,reserve=touchUI?236:0;
    const areaW=W-pad*2-reserve-(reserve?gap:0);
    const w=Math.floor((areaW-gap*2)/3),rh=Math.floor((BH-8-4)/2);
    for(let i=0;i<6;i++){const col=i%3,row=(i/3)|0;buildRects.push({x:pad+col*(w+gap),y:by0+4+row*(rh+4),w:w,h:rh,i:i});}
    if(touchUI)nextRect={x:W-pad-228,y:by0+4,w:228,h:BH-8};
  }else{
    for(let i=0;i<6;i++)buildRects.push({x:12+i*131,y:by0+6,w:124,h:BH-12,i:i});
  }
}
function touchButtons(){
  const y=GY+PH-74;
  return {move:{x:106,y:y,r:62},fire:{x:W-112,y:y,r:50},dash:{x:W-232,y:y,r:36},bomb:{x:W-320,y:y,r:36},pause:{x:6,y:5,w:48,h:32}};
}
function drawAbilities(){
  if(isTouchDevice())return;
  const y=GY+PH-42;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(18,y-2,34,34);
  g.strokeStyle='#3ee6c4';g.lineWidth=2;g.strokeRect(21,y+1,28,28);
  if(P.dashCd>0){g.fillStyle='rgba(0,0,0,.7)';g.fillRect(22,y+2,26*(P.dashCd/1.5),26);}
  g.fillStyle='#3ee6c4';g.font='bold 10px monospace';
  g.textAlign='center';g.textBaseline='middle';g.fillText('DASH',33,y+14);
  g.font='9px monospace';g.fillStyle='#7ee0c9';g.fillText('SHIFT',33,y+26);
  const bx=62;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(bx-2,y-2,34,34);
  g.strokeStyle='#ff9f43';g.strokeRect(bx+1,y+1,28,28);
  if(P.bombCd>0){g.fillStyle='rgba(0,0,0,.7)';g.fillRect(bx+2,y+2,26*(P.bombCd/8),26);}
  g.fillStyle='#ff9f43';g.font='bold 10px monospace';g.fillText('BOMB',bx+15,y+14);
  g.font='9px monospace';g.fillText('F',bx+15,y+26);
  const wx=bx+44;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(wx-2,y-2,86,34);
  g.strokeStyle=WPN[P.weapon].color;g.strokeRect(wx+1,y+1,80,28);
  g.fillStyle=WPN[P.weapon].color;g.font='bold 11px monospace';
  g.fillText(WPN[P.weapon].name,wx+41,y+13);
  g.font='9px monospace';g.fillStyle='#7ee0c9';g.fillText('Q / E',wx+41,y+25);
}
function drawHUD(){
  const compact=hudCompact;
  g.textBaseline='middle';
  g.fillStyle=C.panel;g.fillRect(0,0,W,GY);
  g.fillStyle=C.edge;g.fillRect(0,GY-2,W,2);

  // ---- left cluster: scrap, weapon chip, combo, status icons ----
  const fScrap=hudFont(18),fWpn=hudFont(11),fCombo=hudFont(12);
  const scrapTxt='\u25C8 '+Math.floor(S.scrap);
  const sx=isTouchDevice()?(compact?62:54):16;
  g.textAlign='left';g.font='bold '+fScrap+'px "Courier New",monospace';g.fillStyle=C.gen;
  g.fillText(scrapTxt,sx,GY/2+1);
  let lx=sx+hudTextW(scrapTxt,fScrap)+hudFont(14);
  const bw=compact?Math.round(W*0.24):180,bh=compact?20:16,bx=W-bw-12,by=compact?3:(GY-bh)/2;
  const centreLimit=bx-hudFont(16);
  const wpnTxt=WPN[P.weapon].name,wWpn=hudTextW(wpnTxt,fWpn);
  wpnRect=null;
  if(lx+wWpn+hudFont(14)<centreLimit){
    wpnRect={x:lx-hudFont(5),y:GY/2-hudFont(9),w:wWpn+hudFont(10),h:hudFont(18)};
    g.fillStyle='rgba(120,200,255,.10)';g.fillRect(wpnRect.x,wpnRect.y,wpnRect.w,wpnRect.h);
    if(isTouchDevice()){g.strokeStyle='rgba(120,200,255,.35)';g.lineWidth=1;g.strokeRect(wpnRect.x+0.5,wpnRect.y+0.5,wpnRect.w-1,wpnRect.h-1);}
    g.fillStyle=WPN[P.weapon].color;g.font='bold '+fWpn+'px "Courier New",monospace';
    g.fillText(wpnTxt,lx,GY/2+1);
    lx+=wWpn+hudFont(18);
  }
  if(S.combo>1){const t='x'+S.combo;g.fillStyle='#ff9f43';g.font='bold '+fCombo+'px "Courier New",monospace';g.fillText(t,lx,GY/2+1);lx+=hudTextW(t,fCombo)+hudFont(10);}
  if(P.rapidT>0){g.fillStyle='#ff5d5d';g.font='bold '+fCombo+'px monospace';g.fillText('\u26A1',lx,GY/2+1);lx+=hudFont(18);}
  if(P.damageT>0){g.fillStyle='#b06bff';g.font='bold '+fCombo+'px monospace';g.fillText('\u2694',lx,GY/2+1);}

  // ---- centre: wave (+ score when there is room) ----
  g.textAlign='center';
  const mt=(S.mod?' ['+S.mod.toUpperCase()+']':'')+(activeMutators.length?' {MUT '+activeMutators.length+'}':'')+(S.endless?' [ENDLESS]':'');
  const waveTxt='WAVE '+String(S.wave).padStart(2,'0')+mt;
  const half=Math.min(W/2-lx-hudFont(10),bx-W/2-hudFont(compact?64:10));
  const fWave=hudFont(compact?16:15);
  g.font='bold '+fWave+'px "Courier New",monospace';g.fillStyle=C.text;
  if(half>hudFont(46))g.fillText(waveTxt,W/2,compact?GY/2+1:GY/2-7,Math.max(hudFont(60),half*2));
  else g.fillText('W'+String(S.wave).padStart(2,'0'),W/2,GY/2+1,Math.max(hudFont(34),half*2));
  if(!compact){
    g.font='bold '+hudFont(12)+'px "Courier New",monospace';g.fillStyle=C.dim;
    g.fillText('SCORE '+S.score.toLocaleString(),W/2,GY/2+11,Math.max(hudFont(80),half*2));
  }

  // ---- right: core integrity ----
  g.fillStyle='#180a12';g.fillRect(bx,by,bw,bh);
  const hpF=Math.max(0,core.hp/core.maxHp);
  g.fillStyle=hpF>.5?C.core:hpF>.25?'#ff9f43':'#ff3b3b';
  g.fillRect(bx,by,bw*hpF,bh);
  g.strokeStyle='#3a1a2c';g.lineWidth=2;g.strokeRect(bx+1,by+1,bw-2,bh-2);
  g.fillStyle='#fff';g.font='bold '+hudFont(compact?9:10)+'px "Courier New",monospace';g.textAlign='center';
  g.fillText(Math.ceil(core.hp)+'/'+core.maxHp,bx+bw/2,by+bh/2+1);
  g.textAlign='right';g.fillStyle=C.dim;g.font='bold '+hudFont(10)+'px "Courier New",monospace';
  g.fillText('CORE',bx-hudFont(8),by+bh/2+1);
  if(compact){
    g.textAlign='right';g.font='bold '+hudFont(9)+'px "Courier New",monospace';
    const line=isTouchDevice()?('SCORE '+S.score.toLocaleString()):(S.phase==='build'?('BUILD \u00B7 '+Math.ceil(S.timer)+'s'):('COMBAT \u00B7 '+E.length+' LEFT'));
    g.fillStyle=isTouchDevice()?C.dim:'#7ee0c9';
    g.fillText(line,W-12,31);
  }

  // ---- bottom: build bar ----
  const by0=GY+PH;
  g.fillStyle=C.panel;g.fillRect(0,by0,W,BH);
  g.fillStyle=C.edge;g.fillRect(0,by0,W,2);
  const slots=['turret','wall','gen','sniper','tesla','mortar'];
  const fIdx=hudFont(13),fName=hudFont(compact?11:10),fCost=hudFont(compact?12:10);
  for(const r of buildRects){
    const i=r.i,k=slots[i],def=BLD[k];
    const sel=buildSel===k,af=S.scrap>=def.cost;
    g.fillStyle=sel?'#16303d':(af?'#111a24':'#0d131a');
    g.fillRect(r.x,r.y,r.w,r.h);
    g.strokeStyle=sel?def.color:(af?'#22303f':'#19222c');g.lineWidth=2;
    g.strokeRect(r.x+1,r.y+1,r.w-2,r.h-2);
    g.globalAlpha=af?.95:.3;g.fillStyle=def.color;
    g.fillRect(r.x+hudFont(4),r.y+r.h/2-hudFont(5),hudFont(4),hudFont(10));g.globalAlpha=1;
    const idxTxt='['+(i+1)+']',idxX=r.x+hudFont(12);
    g.textAlign='left';g.font='bold '+fIdx+'px "Courier New",monospace';
    g.fillStyle=sel?def.color:(af?C.text:'#5a6a7d');g.fillText(idxTxt,idxX,r.y+r.h/2+1);
    const nameX=idxX+hudTextW(idxTxt,fIdx)+hudFont(8);
    const costW=hudTextW(String(def.cost),fCost)+hudFont(16);
    g.fillStyle=af?C.text:'#4a5563';g.font='bold '+fName+'px "Courier New",monospace';
    g.fillText(def.name,nameX,r.y+r.h/2+1,Math.max(hudFont(20),r.x+r.w-costW-nameX));
    g.textAlign='right';g.fillStyle=af?C.gen:'#4a5563';g.font='bold '+fCost+'px "Courier New",monospace';
    g.fillText(def.cost,r.x+r.w-hudFont(8),r.y+r.h/2+1);
  }
  if(!compact&&!isTouchDevice()){
    const lastR=buildRects[buildRects.length-1];
    const avail=Math.max(60,(lastR?lastR.x+lastR.w:0)?W-16-(lastR.x+lastR.w)-16:W-32);
    g.textAlign='right';g.font='bold '+hudFont(12)+'px "Courier New",monospace';
    if(S.phase==='build'){
      const n=Math.ceil(S.timer);
      const txt=avail>hudFont(300)?('BUILD \u00B7 NEXT IN '+n+'s \u00B7 HOLD [SPACE]'):('NEXT IN '+n+'s');
      g.fillStyle=S.timer<3?'#ff3b55':'#7ee0c9';if(S.timer<3&&Math.floor(S.t*2)%2===0)g.globalAlpha=.35;
      g.fillText(txt,W-16,by0+BH/2+1,avail);g.globalAlpha=1;
    }else{
      g.fillStyle='#ff8080';g.fillText('COMBAT \u00B7 '+E.length+' LEFT',W-16,by0+BH/2+1,avail);
    }
  }
  if(spaceHold>0){g.fillStyle='#071019';g.fillRect(W/2-90,GY+PH-9,180,5);g.fillStyle='#3ee6c4';g.fillRect(W/2-90,GY+PH-9,180*Math.min(1,spaceHold/.5),5);}
  if(S.phase==='build'&&S.nextQueue){
    const cnt={};for(const t of S.nextQueue)cnt[t]=(cnt[t]||0)+1;
    const parts=Object.entries(cnt).map(([t,n])=>n+'\u00D7'+t.toUpperCase());
    g.textAlign='center';g.font='bold '+hudFont(11)+'px "Courier New",monospace';
    g.fillStyle='#93a5b8';
    g.fillText('INCOMING: '+parts.join('  \u00B7  '),W/2,GY+hudFont(16),W-hudFont(70));
    if(S.nextMod){g.fillStyle='#ff9f43';g.fillText('['+S.nextMod.toUpperCase()+']',W/2,GY+hudFont(32),W-hudFont(70));}
  }
  if(S.msgT>0&&S.msg){
    const a=Math.min(1,S.msgT*1.4);g.globalAlpha=a;
    g.textAlign='center';g.font='bold '+hudFont(compact?26:40)+'px "Courier New",monospace';
    g.fillStyle='rgba(0,0,0,.6)';g.fillText(S.msg,W/2+3,GY+130+3,W-hudFont(60));
    g.fillStyle=KILL[S.combo]?'#ff9f43':'#3ee6c4';g.fillText(S.msg,W/2,GY+130,W-hudFont(60));
    g.globalAlpha=1;
  }
}
function drawTitle(){
  g.fillStyle='rgba(4,8,12,.94)';g.fillRect(0,0,W,cv.height);
  const p=.5+.5*Math.sin(S.t*2);g.textAlign='center';g.textBaseline='middle';
  g.save();g.shadowColor='#3ee6c4';g.shadowBlur=30+p*20;g.fillStyle='#3ee6c4';g.font='bold 52px "Courier New",monospace';g.fillText('SCRAP & GUN',W/2,95);g.restore();
  g.fillStyle='#5a6b80';g.font='bold 13px "Courier New",monospace';g.fillText('BUILD · DEFEND · SURVIVE',W/2,132);
  g.fillStyle='#ffcc33';g.font='bold 13px monospace';g.fillText('MAP: '+selectedMap.toUpperCase()+'     MODE: '+selectedMode.toUpperCase()+(selectedMode==='daily'?' · SEED '+dailySeed:''),W/2,166);
  const buttons=[
    {x:100,y:205,w:220,h:42,label:'ARENA',act:'arena'},{x:370,y:205,w:220,h:42,label:'CROSS',act:'cross'},{x:640,y:205,w:220,h:42,label:'MAZE',act:'maze'},
    {x:100,y:263,w:220,h:42,label:'NORMAL RUN',act:'normal'},{x:370,y:263,w:220,h:42,label:'DAILY-SEED',act:'daily'},{x:640,y:263,w:220,h:42,label:'ENDLESS',act:'endless'},
    {x:100,y:330,w:220,h:42,label:'MUTATORS',act:'mutators'},{x:370,y:330,w:220,h:42,label:'TECH TREE',act:'tech'},{x:640,y:330,w:220,h:42,label:'ENEMY CODEX',act:'codex'},{x:370,y:385,w:220,h:36,label:'RUN HISTORY',act:'history'},{x:640,y:385,w:220,h:36,label:saveAvailable?'CONTINUE RUN':'NO SAVED RUN',act:'continue'}
  ];
  for(const b of buttons){const hov=mouse.x>=b.x&&mouse.x<=b.x+b.w&&mouse.y>=b.y&&mouse.y<=b.y+b.h;g.fillStyle=hov?'#16303d':'#0d141d';g.fillRect(b.x,b.y,b.w,b.h);g.strokeStyle=hov?'#3ee6c4':(b.act===selectedMap||b.act===selectedMode?'#ffcc33':'#26384a');g.lineWidth=2;g.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);g.fillStyle=hov?'#3ee6c4':'#c8d6e5';g.font='bold 15px monospace';g.fillText(b.label,b.x+b.w/2,b.y+b.h/2);}
  g.fillStyle='#8fa3b8';g.font='bold 12px monospace';g.fillText('MUTATORS: '+(activeMutators.length?activeMutators.map(x=>x.toUpperCase()).join(' · '):'NONE')+'   |   TECH CORES: '+meta.cores+'   |   CODEX: '+meta.codex.length+'/'+Object.keys(ENM).length,W/2,435);
  g.fillStyle='#ff4fa3';g.font='bold 12px monospace';g.fillText('PROTECT THE CORE — IF IT FALLS, YOU FALL',W/2,460);
  g.fillStyle=C.gen;g.font='bold 13px monospace';g.fillText('BEST WAVE '+S.best+'   ·   ENDLESS BEST '+(+safeStore.getItem('sg_best_endless')||0),W/2,485);
  g.globalAlpha=.65+.35*Math.sin(S.t*4);g.fillStyle='#fff';g.font='bold 20px monospace';g.fillText('PRESS ENTER OR CLICK START TO PLAY',W/2,530);g.globalAlpha=1;
  g.fillStyle='#5a6b80';g.font='11px monospace';g.fillText('WASD MOVE · MOUSE AIM · SPACE NEXT WAVE · ESC PAUSE',W/2,566);g.fillStyle='#ffcc33';g.fillText('TITLE: R = RHYTHM MODE · C = LOCAL CO-OP (P2: IJKL / NUMPAD 0 FIRE / 1 DASH)',W/2,588);
  if(S.screen==='mutators')drawMetaPanel('MUTATORS',[
    ['NO TURRETS','noTurrets','+50% SCRAP'],['ONE LIFE','oneLife','PLAYER HP = CORE HP'],['PISTOL ONLY','pistolOnly','2× SCORE'],['SPEEDRUN','speedrun','10s WAVES'],['GLASS CANNON','glassCannon','2× PLAYER DAMAGE · 1/3 HP']]);
  if(S.screen==='tech')drawTechPanel();
  if(S.screen==='codex')drawCodexPanel();
}
function drawMetaPanel(title,rows){g.fillStyle='rgba(0,0,0,.92)';g.fillRect(150,80,660,570);g.strokeStyle='#3ee6c4';g.strokeRect(151,81,658,568);g.fillStyle='#3ee6c4';g.font='bold 30px monospace';g.textAlign='center';g.fillText(title,W/2,120);g.fillStyle='#8fa3b8';g.font='12px monospace';g.fillText('CLICK TO TOGGLE · MAX 3 MUTATORS · ESC/BACK TO RETURN',W/2,151);rows.forEach((r,i)=>{const y=190+i*65,on=activeMutators.includes(r[1]);g.fillStyle=on?'#173b35':'#101923';g.fillRect(205,y-22,550,44);g.strokeStyle=on?'#3ee6c4':'#26384a';g.strokeRect(206,y-21,548,42);g.textAlign='left';g.fillStyle=on?'#3ee6c4':'#c8d6e5';g.font='bold 15px monospace';g.fillText((on?'[ON] ':'[OFF] ')+r[0],225,y-3);g.textAlign='right';g.fillStyle='#8fa3b8';g.font='11px monospace';g.fillText(r[2],735,y-3);});g.textAlign='center';g.fillStyle='#ffcc33';g.font='bold 13px monospace';g.fillText('BACK',W/2,550);}
function drawTechPanel(){g.fillStyle='rgba(0,0,0,.94)';g.fillRect(130,70,700,590);g.strokeStyle='#3ee6c4';g.strokeRect(131,71,698,588);g.textAlign='center';g.fillStyle='#3ee6c4';g.font='bold 30px monospace';g.fillText('TECH TREE',W/2,110);g.fillStyle='#ffcc33';g.font='bold 14px monospace';g.fillText('AVAILABLE CORES: '+meta.cores,W/2,140);const rows=[['turret','TURRET HP +20%','3 TIERS · 1/2/3 CORES'],['scrap','START SCRAP +50','3 TIERS · 1/2/3 CORES'],['smg','UNLOCK SMG FROM START','1 CORE'],['dash','DASH COOLDOWN -0.3s','1 CORE'],['shield','+1 STARTING SHIELD','1 CORE']];rows.forEach((r,i)=>{const y=190+i*62,lv=meta.tree[r[0]]||0;g.fillStyle='#101923';g.fillRect(185,y-21,590,42);g.strokeStyle='#26384a';g.strokeRect(186,y-20,588,40);g.textAlign='left';g.fillStyle='#c8d6e5';g.font='bold 14px monospace';g.fillText(r[1],205,y-3);g.fillStyle='#8fa3b8';g.font='11px monospace';g.fillText(r[2]+' · LV '+lv,205,y+12);g.textAlign='right';g.fillStyle='#3ee6c4';g.font='bold 12px monospace';g.fillText('BUY / UPGRADE',755,y+2);});g.textAlign='center';g.fillStyle='#ff9f43';g.font='bold 12px monospace';g.fillText('RESET TREE (REFUND CORES) — CLICK HERE',W/2,520);g.fillStyle='#c8d6e5';g.fillText('BACK',W/2,555);}
function drawCodexPanel(){g.fillStyle='rgba(0,0,0,.94)';g.fillRect(90,55,780,610);g.strokeStyle='#3ee6c4';g.strokeRect(91,56,778,608);g.textAlign='center';g.fillStyle='#3ee6c4';g.font='bold 28px monospace';g.fillText('ENEMY CODEX',W/2,92);const lore={grunt:'Standard core-seeking infantry.',runner:'Fast, fragile and hard to track.',tank:'Armoured bruiser with heavy impact.',boss:'A wave-ending threat with unique tactics.',healer:'Supports nearby hostile units.',shooter:'Attacks from a distance.',splitter:'Breaks into smaller units when killed.',bomber:'Rushes targets and detonates.',shielded:'Front-facing shield; flank to bypass.',flyer:'Ignores walls and flies straight to the core.'};Object.entries(ENM).forEach(([k,d],i)=>{const col=i%2,row=Math.floor(i/2),x=125+col*370,y=130+row*92,unlocked=meta.codex.includes(k);g.fillStyle='#101923';g.fillRect(x,y,340,76);g.strokeStyle=unlocked?d.color:'#26384a';g.strokeRect(x+1,y+1,338,74);g.fillStyle=unlocked?d.color:'#4a5563';g.beginPath();g.arc(x+25,y+27,unlocked?d.r*.65:10,0,Math.PI*2);g.fill();g.textAlign='left';g.fillStyle=unlocked?'#c8d6e5':'#647386';g.font='bold 13px monospace';g.fillText(unlocked?k.toUpperCase():'??? LOCKED',x+48,y+21);g.font='10px monospace';g.fillText(unlocked?`HP ${d.hp} · SPD ${d.speed} · SCRAP ${d.scrap}`:'DEFEAT THIS ENEMY TO IDENTIFY IT',x+48,y+39);g.fillStyle='#8fa3b8';g.fillText(unlocked?lore[k]:'Unknown hostile signature.',x+48,y+56);});g.textAlign='center';g.fillStyle='#c8d6e5';g.font='bold 14px monospace';g.fillText('BACK',W/2,626);}
function drawDraft(){g.fillStyle='rgba(0,0,0,.92)';g.fillRect(0,0,W,cv.height);g.textAlign='center';g.fillStyle='#ffcc33';g.font='bold 30px monospace';g.fillText('WAVE CLEAR · CHOOSE ONE UPGRADE',W/2,155);g.fillStyle=C.text;g.font='13px monospace';g.fillText('PICK ONE CARD · UPGRADES STACK FOR THIS RUN ONLY',W/2,185);(rogueDraft||[]).forEach((c,i)=>{const x=75+i*280,y=240,w=250,h=235;g.fillStyle='#101923';g.fillRect(x,y,w,h);g.strokeStyle=c.color;g.lineWidth=3;g.strokeRect(x+1,y+1,w-2,h-2);g.fillStyle=c.color;g.font='bold 15px monospace';g.fillText('['+(i+1)+']',x+w/2,y+40);g.font='bold 17px monospace';g.fillText(c.name,x+w/2,y+90);g.fillStyle=C.text;g.font='12px monospace';wrapCanvasText(c.desc,x+w/2,y+130,w-30,18);g.fillStyle='#8fa3b8';g.font='11px monospace';g.fillText('SELECT CARD',x+w/2,y+205);});g.fillStyle='#8fa3b8';g.font='11px monospace';g.fillText('Click a card or press 1, 2, or 3',W/2,525);}
function wrapCanvasText(txt,x,y,maxWidth,lineHeight){const words=txt.split(' ');let line='';const lines=[];for(const word of words){const test=line?line+' '+word:word;if(g.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);lines.forEach((l,i)=>g.fillText(l,x,y+i*lineHeight));}
function chooseRogueCard(i){const c=rogueDraft?.[i];if(!c)return;S.rogue=S.rogue||{};S.rogue[c.id]=(S.rogue[c.id]||0)+1;if(c.id==='genDouble')S.genDoubleWave=1;if(c.id==='maxHp'){P.maxHp+=20;P.hp=Math.min(P.maxHp,P.hp+20);if(P2){P2.maxHp+=10;P2.hp=Math.min(P2.maxHp,P2.hp+10);}}if(c.id==='scrap')S.scrap+=40;if(c.id==='coreRegen')core.hp=Math.min(core.maxHp,core.hp+50);if(c.id==='shield'){P.shield=(P.shield||0)+1;if(P2)P2.shield=(P2.shield||0)+1;}if(c.id==='wallHp')for(const b of B)if(b.type==='wall'){b.maxHp*=1.25;b.hp*=1.25;}rogueDraft=null;S.rogueDraft=null;S.screen='playing';S.phase='build';S.timer=S.endless?0:(isMutator('speedrun')?10:20);saveMidRun();sfx(760,.15,'square',.06,1100);}
function drawTimeLoop(){g.fillStyle='rgba(4,0,12,.94)';g.fillRect(0,0,W,cv.height);g.strokeStyle='#b06bff';g.lineWidth=3;g.strokeRect(100,120,760,390);g.textAlign='center';g.fillStyle='#b06bff';g.font='bold 38px monospace';g.fillText('TIME LOOP DETECTED',W/2,190);g.fillStyle=C.text;g.font='16px monospace';g.fillText('Rewind to the start of Wave '+(S.wave||1)+'?',W/2,240);g.fillStyle='#ffcc33';g.font='bold 16px monospace';g.fillText(timeLoopUsed?'COST: 1 BOSS CORE':'COST: ONE FREE REWIND THIS RUN',W/2,280);g.fillStyle='#3ee6c4';g.fillRect(230,330,210,58);g.fillStyle='#041016';g.font='bold 18px monospace';g.fillText('Y — REWIND',335,359);g.fillStyle='#ff5d5d';g.fillRect(520,330,210,58);g.fillStyle='#17040a';g.fillText('N — ACCEPT DEATH',625,359);g.fillStyle='#9aa8b8';g.font='12px monospace';g.fillText('Rewind restores the saved wave-start state; current wave progress is lost.',W/2,430);}
function drawGameOver(){
  g.fillStyle='rgba(20,2,8,.85)';g.fillRect(0,0,W,cv.height);
  g.textAlign='center';g.textBaseline='middle';
  g.save();g.shadowColor='#ff3b6b';g.shadowBlur=30;
  g.fillStyle='#ff3b6b';g.font='bold 58px "Courier New",monospace';
  g.fillText('GAME OVER',W/2,220);g.restore();
  g.fillStyle='#ffb0c0';g.font='bold 18px "Courier New",monospace';
  g.fillText(S.reason||'',W/2,275);
  g.fillStyle=C.text;g.font='bold 20px "Courier New",monospace';
  g.fillText('WAVE: '+S.wave,W/2,340);
  g.fillText('KILLS: '+S.kills+'  ('+Math.floor(runStats.killPoints)+' PTS)',W/2,365);g.fillText('WAVES: '+S.wave+'  ('+Math.floor(runStats.wavePoints)+' PTS)',W/2,395);g.fillText('COMBOS: '+Math.floor(runStats.comboPoints)+' PTS',W/2,425);g.fillText('BUILDINGS: '+(S.buildingsBuilt||0)+'  ·  MUTATORS +'+Math.round((mutatorScoreMult()-1)*100)+'%',W/2,455);g.fillText('TOTAL: '+Math.floor(S.score).toLocaleString(),W/2,485);
  g.fillStyle=C.gen;g.font='bold 16px "Courier New",monospace';
  g.fillText('BEST: WAVE '+S.best+(S.endless?' · ENDLESS '+(+safeStore.getItem('sg_best_endless')||0):''),W/2,455);
  if(S.overT>.8){
    g.globalAlpha=.55+.45*Math.sin(S.t*4);
    g.fillStyle='#fff';g.font='bold 22px "Courier New",monospace';
    g.fillText('CLICK OR PRESS ENTER TO RETRY',W/2,545);
    g.globalAlpha=1;
  }
}
function pauseLayout(){
  const hs=Math.max(1,hudScale);
  const w=Math.min(W-40,Math.round(300*hs)),h=Math.round(40*hs),gap=Math.round(18*hs);
  const total=4*h+3*gap,top=Math.round(GY+(PH-total)/2);
  const rows=[];for(let i=0;i<4;i++)rows.push({y:top+i*(h+gap),w:w,h:h});
  return {rows:rows,titleY:top-Math.round(30*hs),titleFont:Math.round(28*hs),font:Math.round(18*hs)};
}
function drawPause(){
  const L=pauseLayout();
  g.fillStyle='rgba(4,8,12,.94)';g.fillRect(0,0,W,cv.height);
  g.textAlign='center';g.textBaseline='middle';
  g.save();g.shadowColor='#3ee6c4';g.shadowBlur=20;
  g.fillStyle='#3ee6c4';g.font='bold '+L.titleFont+'px "Courier New",monospace';
  g.fillText('PAUSED',W/2,L.titleY);g.restore();
  const opts=['RESUME','SETTINGS','RESTART','QUIT TO TITLE'];
  for(let i=0;i<opts.length;i++){
    const r=L.rows[i];
    const hov=mouse.x>W/2-r.w/2&&mouse.x<W/2+r.w/2&&mouse.y>r.y&&mouse.y<r.y+r.h;
    g.fillStyle=hov?'#16303d':'#0d141d';g.fillRect(W/2-r.w/2,r.y,r.w,r.h);
    g.strokeStyle=hov?'#3ee6c4':'#1c2a3a';g.lineWidth=2;
    g.strokeRect(W/2-r.w/2+1,r.y+1,r.w-2,r.h-2);
    g.fillStyle=hov?'#3ee6c4':'#c8d6e5';g.font='bold '+L.font+'px "Courier New",monospace';
    g.fillText(opts[i],W/2,r.y+r.h/2+1);
  }
}
function getSettingsRows(){return [
 {y:82,label:'MASTER VOLUME',value:Math.round(settings.volume*100)+'%',key:'volume'},
 {y:106,label:'SCREEN SHAKE',value:settings.shake?'ON':'OFF',key:'shake'},
 {y:130,label:'SCANLINES',value:settings.scan?'ON':'OFF',key:'scan'},
 {y:154,label:'SCANLINE INTENSITY',value:settings.scanIntensity+'%',key:'scanIntensity'},
 {y:178,label:'COLORBLIND PALETTE',value:settings.palette.toUpperCase(),key:'palette'},
 {y:202,label:'VISUAL THEME',value:({default:'DEFAULT',gameboy:'GAME BOY',amber:'AMBER',cyberpunk:'CYBERPUNK'})[settings.theme]||'DEFAULT',key:'theme'},
 {y:226,label:'REDUCED MOTION',value:settings.reducedMotion?'ON':'OFF',key:'motion'},
 {y:250,label:'MUSIC',value:settings.musicEnabled?'ON':'OFF',key:'music'},
 {y:274,label:'ROBOT ANNOUNCER',value:settings.announcer?'ON':'OFF',key:'announcer'},
 {y:298,label:'CRT CURVATURE',value:settings.curvature?'ON':'OFF',key:'curvature'},
 {y:322,label:'CHROMATIC FRINGE',value:settings.chromatic?'ON':'OFF',key:'chromatic'},
 {y:345,label:'PIXEL FONT',value:settings.pixelFont?'ON':'OFF',key:'pixelFont'},
 {y:368,label:'FPS / FRAME GRAPH',value:settings.showFps?'ON':'OFF',key:'fps'},
 ...[['up','MOVE UP'],['down','MOVE DOWN'],['left','MOVE LEFT'],['right','MOVE RIGHT'],['prev','PREV WEAPON'],['next','NEXT WEAPON'],['bomb','BOMB'],['dash','DASH'],['wave','NEXT WAVE']].map((a,i)=>({y:391+i*23,label:a[1],value:(settings.keybinds[a[0]]===' '?'SPACE':settings.keybinds[a[0]]).toUpperCase()+(waitingForBind===a[0]?' · PRESS KEY':''),key:'bind:'+a[0]})),
 {y:600,label:'FULLSCREEN',value:'TOGGLE',key:'fullscreen'},
 {y:618,label:'RESET KEYBINDS',value:'DEFAULT',key:'reset'},
 {y:636,label:'BACK',value:'',key:'back'}];}
function drawSettings(){g.fillStyle='rgba(4,8,12,.96)';g.fillRect(0,0,W,cv.height);g.textAlign='center';g.textBaseline='middle';g.fillStyle=C.player;g.font='bold 30px monospace';g.fillText('SETTINGS & ACCESSIBILITY',W/2,48);settingsRows=getSettingsRows();for(const r of settingsRows){const hov=mouse.x>W/2-230&&mouse.x<W/2+230&&mouse.y>r.y-13&&mouse.y<r.y+13;g.fillStyle=hov?'#16303d':'#0d141d';g.fillRect(W/2-230,r.y-13,460,26);g.strokeStyle=hov?C.player:'#1c2a3a';g.strokeRect(W/2-229,r.y-12,458,24);g.textAlign='left';g.fillStyle=C.text;g.font='bold 12px monospace';g.fillText(r.label,W/2-215,r.y);g.textAlign='right';g.fillStyle=r.key.startsWith('bind:')&&waitingForBind===r.key.slice(5)?'#ffcc33':C.player;g.fillText(r.value,W/2+215,r.y);}g.textAlign='center';g.fillStyle=C.dim;g.font='10px monospace';g.fillText('CLICK A ROW · ESC TO RETURN · F11 FULLSCREEN',W/2,650);}

function drawCrosshair(){const a=P.ang,cx=P.x+Math.cos(a)*30,cy=GY+P.y+Math.sin(a)*30,k=P.crossKick;g.save();g.translate(cx,cy);g.strokeStyle=WPN[P.weapon].color;g.fillStyle=WPN[P.weapon].color;g.lineWidth=1.5;if(P.weapon==='shotgun'){g.beginPath();g.arc(0,0,10+k,0,Math.PI*2);g.stroke();for(const [x,y] of [[0,-14],[14,0],[0,14],[-14,0]]){g.beginPath();g.arc(x,y,1.8,0,Math.PI*2);g.fill();}}else if(P.weapon==='smg'){g.beginPath();g.moveTo(-8,-5);g.lineTo(-3,0);g.lineTo(-8,5);g.moveTo(8,-5);g.lineTo(3,0);g.lineTo(8,5);g.stroke();g.globalAlpha=.35;g.beginPath();g.arc(0,0,7+k,0,Math.PI*2);g.stroke();}else{g.beginPath();g.moveTo(-5-k,0);g.lineTo(5+k,0);g.moveTo(0,-5-k);g.lineTo(0,5+k);g.stroke();}g.restore();}
function drawHitMarkers(){for(let i=hitMarkers.length-1;i>=0;i--){const h=hitMarkers[i];h.life-=.016;if(h.life<=0){hitMarkers.splice(i,1);continue;}g.save();g.globalAlpha=Math.min(1,h.life/.08);g.strokeStyle=h.color;g.lineWidth=2;g.beginPath();g.moveTo(h.x-4,GY+h.y-4);g.lineTo(h.x+4,GY+h.y+4);g.moveTo(h.x+4,GY+h.y-4);g.lineTo(h.x-4,GY+h.y+4);g.stroke();g.restore();}}
function drawBuildTooltip(){if(S.screen!=='playing'||isTouchDevice()||mouse.y<GY+PH||mouse.y>GY+PH+BH)return;const r=buildRects.find(b=>mouse.x>=b.x&&mouse.x<=b.x+b.w&&mouse.y>=b.y&&mouse.y<=b.y+b.h);if(!r)return;const k=['turret','wall','gen','sniper','tesla','mortar'][r.i],d=BLD[k];if(!d)return;const x=clamp(mouse.x-115,8,W-238),y=GY+PH-126;g.fillStyle='rgba(2,7,12,.96)';g.fillRect(x,y,230,112);g.strokeStyle=d.color;g.strokeRect(x+1,y+1,228,110);g.fillStyle=d.color;g.font='bold 12px monospace';g.textAlign='left';g.fillText(d.name+' · COST '+d.cost,x+10,y+18);g.fillStyle=C.text;g.font='11px monospace';g.fillText('HP '+d.hp+' · DMG '+(d.dmg||0),x+10,y+37);g.fillText('RATE '+(d.rate||'—')+'s · RANGE '+(d.range||'—'),x+10,y+54);g.fillText('DPS '+(d.dmg&&d.rate?Math.round(d.dmg/d.rate):'—'),x+10,y+71);g.fillText(({turret:'Balanced automatic defence.',wall:'Blocks and absorbs enemy attacks.',gen:'Generates resources over time.',sniper:'Long-range, high-damage shot.',tesla:'Short-range electrical attack.',mortar:'Explosive area damage.'})[k],x+10,y+91);}
function drawSellProgress(){if(!sellTarget)return;g.save();g.strokeStyle='#ff9f43';g.lineWidth=4;g.beginPath();g.arc(sellTarget.x,sellTarget.y,24,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,sellHold/.4));g.stroke();g.restore();}
function drawAchievementToast(){if(!achievementToast)return;achievementToast.life-=.016;if(achievementToast.life<=0){achievementToast=null;return;}g.save();g.globalAlpha=Math.min(1,achievementToast.life);g.fillStyle='rgba(3,10,16,.94)';g.fillRect(W-255,58,240,48);g.strokeStyle='#ffcc33';g.strokeRect(W-254,59,238,46);g.textAlign='center';g.fillStyle='#ffcc33';g.font='bold 11px monospace';g.fillText('ACHIEVEMENT UNLOCKED',W-135,73);g.fillStyle='#fff';g.font='bold 14px monospace';g.fillText(achievementToast.label,W-135,91);g.restore();}
function drawTouchControls(){
  const B=touchButtons();
  g.save();
  g.globalAlpha=.92;g.fillStyle='rgba(6,14,22,.9)';g.fillRect(B.pause.x,B.pause.y,B.pause.w,B.pause.h);
  g.strokeStyle='#3ee6c4';g.lineWidth=2;g.strokeRect(B.pause.x+1,B.pause.y+1,B.pause.w-2,B.pause.h-2);
  g.fillStyle='#3ee6c4';g.fillRect(B.pause.x+14,B.pause.y+9,5,14);g.fillRect(B.pause.x+27,B.pause.y+9,5,14);
  if(nextRect){
    g.globalAlpha=.95;g.textAlign='center';g.textBaseline='middle';
    if(S.phase==='build'){
      g.fillStyle='rgba(6,14,22,.94)';g.fillRect(nextRect.x,nextRect.y,nextRect.w,nextRect.h);
      g.strokeStyle='#7ee0c9';g.lineWidth=2;g.strokeRect(nextRect.x+1,nextRect.y+1,nextRect.w-2,nextRect.h-2);
      g.fillStyle='#7ee0c9';g.font='bold '+hudFont(14)+'px "Courier New",monospace';
      g.fillText('NEXT '+Math.ceil(S.timer)+'s',nextRect.x+nextRect.w/2,nextRect.y+nextRect.h/2+1);
    }else{
      g.fillStyle='#ff8080';g.font='bold '+hudFont(12)+'px "Courier New",monospace';
      g.fillText('COMBAT',nextRect.x+nextRect.w/2,nextRect.y+nextRect.h/2-hudFont(7));
      g.fillStyle='#ffb3b3';g.fillText(E.length+' LEFT',nextRect.x+nextRect.w/2,nextRect.y+nextRect.h/2+hudFont(9));
    }
  }
  const ring=(c,col)=>{g.strokeStyle=col;g.lineWidth=3;g.beginPath();g.arc(c.x,c.y,c.r,0,Math.PI*2);g.stroke();};
  g.globalAlpha=.9;g.fillStyle='rgba(6,14,22,.32)';g.beginPath();g.arc(B.move.x,B.move.y,B.move.r,0,Math.PI*2);g.fill();
  g.globalAlpha=.42;ring(B.move,'#d8e7f4');
  g.globalAlpha=.9;g.fillStyle='rgba(6,14,22,.32)';g.beginPath();g.arc(B.fire.x,B.fire.y,B.fire.r,0,Math.PI*2);g.fill();
  g.globalAlpha=.5;ring(B.fire,'#3ee6c4');
  g.globalAlpha=.9;g.fillStyle=touchFire?'#ff9f43':'#3ee6c4';g.beginPath();g.arc(B.fire.x,B.fire.y,B.fire.r*0.44,0,Math.PI*2);g.fill();
  g.globalAlpha=.9;g.fillStyle='rgba(6,14,22,.32)';g.beginPath();g.arc(B.dash.x,B.dash.y,B.dash.r,0,Math.PI*2);g.arc(B.bomb.x,B.bomb.y,B.bomb.r,0,Math.PI*2);g.fill();
  g.globalAlpha=.5;ring(B.dash,'#d8e7f4');ring(B.bomb,'#d8e7f4');
  g.globalAlpha=.92;g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
  g.font='bold '+hudFont(10)+'px "Courier New",monospace';
  g.fillText('MOVE',B.move.x,B.move.y+B.move.r-hudFont(13));
  g.fillText('FIRE',B.fire.x,B.fire.y+B.fire.r-hudFont(12));
  g.fillText('DASH',B.dash.x,B.dash.y+B.dash.r-hudFont(9));
  g.fillText('BOMB',B.bomb.x,B.bomb.y+B.bomb.r-hudFont(9));
  if(buildSel){
    g.globalAlpha=.95;g.fillStyle='#ffcc33';g.textAlign='center';
    g.font='bold '+hudFont(11)+'px "Courier New",monospace';
    g.fillText('TAP A TILE TO PLACE \u00B7 TAP SLOT TO CANCEL',W/2,GY+PH-hudFont(116),W-hudFont(80));
  }
  g.restore();
}
function drawHistory(){g.fillStyle='rgba(0,0,0,.94)';g.fillRect(100,60,760,600);g.strokeStyle=C.player;g.strokeRect(101,61,758,598);g.textAlign='center';g.fillStyle=C.player;g.font='bold 30px monospace';g.fillText('RUN HISTORY · LAST 10',W/2,105);g.textAlign='left';g.font='12px monospace';runHistory.forEach((r,i)=>{const y=150+i*42;g.fillStyle=i%2?'#0d141d':'#111b26';g.fillRect(135,y-17,690,34);g.fillStyle=C.text;g.fillText(`${i+1}. ${new Date(r.date).toLocaleDateString()} · ${r.mode.toUpperCase()} · WAVE ${r.wave} · KILLS ${r.kills} · SCORE ${r.score}`,150,y+1);});g.textAlign='center';g.fillStyle='#fff';g.fillText('BACK (ESC)',W/2,610);}
function render(){
  g=settings.curvature?offscreenG:visibleG;
  g.clearRect(0,0,W,cv.height);
  g.save();g.translate(0,GY);
  g.beginPath();g.rect(0,0,W,PH);g.clip();
  const shk=settings.shake&&!settings.reducedMotion?S.shake:0;
  if(shk>.05)g.translate((Math.random()-.5)*shk,(Math.random()-.5)*shk);
  drawField();drawDamageDecals();drawCore();drawBuildings();drawBullets();
  drawEnemies();drawPU();drawPlayer();if(P2)drawPlayer2();drawParticles();drawGhost();
  drawFog();
  if(bossIntro&&bossIntro.life>1.9){const a=Math.min(.55,(bossIntro.life-1.9)*1.1);g.fillStyle='rgba(0,0,0,'+a+')';g.fillRect(0,0,W,PH);g.fillStyle='#fff';g.textAlign='center';g.font='bold 28px monospace';g.fillText(bossIntro.name,W/2,PH*.28);}
  g.restore();
  const fl=settings.reducedMotion?0:(settings.shake?S.flash:S.flash*.3);
  if(fl>0){g.fillStyle='rgba(255,40,60,'+(fl*.3)+')';g.fillRect(0,GY,W,PH);}
  if(S.screen==='playing'&&core.hp/core.maxHp<.3){
    const p=.5+.5*Math.sin(S.t*6);
    g.fillStyle='rgba(255,30,60,'+(.05+p*.06)+')';g.fillRect(0,GY,W,PH);
  }
  drawThreatIndicators();drawRhythmIndicator();drawBossBar();drawHUD();if(S.screen==='playing')drawCrosshair();drawHitMarkers();drawBuildTooltip();drawSellProgress();drawAchievementToast();if(isTouchDevice()&&S.screen==='playing')drawTouchControls();
  if(S.screen==='playing')drawAbilities();
  if(S.screen==='history'&&(k==='escape'||k==='backspace')){S.screen='title';return;}if(['title','mutators','tech','codex'].includes(S.screen))drawTitle();
  if(S.screen==='draft')drawDraft();if(S.screen==='timeloop')drawTimeLoop();if(S.screen==='gameover')drawGameOver();
  if(S.screen==='paused')drawPause();
  if(S.screen==='settings')drawSettings();if(S.screen==='history')drawHistory();
  if(settings.curvature){visibleG.clearRect(0,0,W,cv.height);visibleG.drawImage(offscreenCanvas,0,0);}
  if(settings.showFps){const ctx=visibleG;ctx.save();ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(8,8,190,46);ctx.fillStyle='#7dff9b';ctx.font='bold 12px monospace';ctx.textAlign='left';ctx.fillText('FPS '+fpsValue+' · '+(frameTimes.length?Math.round(frameTimes[frameTimes.length-1]):0)+'ms',15,22);ctx.beginPath();ctx.strokeStyle='#7dff9b';ctx.lineWidth=1;const vals=frameTimes.slice(-60),max=Math.max(20,...vals);vals.forEach((v,i)=>{const x=15+i*2.8,y=47-(v/max)*18;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();}
}

// ===== INPUT =====
function handleTitleClick(x,y){
  if(S.screen==='mutators'){
    if(y>=168&&y<=500){const i=Math.floor((y-168)/65),keys=['noTurrets','oneLife','pistolOnly','speedrun','glassCannon'];if(i>=0&&i<keys.length){const k=keys[i];if(activeMutators.includes(k))activeMutators=activeMutators.filter(v=>v!==k);else if(activeMutators.length<3)activeMutators.push(k);return;}}
    if(y>520){S.screen='title';return;}return;
  }
  if(S.screen==='tech'){
    if(y>=165&&y<=485){const i=Math.floor((y-165)/62),keys=['turret','scrap','smg','dash','shield'];const costs={turret:[1,2,3],scrap:[1,2,3],smg:[1],dash:[1],shield:[1]};const k=keys[i];if(!k)return;const lv=meta.tree[k]||0,arr=costs[k];if(lv>=arr.length)return;const cost=arr[lv];if(meta.cores<cost)return;meta.cores-=cost;meta.tree[k]=lv+1;saveMeta();return;}
    if(y>=500&&y<540){meta.cores+=Object.entries(meta.tree).reduce((n,[k,v])=>n+(k==='turret'||k==='scrap'?[1,2,3].slice(0,v).reduce((a,b)=>a+b,0):v),0);meta.tree={turret:0,scrap:0,smg:0,dash:0,shield:0};saveMeta();return;}if(y>=540){S.screen='title';return;}return;
  }
  if(S.screen==='codex'){if(y>600)S.screen='title';return;}if(S.screen==='history'){if(y>580||y<120)S.screen='title';return;}
  if(y>=195&&y<=250){if(x<340)selectedMap='arena';else if(x<620)selectedMap='cross';else selectedMap='maze';resetGame();return;}
  if(y>=255&&y<=315){if(x<340)selectedMode='normal';else if(x<620)selectedMode='daily';else selectedMode='endless';resetGame();return;}
  if(y>=325&&y<=380){if(x<340)S.screen='mutators';else if(x<620)S.screen='tech';else S.screen='codex';return;}if(y>=380&&y<=430&&x>=350&&x<=610){S.screen='history';return;}if(y>=380&&y<=430&&x>=630&&x<=870){if(saveAvailable&&loadMidRun())return;return;}
  if(y>=495&&y<=570)startGame();
}
function updateMouse(e){
  const r=cv.getBoundingClientRect();
  mouse.x=(e.clientX-r.left)*(cv.width/r.width);
  mouse.y=(e.clientY-r.top)*(cv.height/r.height);
}
function handlePauseClick(x,y){
  const opts=['resume','settings','restart','quit'];
  const L=pauseLayout();
  for(let i=0;i<opts.length;i++){
    const r=L.rows[i];
    if(x>W/2-r.w/2&&x<W/2+r.w/2&&y>r.y&&y<r.y+r.h){
      if(opts[i]==='resume')S.screen='playing';
      else if(opts[i]==='settings')S.screen='settings';
      else if(opts[i]==='restart'){resetGame();startGame();}
      else if(opts[i]==='quit'){resetGame();}
      sfx(600,.1,'square',.05,900);return;
    }
  }
}
function handleSettingsClick(x,y){const r=settingsRows.find(v=>Math.abs(y-v.y)<12&&x>W/2-230&&x<W/2+230);if(!r)return;if(r.key==='volume'){const steps=[0,.25,.5,.75,1],i=steps.findIndex(v=>Math.abs(v-settings.volume)<.01);settings.volume=steps[(i+1)%steps.length];if(musicBus)musicBus.gain.setTargetAtTime(.22*settings.volume,actx.currentTime,.1);}else if(r.key==='shake')settings.shake=!settings.shake;else if(r.key==='scan'){settings.scan=!settings.scan;scanEl.style.display=settings.scan?'block':'none';scanEl.style.opacity=String(settings.scanIntensity/100);applyCRTOptions();}else if(r.key==='scanIntensity'){const steps=[0,20,40,60,80,100],idx=steps.reduce((best,v,i)=>Math.abs(v-settings.scanIntensity)<Math.abs(steps[best]-settings.scanIntensity)?i:best,0);settings.scanIntensity=steps[(idx+1)%steps.length];scanEl.style.opacity=String(settings.scan?settings.scanIntensity/100:0);}else if(r.key==='palette'){settings.palette=({default:'deuteranopia',deuteranopia:'protanopia',protanopia:'default'})[settings.palette]||'default';applyPalette();}else if(r.key==='theme'){settings.theme=({default:'gameboy',gameboy:'amber',amber:'cyberpunk',cyberpunk:'default'})[settings.theme]||'default';applyPalette();}else if(r.key==='motion')settings.reducedMotion=!settings.reducedMotion;else if(r.key==='music'){settings.musicEnabled=!settings.musicEnabled;if(settings.musicEnabled){initAudio();setMusicTrack(S.screen==='playing'&&S.phase==='combat'?(E.some(e=>e.type==='boss')?'boss':'combat'):'build');}else setMusicTrack('off');}else if(r.key==='announcer')settings.announcer=!settings.announcer;else if(r.key==='fps')settings.showFps=!settings.showFps;else if(r.key==='pixelFont')settings.pixelFont=!settings.pixelFont;else if(r.key==='curvature'){settings.curvature=!settings.curvature;applyCRTOptions();}else if(r.key==='chromatic'){settings.chromatic=!settings.chromatic;applyCRTOptions();}else if(r.key.startsWith('bind:')){waitingForBind=r.key.slice(5);S.msg='PRESS A KEY FOR '+waitingForBind.toUpperCase();S.msgT=2;return;}else if(r.key==='fullscreen'){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();}else if(r.key==='reset'){settings.keybinds={...DEFAULT_BINDS};waitingForBind=null;}else if(r.key==='back'){S.screen='paused';waitingForBind=null;}saveSettings();sfx(600,.1,'square',.05,900);}
// [FEAT-F59] Offscreen curvature composition plus CSS CRT fringe/curvature approximation.
function applyCRTOptions(){cv.style.borderRadius=settings.curvature?'4%':'2px';cv.style.transform=settings.curvature?'perspective(1200px) rotateX(1deg) scale(.99)':'';cv.style.filter=settings.chromatic?'drop-shadow(1px 0 rgba(255,0,100,.18)) drop-shadow(-1px 0 rgba(0,255,255,.18))':'';scanEl.style.opacity=settings.scan?String(settings.scanIntensity/100):'0';} 

cv.addEventListener('mousemove',updateMouse);
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  if(S.screen==='playing'&&!buildSel)cycleWeapon(e.deltaY>0?1:-1);
},{passive:false});
cv.addEventListener('mousedown',e=>{
  initAudio();updateMouse(e);if(S.screen!=='playing')uiClick((e.button===2||(S.screen==='settings'&&mouse.y>600))?'back':'confirm');
  if(['title','mutators','tech','codex'].includes(S.screen)){if(e.button===0)handleTitleClick(mouse.x,mouse.y);return;}
  if(S.screen==='draft'){if(e.button===0&&mouse.y>=240&&mouse.y<=475){const idx=Math.floor((mouse.x-75)/280);chooseRogueCard(idx);}return;}if(S.screen==='timeloop'){if(e.button===0&&mouse.y>=330&&mouse.y<=390){if(mouse.x>=220&&mouse.x<=445)resolveTimeLoop(true);else if(mouse.x>=510&&mouse.x<=740)resolveTimeLoop(false);}return;}if(S.screen==='gameover'){if(e.button===0&&S.overT>.8){resetGame();startGame();}return;}
  if(S.screen==='paused'){handlePauseClick(mouse.x,mouse.y);return;}
  if(S.screen==='settings'){handleSettingsClick(mouse.x,mouse.y);return;}if(S.screen==='history'){if(mouse.y>580)S.screen='title';return;}
  if(e.button===2){if(buildSel){buildSel=null;return;}const c=Math.floor(mouse.x/TILE),r=Math.floor((mouse.y-GY)/TILE),b=grid[r]?.[c];if(b&&b!==core&&b.type!=='rock'){sellTarget=b;sellHold=0;mouse.rightDown=true;S.msg='SELL REFUND: '+Math.floor((BLD[b.type]?.cost||0)*.5)+' SCRAP · HOLD RIGHT-CLICK';S.msgT=1.2;}return;}
  if(e.button!==0)return;
  const c=Math.floor(mouse.x/TILE),r=Math.floor((mouse.y-GY)/TILE);
  if(e.shiftKey&&grid[r]?.[c]&&grid[r][c]!==core){tryUpgrade(c,r);return;}
  if(buildSel)tryPlace(c,r);
  else mouse.down=true;
});
window.addEventListener('mouseup',e=>{mouse.down=false;if(e.button===2){mouse.rightDown=false;if(sellTarget&&sellHold<.4){S.msg='REFUND PREVIEW: '+Math.floor((BLD[sellTarget.type]?.cost||0)*.5)+' SCRAP';S.msgT=1.2;}sellTarget=null;sellHold=0;}});
window.addEventListener('blur',()=>{mouse.down=false;keys={};});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&S.screen==='playing')S.screen='paused';
});
window.addEventListener('keydown',e=>{
  initAudio();const k=e.key.toLowerCase();if(P2&&S.screen==='playing'&&(e.code==='Numpad0'||e.code==='Numpad1')){if(e.code==='Numpad0')keys.p2fire=true;if(e.code==='Numpad1')keys.p2dash=true;e.preventDefault();return;}if(S.screen==='title'&&k==='r'){selectedMode='rhythm';resetGame();return;}if(S.screen==='title'&&k==='c'){selectedMode='coop';resetGame();return;}if(S.screen==='draft'){if(['1','2','3'].includes(k)){chooseRogueCard(+k-1);return;}return;}if(S.screen==='timeloop'){if(k==='y'||k==='enter'){resolveTimeLoop(true);return;}if(k==='n'||k==='escape'){resolveTimeLoop(false);return;}return;}if(k==='f11'){e.preventDefault();if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();return;}if(waitingForBind&&S.screen==='settings'){e.preventDefault();settings.keybinds[waitingForBind]=k===' ' ? ' ':k;waitingForBind=null;saveSettings();return;}
  const action=Object.entries(settings.keybinds).find(([a,v])=>v===k)?.[0];if(action==='up')keys.up=true;if(action==='down')keys.down=true;if(action==='left')keys.left=true;if(action==='right')keys.right=true;
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
  if(k==='m'){muted=!muted;settings.muted=muted;saveSettings();if(muted)setMusicTrack('off');else{initAudio();syncMusicTrack();}return;}
  if(S.screen==='history'&&(k==='escape'||k==='backspace')){S.screen='title';return;}if(['title','mutators','tech','codex'].includes(S.screen)){if(k==='escape'||k==='backspace')S.screen='title';else if((k==='enter'||k===' ')&&S.screen==='title')startGame();return;}
  if(S.screen==='gameover'){if((k==='enter'||k===' ')&&S.overT>.8){resetGame();startGame();}return;}
  if(k==='r'&&S.screen==='paused'&&S.msgT>10){resetGame();startGame();return;}
  if(k==='escape'){
    if(S.screen==='settings'){S.screen='paused';return;}
    if(S.screen==='paused'){S.screen='playing';return;}
    if(S.screen==='playing'){
      if(buildSel)buildSel=null;else S.screen='paused';
      return;
    }
  }
  if(S.screen!=='playing')return;
  if(k==='1')buildSel=isMutator('noTurrets')?null:(buildSel==='turret'?null:'turret');
  if(k==='2')buildSel=buildSel==='wall'?null:'wall';
  if(k==='3')buildSel=buildSel==='gen'?null:'gen';
  if(k==='4')buildSel=isMutator('noTurrets')?null:(buildSel==='sniper'?null:'sniper');
  if(k==='5')buildSel=isMutator('noTurrets')?null:(buildSel==='tesla'?null:'tesla');
  if(k==='6')buildSel=isMutator('noTurrets')?null:(buildSel==='mortar'?null:'mortar');
  if(k===settings.keybinds.prev){if(buildSel)buildSel=null;else cycleWeapon(-1);return;}
  if(k===settings.keybinds.next){cycleWeapon(1);return;}
  if(k===settings.keybinds.wave){keys.spaceHold=true;return;}
  if(k===settings.keybinds.dash&&!e.repeat){tryDash();return;}
  if(k===settings.keybinds.bomb&&!e.repeat){tryBomb();return;}
  keys[k]=true;
});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(e.code==='Numpad0')keys.p2fire=false;if(e.code==='Numpad1')keys.p2dash=false;keys[k]=false;for(const a of ['up','down','left','right'])if(settings.keybinds[a]===k)keys[a]=false;if(k===settings.keybinds.wave){keys.spaceHold=false;spaceHold=0;keys.spaceHandled=false;}});

// Touch controls. The build bar selects buildings; a top-left button pauses; a NEXT button skips the build phase.
// Left half steers (or places when a building is selected); right half aims and fires while held.
const TOUCH_SLOTS=['turret','wall','gen','sniper','tesla','mortar'];
function inTouchRect(x,y,r){return !!r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function inCircle(x,y,c,pad){return Math.hypot(x-c.x,y-c.y)<=c.r+(pad||0);}
function touchSlotAt(x,y){const r=buildRects.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);return r?r.i:-1;}
function touchToggleSlot(i){const k=TOUCH_SLOTS[i];if(!k)return;if(isMutator('noTurrets')&&['turret','sniper','tesla','mortar'].includes(k))return;buildSel=buildSel===k?null:k;uiClick(buildSel?'confirm':'back');}
cv.addEventListener('touchstart',e=>{if(!isTouchDevice()||S.screen!=='playing')return;e.preventDefault();const r=cv.getBoundingClientRect();const B=touchButtons();for(const t of e.changedTouches){const x=(t.clientX-r.left)*cv.width/r.width,y=(t.clientY-r.top)*cv.height/r.height;
  if(y>=GY+PH){if(S.phase==='build'&&inTouchRect(x,y,nextRect)){if(S.endless)startWave();else S.timer=Math.min(S.timer,.01);S.msg='WAVE INCOMING';S.msgT=1;uiClick('confirm');continue;}const i=touchSlotAt(x,y);if(i>=0)touchToggleSlot(i);continue;}
  if(inTouchRect(x,y,B.pause)){S.screen='paused';uiClick('back');continue;}
  if(inTouchRect(x,y,wpnRect)){cycleWeapon(1);uiClick('confirm');continue;}
  if(inCircle(x,y,B.bomb,10)){touchAction={id:t.identifier,kind:'bomb'};continue;}
  if(inCircle(x,y,B.dash,10)){touchAction={id:t.identifier,kind:'dash'};continue;}
  if(buildSel){pendingPlace={id:t.identifier,x0:x,y0:y,moved:false};mouse.x=x;mouse.y=y;continue;}
  pendingTap={id:t.identifier,x0:x,y0:y};
  if(x<cv.width/2)touchMove={id:t.identifier,x0:x,y0:y,x:0,y:0};
  else{touchAim={id:t.identifier,x0:x,y0:y,x:0,y:0};touchFire=true;mouse.down=true;}
}},{passive:false});
cv.addEventListener('touchmove',e=>{if(!isTouchDevice())return;e.preventDefault();const r=cv.getBoundingClientRect();for(const t of e.changedTouches){const x=(t.clientX-r.left)*cv.width/r.width,y=(t.clientY-r.top)*cv.height/r.height;
  if(touchMove&&touchMove.id===t.identifier){touchMove.x=clamp((x-touchMove.x0)/45,-1,1);touchMove.y=clamp((y-touchMove.y0)/45,-1,1);keys.left=touchMove.x<-.2;keys.right=touchMove.x>.2;keys.up=touchMove.y<-.2;keys.down=touchMove.y>.2;}
  if(touchAim&&touchAim.id===t.identifier){touchAim.x=clamp((x-touchAim.x0)/45,-1,1);touchAim.y=clamp((y-touchAim.y0)/45,-1,1);}
  if(pendingPlace&&pendingPlace.id===t.identifier){if(Math.hypot(x-pendingPlace.x0,y-pendingPlace.y0)>14){touchMove={id:t.identifier,x0:pendingPlace.x0,y0:pendingPlace.y0,x:0,y:0};pendingPlace=null;}else{mouse.x=x;mouse.y=y;}}
  if(pendingTap&&pendingTap.id===t.identifier&&Math.hypot(x-pendingTap.x0,y-pendingTap.y0)>14)pendingTap=null;
}},{passive:false});
function clearTouch(t){if(touchAction&&touchAction.id===t.identifier){if(touchAction.kind==='dash')tryDash();else tryBomb();touchAction=null;}if(pendingTap&&pendingTap.id===t.identifier){const tc=Math.floor(pendingTap.x0/TILE),tr=Math.floor((pendingTap.y0-GY)/TILE);const tb=grid[tr]?.[tc];if(tb&&tb!==core&&tb.type!=='rock'&&tb.level<3)tryUpgrade(tc,tr);pendingTap=null;}if(pendingPlace&&pendingPlace.id===t.identifier){const pc=Math.floor(pendingPlace.x0/TILE),pr=Math.floor((pendingPlace.y0-GY)/TILE);if(buildSel&&!pendingPlace.moved){if(S.scrap<BLD[buildSel].cost){S.msg='NOT ENOUGH SCRAP';S.msgT=1;}else if(canPlace(pc,pr))tryPlace(pc,pr);else{S.msg='CANNOT PLACE HERE';S.msgT=1;}}pendingPlace=null;}if(touchMove&&touchMove.id===t.identifier){touchMove=null;keys.left=keys.right=keys.up=keys.down=false;}if(touchAim&&touchAim.id===t.identifier){touchAim=null;touchFire=false;mouse.down=false;}}cv.addEventListener('touchend',e=>{for(const t of e.changedTouches)clearTouch(t);},{passive:true});cv.addEventListener('touchcancel',e=>{for(const t of e.changedTouches)clearTouch(t);},{passive:true});
// ===== BOOT =====
function startGame(){
  if(S.screen==='title'||['mutators','tech','codex'].includes(S.screen)){clearMidRun();S.screen='playing';S.phase='build';S.timer=S.endless?0:(isMutator('speedrun')?10:12);S.startTime=performance.now();if(S.endless)S.msg='ENDLESS MODE';else if(selectedMode==='daily')S.msg='DAILY SEED · '+dailySeed;else S.msg='BUILD UP!';S.msgT=2.5;
  sfx(440,.12,'square',.05,660);}}

let last=performance.now(),fpsBucket=0,fpsFrames=0;
const FIXED_DT=1/60;
function loop(now){
  const raw=Math.min((now-last)/1000,.1);last=now;fixedAccumulator=Math.min(fixedAccumulator+raw,.1);
  fpsFrames++;fpsBucket+=raw;if(fpsBucket>=.5){fpsValue=Math.round(fpsFrames/fpsBucket);fpsFrames=0;fpsBucket=0;}frameTimes.push(raw*1000);if(frameTimes.length>60)frameTimes.shift();
  let steps=0;while(fixedAccumulator>=FIXED_DT&&steps++<6){const dt=FIXED_DT;fixedAccumulator-=dt;
    if(S.screen==='playing'){if(settings.reducedMotion)S.hitStop=0;if(!settings.reducedMotion&&S.hitStop>0)S.hitStop=Math.max(0,S.hitStop-dt);else update(dt);}
    else{S.t+=dt;if(S.screen==='gameover')S.overT+=dt;updateParticles(dt);if(S.shake>0)S.shake=Math.max(0,S.shake-dt*22);if(S.flash>0)S.flash=Math.max(0,S.flash-dt*2.5);}
  }
  render();requestAnimationFrame(loop);
}
// [FEAT-F71] Preserve 4:3 aspect ratio; prefer integer scaling when the viewport permits it.
// [FEAT-F71] Fill the viewport at 4:3; [FEAT-F79] enlarge the HUD when the canvas is displayed small.
function resizeCanvas(){
  const base=Math.min(window.innerWidth/W,window.innerHeight/(GY+PH+40));
  const compact=base<0.9;
  const wantBH=compact?64:40;
  if(wantBH!==BH){BH=wantBH;cv.height=GY+PH+BH;offscreenCanvas.height=GY+PH+BH;}
  const scale=Math.max(0.2,Math.min(window.innerWidth/W,window.innerHeight/cv.height));
  cv.style.width=Math.max(1,Math.floor(W*scale))+'px';
  cv.style.height=Math.max(1,Math.floor(cv.height*scale))+'px';
  hudCompact=compact;
  hudScale=compact?clamp(1/scale,1,2.1):1;
  computeBuildLayout();
}
// [FEAT-F78] Gate portrait play behind a rotate prompt on touch devices; pause if it appears mid-run.
function updateOrientationGate(){if(!rotateEl)return;const portrait=isTouchDevice()&&window.innerHeight>window.innerWidth;const show=portrait&&!portraitDismissed;rotateEl.hidden=!show;if(show&&S&&S.screen==='playing')S.screen='paused';}
window.addEventListener('resize',()=>{resizeCanvas();updateOrientationGate();});
window.addEventListener('orientationchange',updateOrientationGate);
window.dispatchEvent(new Event('resize'));updateOrientationGate();
// [FEAT-F68] Service-worker support requires HTTPS or localhost; the package also works without it.
if('serviceWorker' in navigator&&(/^https:$/.test(location.protocol)||location.hostname==='localhost'||location.hostname==='127.0.0.1'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline cache unavailable:',err)));
resizeCanvas();resetGame();requestAnimationFrame(loop);
})();

