const roundTenThousand=value=>Math.max(10000,Math.round(value/10000)*10000);

const LANDMARKS={
  taipei:{landmarkName:'타이베이 101',landmarkShort:'101',landmarkGlyph:'▥'},'hong-kong':{landmarkName:'ICC 타워',landmarkShort:'ICC',landmarkGlyph:'▤'},manila:{landmarkName:'마닐라 시청',landmarkShort:'시청',landmarkGlyph:'♜'},
  jeju:{landmarkName:'돌하르방',landmarkShort:'돌하르방',landmarkGlyph:'♟'},singapore:{landmarkName:'마리나 베이 샌즈',landmarkShort:'MBS',landmarkGlyph:'♒'},cairo:{landmarkName:'기자 대피라미드',landmarkShort:'피라미드',landmarkGlyph:'▲'},
  istanbul:{landmarkName:'아야 소피아',landmarkShort:'아야소피아',landmarkGlyph:'☪'},athens:{landmarkName:'파르테논 신전',landmarkShort:'파르테논',landmarkGlyph:'Π'},copenhagen:{landmarkName:'로센보르성',landmarkShort:'로센보르',landmarkGlyph:'♛'},
  stockholm:{landmarkName:'스톡홀름 시청',landmarkShort:'시청사',landmarkGlyph:'♜'},zurich:{landmarkName:'그로스뮌스터',landmarkShort:'대성당',landmarkGlyph:'♝'},berlin:{landmarkName:'브란덴부르크문',landmarkShort:'브란덴문',landmarkGlyph:'⊓'},
  montreal:{landmarkName:'노트르담 대성당',landmarkShort:'노트르담',landmarkGlyph:'♰'},'buenos-aires':{landmarkName:'부에노스아이레스 오벨리스크',landmarkShort:'오벨리스크',landmarkGlyph:'♦'},'sao-paulo':{landmarkName:'상파울루 대성당',landmarkShort:'상파울루성당',landmarkGlyph:'♝'},
  sydney:{landmarkName:'시드니 오페라하우스',landmarkShort:'오페라',landmarkGlyph:'◒'},busan:{landmarkName:'광안대교',landmarkShort:'광안대교',landmarkGlyph:'⌒'},hawaii:{landmarkName:'알로하 타워',landmarkShort:'알로하',landmarkGlyph:'♜'},
  lisbon:{landmarkName:'벨렝탑',landmarkShort:'벨렝탑',landmarkGlyph:'♜'},madrid:{landmarkName:'시벨레스 궁전',landmarkShort:'시벨레스',landmarkGlyph:'♛'},tokyo:{landmarkName:'도쿄 스카이트리',landmarkShort:'스카이트리',landmarkGlyph:'♢'},
  paris:{landmarkName:'에펠탑',landmarkShort:'에펠탑',landmarkGlyph:'♢'},rome:{landmarkName:'콜로세움',landmarkShort:'콜로세움',landmarkGlyph:'◉'},london:{landmarkName:'엘리자베스 타워',landmarkShort:'빅벤',landmarkGlyph:'♜'},
  'new-york':{landmarkName:'엠파이어 스테이트 빌딩',landmarkShort:'ESB',landmarkGlyph:'▥'},'seoul-olympic':{landmarkName:'서울 올림픽주경기장',landmarkShort:'올림픽',landmarkGlyph:'◉'},
};

const city=(id,name,englishName,region,purchasePrice,{buildable=true,fixedRent=null}={})=>({
  id,
  name,
  englishName,
  region,
  purchasePrice,
  buildable,
  baseRent:fixedRent??roundTenThousand(purchasePrice*.11),
  buildingCosts:buildable?[.55,.9,1.15,1.15].map(rate=>roundTenThousand(purchasePrice*rate)):[],
  rentByLevel:buildable?[.11,.32,1.35,2.45,3.55].map(rate=>roundTenThousand(purchasePrice*rate)):[fixedRent],
  ...LANDMARKS[id],
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
