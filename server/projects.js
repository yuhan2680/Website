import {HttpError} from './http.js';
import {initialProjects} from './generated/templates.js';
import {getSetting, saveSetting, textField, linkField} from './settings.js';

export function getProjects(env) {
  return getSetting(env, 'projects', {items: initialProjects});
}

export async function saveProjects(env, input) {
  if (!Array.isArray(input?.items) || input.items.length > 40) throw new HttpError(400, '最多可填写 40 个项目或作品');
  const items = input.items.map(item => ({
    name: textField(item?.name, '作品名称', 100),
    description: textField(item?.description, '作品简介', 300, false),
    url: linkField(item?.url, '作品链接', true),
    cover: linkField(item?.cover, '封面地址', true),
    platform: textField(item?.platform, '平台名称', 40, false)
  }));
  return saveSetting(env, 'projects', input.version, {items});
}
