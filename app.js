export const INVALID_LINK = 'Ссылка на коммерческое предложение указана некорректно. Попросите менеджера прислать новую';
export const LOAD_ERROR = 'Не удалось загрузить предложение. Попробуйте обновить страницу';

export function parseProposal(search, services) {
  const params = new URLSearchParams(search);
  const client = params.get('client')?.trim();
  const codes = params.get('services')?.split(',');
  if (params.getAll('client').length !== 1 || params.getAll('services').length !== 1 || !client || !codes?.length || codes.some(code => !services.some(service => service.code === code))) return null;
  const chosen = [];
  for (const code of new Set(codes)) {
    const service = services.find(item => item.code === code);
    let selectedOptions = [];
    if (service.selection) {
      const group = service.selection;
      const raw = params.get(group.parameter);
      selectedOptions = raw === null ? [...group.defaults] : [...new Set(raw.split(','))];
      if (params.getAll(group.parameter).length > 1 || (raw !== null && !raw) || selectedOptions.some(option => !group.options.some(item => item.code === option)) || (group.multiple === false && selectedOptions.length !== 1)) return null;
    }
    chosen.push({...service, selectedOptions});
  }
  return {client, services: chosen};
}

export function buildProposalURL(base, client, selected, selections, services) {
  const url = new URL('./', base);
  const params = new URLSearchParams({client: client.trim(), services: selected.join(',')});
  for (const code of selected) {
    const service = services.find(item => item.code === code);
    if (service?.selection) params.set(service.selection.parameter, (selections[code] || []).join(','));
  }
  url.search = params.toString();
  return url;
}

export function serviceView(service) {
  const selected = service.selectedOptions || service.selection?.defaults || [];
  const options = service.selection?.options.filter(option => selected.includes(option.code)) || [];
  const packages = service.code === 'web' ? service.packages.filter(item => selected.includes(item.code)) : [];
  let prices = service.prices;
  let label = service.summaryLabel || '';
  let price = prices[0].value;
  let period = prices[0].period;
  if (service.code === 'web') {
    prices = packages.map(item => ({label: item.name, value: item.price, period: `Разовый проект · ${item.timing}`}));
    label = options.map(item => item.label).join(' / ');
    price = packages[0].price;
    period = packages.length === 1 ? 'разовый проект' : 'в зависимости от формата';
  }
  if (service.code === 'seo') {price = service.prices[0].value; period = `первый месяц · далее ${service.prices[1].value}/мес`;}
  if (service.code === 'geo') {price = service.prices[1].value; period = `разовый проект · ведение ${service.prices[2].value}/мес`;}
  return {packages, prices, label, price, period};
}

export function validateCatalog(data) {
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const safeURL = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
  if (!data || !['brand', 'intro', 'about', 'nextStep'].every(key => nonempty(data[key])) || !safeURL(data.contacts?.url) || !safeURL(data.contacts?.website) || !Array.isArray(data.services) || !data.services.length) throw new Error('Invalid catalog');
  const codes = new Set();
  for (const service of data.services) {
    if (!/^[a-z]+$/.test(service.code) || codes.has(service.code) || !['name', 'category', 'benefit'].every(key => nonempty(service[key])) || !Array.isArray(service.items) || !service.items.every(nonempty) || !Array.isArray(service.prices) || !service.prices.length || !service.prices.every(price => ['label', 'value', 'period'].every(key => nonempty(price[key]))) || (service.url && !safeURL(service.url)) || (service.note !== undefined && !nonempty(service.note))) throw new Error('Invalid service');
    codes.add(service.code);
    if (service.selection) {
      const group = service.selection;
      if (!/^[a-z]+$/.test(group.parameter) || !nonempty(group.label) || !Array.isArray(group.options) || !group.options.length || !group.options.every(option => option && /^[a-z]+$/.test(option.code) && nonempty(option.label)) || new Set(group.options.map(option => option.code)).size !== group.options.length || !Array.isArray(group.defaults) || !Array.isArray(group.builderDefaults) || ![...group.defaults, ...group.builderDefaults].every(code => group.options.some(option => option.code === code))) throw new Error('Invalid selection');
      if (service.code === 'web' && (!service.packages || !service.packages.length || !group.defaults.length || !service.packages.every(item => group.options.some(option => option.code === item.code)))) throw new Error('Invalid web formats');
    }
    if (service.timing !== undefined && !nonempty(service.timing)) throw new Error('Invalid timing');
    if (service.terms !== undefined && (!Array.isArray(service.terms) || !service.terms.every(nonempty))) throw new Error('Invalid terms');
    for (const [key, fields] of [['packages', ['name', 'price', 'description']], ['steps', ['title', 'timing', 'text']]]) {
      if (service[key] !== undefined && (!Array.isArray(service[key]) || !service[key].every(item => item && fields.every(field => nonempty(item[field]))))) throw new Error(`Invalid ${key}`);
    }
    if (service.packages?.some(item => !Array.isArray(item.items) || !item.items.every(nonempty) || typeof item.timing !== 'string')) throw new Error('Invalid package');
  }
  if (data.principles !== undefined && (!Array.isArray(data.principles) || !data.principles.every(item => item && nonempty(item.title) && nonempty(item.text)))) throw new Error('Invalid principles');
  if (data.contacts.telegram && !safeURL(data.contacts.telegram)) throw new Error('Invalid Telegram URL');
  return data;
}

export async function loadCatalog() {
  const response = await fetch(new URL('./catalog.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('Catalog unavailable');
  return validateCatalog(await response.json());
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, className) {
  const node = element('a', className, text);
  node.href = href;
  return node;
}

export function renderProposal(root, catalog, proposal) {
  root.replaceChildren();
  const hero = element('section', 'hero');
  hero.append(element('p', 'eyebrow', 'Персональное коммерческое предложение'));
  const title = element('h1', '', `Предложение ${catalog.brand} для `);
  title.append(element('span', 'client-name', proposal.client));
  hero.append(title, element('p', 'hero-intro', catalog.intro));
  const heroBottom = element('div', 'hero-bottom');
  heroBottom.append(link('Обсудить запуск ↗', catalog.contacts.url, 'button'), element('span', 'hero-detail', 'Понятный состав работ. Прозрачные условия.'));
  hero.append(heroBottom, element('span', 'hero-art', '↗'));
  hero.lastChild.setAttribute('aria-hidden', 'true');
  const about = element('section', 'about-section');
  about.append(element('h2', 'eyebrow', 'О FastUp'), element('p', '', catalog.about));
  if (catalog.principles) {
    const principles = element('div', 'principles');
    catalog.principles.forEach(item => {
      const box = element('div', 'principle');
      box.append(element('h3', '', item.title), element('p', '', item.text));
      principles.append(box);
    });
    about.append(principles);
  }
  const services = element('section', 'services-section');
  const heading = element('div', 'section-heading');
  heading.append(element('h2', '', 'Что предлагаем'), element('span', 'muted', 'Нажмите на услугу, чтобы увидеть состав и условия'));
  services.append(heading);
  const grid = element('div', 'service-grid');
  proposal.services.forEach((service, index) => {
    const view = serviceView(service);
    const card = element('details', 'service-card service-accordion');
    card.dataset.service = service.code;
    card.id = `service-${service.code}`;
    const summary = element('summary', 'service-summary');
    const copy = element('span', 'summary-copy');
    copy.append(element('span', 'eyebrow', service.category), element('span', 'summary-title', service.name), element('span', 'summary-description', service.short || service.benefit));
    if (view.label) copy.append(element('span', 'summary-selection', view.label));
    const price = element('span', 'summary-price');
    price.append(element('strong', '', view.price), element('small', '', view.period));
    const hint = element('span', 'summary-hint');
    hint.append(element('span', 'when-closed', 'Подробнее'), element('span', 'when-open', 'Свернуть'));
    summary.append(element('span', 'card-number', String(index + 1).padStart(2, '0')), copy, price, hint);
    card.append(summary);
    const body = element('div', 'service-body');
    body.append(element('p', 'service-benefit', service.benefit));
    // The selected website formats carry their own scope and timing.
    if (service.timing && service.code !== 'web') body.append(element('p', 'timing', service.timing));
    if (service.code !== 'web') {
      const overview = element('div', 'service-overview');
      const scope = element('div');
      scope.append(element('h4', '', 'Что входит в работу'));
      const list = element('ul', 'work-list');
      service.items.forEach(item => list.append(element('li', '', item)));
      scope.append(list);
      const prices = element('div', 'prices');
      view.prices.forEach(item => {
        const row = element('div', 'price-row');
        const label = element('div', 'price-label', item.label);
        label.append(element('small', '', item.period));
        row.append(label, element('strong', 'price-value', item.value));
        prices.append(row);
      });
      overview.append(scope, prices);
      body.append(overview);
    }
    if (view.packages.length) {
      const packages = element('div', 'package-grid');
      view.packages.forEach(item => {
        const box = element('section', 'package');
        box.dataset.format = item.code;
        box.append(element('p', 'eyebrow', item.timing), element('h4', '', item.name), element('p', 'package-price', item.price), element('p', 'package-description', item.description));
        const list = element('ul', 'work-list');
        item.items.forEach(text => list.append(element('li', '', text)));
        box.append(list);
        packages.append(box);
      });
      body.append(packages);
    }
    if (service.note) body.append(element('p', 'service-note', service.note));
    if (service.terms?.length) {
      const terms = element('div', 'terms');
      terms.append(element('h4', '', 'Условия работы'));
      const list = element('ul');
      service.terms.forEach(text => list.append(element('li', '', text)));
      terms.append(list);
      body.append(terms);
    }
    if (service.steps?.length) {
      body.append(element('h4', 'detail-heading', 'Как работаем'));
      const steps = element('ol', 'steps');
      service.steps.forEach(item => {
        const step = element('li');
        step.append(element('span', 'eyebrow', item.timing), element('h5', '', item.title), element('p', '', item.text));
        steps.append(step);
      });
      body.append(steps);
    }
    const more = link('Узнать больше ↗', service.url || catalog.contacts.website, 'button learn-more');
    more.target = '_blank';
    more.rel = 'noopener noreferrer';
    body.append(more);
    card.append(body);
    grid.append(card);
  });
  services.append(grid);
  const next = element('section', 'next-section');
  const nextText = element('div');
  nextText.append(element('p', 'eyebrow', 'Следующий шаг'), element('h2', '', 'С чего начнём'), element('p', '', catalog.nextStep));
  next.append(nextText, link('Обсудить запуск ↗', catalog.contacts.url, 'button'));
  const contacts = element('section', 'contacts-section');
  contacts.append(element('h2', '', 'На связи с вами'));
  const contactLinks = element('div', 'contact-links');
  if (catalog.contacts.phone) contactLinks.append(link(catalog.contacts.phone, `tel:${catalog.contacts.phone.replace(/[^+\d]/g, '')}`));
  if (catalog.contacts.phoneAlt) contactLinks.append(link(catalog.contacts.phoneAlt, `tel:${catalog.contacts.phoneAlt.replace(/[^+\d]/g, '')}`));
  if (catalog.contacts.email) contactLinks.append(link(catalog.contacts.email, `mailto:${catalog.contacts.email}`));
  if (catalog.contacts.telegram) contactLinks.append(link('Написать в Telegram ↗', catalog.contacts.telegram));
  contacts.append(contactLinks);
  if (catalog.contacts.hours) contacts.append(element('p', 'muted', catalog.contacts.hours));
  if (catalog.contacts.location) contacts.append(element('p', 'muted', catalog.contacts.location));
  if (catalog.contacts.legal) contacts.append(element('p', 'legal', catalog.contacts.legal));
  const footer = element('footer', 'proposal-footer');
  footer.append(element('span', '', `${catalog.brand} · Маркетинг и веб-разработка`), link('Основной сайт FastUp ↗', catalog.contacts.website));
  root.append(hero, about, services, next, contacts, footer);
  root.setAttribute('aria-busy', 'false');
}

// Keep a way to contact FastUp even when the shared catalog is unavailable.
export const RECOVERY_CONTACTS = {
  telegram: 'https://t.me/Asmodey_dev',
  phone: '+375 (29) 132-80-73',
  phoneAlt: '+375 (25) 970-40-86',
  website: 'https://fastup.by/',
  url: 'https://fastup.by/kontakty/'
};

export function renderProposalError(root, message, contacts = RECOVERY_CONTACTS, retry) {
  const isLoadError = message === LOAD_ERROR;
  const contact = {...RECOVERY_CONTACTS, ...contacts};
  root.className = 'error-page';
  root.replaceChildren();
  const hero = element('section', 'recovery-hero');
  const content = element('div', 'recovery-content');
  const eyebrow = element('p', 'recovery-eyebrow', isLoadError ? 'Небольшая пауза — и продолжим' : 'FastUp рядом, даже если ссылка подвела');
  const title = element('h1', 'recovery-title');
  title.append(element('span', '', 'Предложение'), element('span', 'recovery-accent', 'не открылось.'));
  const description = element('p', 'recovery-description', message);
  description.setAttribute('role', 'status');
  const actions = element('div', 'recovery-actions');
  const telegram = link('Написать в Telegram ↗', contact.telegram, 'button recovery-telegram');
  telegram.target = '_blank';
  telegram.rel = 'noopener noreferrer';
  actions.append(telegram);
  if (isLoadError && retry) {
    const refresh = element('button', 'recovery-retry', 'Попробовать ещё раз ↻');
    refresh.type = 'button';
    refresh.addEventListener('click', retry);
    actions.append(refresh);
  } else {
    actions.append(link('Другие способы связи ↗', contact.url, 'recovery-secondary'));
  }
  content.append(eyebrow, title, description, actions);
  const accent = element('span', 'recovery-orbit', '↗');
  accent.setAttribute('aria-hidden', 'true');
  hero.append(content, accent);
  const footer = element('footer', 'recovery-footer');
  const prompt = element('div', 'recovery-contact-copy');
  prompt.append(element('span', 'recovery-availability', 'Мы на связи'), element('p', '', 'Поможем получить ваше предложение.'));
  const phones = element('div', 'recovery-phones');
  [contact.phone, contact.phoneAlt].filter(Boolean).forEach(phone => phones.append(link(phone, `tel:${phone.replace(/[^+\d]/g, '')}`, 'recovery-phone')));
  footer.append(prompt, phones, link('На fastup.by ↗', contact.website, 'recovery-home'));
  root.append(hero, footer);
  root.setAttribute('aria-busy', 'false');
}

async function startProposal() {
  const root = document.getElementById('proposal');
  const showError = (message, contacts) => renderProposalError(root, message, contacts, () => location.reload());
  const params = new URLSearchParams(location.search);
  if (!params.get('client')?.trim() || !params.get('services')) { showError(INVALID_LINK); return; }
  try {
    const catalog = await loadCatalog();
    const proposal = parseProposal(location.search, catalog.services);
    if (!proposal) { showError(INVALID_LINK, catalog.contacts); return; }
    document.title = `Предложение ${catalog.brand} для ${proposal.client}`;
    renderProposal(root, catalog, proposal);
  } catch { showError(LOAD_ERROR); }
}
if (typeof document !== 'undefined' && document.body.dataset.page === 'proposal') startProposal();
