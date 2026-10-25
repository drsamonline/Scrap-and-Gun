#!/usr/bin/env node
'use strict';
// Conservative no-dependency minifier for this project: strips comments and horizontal whitespace,
// preserves quoted/template/regex literals and source newlines to avoid changing ASI semantics.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const input = process.argv[2] || path.join(root, 'game.js');
const output = process.argv[3] || path.join(root, 'game.min.js');
const src = fs.readFileSync(input, 'utf8');
let out = '', i = 0, prev = '', canRegex = true;
const word = c => !!c && /[A-Za-z0-9_$]/.test(c);
const punct = ['===','!==','>>>','**=','&&=','||=','??=','=>','==','!=','<=','>=','++','--','&&','||','??','?.','+=','-=','*=','/=','%=','<<','>>','**','&=','|=','^=','...'];
function emit(tok, type) {
  const last = out[out.length - 1] || '';
  const first = tok[0] || '';
  if (out && word(last) && word(first)) out += ' ';
  else if (out && last === '+' && first === '+') out += ' ';
  else if (out && last === '-' && first === '-') out += ' ';
  else if (out && last === '/' && (first === '/' || first === '*')) out += ' ';
  else if (out && last === '.' && /\d/.test(first)) out += ' ';
  else if (out && last === '?' && first === '.') out += ' ';
  out += tok;
  prev = tok;
  if (type === 'word' && /^(return|throw|case|delete|void|typeof|new|in|of|yield|await|else|do|instanceof|extends)$/.test(tok)) canRegex = true;
  else if (type === 'literal' || type === 'word' || tok === ')' || tok === ']' || tok === '}' || tok === '++' || tok === '--') canRegex = false;
  else canRegex = true;
}
function readQuoted(q) {
  let j = i + 1;
  while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
  return j;
}
function readRegex() {
  let j = i + 1, cls = false;
  while (j < src.length) { const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) { j++; while (/[a-z]/i.test(src[j] || '')) j++; break; } if (c === '\n' || c === '\r') break; j++; }
  return j;
}
while (i < src.length) {
  const c = src[i];
  if (/\s/.test(c)) { let hadNl = false; while (i < src.length && /\s/.test(src[i])) { if (src[i] === '\n' || src[i] === '\r') hadNl = true; i++; } if (hadNl && out && !out.endsWith('\n')) out += '\n'; continue; }
  if (c === '/' && src[i+1] === '/') { i += 2; while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
  if (c === '/' && src[i+1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i+1] === '/')) { if ((src[i] === '\n' || src[i] === '\r') && out && !out.endsWith('\n')) out += '\n'; i++; } i = Math.min(src.length, i + 2); continue; }
  let j = i + 1, tok = c, type = 'punct';
  if (c === '"' || c === "'") { j = readQuoted(c); tok = src.slice(i,j); type = 'literal'; }
  else if (c === '`') { j = readQuoted('`'); tok = src.slice(i,j); type = 'literal'; }
  else if (c === '/' && canRegex) { j = readRegex(); tok = src.slice(i,j); type = 'literal'; }
  else if (/[A-Za-z_$]/.test(c)) { while (/[A-Za-z0-9_$]/.test(src[j] || '')) j++; tok = src.slice(i,j); type = 'word'; }
  else if (/\d/.test(c) || (c === '.' && /\d/.test(src[i+1] || ''))) { while (/[A-Za-z0-9_.]/.test(src[j] || '')) j++; tok = src.slice(i,j); type = 'literal'; }
  else { const hit = punct.find(p => src.startsWith(p, i) && !(p === '?.' && /\d/.test(src[i+2] || ''))); if (hit) { tok = hit; j = i + hit.length; } }
  emit(tok, type); i = j;
}
const banner = '/*! SCRAP & GUN — generated from game.js; see LICENSE. */\n';
fs.writeFileSync(output, banner + out.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n'));
console.log(`${path.relative(root, input)} -> ${path.relative(root, output)} (${Buffer.byteLength(src)} -> ${Buffer.byteLength(banner + out)} bytes)`);
