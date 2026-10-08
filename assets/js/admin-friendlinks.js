(() => {
  'use strict';
  const $=id=>document.getElementById(id),form=$('friendEditor');
  const fields=['name','url','avatar','description','sort_order'];
  const fallback='/assets/images/avatar-logo.jpg';
  let csrf='',current=null,dirty=false,saving=false,uploading=false,selection=0,sequence=0,searchTimer;
  const status=(message,error=false)=>{ $('globalStatus').textContent=message;$('globalStatus').dataset.error=String(error); };
  const errorMessage=error=>error.name==='TimeoutError'?'请求超时，请稍后重试。':error.message;
  async function api(path,options={}) {
    const response=await fetch('/admin/api/'+path,{credentials:'same-origin',signal:AbortSignal.timeout(30000),...options,headers:{Accept:'application/json',...(options.body?{'X-CSRF-Token':csrf,...(options.body instanceof FormData?{}:{'Content-Type':'application/json'})}:{}),...options.headers}});
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('登录已过期，请刷新页面重新登录。');
    const data=await response.json();
    if(!response.ok)throw new Error(data.msg||'操作失败，请重试');
    return data;
  }
  function confirmAction(message) {
    return new Promise(resolve=>{
      const dialog=$('confirmDialog');$('confirmMessage').textContent=message;dialog.returnValue='cancel';
      dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();
    });
  }
  const canLeave=async()=>!dirty||await confirmAction('当前修改尚未保存，确定离开这条友链吗？');
  function updateBusy() {
    $('newFriend').disabled=!csrf||saving||uploading;
    $('friendFields').disabled=saving||uploading||current?.status==='trash';
    form.querySelectorAll('.editor-actions button').forEach(button=>button.disabled=saving||uploading);
    form.setAttribute('aria-busy',String(saving||uploading));
  }
  function updateAvatar() {
    const value=$('friendAvatar').value.trim();let source=fallback;
    try { const url=new URL(value,location.origin);if(value&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)source=url.href; } catch {}
    $('avatarPreview').src=source;
  }
  $('avatarPreview').addEventListener('error',()=>{if($('avatarPreview').getAttribute('src')!==fallback)$('avatarPreview').src=fallback;});
  function changed() { selection++;dirty=true;$('friendSaveState').textContent='有未保存的修改'; }
  function showFriend(link) {
    current=link;dirty=false;form.hidden=false;$('friendEmpty').hidden=true;
    for(const name of fields)form.elements[name].value=link[name]??'';
    $('friendState').textContent=link.status==='trash'?'回收站':link.id?'已显示':'新增友链';
    $('friendSaveState').textContent=link.id?'已保存 · '+new Date(link.updated_at).toLocaleString('zh-CN'):'尚未保存';
    $('saveFriend').hidden=link.status==='trash';$('trashFriend').hidden=!link.id||link.status==='trash';$('restoreFriend').hidden=link.status!=='trash';
    $('avatarStatus').hidden=true;updateAvatar();updateBusy();
    document.querySelectorAll('#friendList .post-item').forEach(button=>button.setAttribute('aria-current',String(button.dataset.id===link.id)));
  }
  async function loadList() {
    const token=++sequence,params=new URLSearchParams({q:$('friendSearch').value,status:$('friendFilter').value});
    try {
      const {items}=await api('friendlinks?'+params);if(token!==sequence)return;
      $('friendCount').textContent=`共 ${items.length} 条`;
      const rows=items.map(link=>{
        const button=document.createElement('button');button.type='button';button.className='post-item';button.dataset.id=link.id;button.setAttribute('aria-current',String(link.id===current?.id));
        const title=document.createElement('strong');title.textContent=link.name;
        const meta=document.createElement('small');meta.textContent=`排序 ${link.sort_order} · ${link.url}`;button.append(title,meta);
        button.addEventListener('click',async()=>{
          if(saving||uploading||!await canLeave())return;
          const token=++selection;
          try { const data=await api('friendlinks/'+encodeURIComponent(link.id));if(token!==selection)return;showFriend(data.friendlink);status(''); }
          catch(error){if(token===selection)status(errorMessage(error),true);}
        });return button;
      });
      if(!rows.length){const empty=document.createElement('p');empty.className='subtle';empty.textContent='没有找到友链。';rows.push(empty);}
      $('friendList').replaceChildren(...rows);
    } catch(error) { if(token===sequence)status(errorMessage(error),true); }
  }
  async function save(nextStatus) {
    if(!csrf||saving||uploading||!current)return;
    const isStatusChange=nextStatus==='trash'||current.status==='trash';
    if(!isStatusChange&&!form.reportValidity())return;
    if(nextStatus==='trash'&&!await confirmAction('将这条友链移到回收站？它会从友情链接页面隐藏，之后可以恢复。'))return;
    const values=isStatusChange?{...current}:Object.fromEntries(fields.map(name=>[name,form.elements[name].value]));
    values.sort_order=Number(values.sort_order);
    const input={...values,status:nextStatus,revision:current.revision};
    saving=true;selection++;updateBusy();status('正在保存…');
    try {
      const data=await api('friendlinks'+(current.id?'/'+encodeURIComponent(current.id):''),{method:current.id?'PUT':'POST',body:JSON.stringify(input)});
      showFriend(data.friendlink);status(nextStatus==='trash'?'已移到回收站。':'友链已保存，页面已更新。');await loadList();
    } catch(error) { status(errorMessage(error),true); }
    finally { saving=false;updateBusy(); }
  }
  $('newFriend').addEventListener('click',async()=>{
    if(!csrf||saving||uploading||!await canLeave())return;
    selection++;showFriend({id:null,name:'',url:'',avatar:'',description:'',sort_order:100,status:'active',revision:0});$('friendName').focus();status('');
  });
  form.addEventListener('input',changed);$('friendAvatar').addEventListener('input',updateAvatar);
  form.addEventListener('submit',event=>{event.preventDefault();save('active');});
  $('trashFriend').addEventListener('click',()=>save('trash'));$('restoreFriend').addEventListener('click',()=>save('active'));
  $('friendSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadList,250);});$('friendFilter').addEventListener('change',loadList);
  $('uploadAvatar').addEventListener('click',()=>{if(csrf&&!saving&&!uploading&&current?.status!=='trash')$('avatarFile').click();});
  $('avatarFile').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';
    if(!file||!csrf||saving||uploading||!current||current.status==='trash')return;
    const extension=file.name.match(/\.(jpe?g|png|svg)$/i)?.[1].toLowerCase();
    const notify=(message,error=false)=>{ $('avatarStatus').hidden=false;$('avatarStatus').textContent=message;$('avatarStatus').dataset.error=String(error); };
    if(!extension){notify('仅支持 JPG、PNG 和 SVG 图片。',true);return;}
    if(!file.size||file.size>(extension==='svg'?1:8)*1024*1024){notify(extension==='svg'?'SVG 图片不能超过 1 MB，且不能为空。':'图片不能超过 8 MB，且不能为空。',true);return;}
    uploading=true;selection++;updateBusy();notify('正在上传头像…');
    try {
      const body=new FormData();body.append('file',file);
      const data=await api('media',{method:'POST',body,signal:AbortSignal.timeout(120000)});
      $('friendAvatar').value=data.image.url;changed();updateAvatar();notify('头像已上传，保存友链后生效。');
    } catch(error) { notify(errorMessage(error),true); }
    finally { uploading=false;updateBusy(); }
  });
  window.addEventListener('beforeunload',event=>{if(dirty||saving||uploading){event.preventDefault();event.returnValue='';}});
  (async()=>{try{const session=await api('session');csrf=session.csrf;$('accountName').textContent=session.user.email;updateBusy();status('');await loadList();}catch(error){status(errorMessage(error),true);}})();
})();
