import {createForestParty3D} from './scene.js';
import {createNewMinigameEngine,NEW_MINI_IDS,runNewMinigameLogicTests} from './new-minigames.js';

window.ForestParty3D={createForestParty3D,createNewMinigameEngine,NEW_MINI_IDS,runNewMinigameLogicTests};
window.dispatchEvent(new CustomEvent('forest-party-3d-ready'));
