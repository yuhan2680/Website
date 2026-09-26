(() => {
  'use strict';
  const $=id=>document.getElementById(id), form=$('postEditor');
  const labels={draft:'草稿',published:'已发布',trash:'回收站'};
  const fields=['title','slug','category','excerpt','markdown'];
  let csrf='',current=null,dirty=false,saving=false,page=1,total=0,sequence=0,selection=0,searchTimer,previewController;
  const status=(message,error=false)=>{ $('globalStatus').textContent=message; $('globalStatus').dataset.error=String(error); };
  async function api(path,options={}) {
    const response=await fetch('/admin/api/'+path,{credentials:'same-origin',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...options.headers}});
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('登录已过期，请刷新页面重新登录。');
    const data=await response.json();
    if(!response.ok)throw new Error(data.msg || '操作失败，请重试');
    return data;
  }
  function values() { return Object.fromEntries(fields.map(name=>[name,form.elements[name].value])); }
  function changed() { dirty=true;$('saveState').textContent='有未保存的修改';$('wordCount').textContent=$('postMarkdown').value.length+' 字'; }
  function confirmAction(message) {
    return new Promise(resolve=>{
      const dialog=$('confirmDialog');$('confirmMessage').textContent=message;
      dialog.returnValue='cancel';dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();
    });
  }
  async function canLeave() { return !dirty || await confirmAction('当前修改尚未保存，确定离开这篇文章吗？'); }
  function editMode() { $('writePanel').hidden=false;$('previewPanel').hidden=true;$('writeTab').setAttribute('aria-selected','true');$('previewTab').setAttribute('aria-selected','false'); }
  function showPost(post) {
    previewController?.abort();current=post;dirty=false;
    $('editorEmpty').hidden=true;form.hidden=false;
    for(const name of fields)form.elements[name].value=post[name] || '';
    $('postSlug').readOnly=Boolean(post.published_at);
    $('editingState').textContent=labels[post.status];
    $('saveState').textContent=post.id?'已保存 · '+new Date(post.updated_at).toLocaleString('zh-CN'):'尚未保存';
    $('wordCount').textContent=post.markdown.length+' 字';
    $('savePost').textContent=post.status==='published'?'保存修改':'保存草稿';
    $('savePost').hidden=post.status==='trash';
    $('publishPost').hidden=post.status!=='draft';
    $('unpublishPost').hidden=post.status!=='published';
    $('restorePost').hidden=post.status!=='trash';
    $('trashPost').hidden=!post.id||post.status==='trash';
    $('articleFields').disabled=post.status==='trash';
    $('publishedLink').hidden=post.status!=='published';
    $('publishedLink').href='/posts/'+encodeURIComponent(post.slug);
    $('markdownPreview').replaceChildren();editMode();
    document.querySelectorAll('.post-item').forEach(button=>button.setAttribute('aria-current',String(button.dataset.id===post.id)));
  }
  async function loadList() {
    const token=++sequence;
    const params=new URLSearchParams({q:$('adminSearch').value,status:$('statusFilter').value,page:String(page)});
    try {
      const data=await api('posts?'+params);
      if(token!==sequence)return;
      total=data.total;$('listCount').textContent=`共 ${total} 篇`;
      $('listPage').textContent=`${page} / ${Math.max(1,Math.ceil(total/data.limit))}`;
      $('listPrevious').disabled=page<=1;$('listNext').disabled=page*data.limit>=total;
      const rows=data.items.map(post=>{
        const button=document.createElement('button');button.type='button';button.className='post-item';button.dataset.id=post.id;button.setAttribute('aria-current',String(post.id===current?.id));
        const title=document.createElement('strong');title.textContent=post.title;
        const meta=document.createElement('small');meta.textContent=labels[post.status]+' · '+post.category+' · '+post.updated_at.slice(0,10);
        button.append(title,meta);button.addEventListener('click',async()=>{
          if(saving||!await canLeave())return;
          const selected=++selection;
          try { const data=await api('posts/'+encodeURIComponent(post.id));if(selected!==selection)return;showPost(data.post);status(''); }
          catch(error){status(error.message,true);}
        });return button;
      });
      if(!rows.length){const empty=document.createElement('p');empty.className='subtle';empty.textContent='没有找到文章。';rows.push(empty);}
      $('adminPostList').replaceChildren(...rows);
      $('categoryOptions').replaceChildren(...data.categories.map(item=>{const option=document.createElement('option');option.value=item.category;return option;}));
    }catch(error){status(error.message,true);}
  }
  async function save(nextStatus) {
    if(saving||!current)return;
    if(current.status!=='trash'&&!form.checkValidity()){editMode();form.reportValidity();return;}
    if(nextStatus==='trash'&&!await confirmAction('将这篇文章移到回收站？之后可以恢复为草稿。'))return;
    if(nextStatus==='draft'&&current.status==='published'&&!await confirmAction('撤回后，访客将无法访问这篇文章。确定撤回吗？'))return;
    const input={...values(),status:nextStatus,revision:current.revision};
    saving=true;$('articleFields').disabled=true;form.querySelectorAll('.editor-actions button').forEach(button=>button.disabled=true);
    status('正在保存…');
    try {
      const data=await api('posts'+(current.id?'/'+encodeURIComponent(current.id):''),{method:current.id?'PUT':'POST',body:JSON.stringify(input)});
      showPost(data.post);status(nextStatus==='published'?'文章已发布，网站已同步更新。':nextStatus==='trash'?'已移到回收站。':'草稿已保存。');await loadList();
    }catch(error){status(error.message,true);}
    finally{saving=false;$('articleFields').disabled=current.status==='trash';form.querySelectorAll('.editor-actions button').forEach(button=>button.disabled=false);}
  }
  $('newPost').addEventListener('click',async()=>{
    if(saving||!await canLeave())return;
    selection++;
    showPost({id:null,title:'',slug:'post-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,6),category:'日常',excerpt:'',markdown:'',status:'draft',revision:0,published_at:null});
    $('postTitle').focus();status('');
  });
  form.addEventListener('input',changed);
  form.addEventListener('submit',event=>{event.preventDefault();save(current.status==='published'?'published':'draft');});
  $('publishPost').addEventListener('click',()=>save('published'));
  $('unpublishPost').addEventListener('click',()=>save('draft'));
  $('restorePost').addEventListener('click',()=>save('draft'));
  $('trashPost').addEventListener('click',()=>save('trash'));
  $('writeTab').addEventListener('click',editMode);
  $('previewTab').addEventListener('click',async()=>{
    $('writePanel').hidden=true;$('previewPanel').hidden=false;$('writeTab').setAttribute('aria-selected','false');$('previewTab').setAttribute('aria-selected','true');
    previewController?.abort();previewController=new AbortController();$('markdownPreview').textContent='正在生成预览…';
    try{const data=await api('preview',{method:'POST',body:JSON.stringify({markdown:$('postMarkdown').value}),signal:previewController.signal});$('markdownPreview').innerHTML=data.html;}
    catch(error){if(error.name!=='AbortError'){$('markdownPreview').textContent=error.message;status(error.message,true);}}
  });
  const formats={heading:['## ','标题'],bold:['**','文字','**'],list:['- ','列表项'],link:['[','链接文字','](https://example.com)'],image:['![','图片说明','](https://example.com/image.jpg)'],code:['```\n','代码','\n```']};
  document.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{
    const editor=$('postMarkdown'),[before,placeholder,after='']=formats[button.dataset.format];
    const selected=editor.value.slice(editor.selectionStart,editor.selectionEnd)||placeholder;
    editor.setRangeText(before+selected+after,editor.selectionStart,editor.selectionEnd,'end');editor.focus();changed();
  }));
  $('adminSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;loadList();},250);});
  $('statusFilter').addEventListener('change',()=>{page=1;loadList();});
  $('listPrevious').addEventListener('click',()=>{page--;loadList();});$('listNext').addEventListener('click',()=>{page++;loadList();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  (async()=>{try{const session=await api('session');csrf=session.csrf;$('accountName').textContent=session.user.email;status('');await loadList();}catch(error){status(error.message,true);$('newPost').disabled=true;}})();
})();
