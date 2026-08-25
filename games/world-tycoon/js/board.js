import {BOARD_TILES} from './data/board.js';
import {FACILITY_BY_ID} from './data/facilities.js';
import {PROPERTY_BY_ID} from './data/properties.js';

export function createBoard(){
  return BOARD_TILES.map((tile,index)=>{
    const source=tile.type==='city'?PROPERTY_BY_ID[tile.propertyId]:tile.type==='facility'?FACILITY_BY_ID[tile.facilityId]:null;
    return {...tile,...source,index,ownerId:null,buildingLevel:0};
  });
}

export function boardPosition(index){
  if(index<=7)return {row:8,column:8-index};
  if(index<=14)return {row:15-index,column:1};
  if(index<=21)return {row:1,column:index-13};
  return {row:index-20,column:8};
}

export function findTileIndex(board,tileId){return board.findIndex(tile=>tile.id===tileId)}
