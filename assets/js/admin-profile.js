import {bindSettingsEditor, bindImageUpload} from './admin-settings.js';

const form = document.getElementById('profileEditor');
const fields = document.getElementById('profileFields');
const saveButton = document.getElementById('saveProfile');
const status = document.getElementById('profileStatus');
const reloadButton = document.getElementById('reloadProfile');
const textFields = ['name', 'bio', 'avatar', 'learningTitle', 'aboutTitle', 'aboutAvatar', 'aboutMarkdown'];
const listFields = [
  {name: 'tags', label: '标签', maxItems: 12, maxLength: 40},
  {name: 'learning', label: '学习内容', maxItems: 30, maxLength: 120}
];

function display(profile) {
  for (const name of textFields) form.elements.namedItem(name).value = profile[name];
  for (const {name} of listFields) form.elements.namedItem(name).value = profile[name].join('\n');
}

function readFields() {
  const values = {};
  for (const name of textFields) values[name] = form.elements.namedItem(name).value;
  for (const {name, label, maxItems, maxLength} of listFields) {
    const input = form.elements.namedItem(name);
    const items = input.value.split('\n').map(line => line.trim()).filter(Boolean);
    if (items.length > maxItems || items.some(item => item.length > maxLength)) {
      input.setCustomValidity(label + '最多 ' + maxItems + ' 项，每项最多 ' + maxLength + ' 字。');
      input.reportValidity();
      return null;
    }
    values[name] = items;
  }
  return values;
}

const editor = bindSettingsEditor({
  form, fields, saveButton, reloadButton, status, endpoint: 'profile',
  display, read: readFields, savedMessage: '资料已保存。'
});

form.querySelectorAll('[data-upload]').forEach(button => {
  const address = form.elements.namedItem(button.dataset.upload);
  bindImageUpload(button, document.getElementById(button.dataset.upload + 'File'), address, editor, '头像');
});
