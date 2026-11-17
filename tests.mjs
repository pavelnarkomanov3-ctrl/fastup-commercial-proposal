import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseProposal, validateCatalog, renderProposal, loadCatalog, buildProposalURL, serviceView, renderProposalError, INVALID_LINK, LOAD_ERROR, RECOVERY_CONTACTS} from './app.js';
const catalog = validateCatalog(JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8')));
const parse = search => parseProposal(search, catalog.services);
const view = search => serviceView(parse(search).services[0]);

test('Old links keep working and preserve selected service order', () => {
  assert.deepEqual(parse('?client=OLANTIZ&services=ppc,target').services.map(s => s.code), ['ppc','target']);
  assert.deepEqual(parse('?client=A&services=target,web,geo').services.map(s => s.code), ['target','web','geo']);
  assert.equal(view('?client=A&services=web').packages.length, 3);
  assert.equal(view('?client=A&services=ppc').price, 'от 700 BYN');
});
test('Missing, empty, unknown and ambiguous parameters reject the whole link', () => {
  for (const query of ['', '?services=web', '?client=A', '?client=&services=web','?client=%20&services=web','?client=A&services=', '?client=A&services=unknown','?client=A&services=ppc,unknown','?client=A&services=web&web=', '?client=A&services=web&web=wrong','?client=A&client=B&services=web','?client=A&services=web&web=landing&web=ecommerce']) assert.equal(parse(query), null, query);
});
test('Unicode, ampersand and configuration round-trip through share link in a subfolder', () => {
  const company = 'ООО Ромашка & Партнёры <script>alert(1)</script>';
  const url = buildProposalURL('https://example.com/repo/builder.html',company,['web','ppc','target'],{web:['corporate','ecommerce'],ppc:['google','yandex'],target:['two']},catalog.services);
  assert.equal(url.pathname, '/repo/');
  assert.equal(parse(url.search).client, company);
  assert.deepEqual(parse(url.search).services[0].selectedOptions,['corporate','ecommerce']);
  assert.equal(url.searchParams.has('ppc'), false);
  assert.equal(url.searchParams.has('target'), false);
  assert.equal(serviceView(parse(url.search).services[2]).price, 'от 700 BYN');
});
test('Only manager-selected development formats are included', () => {
  assert.deepEqual(view('?client=A&services=web&web=ecommerce').packages.map(p => p.code), ['ecommerce']);
  assert.equal(view('?client=A&services=web&web=ecommerce').price,'от 3 000 BYN');
  assert.deepEqual(view('?client=A&services=web&web=landing,corporate').packages.map(p => p.code), ['landing','corporate']);
  assert.equal(view('?client=A&services=web&web=corporate').packages[0].timing, '15–25 рабочих дней');
});
test('PPC offers a choice of one service without manager channel controls', () => {
  const ppc = catalog.services.find(s => s.code === 'ppc');
  assert.equal(ppc.selection, undefined);
  const result = view('?client=A&services=ppc');
  assert.equal(result.price, 'от 700 BYN');
  assert.match(result.label, /Google Ads или Яндекс.Директ/);
  assert.deepEqual(result.prices.map(p => p.value), ['от 700 BYN', 'от 700 BYN']);
  assert.ok(ppc.terms.some(text => text.includes('обе площадки') && text.includes('выше')));
  // Old links with platform parameters keep working with the current simplified offer.
  assert.equal(view('?client=A&services=ppc&ppc=google,yandex').price, 'от 700 BYN');
});
test('Target offers launch from 700 without quantity controls and discloses added scope', () => {
  const target = catalog.services.find(s => s.code === 'target');
  assert.equal(target.selection, undefined);
  assert.equal(view('?client=A&services=target').price,'от 700 BYN');
  assert.ok(target.items.some(item => item.includes('креативов')));
  assert.ok(target.terms.some(text => text.includes('дополнительные') && text.includes('выше')));
  assert.match(target.note,/отдельно/);
});
test('SEO/GEO keep their profile fees, remove package proliferation and FAQ', () => {
  assert.equal(view('?client=A&services=seo').price,'от 1 000 BYN');
  assert.match(view('?client=A&services=seo').period,/800/);
  assert.equal(view('?client=A&services=geo').price,'от 1 200 BYN');
  assert.match(view('?client=A&services=geo').period,/800/);
  for (const service of catalog.services) {
    assert.equal(service.faq,undefined);
    if (service.code !== 'web') assert.equal(service.packages,undefined);
  }
  assert.match(catalog.services.find(s => s.code === 'geo').note,/без двойной оплаты/);
});
class Node {
  constructor(tag) {this.tag=tag; this.children=[]; this.dataset={}; this.attributes={};}
  addEventListener(name, handler) {(this.listeners ||= {})[name] = handler;}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children=nodes;}
  setAttribute(k,v) {this.attributes[k]=v;}
  get lastChild() {return this.children.at(-1);}
}
const flatten = node => [node,...node.children.flatMap(flatten)];
test('Renderer creates collapsed service panels with summaries, no FAQ and only selected formats', () => {
  globalThis.document={createElement:tag=>new Node(tag)};
  try {
    const root=new Node('main');
    const company='<img src=x onerror=alert(1)> & Компания';
    const params=new URLSearchParams({client:company,services:'web,ppc',web:'corporate',ppc:'google,yandex'});
    renderProposal(root,catalog,parse(params.toString()));
    const nodes=flatten(root);
    const panels=nodes.filter(n=>n.dataset.service);
    assert.deepEqual(panels.map(n=>n.dataset.service),['web','ppc']);
    assert.ok(panels.every(n=>n.tag==='details' && !n.open));
    assert.equal(nodes.filter(n=>n.tag==='summary').length,2);
    assert.deepEqual(nodes.filter(n=>n.dataset.format).map(n=>n.dataset.format),['corporate']);
    assert.equal(nodes.find(n=>n.className==='client-name').textContent,company);
    assert.ok(!nodes.some(n=>n.tag==='img'||n.tag==='script'));
    assert.equal(nodes.filter(n=>n.textContent==='Обсудить запуск ↗'&&n.href===catalog.contacts.url).length,2);
    assert.ok(nodes.some(n=>n.className==='summary-price'&&n.children[0].textContent==='от 700 BYN'));
  } finally {delete globalThis.document;}
});
test('Catalog validation rejects unsafe URLs and broken option/pricing data', () => {
  for (const broken of [null,{}, {...catalog,services:[]},{...catalog,contacts:{url:'javascript:alert(1)'}}]) assert.throws(()=>validateCatalog(broken));
  for (const patch of [{prices:[]},{steps:[{}]},{terms:[null]},{packages:[{}]},{selection:{parameter:'web'}}]) assert.throws(()=>validateCatalog({...catalog,services:[{...catalog.services[0],...patch}]}));
});
test('Loader reports server, JSON and network failures; requests fresh shared catalog', async () => {
  const original=globalThis.fetch;
  try {
    for (const fake of [async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw new SyntaxError();}}),async()=>({ok:true,json:async()=>({})}),async()=>{throw new TypeError();}]) {globalThis.fetch=fake;await assert.rejects(loadCatalog);}
    globalThis.fetch=async(url,options)=>{assert.ok(url.href.endsWith('/catalog.json'));assert.equal(options.cache,'no-store');return {ok:true,json:async()=>catalog};};
    assert.equal(await loadCatalog(),catalog);
  } finally {globalThis.fetch=original;}
});

test('Every service has a learn-more button leading to FastUp', () => {
  globalThis.document={createElement:tag=>new Node(tag)};
  try {
    const root=new Node('main');
    renderProposal(root,catalog,parse('?client=Город+и+Ромашки&services=web,ppc,seo,geo,target&web=corporate'));
    const buttons=flatten(root).filter(n=>n.className==='button learn-more');
    assert.equal(buttons.length,5);
    assert.ok(buttons.every(n=>n.textContent==='Узнать больше ↗' && new URL(n.href).hostname==='fastup.by' && n.target==='_blank'));
  } finally {delete globalThis.document;}
});

test('Invalid-link screen has large heading, exact explanation and direct contacts without catalog', () => {
  globalThis.document={createElement:tag=>new Node(tag)};
  try {
    const root=new Node('main');
    renderProposalError(root,INVALID_LINK);
    const nodes=flatten(root);
    assert.equal(root.className,'error-page');
    assert.ok(nodes.some(n=>n.tag==='h1' && n.className==='recovery-title'));
    assert.ok(nodes.some(n=>n.textContent===INVALID_LINK));
    assert.ok(nodes.some(n=>n.href===RECOVERY_CONTACTS.telegram));
    assert.ok(nodes.some(n=>n.href==='tel:+375291328073'));
    assert.ok(nodes.some(n=>n.href==='tel:+375259704086'));
    assert.ok(!nodes.some(n=>n.className==='state error-state'));
    assert.equal(root.attributes['aria-busy'],'false');
  } finally {delete globalThis.document;}
});
test('Catalog-load screen can retry and uses supplied contacts', () => {
  globalThis.document={createElement:tag=>new Node(tag)};
  try {
    let retried=false;
    const root=new Node('main');
    renderProposalError(root,LOAD_ERROR,{...catalog.contacts},()=>{retried=true;});
    const nodes=flatten(root);
    assert.ok(nodes.some(n=>n.textContent===LOAD_ERROR));
    nodes.find(n=>n.className==='recovery-retry').listeners.click();
    assert.equal(retried,true);
    assert.ok(nodes.some(n=>n.href===catalog.contacts.telegram));
  } finally {delete globalThis.document;}
});
