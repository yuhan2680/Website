// Both settings pages edit one versioned record and publish on submit.
export function bindSettingsEditor({form, fields, endpoint, saveButton, reloadButton, status, display, read, savedMessage}) {
  let version = null;
  let csrf = '';
  let busy = false;
  let dirty = false;

  function notice(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function updateButtons() {
    fields.disabled = busy || version === null;
    saveButton.disabled = fields.disabled || !dirty;
    reloadButton.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  }

  function changed(message = '有未保存的修改') {
    dirty = true;
    updateButtons();
    notice(message);
  }

  async function api(path, method = 'GET', body) {
    const headers = {Accept: 'application/json'};
    const multipart = body instanceof FormData;
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = csrf;
      if (!multipart) headers['Content-Type'] = 'application/json';
    }
    const response = await fetch('/admin/api/' + path, {
      credentials: 'same-origin', method, headers,
      body: multipart ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(multipart ? 120000 : 30000)
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('登录已过期，请刷新页面重新登录。');
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) reloadButton.hidden = false;
      throw new Error(data.msg || '操作失败，请重试。');
    }
    return data;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    updateButtons();
    try {
      await action();
    } catch (error) {
      notice(error.name === 'TimeoutError' ? '请求超时，请重试。' : error.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  }

  function accept(record) {
    display(record);
    for (const input of fields.querySelectorAll('input,textarea')) input.setCustomValidity('');
    version = record.version;
    dirty = false;
    reloadButton.hidden = true;
  }

  function load() {
    reloadButton.hidden = false;
    return run(async () => {
      const [session, data] = await Promise.all([api('session'), api(endpoint)]);
      csrf = session.csrf;
      document.getElementById('accountName').textContent = session.user.email;
      accept(data[endpoint]);
      notice('');
    });
  }

  form.addEventListener('input', event => {
    if (event.target.type === 'file') return;
    event.target.setCustomValidity('');
    changed();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !dirty || version === null || !csrf) return;
    const values = read();
    if (!values) return;
    return run(async () => {
      notice('正在保存…');
      const data = await api(endpoint, 'PUT', {...values, version});
      accept(data[endpoint]);
      notice(savedMessage);
    });
  });
  reloadButton.addEventListener('click', () => {
    if (!dirty || window.confirm('重新读取会覆盖尚未保存的修改，继续吗？')) load();
  });
  window.addEventListener('beforeunload', event => {
    if (dirty || (busy && version !== null)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  load();
  return {changed, notice, api, run};
}

export function bindImageUpload(button, picker, address, editor, label) {
  button.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    if (!/\.(?:jpe?g|png|svg)$/i.test(file.name)) {
      editor.notice('请选择 JPG、PNG 或 SVG 图片。', true);
      return;
    }
    const limit = /\.svg$/i.test(file.name) ? 1 : 8;
    if (!file.size || file.size > limit * 1024 * 1024) {
      editor.notice('请选择非空图片，最大 ' + limit + ' MB。', true);
      return;
    }
    const body = new FormData();
    body.append('file', file);
    await editor.run(async () => {
      editor.notice('正在上传' + label + '…');
      const {image} = await editor.api('media', 'POST', body);
      address.value = image.url;
      editor.changed(label + '已上传，保存后生效。');
    });
  });
}
