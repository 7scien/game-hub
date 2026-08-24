const patron = (id, name, victoryPoints, requirements) => ({ id, name, victoryPoints, requirements });

export const PATRONS = [
  patron('patron-aurora', 'Aurora Envoy', 3, { Ruby: 4, Emerald: 4, Diamond: 4 }),
  patron('patron-tide', 'Tide Archivist', 3, { Sapphire: 4, Diamond: 4, Onyx: 4 }),
  patron('patron-thorn', 'Thorn Regent', 3, { Ruby: 4, Sapphire: 4, Emerald: 4 }),
  patron('patron-eclipse', 'Eclipse Oracle', 3, { Ruby: 4, Diamond: 4, Onyx: 4 }),
  patron('patron-grove', 'Grove Matriarch', 3, { Sapphire: 4, Emerald: 4, Onyx: 4 }),
  patron('patron-ember', 'Ember Chancellor', 3, { Ruby: 5, Sapphire: 3, Diamond: 3 }),
  patron('patron-reef', 'Reef Cartographer', 3, { Sapphire: 5, Emerald: 3, Onyx: 3 }),
  patron('patron-vale', 'Vale Custodian', 3, { Ruby: 3, Emerald: 5, Diamond: 3 }),
  patron('patron-dawn', 'Dawn Magistrate', 3, { Sapphire: 3, Diamond: 5, Onyx: 3 }),
  patron('patron-night', 'Night Ambassador', 3, { Ruby: 3, Emerald: 3, Onyx: 5 }),
];
