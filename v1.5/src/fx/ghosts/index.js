// Ghost type registry for FX: sculpt spec (layout, builder, bound) and visual class per type.
import { Onionhead, SPEC as ONIONHEAD } from './onionhead.js';
import { LibraryGhost, SPEC as LIBRARY } from './library.js';
import { TaxiGhost, SPEC as TAXI } from './taxi.js';
import { TerrorDog, SPEC as TERROR_DOG } from './terror_dog.js';
import { SwarmGhost, SPEC as SWARM } from './swarm.js';
import { BookPool } from './books.js';

export const GHOST_TYPES = {
  onionhead: { spec: ONIONHEAD, Class: Onionhead },
  library: { spec: LIBRARY, Class: LibraryGhost, shared: BookPool },
  taxi: { spec: TAXI, Class: TaxiGhost },
  terror_dog: { spec: TERROR_DOG, Class: TerrorDog },
  swarm: { spec: SWARM, Class: SwarmGhost },
};

export const GHOST_TYPE_LIST = Object.keys(GHOST_TYPES);
