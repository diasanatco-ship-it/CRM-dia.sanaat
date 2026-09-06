const routes=[];let afterNavigate=null;
function compile(pattern){const keys=[];const regex=pattern.replace(/:[^/]+/g,m=>{keys.push(m.slice(1));return '([^/]+)'});return {re:new RegExp('^'+regex+'$'),keys};}
export function route(pattern,fn){const {re,keys}=compile(pattern);routes.push({re,keys,fn});}
export function onNavigate(fn){afterNavigate=fn;}
export function navigate(hash){location.hash=hash;}
export function startRouter(){const render=()=>{const raw=location.hash||'#/dashboard';const key=raw.split('?')[0];for(const r of routes){const m=key.match(r.re);if(m){const params={};r.keys.forEach((k,i)=>params[k]=decodeURIComponent(m[i+1]));const query=new URLSearchParams(raw.includes('?')?raw.split('?')[1]:'');params.query=query;r.fn(params);afterNavigate?.(raw);return;}}if(key!=='#/dashboard')navigate('#/dashboard');};window.addEventListener('hashchange',render);render();}
