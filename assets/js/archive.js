(() => {
  'use strict';
  const form=document.getElementById('archiveSearch');
  if(!form)return;
  const archive=document.getElementById('articleArchive'),status=document.getElementById('archiveStatus');
  let controller,timer;
  async function navigate(url,record=true) {
    controller?.abort();const active=new AbortController();controller=active;archive.setAttribute('aria-busy','true');
    try {
      const response=await fetch('/api/posts'+url.search,{signal:active.signal});
      const result=await response.json();
      if(controller!==active)return;
      if(!response.ok)throw new Error(result.msg||'文章加载失败');
      archive.querySelector('.archive-list').innerHTML=result.html;document.getElementById('archivePager').innerHTML=result.pagination;
      status.textContent=`共 ${result.total} 篇文章`;
      form.elements.q.value=url.searchParams.get('q')||'';form.elements.category.value=url.searchParams.get('category')||'';
      archive.querySelectorAll('.filter-group a').forEach(link=>{
        const next=new URL(link.href);next.searchParams.set('q',form.elements.q.value);next.searchParams.delete('page');link.href=next.pathname+next.search;
        if((next.searchParams.get('category')||'')===form.elements.category.value)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
      });
      if(record)history.pushState(null,'',url.pathname+url.search);
    }catch(error){if(error.name!=='AbortError')status.textContent=error.message+'，请重试。';}
    finally{if(controller===active)archive.removeAttribute('aria-busy');}
  }
  form.addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);const url=new URL('/blog',location.origin);url.search=new URLSearchParams(new FormData(form)).toString();navigate(url);});
  form.elements.q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>form.requestSubmit(),300);});
  archive.addEventListener('click',event=>{
    const link=event.target.closest('a[data-archive-link]');
    if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
    event.preventDefault();clearTimeout(timer);navigate(new URL(link.href));
  });
  window.addEventListener('popstate',()=>navigate(new URL(location.href),false));
})();
