import {HttpError} from './http.js';
import {getSetting, saveSetting, textField, linkField} from './settings.js';

export const defaultProfile = {
  version: 1,
  name: '小涵 Naiwenel',
  bio: '学生，开源独立游戏开发者。',
  avatar: '/assets/images/avatar-logo.jpg',
  tags: ['独立开发', '天文摄影', '日常记录'],
  learningTitle: '正在学习',
  learning: ['Godot 与游戏开发', 'Python', '英语'],
  aboutTitle: '关于我',
  aboutAvatar: '/assets/images/naiwenel-avatar.jpg',
  aboutMarkdown: `你好~我是**小涵 Naiwenel**，石溪大学的普通学生，开源独立游戏开发者

正在学习：

- 🎮 Godot
- 🐍 Python
- 🇺🇸 英语

感兴趣的事情：

- 🌌 天文摄影
- 🎸 电吉他
- 🌏 维基百科编辑
- 🛠️ mod开发
- 🔴 直播

希望我的作品能为大家带来快乐~ ✨

[在 GitHub 找到我 ↗](https://github.com/yuhan2680)`
};

export function getProfile(env) {
  return getSetting(env, 'profile', defaultProfile);
}

function textList(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new HttpError(400, label + '列表无效');
  return value.map(item => textField(item, label, maxLength));
}

export async function saveProfile(env, input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, '资料格式无效');
  const content = {
    name: textField(input.name, '名称', 80),
    bio: textField(input.bio, '简介', 300, false),
    avatar: linkField(input.avatar, '首页头像', true),
    tags: textList(input.tags, '标签', 12, 40),
    learningTitle: textField(input.learningTitle, '学习卡片标题', 80),
    learning: textList(input.learning, '学习项目', 30, 120),
    aboutTitle: textField(input.aboutTitle, '关于我标题', 100),
    aboutAvatar: linkField(input.aboutAvatar, '关于我头像', true),
    aboutMarkdown: textField(input.aboutMarkdown, '关于我正文', 20000)
  };
  return saveSetting(env, 'profile', input.version, content);
}
