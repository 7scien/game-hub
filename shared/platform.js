export function isStandaloneDisplay({mediaQuery,navigatorObject=globalThis.navigator}={}){
  const query=mediaQuery??(value=>globalThis.matchMedia?.(value));
  const mediaStandalone=typeof query==='function'&&query('(display-mode: standalone)')?.matches===true;
  return mediaStandalone||navigatorObject?.standalone===true;
}
