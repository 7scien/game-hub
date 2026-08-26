export const CHARACTERS=Object.freeze([
  {id:'ghost',name:'몽실 유령',caption:'사뿐사뿐 공중 산책',accent:'#bda7ff'},
  {id:'mole',name:'콩콩 두더지',caption:'달리다 깜짝 땅파기',accent:'#df9b68'},
  {id:'chick',name:'삐약 병아리',caption:'빠른 종종걸음',accent:'#ffd75a'},
  {id:'slime',name:'말랑 슬라임',caption:'쭈욱, 통통, 폴짝',accent:'#72e6c0'},
]);

export function Character({id,state='idle',small=false}){
  return <div className={`character character-${id}${small?' character-small':''}`} data-motion={state} aria-hidden="true">
    <div className="obtain-object">★</div>
    <div className="character-shadow" />
    <div className="character-body">
      <i className="ear ear-left" /><i className="ear ear-right" />
      <i className="eye eye-left" /><i className="eye eye-right" /><i className="mouth" />
      <i className="detail detail-one" /><i className="detail detail-two" />
    </div>
  </div>;
}
