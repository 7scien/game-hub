export const FACILITIES = [
  {id:'rail',name:'대륙 철도',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:180,baseRent:34},
  {id:'harbor',name:'글로벌 항구',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:200,baseRent:38},
  {id:'airport',name:'국제 공항',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:230,baseRent:42},
  {id:'space',name:'우주 정거장',kind:'mobility',kindName:'글로벌 교통망',purchasePrice:260,baseRent:48},
];

export const FACILITY_BY_ID=Object.fromEntries(FACILITIES.map(facility=>[facility.id,facility]));
