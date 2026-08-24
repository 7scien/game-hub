export const RESOURCES = ['wood', 'brick', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceBag = Record<Resource, number>;
export type Terrain = 'forest' | 'hill' | 'pasture' | 'field' | 'mountain' | 'desert';
export type BuildingType = 'settlement' | 'city';
export type DevCardType = 'knight' | 'victory' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';
export type PortType = 'generic' | Resource;
export type Phase = 'setup-settlement' | 'setup-road' | 'pre-roll' | 'main' | 'discard' | 'robber-move' | 'robber-steal' | 'victory';

export interface Tile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  vertexIds: string[];
  edgeIds: string[];
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  adjacentTileIds: string[];
  edgeIds: string[];
}

export interface Edge {
  id: string;
  a: string;
  b: string;
  tileIds: string[];
}

export interface Port {
  edgeId: string;
  type: PortType;
}

export interface Board {
  tiles: Tile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  ports: Port[];
  robberTileId: string;
}

export interface Building {
  playerId: string;
  type: BuildingType;
}

export interface DevCard {
  id: string;
  type: DevCardType;
  boughtTurn: number;
  played: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  resources: ResourceBag;
  devCards: DevCard[];
  roads: string[];
  usedKnights: number;
}

export interface TradeOffer {
  from: string;
  to: string;
  give: ResourceBag;
  receive: ResourceBag;
}

export interface GameLog {
  id: string;
  message: string;
  privateFor?: string[];
}

export interface GameState {
  version: 1;
  seed: number;
  board: Board;
  players: Player[];
  turnOrder: string[];
  currentPlayerId: string;
  turnNumber: number;
  round: number;
  phase: Phase;
  setupSequence: string[];
  setupIndex: number;
  lastPlacedVertexId?: string;
  buildings: Record<string, Building>;
  bank: ResourceBag;
  devDeck: DevCardType[];
  hidden: boolean;
  handoffReason: string;
  privacyPlayerId?: string;
  discardQueue: string[];
  eligibleVictims: string[];
  pendingTrade?: TradeOffer;
  dice?: [number, number];
  devPlayedThisTurn: boolean;
  freeRoads: number;
  longestRoadOwner?: string;
  largestArmyOwner?: string;
  winnerId?: string;
  sound: boolean;
  log: GameLog[];
}

export const emptyBag = (): ResourceBag => ({ wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
export const cloneBag = (bag: ResourceBag): ResourceBag => ({ ...bag });
export const bagTotal = (bag: ResourceBag) => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);

export const RESOURCE_LABELS: Record<Resource, string> = {
  wood: '목재', brick: '벽돌', wool: '양모', grain: '곡물', ore: '광석',
};

export const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '♠', brick: '▰', wool: '⌁', grain: '≋', ore: '◆',
};

export const TERRAIN_LABELS: Record<Terrain, string> = {
  forest: '숲', hill: '구릉', pasture: '목초지', field: '농경지', mountain: '산지', desert: '사막',
};

export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  forest: 'wood', hill: 'brick', pasture: 'wool', field: 'grain', mountain: 'ore', desert: null,
};

export const DEV_LABELS: Record<DevCardType, string> = {
  knight: '기사', victory: '승점', roadBuilding: '도로 건설', yearOfPlenty: '풍요의 해', monopoly: '독점',
};

export const COSTS = {
  road: { wood: 1, brick: 1, wool: 0, grain: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1, ore: 0 },
  city: { wood: 0, brick: 0, wool: 0, grain: 2, ore: 3 },
  development: { wood: 0, brick: 0, wool: 1, grain: 1, ore: 1 },
} satisfies Record<string, ResourceBag>;
