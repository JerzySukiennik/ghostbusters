// Ghost behaviour registry: type -> module ({ type, name, cls, radius, will, speed, prefers, floor, voice, init, step, mood, face, hit }).
import onionhead from './onionhead.js';
import library from './library.js';
import taxi from './taxi.js';
import terror_dog from './terror_dog.js';
import swarm from './swarm.js';

export const GHOSTS = { onionhead, library, taxi, terror_dog, swarm };
export const GHOST_LIST = Object.keys(GHOSTS);
export function behaviour(type) { return GHOSTS[type] || GHOSTS.onionhead; }
