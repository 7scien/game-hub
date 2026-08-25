import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import ts from 'typescript';

const sourceDirectory = fileURLToPath(new URL('../lib/game/', import.meta.url));
const compiledDirectory = await mkdtemp(join(tmpdir(), 'catan-rules-'));
after(() => rm(compiledDirectory, { recursive: true, force: true }));

await writeFile(join(compiledDirectory, 'package.json'), '{"type":"commonjs"}\n');
for (const name of ['types', 'board', 'rules', 'storage']) {
  const source = await readFile(join(sourceDirectory, `${name}.ts`), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: `${name}.ts`,
  }).outputText;
  await writeFile(join(compiledDirectory, `${name}.js`), output);
}

const require = createRequire(import.meta.url);
const { createGame, getDiceTotal, reduceGame } = require(join(compiledDirectory, 'rules.js'));
const { RESOURCES } = require(join(compiledDirectory, 'types.js'));
const { clearGame, LEGACY_SAVE_KEY, loadGames, saveGame } = require(join(compiledDirectory, 'storage.js'));

const totalResources = (player) => RESOURCES.reduce((total, resource) => total + player.resources[resource], 0);

test('1과 3이 나오면 합계 4 타일만 생산한다', () => {
  const game = createGame(['가', '나', '다'], undefined, 20260825);
  const [firstPlayer, secondPlayer, roadOnlyPlayer] = game.players;
  const threeTile = game.board.tiles.find((tile) => tile.number === 3);
  const fourTile = game.board.tiles.find((tile) => tile.number === 4);

  assert.ok(threeTile);
  assert.ok(fourTile);

  const threeVertex = threeTile.vertexIds.find((vertexId) => !fourTile.vertexIds.includes(vertexId));
  const fourVertex = fourTile.vertexIds.find((vertexId) => !threeTile.vertexIds.includes(vertexId));
  assert.ok(threeVertex);
  assert.ok(fourVertex);

  for (const tile of game.board.tiles) tile.number = null;
  threeTile.number = 3;
  fourTile.number = 4;
  game.board.robberTileId = game.board.tiles.find((tile) => tile.id !== threeTile.id && tile.id !== fourTile.id).id;
  game.phase = 'pre-roll';
  game.currentPlayerId = firstPlayer.id;
  game.hidden = false;
  game.buildings = {
    [threeVertex]: { playerId: firstPlayer.id, type: 'settlement' },
    [fourVertex]: { playerId: secondPlayer.id, type: 'settlement' },
  };
  roadOnlyPlayer.roads = [fourTile.edgeIds[0]];

  const next = reduceGame(game, { type: 'ROLL', dice: [1, 3] });

  assert.equal(getDiceTotal([1, 3]), 4);
  assert.equal(totalResources(next.players.find((player) => player.id === firstPlayer.id)), 0, '개별 눈 3 타일은 생산하면 안 된다');
  assert.equal(totalResources(next.players.find((player) => player.id === secondPlayer.id)), 1, '합계 4 타일의 마을만 자원 1개를 받는다');
  assert.equal(totalResources(next.players.find((player) => player.id === roadOnlyPlayer.id)), 0, '길만 있는 플레이어는 자원을 받지 않는다');
});

test('두 저장 슬롯을 독립적으로 저장하고 이전 단일 저장을 1번으로 옮긴다', () => {
  const values=new Map();
  globalThis.window={};
  globalThis.localStorage={
    getItem:(key)=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:(key)=>values.delete(key),
  };
  const first=createGame(['첫째','둘째','셋째'],undefined,11);
  const second=createGame(['하나','둘','셋'],undefined,22);

  saveGame(first,1);
  saveGame(second,2);
  let [slotOne,slotTwo]=loadGames();
  assert.equal(slotOne.players[0].name,'첫째');
  assert.equal(slotTwo.players[0].name,'하나');

  clearGame(1);
  [slotOne,slotTwo]=loadGames();
  assert.equal(slotOne,null);
  assert.equal(slotTwo.players[0].name,'하나');

  clearGame();
  localStorage.setItem(LEGACY_SAVE_KEY,JSON.stringify(first));
  [slotOne,slotTwo]=loadGames();
  assert.equal(slotOne.players[0].name,'첫째');
  assert.equal(slotTwo,null);
  assert.equal(localStorage.getItem(LEGACY_SAVE_KEY),null);
  clearGame();
});
