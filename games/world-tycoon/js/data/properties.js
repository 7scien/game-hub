const roundTenThousand=value=>Math.max(10000,Math.round(value/10000)*10000);

const city=(id,name,englishName,region,purchasePrice,{buildable=true,fixedRent=null}={})=>({
  id,
  name,
  englishName,
  region,
  purchasePrice,
  buildable,
  baseRent:fixedRent??roundTenThousand(purchasePrice*.11),
  buildingCosts:buildable?[.55,.9,1.15].map(rate=>roundTenThousand(purchasePrice*rate)):[],
  rentByLevel:buildable?[.11,.32,1.35,2.45].map(rate=>roundTenThousand(purchasePrice*rate)):[fixedRent],
});

export const PROPERTIES = [
  city('taipei','타이페이','TAIPEI','asia',50000),
  city('hong-kong','홍콩','HONG KONG','asia',80000),
  city('manila','마닐라','MANILA','asia',80000),
  city('jeju','제주도','JEJU','asia',200000,{buildable:false,fixedRent:300000}),
  city('singapore','싱가폴','SINGAPORE','asia',100000),
  city('cairo','카이로','CAIRO','africa',100000),
  city('istanbul','이스탄불','ISTANBUL','africa',120000),
  city('athens','아테네','ATHENS','europe',140000),
  city('copenhagen','코펜하겐','COPENHAGEN','europe',160000),
  city('stockholm','스톡홀름','STOCKHOLM','europe',160000),
  city('zurich','취리히','ZURICH','europe',180000),
  city('berlin','베를린','BERLIN','europe',180000),
  city('montreal','몬트리올','MONTREAL','america',200000),
  city('buenos-aires','부에노스 아이레스','BUENOS AIRES','america',220000),
  city('sao-paulo','상파울루','SAO PAULO','america',240000),
  city('sydney','시드니','SYDNEY','america',240000),
  city('busan','부산','BUSAN','asia',500000,{buildable:false,fixedRent:600000}),
  city('hawaii','하와이','HAWAII','america',260000),
  city('lisbon','리스본','LISBON','europe',260000),
  city('madrid','마드리드','MADRID','europe',280000),
  city('tokyo','도쿄','TOKYO','asia',300000),
  city('paris','파리','PARIS','europe',320000),
  city('rome','로마','ROME','europe',320000),
  city('london','런던','LONDON','europe',350000),
  city('new-york','뉴욕','NEW YORK','america',350000),
  city('seoul-olympic','서울','SEOUL','asia',1000000,{buildable:false,fixedRent:2000000}),
];

export const PROPERTY_BY_ID=Object.fromEntries(PROPERTIES.map(property=>[property.id,property]));
