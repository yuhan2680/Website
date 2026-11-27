import {bindSettingsEditor, bindImageUpload} from './admin-settings.js';

const form = document.getElementById('collectionEditor');
const rows = document.getElementById('collectionRows');
const addButton = document.getElementById('addItem');
const endpoint = form.dataset.collection;
const projects = endpoint === 'projects';
const noun = projects ? '项目' : '平台';
const definitions = projects ? [
  {key: 'name', label: '项目名称', max: 100, required: true},
  {key: 'url', label: '项目地址', max: 2048, required: true},
  {key: 'platform', label: '平台', max: 40},
  {key: 'cover', label: '封面地址', max: 2048, required: true},
  {key: 'description', label: '简介', max: 300, multiline: true}
] : [
  {key: 'name', label: '平台名称', max: 80, required: true},
  {key: 'url', label: '平台网址（HTTPS）', max: 2048, required: true, type: 'url'}
];
let rowNumber = 0;

function buttonFor(text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.dataset.action = action;
  return button;
}

function makeRow(item) {
  const section = document.createElement('section');
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  const prefix = 'collection-item-' + (++rowNumber);
  heading.id = prefix;
  section.setAttribute('aria-labelledby', heading.id);
  const actions = document.createElement('div');
  actions.className = 'collection-actions';
  const remove = buttonFor('移除', 'remove');
  remove.className = 'danger';
  actions.append(buttonFor('上移', 'up'), buttonFor('下移', 'down'), remove);
  header.append(heading, actions);
  section.append(header);

  for (const {key, label, max, required, type, multiline} of definitions) {
    const caption = document.createElement('label');
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.id = prefix + '-' + key;
    caption.htmlFor = input.id;
    caption.textContent = label;
    input.name = key;
    input.maxLength = max;
    input.required = Boolean(required);
    input.value = item[key] ?? '';
    if (multiline) input.rows = 2;
    if (type) input.type = type;
    section.append(caption);
    if (key !== 'cover') {
      section.append(input);
      continue;
    }
    const controls = document.createElement('div');
    controls.className = 'profile-image-field';
    const upload = buttonFor('上传封面', 'upload');
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml';
    picker.hidden = true;
    controls.append(input, upload, picker);
    section.append(controls);
    bindImageUpload(upload, picker, input, editor, '封面');
  }
  return section;
}

function updateOrder() {
  const count = rows.children.length;
  document.getElementById('emptyList').hidden = count > 0;
  addButton.disabled = count >= 40;
  Array.from(rows.children).forEach((row, index) => {
    row.querySelector('h2').textContent = noun + ' ' + (index + 1);
    row.querySelector('[data-action="up"]').disabled = index === 0;
    row.querySelector('[data-action="down"]').disabled = index === count - 1;
  });
}

function display(record) {
  rows.replaceChildren(...record.items.map(makeRow));
  updateOrder();
}

function read() {
  const items = Array.from(rows.children, row => Object.fromEntries(
    definitions.map(({key}) => [key, row.querySelector('[name="' + key + '"]').value.trim()])
  ));
  return {items};
}

const editor = bindSettingsEditor({
  endpoint, form, display, read, savedMessage: noun + '已保存。',
  fields: document.getElementById('collectionFields'),
  saveButton: document.getElementById('saveCollection'),
  reloadButton: document.getElementById('reloadCollection'),
  status: document.getElementById('profileStatus')
});

addButton.addEventListener('click', () => {
  if (rows.children.length >= 40) return;
  const row = makeRow({});
  rows.append(row);
  updateOrder();
  row.querySelector('[name="name"]').focus();
  editor.changed();
});

rows.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.dataset.action === 'upload') return;
  const row = button.closest('section');
  const previous = row.previousElementSibling;
  const next = row.nextElementSibling;
  let focus = row;
  switch (button.dataset.action) {
    case 'up':
      if (!previous) return;
      rows.insertBefore(row, previous);
      break;
    case 'down':
      if (!next) return;
      rows.insertBefore(next, row);
      break;
    case 'remove':
      row.remove();
      focus = next || previous;
      break;
  }
  updateOrder();
  if (focus) focus.querySelector('[name="name"]').focus();
  else addButton.focus();
  editor.changed();
});
