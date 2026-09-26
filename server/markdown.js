import MarkdownIt from 'markdown-it';
const markdown = new MarkdownIt({html:false,linkify:true,breaks:true,typographer:false});
const linkOpen = markdown.renderer.rules.link_open || ((tokens,index,options,env,self)=>self.renderToken(tokens,index,options));
markdown.renderer.rules.link_open = (tokens,index,options,env,self) => {
  tokens[index].attrSet('rel','noopener noreferrer');
  return linkOpen(tokens,index,options,env,self);
};
const image = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens,index,options,env,self) => {
  tokens[index].attrSet('loading','lazy');
  tokens[index].attrSet('decoding','async');
  tokens[index].attrSet('referrerpolicy','no-referrer');
  return image(tokens,index,options,env,self);
};
export function renderMarkdown(source) { return markdown.render(source); }
