const routes={};
export function route(path,fn){routes[path]=fn}
export function startRouter(){
 const render=()=>{const key=location.hash||'#/dashboard';(routes[key]||routes['#/dashboard'])()};
 window.addEventListener('hashchange',render);render();
}
