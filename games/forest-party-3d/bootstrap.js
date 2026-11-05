import {createForestParty3D} from './scene.js';

window.ForestParty3D={createForestParty3D};
window.dispatchEvent(new CustomEvent('forest-party-3d-ready'));
