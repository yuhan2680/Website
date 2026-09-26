// In-memory R2 adapter for tests and the loopback preview. Never deployed.
export function localImages() {
  const objects = new Map();
  return {
    async put(key,value,options={}) {
      const bytes = new Uint8Array(value).slice();
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const httpEtag = '"'+Array.from(hash,value=>value.toString(16).padStart(2,'0')).join('')+'"';
      const metadata = {key,size:bytes.length,httpEtag,uploaded:new Date(),...options};
      objects.set(key,{bytes,metadata});
      return metadata;
    },
    async head(key) { return objects.get(key)?.metadata || null; },
    async get(key,{onlyIf}={}) {
      const item = objects.get(key);
      if (!item) return null;
      const cached = onlyIf?.get('If-None-Match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===item.metadata.httpEtag);
      return cached ? item.metadata : {...item.metadata,body:new Response(item.bytes).body};
    }
  };
}
