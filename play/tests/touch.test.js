// Deterministic headless test of the mobile touch controls.
const fs=require('fs'),path=require('path'),vm=require('vm');
const srcPath=path.join(__dirname,'..','game.js');
const rawSource=fs.readFileSync(srcPath,'utf8');
const injection=`globalThis.__t={st:()=>({screen:S.screen,phase:S.phase,buildSel,scrap:S.scrap,B:B.length,msg:S.msg,aim:touchAim?{x:touchAim.x,y:touchAim.y}:null,pend:!!pendingPlace,mouse:{x:mouse.x,y:mouse.y}})};`;
const source=rawSource.replace(/resetGame\(\);requestAnimationFrame\(loop\);\s*\}\)\(\);/,'resetGame();requestAnimationFrame(loop);'+injection+'})();');
if(source===rawSource)throw new Error('injection failed');
const events={};const errors=[];const noop=()=>{};
function ctx2d(){const base={measureText:t=>({width:String(t).length*7}),createRadialGradient:()=>({addColorStop:noop}),createLinearGradient:()=>({addColorStop:noop}),createPattern:()=>null};return new Proxy(base,{get(o,k){return k in o?o[k]:noop;},set(o,k,v){o[k]=v;return true;}});}
const canvas={width:960,height:720,style:{},getContext:()=>ctx2d(),addEventListener:(n,f)=>((events['canvas:'+n]||=[]).push(f)),getBoundingClientRect:()=>({left:0,top:0,width:960,height:720})};
const scan={style:{}};
const localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
const document={hidden:false,fullscreenElement:null,documentElement:{requestFullscreen:()=>Promise.resolve()},getElementById:id=>id==='game'?canvas:id==='scan'?scan:null,createElement:t=>t==='canvas'?{width:0,height:0,style:{},getContext:()=>ctx2d()}:{},addEventListener:(n,f)=>((events['document:'+n]||=[]).push(f))};
const window={innerWidth:844,innerHeight:390,addEventListener:(n,f)=>((events['window:'+n]||=[]).push(f)),dispatchEvent:noop};
const navigator={maxTouchPoints:1,getGamepads:()=>[]};
const frames=[];
const sandbox={console:{log:noop,warn:(...a)=>errors.push(a.join(' ')),error:(...a)=>errors.push(a.join(' '))},Math,Date,JSON,Array,Object,String,Number,Boolean,Map,Set,Infinity,Event:function(t){this.type=t;},performance:{now:()=>16},localStorage,document,window,navigator,location:{protocol:'file:',hostname:''},requestAnimationFrame:cb=>frames.push(cb),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>1,clearInterval:noop};
vm.runInNewContext(source,sandbox,{timeout:5000});
const dispatch=(name,ev)=>{for(const f of events[name]||[])f(ev);};
const touch=(id,x,y)=>({identifier:id,clientX:x,clientY:y});
const key=(k,code='')=>({key:k,code,repeat:false,preventDefault:noop});
let now=16;frames.shift()(now);
dispatch('window:keydown',key('Enter'));           // start a run
frames.shift()(now+=16);
const st=()=>sandbox.__t.st();
const results=[];
function check(name,cond,extra){results.push({name,ok:!!cond,extra});}

check('screen playing',st().screen==='playing',st().screen);
const scrap0=st().scrap, B0=st().B;

// 1) tap the WALL slot in the build bar
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(1,166,700)]});
check('slot tap selects wall',st().buildSel==='wall',st().buildSel);
dispatch('canvas:touchend',{changedTouches:[touch(1,166,700)]});

// 2) tap an empty field tile -> place
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(2,200,300)]});
dispatch('canvas:touchend',{changedTouches:[touch(2,200,300)]});
const s2=st();
check('field tap placed a building',s2.B===B0+1,'B '+B0+'->'+s2.B);
check('scrap spent on placement',s2.scrap===scrap0-25,'scrap '+scrap0+'->'+s2.scrap+' msg='+s2.msg);
check('no false error on success',s2.msg!=='CANNOT PLACE HERE','msg='+s2.msg);

// 2b) tapping the now-occupied tile reports CANNOT PLACE HERE
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(21,200,300)]});
dispatch('canvas:touchend',{changedTouches:[touch(21,200,300)]});
check('occupied tile reports cannot place',st().msg==='CANNOT PLACE HERE',st().msg);

// 3) tap slot again -> deselect
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(3,166,700)]});
check('slot tap toggles off',st().buildSel===null,st().buildSel);
dispatch('canvas:touchend',{changedTouches:[touch(3,166,700)]});

// 4) aim anchor: touch right half away from the button, then drag a little
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(4,700,300)]});
dispatch('canvas:touchmove',{preventDefault:noop,changedTouches:[touch(4,745,300)]});
check('aim is relative to touch origin',st().aim&&st().aim.x===1,JSON.stringify(st().aim));
dispatch('canvas:touchend',{changedTouches:[touch(4,745,300)]});

// 5) pause button
dispatch('canvas:touchstart',{preventDefault:noop,changedTouches:[touch(5,25,20)]});
check('pause button pauses',st().screen==='paused',st().screen);
dispatch('canvas:touchend',{changedTouches:[touch(5,25,20)]});

let bad=0;
for(const r of results){if(!r.ok)bad++;console.log((r.ok?'PASS':'FAIL')+' - '+r.name+(r.ok?'':'  ['+r.extra+']'));}
console.log(errors.length?('RUNTIME WARNINGS: '+errors.join(' | ')):'no runtime errors');
console.log(bad?('TOUCH TEST FAILED ('+bad+')'):'TOUCH TEST PASSED');
process.exit(bad?1:0);
