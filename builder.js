import { loadCatalog, element, LOAD_ERROR, buildProposalURL, parseProposal } from './app.js';

const client = document.getElementById('client');
const options = document.getElementById('service-options');
const urlField = document.getElementById('share-url');
const copy = document.getElementById('copy');
const status = document.getElementById('builder-status');
const preview = document.getElementById('preview');
const empty = document.getElementById('preview-empty');
const open = document.getElementById('open-preview');
let selected = [];
let selections = {};
let services = [];
let activeURL = '';
let timer;
let revision = 0;

function update() {
  revision++;
  clearTimeout(timer);
  options.querySelectorAll('.service-toggle').forEach(input => {
    input.checked = selected.includes(input.value);
    const wrapper = input.closest('.service-choice');
    wrapper.querySelector('.selection-order').textContent = input.checked ? String(selected.indexOf(input.value) + 1).padStart(2, '0') : '+';
    const group = wrapper.querySelector('.service-parameters');
    if (group) {
      group.hidden = !input.checked;
      group.disabled = !input.checked;
      group.querySelectorAll('input').forEach(option => {option.checked = selections[input.value].includes(option.value);});
    }
  });
  let message = 'Укажите компанию и выберите хотя бы одну услугу.';
  let url;
  if (client.value.trim() && selected.length) {
    url = buildProposalURL(location.href, client.value, selected, selections, services);
    if (!parseProposal(url.search, services)) {
      message = 'Выберите хотя бы один формат сайта для разработки.';
      url = null;
    }
  }
  const valid = Boolean(url);
  copy.disabled = !valid;
  open.hidden = !valid;
  preview.hidden = !valid;
  empty.hidden = valid;
  if (!valid) {
    activeURL = '';
    urlField.value = '';
    preview.removeAttribute('src');
    open.removeAttribute('href');
    status.textContent = message;
    return;
  }
  activeURL = url.href;
  urlField.value = activeURL;
  open.href = activeURL;
  const previewURL = new URL('./index.html', location.href);
  previewURL.search = url.search;
  timer = setTimeout(() => {preview.src = previewURL.href;}, 180);
  status.textContent = 'Проверьте предпросмотр и скопируйте ссылку для клиента.';
}

copy.addEventListener('click', async () => {
  if (!activeURL) return;
  const copiedRevision = revision;
  try {
    await navigator.clipboard.writeText(activeURL);
    if (revision === copiedRevision) status.textContent = 'Ссылка скопирована. Можно отправлять клиенту.';
  } catch {
    urlField.focus();
    urlField.select();
    status.textContent = 'Скопируйте выделенную ссылку вручную: Ctrl+C или ⌘C.';
  }
});
client.addEventListener('input', update);
document.getElementById('builder-form').addEventListener('submit', event => event.preventDefault());

async function start() {
  try {
    const catalog = await loadCatalog();
    services = catalog.services;
    options.replaceChildren();
    services.forEach(service => {
      const wrapper = element('div', 'service-choice');
      const label = element('label', 'service-option');
      const input = element('input', 'service-toggle');
      input.type = 'checkbox'; input.name = 'services'; input.value = service.code;
      const name = element('span', 'option-name', service.name);
      name.append(element('small', '', service.code === 'geo' ? 'Проект от 1 200 BYN · аудит бесплатно' : service.prices[0].value));
      const badge = element('span', 'selection-order', '+');
      badge.setAttribute('aria-hidden', 'true');
      label.append(input, name, badge);
      wrapper.append(label);
      input.addEventListener('change', () => {
        selected = input.checked ? [...selected, service.code] : selected.filter(code => code !== service.code);
        update();
      });
      if (service.selection) {
        const settings = service.selection;
        selections[service.code] = [...settings.builderDefaults];
        const group = element('fieldset', 'service-parameters');
        group.hidden = true;
        group.disabled = true;
        group.append(element('legend', '', settings.label));
        const choices = element('div', 'parameter-options');
        settings.options.forEach(option => {
          const choice = element('label', 'parameter-option');
          const checkbox = element('input');
          checkbox.type = settings.multiple === false ? 'radio' : 'checkbox';
          checkbox.name = `parameter-${service.code}`;
          checkbox.value = option.code;
          checkbox.checked = selections[service.code].includes(option.code);
          checkbox.addEventListener('change', () => {
            selections[service.code] = settings.multiple === false ? [option.code] : checkbox.checked ? [...selections[service.code], option.code] : selections[service.code].filter(code => code !== option.code);
            update();
          });
          choice.append(checkbox, element('span', '', option.label));
          choices.append(choice);
        });
        group.append(choices);
        if (service.code === 'web') group.append(element('p', 'help', 'Можно выбрать несколько форматов. Клиент увидит только их.'));
        wrapper.append(group);
      }
      options.append(wrapper);
    });
    client.disabled = false;
    document.getElementById('services-fieldset').disabled = false;

  } catch {
    options.replaceChildren(element('p', 'error-inline', LOAD_ERROR));
    status.textContent = LOAD_ERROR;
  }
}
start();

// Mobile uses the page scroll, including the full proposal; desktop keeps its own preview viewport.
const mobileLayout = window.matchMedia('(max-width: 760px)');
let previewSizeObserver;
function fitMobilePreview() {
  if (!mobileLayout.matches) {
    preview.style.removeProperty('height');
    return;
  }
  try {
    const body = preview.contentDocument?.body;
    if (body) preview.style.height = `${Math.max(1, Math.ceil(body.getBoundingClientRect().height))}px`;
  } catch {
    // A service link may navigate the iframe to FastUp; its cross-origin document cannot be measured.
    preview.style.removeProperty('height');
  }
}
preview.addEventListener('load', () => {
  previewSizeObserver?.disconnect();
  fitMobilePreview();
  try {
    const body = preview.contentDocument?.body;
    if (body) {
      previewSizeObserver = new ResizeObserver(fitMobilePreview);
      previewSizeObserver.observe(body);
    }
  } catch { /* The iframe can navigate to an external contacts page. */ }
});
mobileLayout.addEventListener('change', fitMobilePreview);
