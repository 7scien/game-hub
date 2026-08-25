export const FACILITIES = [
  {id:'concorde',name:'콩코드여객기',englishName:'CONCORDE AIRLINER',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:220,baseRent:40},
  {id:'queen-elizabeth',name:'퀸 엘리자베스호',englishName:'QUEEN ELIZABETH',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:260,baseRent:46},
  {id:'columbia',name:'콜럼비아호',englishName:'COLUMBIA',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:300,baseRent:52},
];

export const FACILITY_BY_ID=Object.fromEntries(FACILITIES.map(facility=>[facility.id,facility]));
