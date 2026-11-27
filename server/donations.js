import {HttpError} from './http.js';
import {initialDonations} from './generated/templates.js';
import {getSetting, saveSetting, textField, linkField} from './settings.js';

export function getDonations(env) {
  return getSetting(env, 'donations', {items: initialDonations});
}

export async function saveDonations(env, input) {
  if (!Array.isArray(input?.items) || input.items.length > 40) throw new HttpError(400, '最多可填写 40 个赞助方式');
  const items = input.items.map(item => ({
    name: textField(item?.name, '赞助方式名称', 80),
    url: linkField(item?.url, '赞助链接')
  }));
  return saveSetting(env, 'donations', input.version, {items});
}
