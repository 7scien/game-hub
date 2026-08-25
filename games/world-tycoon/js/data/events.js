export const EVENT_CARDS = [
  {id:'creative-festival',title:'글로벌 크리에이터 페스티벌',text:'도시 홍보 캠페인이 성공했습니다. 140을 받습니다.',effect:{type:'cash',amount:140}},
  {id:'green-renovation',title:'친환경 리모델링',text:'보유 시설의 에너지 개선 비용으로 90을 냅니다.',effect:{type:'cash',amount:-90}},
  {id:'express-pass',title:'익스프레스 패스',text:'여행 일정이 앞당겨졌습니다. 3칸 전진합니다.',effect:{type:'moveBy',steps:3}},
  {id:'lost-luggage',title:'늦게 도착한 수하물',text:'공항으로 되돌아가느라 2칸 후퇴합니다.',effect:{type:'moveBy',steps:-2}},
  {id:'airport-upgrade',title:'스마트 공항 초청',text:'국제 공항으로 바로 이동합니다.',effect:{type:'moveTo',tileId:'airport'}},
  {id:'travel-channel',title:'여행 채널 출연',text:'각 플레이어에게서 홍보 수익 35씩 받습니다.',effect:{type:'collectEach',amount:35}},
  {id:'team-retreat',title:'팀 워크숍 지원',text:'다른 모든 플레이어에게 30씩 지급합니다.',effect:{type:'payEach',amount:30}},
  {id:'local-pass',title:'현지인 패스',text:'다음 두 번의 통행료가 50% 할인됩니다.',effect:{type:'rentDiscount',charges:2,rate:.5}},
  {id:'flight-delay',title:'갑작스러운 운항 지연',text:'다음 턴을 한 번 쉽니다.',effect:{type:'skipTurns',turns:1}},
  {id:'homecoming',title:'홈커밍 보너스',text:'출발 지점으로 이동하고 한 바퀴 보너스를 받습니다.',effect:{type:'moveTo',tileId:'start',collectPassBonus:true}},
  {id:'innovation-award',title:'도시 혁신상',text:'스마트시티 상금 180을 받습니다.',effect:{type:'cash',amount:180}},
  {id:'weather-repair',title:'기상 악화 긴급 보수',text:'안전 점검 비용 150을 냅니다.',effect:{type:'cash',amount:-150}},
];
