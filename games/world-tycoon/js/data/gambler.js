const LINES={
  2:'몸풀기였죠? 은행은 벌써 수업료를 받았네요.',
  3:'포커페이스는 완벽했는데, 주사위가 눈치를 못 챘네요.',
  4:'라스베가스에 오신 걸 환영합니다. 지갑은 두고 가세요.',
  5:'은행이 당신을 VIP 고객으로 모시고 싶대요.',
  6:'사실 도박은 실력이라는 것을 아시나요?',
  7:'여러가지로 운이 좋네요',
  8:'오, 시작이 좋은데요? 라스베가스가 용돈을 줬어요!',
  9:'잠깐, 또 맞혔다고요? 제법인데요!',
  10:'주사위가 당신 편이네요! 은행이 계산기를 다시 두드립니다.',
  11:'카지노가 긴장하기 시작했습니다. 오늘 주인공은 당신이군요!',
  12:'역시 도박은 실력이죠, 라스베가스의 지배자!',
};

export function gamblerOutcome(total){
  if(!Number.isInteger(total)||total<2||total>12)throw new Error('주사위 합은 2~12여야 합니다.');
  const amount=total<7?-total*100000:total>7?(total-6)*100000:0;
  return {total,amount,quote:LINES[total],tone:amount<0?'danger':amount>0?'success':'info'};
}
