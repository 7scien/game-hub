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
  if(index<=10)return {row:11,column:11-index};
  if(index<=20)return {row:21-index,column:1};
  if(index<=30)return {row:1,column:index-19};
  return {row:index-29,column:11};
}

export function findTileIndex(board,tileId){return board.findIndex(tile=>tile.id===tileId)}
