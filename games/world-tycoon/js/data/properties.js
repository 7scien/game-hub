const roundTen=value=>Math.round(value/10)*10;

const city=(id,name,englishName,region,purchasePrice)=>({
  id,
  name,
  englishName,
  region,
  purchasePrice,
  baseRent:roundTen(purchasePrice*.11),
  buildingCosts:[.55,.7,.9,1.15].map(rate=>roundTen(purchasePrice*rate)),
  rentByLevel:[.11,.32,.7,1.35,2.45].map(rate=>roundTen(purchasePrice*rate)),
});

export const PROPERTIES = [
  city('taipei','타이페이','TAIPEI','asia',120),
  city('hong-kong','홍콩','HONG KONG','asia',130),
  city('manila','마닐라','MANILA','asia',140),
  city('jeju','제주도','JEJU','asia',150),
  city('singapore','싱가폴','SINGAPORE','asia',160),
  city('cairo','카이로','CAIRO','africa',170),
  city('istanbul','이스탄불','ISTANBUL','africa',180),
  city('athens','아테네','ATHENS','africa',190),
  city('copenhagen','코펜하겐','COPENHAGEN','europe',200),
  city('stockholm','스톡홀름','STOCKHOLM','europe',210),
  city('zurich','취리히','ZURICH','europe',230),
  city('berlin','베를린','BERLIN','europe',240),
  city('montreal','몬트리올','MONTREAL','america',250),
  city('buenos-aires','부에노스 아이레스','BUENOS AIRES','america',260),
  city('sao-paulo','상파올로','SAO PAULO','america',270),
  city('sydney','시드니','SYDNEY','america',280),
  city('busan','부산','BUSAN','asia',290),
  city('hawaii','하와이','HAWAII','america',300),
  city('lisbon','리스본','LISBON','europe',310),
  city('madrid','마드리드','MADRID','europe',330),
  city('tokyo','도쿄','TOKYO','asia',340),
  city('paris','파리','PARIS','europe',360),
  city('rome','로마','ROME','europe',370),
  city('london','런던','LONDON','europe',390),
  city('new-york','뉴욕','NEW YORK','america',410),
  city('seoul-olympic','서울올림픽','SEOUL OLYMPICS','asia',420),
];

export const PROPERTY_BY_ID=Object.fromEntries(PROPERTIES.map(property=>[property.id,property]));
