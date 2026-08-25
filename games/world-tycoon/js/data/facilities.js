export const FACILITIES = [
  {id:'concorde',name:'콩코드여객기',englishName:'CONCORDE AIRLINER',kind:'mobility',kindName:'탈것',purchasePrice:300000,baseRent:300000},
  {id:'queen-elizabeth',name:'퀸 엘리자베스호',englishName:'QUEEN ELIZABETH',kind:'mobility',kindName:'탈것',purchasePrice:400000,baseRent:250000},
  {id:'columbia',name:'콜럼비아호',englishName:'COLUMBIA SHUTTLE',kind:'mobility',kindName:'탈것',purchasePrice:450000,baseRent:400000},
];

export const FACILITY_BY_ID=Object.fromEntries(FACILITIES.map(facility=>[facility.id,facility]));
