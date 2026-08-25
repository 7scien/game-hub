import type { Board, Edge, PortType, Terrain, Tile, Vertex } from './types';

const COORDS = Array.from({ length: 5 }, (_, row) => row - 2).flatMap((r) =>
  Array.from({ length: 5 }, (_, column) => column - 2).filter((q) => Math.abs(q + r) <= 2).map((q) => [q, r] as const),
);

const TERRAINS: Terrain[] = [
  ...Array(4).fill('forest'), ...Array(4).fill('pasture'), ...Array(4).fill('field'),
  ...Array(3).fill('hill'), ...Array(3).fill('mountain'), 'desert',
] as Terrain[];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORTS: PortType[] = ['generic', 'generic', 'generic', 'generic', 'wood', 'brick', 'wool', 'grain', 'ore'];
const HEX_SIZE = 72;
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const pointKey = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
const edgeKey = (a: string, b: string) => [a, b].sort().join('|');
const coordKey = (q: number, r: number) => `${q},${r}`;

function hasTerrainTriple(terrains: Map<string, Terrain>) {
  for (const [coord, terrain] of terrains) {
    if (terrain === 'desert') continue;
    const [q, r] = coord.split(',').map(Number);
    const matchingNeighbors = DIRECTIONS.filter(([dq, dr]) => terrains.get(coordKey(q + dq, r + dr)) === terrain).length;
    if (matchingNeighbors >= 2) return true;
  }
  return false;
}

function balancedTerrains(random: () => number) {
  const centerKey = coordKey(0, 0);
  const outerCoords = COORDS.filter(([q, r]) => q !== 0 || r !== 0);
  const resourceTerrains = TERRAINS.filter((terrain) => terrain !== 'desert');
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const shuffled = shuffle(resourceTerrains, random);
    const mapping = new Map<string, Terrain>([[centerKey, 'desert']]);
    outerCoords.forEach(([q, r], index) => mapping.set(coordKey(q, r), shuffled[index]));
    if (!hasTerrainTriple(mapping)) return mapping;
  }
  throw new Error('서로 뭉치지 않는 지형 배치를 생성하지 못했습니다.');
}

function hasAdjacentHighNumbers(numbers: Map<string, number>) {
  for (const [coord, number] of numbers) {
    if (number !== 6 && number !== 8) continue;
    const [q, r] = coord.split(',').map(Number);
    if (DIRECTIONS.some(([dq, dr]) => {
      const neighbor = numbers.get(coordKey(q + dq, r + dr));
      return neighbor === 6 || neighbor === 8;
    })) return true;
  }
  return false;
}

function balancedNumbers(nonDesert: readonly (readonly [number, number])[], random: () => number) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const candidate = shuffle(NUMBERS, random);
    const mapping = new Map(nonDesert.map(([q, r], index) => [`${q},${r}`, candidate[index]]));
    if (!hasAdjacentHighNumbers(mapping)) return mapping;
  }
  throw new Error('균형 잡힌 숫자 토큰을 생성하지 못했습니다.');
}

export function createBoard(seed: number): Board {
  const random = seededRandom(seed);
  const terrainMap = balancedTerrains(random);
  const nonDesertCoords = COORDS.filter(([q, r]) => q !== 0 || r !== 0);
  const numberMap = balancedNumbers(nonDesertCoords, random);
  const vertices: Record<string, Vertex> = {};
  const edges: Record<string, Edge> = {};

  const tiles: Tile[] = COORDS.map(([q, r]) => {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const y = HEX_SIZE * 1.5 * r;
    const terrain = terrainMap.get(coordKey(q, r))!;
    const id = `t:${q},${r}`;
    const vertexIds = Array.from({ length: 6 }, (_, corner) => {
      const angle = (Math.PI / 180) * (60 * corner - 30);
      const vx = x + HEX_SIZE * Math.cos(angle);
      const vy = y + HEX_SIZE * Math.sin(angle);
      const vertexId = `v:${pointKey(vx, vy)}`;
      vertices[vertexId] ??= { id: vertexId, x: vx, y: vy, adjacentTileIds: [], edgeIds: [] };
      vertices[vertexId].adjacentTileIds.push(id);
      return vertexId;
    });
    const edgeIds = vertexIds.map((vertexId, corner) => {
      const next = vertexIds[(corner + 1) % 6];
      const idKey = `e:${edgeKey(vertexId, next)}`;
      edges[idKey] ??= { id: idKey, a: vertexId, b: next, tileIds: [] };
      edges[idKey].tileIds.push(id);
      if (!vertices[vertexId].edgeIds.includes(idKey)) vertices[vertexId].edgeIds.push(idKey);
      if (!vertices[next].edgeIds.includes(idKey)) vertices[next].edgeIds.push(idKey);
      return idKey;
    });
    return { id, q, r, x, y, terrain, number: terrain === 'desert' ? null : numberMap.get(`${q},${r}`)!, vertexIds, edgeIds };
  });

  const coast = Object.values(edges).filter((edge) => edge.tileIds.length === 1).sort((left, right) => {
    const lm = { x: (vertices[left.a].x + vertices[left.b].x) / 2, y: (vertices[left.a].y + vertices[left.b].y) / 2 };
    const rm = { x: (vertices[right.a].x + vertices[right.b].x) / 2, y: (vertices[right.a].y + vertices[right.b].y) / 2 };
    return Math.atan2(lm.y, lm.x) - Math.atan2(rm.y, rm.x);
  });
  const portTypes = shuffle(PORTS, random);
  const ports = portTypes.map((type, index) => ({ edgeId: coast[Math.floor(index * coast.length / 9)].id, type }));
  const desert = tiles.find((tile) => tile.terrain === 'desert')!;
  return { tiles, vertices, edges, ports, robberTileId: desert.id };
}

export function adjacentVertices(board: Board, vertexId: string) {
  return board.vertices[vertexId].edgeIds.map((id) => {
    const edge = board.edges[id];
    return edge.a === vertexId ? edge.b : edge.a;
  });
}

export function tilePoints(tile: Tile, size = HEX_SIZE) {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 180) * (60 * corner - 30);
    return `${tile.x + size * Math.cos(angle)},${tile.y + size * Math.sin(angle)}`;
  }).join(' ');
}
