const patron = (id, name, victoryPoints, requirements) => ({ id, name, victoryPoints, requirements });

export const PATRONS = [
  patron('patron-aurora', '여명 사절', 3, { Ruby: 3, Emerald: 3, Diamond: 3 }),
  patron('patron-tide', '해류 기록관', 3, { Sapphire: 3, Diamond: 3, Onyx: 3 }),
  patron('patron-thorn', '가시 섭정', 3, { Ruby: 3, Sapphire: 3, Emerald: 3 }),
  patron('patron-eclipse', '일식 예언자', 3, { Ruby: 3, Diamond: 3, Onyx: 3 }),
  patron('patron-grove', '숲의 대모', 3, { Sapphire: 3, Emerald: 3, Onyx: 3 }),
  patron('patron-ember', '불꽃 재상', 3, { Ruby: 4, Sapphire: 4 }),
  patron('patron-reef', '산호 지도사', 3, { Sapphire: 4, Emerald: 4 }),
  patron('patron-vale', '계곡 수호자', 3, { Emerald: 4, Diamond: 4 }),
  patron('patron-dawn', '새벽 판관', 3, { Diamond: 4, Onyx: 4 }),
  patron('patron-night', '밤의 대사', 3, { Ruby: 4, Onyx: 4 }),
];
