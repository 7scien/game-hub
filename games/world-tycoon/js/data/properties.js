const city=(id,name,region,purchasePrice,baseRent,buildingCosts,rentByLevel)=>({id,name,region,purchasePrice,baseRent,buildingCosts,rentByLevel});

export const PROPERTIES = [
  city('seoul','서울','asia',160,18,[90,120,160,220],[18,52,115,230,430]),
  city('tokyo','도쿄','asia',180,20,[100,130,170,230],[20,58,126,250,460]),
  city('singapore','싱가포르','asia',200,22,[110,140,180,240],[22,64,138,272,500]),
  city('cairo','카이로','africa',220,25,[120,150,195,255],[25,72,152,298,545]),
  city('nairobi','나이로비','africa',230,27,[125,155,200,260],[27,76,160,312,570]),
  city('cape-town','케이프타운','africa',250,30,[130,165,210,270],[30,84,174,336,610]),
  city('paris','파리','europe',270,33,[140,175,225,285],[33,92,190,365,660]),
  city('rome','로마','europe',280,35,[145,180,230,290],[35,98,202,385,690]),
  city('london','런던','europe',300,38,[155,190,240,300],[38,106,216,410,735]),
  city('new-york','뉴욕','america',320,42,[165,205,255,315],[42,118,238,450,800]),
  city('mexico-city','멕시코시티','america',330,44,[170,210,260,320],[44,122,248,468,830]),
  city('rio','리우','america',350,48,[180,220,270,335],[48,132,265,498,880]),
  city('vancouver','밴쿠버','america',370,52,[190,230,285,350],[52,142,285,530,930]),
];

export const PROPERTY_BY_ID=Object.fromEntries(PROPERTIES.map(property=>[property.id,property]));
