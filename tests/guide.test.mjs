// The test-guide shell's script, run against a small fake DOM: what a tester
// sees and what the guide keeps in their browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SHELL = fs.readFileSync(path.resolve(import.meta.dirname, '../plugin/skills/test-guide/guide-shell.html'), 'utf8');

class El {
  constructor(tag = 'div', id = '') {
    Object.assign(this, { tag, id, className: '', type: '', textContent: '', innerHTML: '', checked: false, disabled: false, hidden: false });
    this.style = {};
    this.children = [];
    this.attrs = {};
    this.listeners = {};
  }
  appendChild(el) { this.children.push(el); return el; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({ target: this, ...event }); }
  setAttribute(k, v) { this.attrs[k] = v; }
  querySelectorAll(sel) { return sel === '.item' ? this.children.filter((c) => c.className === 'item') : []; }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; }
  get innerHTML() { return this._html ?? ''; }
}

// Runs the shell with `guide` in place of its GUIDE block. Returns the page's elements and storage.
function open(guide, { storage = new Map(), hash = '' } = {}) {
  const start = SHELL.indexOf('const GUIDE = {');
  const end = SHELL.indexOf('(function () {', start);
  const js = SHELL.slice(SHELL.lastIndexOf('<script>') + 8, SHELL.lastIndexOf('</script>'));
  const script = js.replace(SHELL.slice(start, end), `const GUIDE = ${JSON.stringify(guide)};\n\n`);

  const els = new Map();
  const sections = [new El('section'), new El('section')];
  const byClass = { '.situacao': new El('dl'), '.progresso': new El('div') };
  const document = new El('document');
  Object.assign(document, {
    getElementById: (id) => els.get(id) ?? els.set(id, new El('div', id)).get(id),
    createElement: (tag) => new El(tag),
    querySelector: (sel) => byClass[sel],
    querySelectorAll: (sel) => (sel === '.ficha > section' ? sections : []),
  });
  const location = { hash };
  const localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const history = { replaceState: (_, __, h) => { location.hash = h; } };
  const window = { scrollTo() {} };
  new Function('document', 'localStorage', 'location', 'history', 'window', script)(document, localStorage, location, history, window);
  const get = (id) => document.getElementById(id);
  return { get, storage, location, sections, byClass, document };
}

const labels = {
  of: 'de', done: 'feitos', scenario: 'Cenário', situation: 'A situação', steps: 'O que fazer', expected: 'O que deve acontecer',
  previous: '← Anterior', next: 'Próximo →', clear: 'Limpar', scenarios: 'Cenários', empty: 'Nada para testar nesta beta.',
};
const guide = {
  key: 'HL-test-guide-v1.2.0-beta.2',
  labels,
  scenarios: [
    { title: 'Orçar um guindaste', tag: 'Orçamentos', situation: 'Antonio precisa...', steps: ['Abra Orçamentos', 'Clique em Novo'], expected: ['O orçamento aparece'] },
    { title: 'Fechar o contrato', tag: 'Contratos', situation: 'Rogerio...', steps: ['Abra Contratos'], expected: ['O contrato é gerado'] },
  ],
};
const box = (page, j) => page.get('passos').children[j].children[0].children[0];

test('the guide shows the first scenario in the project\'s labels, with its index and a print copy', () => {
  const page = open(guide);
  assert.equal(page.get('titulo').textContent, 'Orçar um guindaste');
  assert.equal(page.get('selo').textContent, 'Cenário 01');
  assert.equal(page.get('l-passos').textContent, 'O que fazer');
  assert.equal(page.get('nav').children.length, 2);
  assert.equal(page.get('passos').children.length, 2);
  assert.equal(page.get('esperado').children.length, 1);
  assert.equal(page.get('resumo').textContent, '0 de 2 feitos');
  assert.equal(page.get('anterior').disabled, true);
  assert.equal(page.get('impressao').children.length, 2);
  assert.equal(page.location.hash, '#s01');
});

test('ticks are saved under the beta\'s key and come back on reload', () => {
  const page = open(guide);
  box(page, 0).checked = true;
  box(page, 0).dispatch('change');
  assert.deepEqual(JSON.parse(page.storage.get('HL-test-guide-v1.2.0-beta.2')), [[true, false], [false]]);
  assert.equal(page.get('contagem').textContent, '1 de 2');

  box(page, 1).checked = true;
  box(page, 1).dispatch('change');
  assert.equal(page.get('resumo').textContent, '1 de 2 feitos');
  assert.equal(page.get('nav').children[0].attrs['data-feito'], 'true');

  const again = open(guide, { storage: page.storage });
  assert.equal(box(again, 0).checked, true);
  assert.equal(again.get('resumo').textContent, '1 de 2 feitos');
  assert.equal(open({ ...guide, key: 'HL-test-guide-v1.2.0-beta.3' }, { storage: page.storage }).get('resumo').textContent, '0 de 2 feitos');
});

test('next, previous and the URL hash move between scenarios', () => {
  const page = open(guide);
  page.get('proximo').dispatch('click');
  assert.equal(page.get('titulo').textContent, 'Fechar o contrato');
  assert.equal(page.location.hash, '#s02');
  assert.equal(page.get('proximo').disabled, true);
  page.get('anterior').dispatch('click');
  assert.equal(page.get('titulo').textContent, 'Orçar um guindaste');
  assert.equal(open(guide, { hash: '#s02' }).get('titulo').textContent, 'Fechar o contrato');
});

test('a beta with no scenarios shows the empty state instead of failing', () => {
  const page = open({ ...guide, scenarios: [] });
  assert.equal(page.get('titulo').textContent, 'Nada para testar nesta beta.');
  assert.equal(page.get('anterior').disabled, true);
  assert.equal(page.get('proximo').disabled, true);
  assert.equal(page.sections.every((s) => s.hidden), true);
  assert.equal(page.byClass['.progresso'].hidden, true);
  assert.match(page.get('impressao').innerHTML, /Nada para testar/);
  page.document.dispatch('keydown', { key: 'ArrowRight' });
  page.get('proximo').dispatch('click');
  assert.equal(page.get('titulo').textContent, 'Nada para testar nesta beta.');
});
