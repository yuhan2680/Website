import {SaxesParser} from 'saxes';
import {HttpError,readBytes} from './http.js';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SVG_BYTES = 1024 * 1024;
const types = {jpg:'image/jpeg',png:'image/png',svg:'image/svg+xml'};
const imagePath = /^\/media\/(\d{4}\/(?:0[1-9]|1[0-2])\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|svg))$/;
const svgNamespace = 'http://www.w3.org/2000/svg';
const activeElements = new Set(['script','foreignobject','a','animate','animatemotion','animatetransform','set','discard','iframe','object','embed']);

function bucket(env) {
  if (!env.BLOG_IMAGES) throw new HttpError(503,'图片存储尚未配置，请稍后再试');
  return env.BLOG_IMAGES;
}

// Parse XML rather than matching tags with a regex. Reject active SVG content;
// the response also has an opaque-origin sandbox, including on direct visits.
function validateSvg(bytes) {
  if (bytes.byteLength > MAX_SVG_BYTES) throw new HttpError(413,'SVG 图片不能超过 1 MB');
  const unsafe = () => { throw new HttpError(400,'SVG 包含脚本、事件或外部引用，请导出为静态 SVG 后重试'); };
  let depth = 0, nodes = 0, root = false;
  try {
    const source = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const parser = new SaxesParser({xmlns:true});
    parser.on('doctype',unsafe);
    parser.on('processinginstruction',unsafe);
    parser.on('xmldecl',declaration=>{
      if (declaration.encoding && !/^utf-8$/i.test(declaration.encoding)) throw new Error('encoding');
    });
    parser.on('opentag',node=>{
      if (++depth > 64 || ++nodes > 30000) throw new HttpError(400,'SVG 过于复杂，请简化后重试');
      if (!root) {
        if (node.local !== 'svg' || node.uri !== svgNamespace) throw new Error('root');
        root = true;
      }
      if (activeElements.has(node.local.toLowerCase())) unsafe();
      for (const attribute of Object.values(node.attributes)) {
        if (/^on/i.test(attribute.local) || attribute.name === 'xml:base') unsafe();
        if (attribute.local === 'href' && !/^#[A-Za-z_][\w:.-]*$/.test(attribute.value) &&
            !(node.local === 'image' && /^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=\s]+$/.test(attribute.value))) unsafe();
      }
    });
    parser.on('closetag',()=>{ depth--; });
    parser.write(source).close();
    if (!root) throw new Error('empty');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400,'不是有效的 SVG 图片，请使用 UTF-8 编码的 SVG 文件');
  }
}

export async function uploadImage(request,env) {
  const storage = bucket(env);
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new HttpError(415,'请选择要上传的图片');
  const bytes = await readBytes(request,MAX_IMAGE_BYTES + 65536,'图片不能超过 8 MB');
  let form;
  try { form = await new Response(bytes,{headers:{'Content-Type':contentType}}).formData(); }
  catch { throw new HttpError(400,'图片上传格式无效'); }
  const file = form.get('file');
  if ([...form.keys()].length !== 1 || !file || typeof file === 'string' || typeof file.name !== 'string') throw new HttpError(400,'每次请求只能上传一张图片');
  if (!file.size) throw new HttpError(400,'图片文件为空');
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413,'图片不能超过 8 MB');
  const extension = file.name.match(/\.(jpe?g|png|svg)$/i)?.[1].toLowerCase().replace('jpeg','jpg');
  if (!types[extension]) throw new HttpError(415,'仅支持 JPG、PNG 和 SVG 图片');
  const body = new Uint8Array(await file.arrayBuffer());
  if (extension === 'svg') validateSvg(body);
  else {
    const valid = extension === 'png'
      ? body.length >= 33 && [137,80,78,71,13,10,26,10].every((value,index)=>body[index]===value) && String.fromCharCode(...body.slice(12,16)) === 'IHDR'
      : body.length >= 4 && body[0]===255 && body[1]===216 && body[2]===255 && body.some((value,index)=>index>2 && value===255 && body[index+1]===217);
    if (!valid) throw new HttpError(400,'图片内容与文件格式不符，或文件已损坏');
  }
  const name = file.name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180) || '图片.'+extension;
  const key = new Date().toISOString().slice(0,7).replace('-','/')+'/'+crypto.randomUUID()+'.'+extension;
  await storage.put('images/'+key,body,{httpMetadata:{contentType:types[extension]},customMetadata:{name}});
  return {url:'/media/'+key,name,size:body.byteLength,type:types[extension]};
}

export async function serveImage(request,env) {
  const match = new URL(request.url).pathname.match(imagePath);
  if (!match) throw new HttpError(404,'图片不存在');
  const storage = bucket(env), key = 'images/'+match[1], conditions = new Headers();
  if (request.headers.has('If-None-Match')) conditions.set('If-None-Match',request.headers.get('If-None-Match'));
  const object = request.method === 'HEAD' ? await storage.head(key) : await storage.get(key,{onlyIf:conditions});
  if (!object) throw new HttpError(404,'图片不存在');
  const headers = {
    'Content-Type':types[match[2]],
    'Cache-Control':'public, max-age=31536000, immutable',
    'ETag':object.httpEtag,
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer'
  };
  // R2 returns metadata without a body when a conditional GET is not satisfied.
  const cached = request.headers.get('If-None-Match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===object.httpEtag);
  if (cached || (request.method === 'GET' && !('body' in object))) return new Response(null,{status:304,headers});
  headers['Content-Length'] = String(object.size);
  return new Response(request.method === 'HEAD' ? null : object.body,{headers});
}
