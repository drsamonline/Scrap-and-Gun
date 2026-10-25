// Dependency-free boot/render/update smoke test using a minimal canvas/DOM shim.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const jsFile = process.argv[2] || 'game.js';
const rawSource = fs.readFileSync(path.join(__dirname, '..', jsFile), 'utf8');
const injection = `globalThis.__sgTest={saveMidRun,loadMidRun,captureWaveSnapshot,restoreWaveSnapshot,resolveTimeLoop,clearMidRun,saveMeta,getState:()=>({S,P,core,meta,timeLoopUsed,timeLoopSnapshot}),setTimeLoopUsed:v=>{timeLoopUsed=v;},setScreen:v=>{S.screen=v;},setRun:(wave,score,hp,coreHp)=>{S.screen='playing';S.wave=wave;S.score=score;P.hp=hp;core.hp=coreHp;}};`;
const source = rawSource.replace(/resetGame\(\);requestAnimationFrame\(loop\);\s*\}\)\(\);/, 'resetGame();requestAnimationFrame(loop);'+injection+'})();');
if (source === rawSource) throw new Error('Could not inject save/load test hooks');
const events = {};
const errors = [];
const noop = () => {};
function ctx2d() {
  const base = {
    measureText: t => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => null
  };
  return new Proxy(base, {
    get(o, k) { return k in o ? o[k] : noop; },
    set(o, k, v) { o[k] = v; return true; }
  });
}
const canvas = {
  width: 960, height: 720, style: {},
  getContext: () => ctx2d(),
  addEventListener: (n, f) => (events['canvas:' + n] ||= []).push(f),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 720 })
};
const scan = { style: {} };
const storage = new Map([['sg_meta_v1','{bad json'],['sg_set','null'],['sg_history','not-an-array'],['sg_achievements','{bad json']]);
const localStorage = {
  getItem: k => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k)
};
const document = {
  hidden: false, fullscreenElement: null,
  documentElement: { requestFullscreen: () => Promise.resolve() },
  getElementById: id => id === 'game' ? canvas : id === 'scan' ? scan : null,
  createElement: t => t === 'canvas' ? { width: 0, height: 0, style: {}, getContext: () => ctx2d() } : {},
  addEventListener: (n, f) => (events['document:' + n] ||= []).push(f)
};
const window = {
  innerWidth: 1200, innerHeight: 900,
  addEventListener: (n, f) => (events['window:' + n] ||= []).push(f),
  dispatchEvent: noop
};
const navigator = { maxTouchPoints: 0, getGamepads: () => [] };
const frames = [];
const fakeConsole = {
  log: noop, warn: (...a) => errors.push(a.join(' ')),
  error: (...a) => errors.push(a.join(' '))
};
const sandbox = {
  console: fakeConsole, Math, Date, JSON, Array, Object, String, Number, Boolean,
  Map, Set, Infinity, Event: function Event(type) { this.type = type; },
  performance: { now: () => 16 }, localStorage, document, window, navigator,
  location: { protocol: 'file:', hostname: '' },
  requestAnimationFrame: cb => frames.push(cb),
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 1, clearInterval: noop
};
vm.runInNewContext(source, sandbox, { timeout: 5000 });
function dispatch(name, event) { for (const f of events[name] || []) f(event); }
function key(key, code = '') { return { key, code, repeat: false, preventDefault: noop }; }
// First frame renders the title; then activate co-op and start a run.
let now = 16;
frames.shift()(now);
dispatch('window:keydown', key('c'));
dispatch('window:keydown', key('Enter'));
dispatch('window:keydown', key('i'));
dispatch('window:keydown', key('0', 'Numpad0'));
for (let i = 0; i < 1400 && frames.length; i++) {
  now += 16;
  frames.shift()(now);
}
dispatch('window:keyup', key('0', 'Numpad0'));
if (errors.some(e => e.includes('SCRAP & GUN update error'))) {
  throw new Error('Game update loop reported an error: ' + errors.join('\n'));
}
console.log('SCRAP & GUN runtime boot/render/co-op update smoke passed (1400 frames).');
// Save/load + time-loop integrity regression checks against the actual game closure.
const api = sandbox.__sgTest;
if (!api) throw new Error('Missing internal test API');
api.setRun(3, 120, 80, 900);
api.captureWaveSnapshot();
if (!api.saveMidRun()) throw new Error('Expected run checkpoint to save');
api.setRun(3, 999, 1, 100);
if (!api.loadMidRun()) throw new Error('Expected valid run checkpoint to load');
let state = api.getState();
if (state.S.wave !== 3 || state.S.score !== 120 || state.P.hp !== 80 || state.core.hp !== 900) throw new Error('Run checkpoint did not restore expected state');
state.meta.cores = 5;
api.setTimeLoopUsed(false);
api.setRun(3, 999, 1, 100);
if (!api.restoreWaveSnapshot()) throw new Error('Wave snapshot failed to restore');
state = api.getState();
if (state.meta.cores !== 5) throw new Error('Wave rewind incorrectly rolled back persistent boss cores');
api.setTimeLoopUsed(false);
api.setRun(3, 999, 1, 100);
api.resolveTimeLoop(true);
state = api.getState();
if (!state.timeLoopUsed || state.meta.cores !== 5) throw new Error('Free rewind state/accounting failed');
state.meta.cores = 5;
api.setRun(3, 999, 1, 100);
api.resolveTimeLoop(true);
state = api.getState();
if (state.meta.cores !== 4) throw new Error('Paid rewind did not consume exactly one persistent core');
// Malformed checkpoint must be rejected and removed rather than partially restored.
storage.set('sg_run_save', '{broken');
if (api.loadMidRun() !== false) throw new Error('Malformed checkpoint should be rejected');
if (storage.has('sg_run_save')) throw new Error('Malformed checkpoint should be cleared');
console.log('SCRAP & GUN save/load + time-loop integrity checks passed (10 assertions).');
