// "Manhattan z filmu": hand-authored compressed 1984 island (north = -Z, east = +X, origin = N Moore St x Varick St).
export const VERSION = 1;
export const CHUNK = 128;
export const SIDEWALK_H = 0.15;
export const WATER_Y = -1.6;

export const LAND = [[-400, -2400], [520, -2400], [520, 640], [492, 702], [400, 742], [180, 768], [-60, 770], [-260, 752], [-400, 700]];
export const XLINES = [-400, 520];
export const ZLINES = [-2400, 780];
export const NORTH_WALL = -2085;

export const AVENUES = [
  { id: 'L0', x: -365, w: 26, walk: 6, segs: [[640, -640, 'West St', 0], [-640, -1370, '12th Ave', 0], [-1370, -2015, 'Riverside Dr', 0]] },
  { id: 'L1', x: -240, w: 18, walk: 5, segs: [[640, 520, 'Washington St', 'n'], [350, -140, 'Washington St', 'n'], [-140, -640, 'Greenwich St', 's'], [-640, -1370, '9th Ave', 's'], [-1370, -2015, 'Columbus Ave', 's']] },
  { id: 'L2', x: -120, w: 18, walk: 5, segs: [[640, 350, 'Church St', 'n'], [350, -640, 'Hudson St', 'n'], [-640, -1370, '8th Ave', 'n'], [-1370, -2015, 'Central Park West', 0, 20, 6]] },
  { id: 'L3', x: 0, w: 20, walk: 5, segs: [[640, 350, 'Greenwich St', 0], [350, -140, 'Varick St', 0], [-140, -640, '7th Ave South', 0], [-640, -1370, '7th Ave', 0]] },
  { id: 'L4', x: 125, w: 18, walk: 5, segs: [[640, 350, 'Trinity Pl', 's'], [350, -350, 'West Broadway', 's'], [-350, -1370, '6th Ave', 'n']] },
  { id: 'L5', x: 250, w: 16, walk: 5, segs: [[640, 350, 'New St', 'n', 12, 4], [350, -140, 'Church St', 's'], [-140, -475, 'Greene St', 'n', 12, 4], [-560, -2015, '5th Ave', 's', 18, 6]] },
  { id: 'L6', x: 330, w: 20, walk: 5, segs: [[640, -560, 'Broadway', 's'], [-730, -2015, 'Madison Ave', 'n', 18]] },
  { id: 'LW', x: 370, w: 9, walk: 3, segs: [[640, 350, 'William St', 's']] },
  { id: 'L7', x: 410, w: 14, walk: 4, segs: [[640, 350, 'Pearl St', 'n', 11, 3.5], [350, 150, 'Centre St', 'n'], [150, -140, 'Mott St', 's', 10, 3.5], [-140, -640, 'Lafayette St', 'n'], [-640, -2015, 'Park Ave', 0, 20, 5]] },
  { id: 'LX', x: 450, w: 10, walk: 3, segs: [[640, 350, 'Water St', 'n']] },
  { id: 'L8', x: 490, w: 20, walk: 4, segs: [[640, 350, 'South St', 0], [350, -2015, 'FDR Drive', 0]] },
];

const full = (name, dir = 0) => [[-365, 490, name, dir]];
export const STREETS = [
  { id: 'S640', z: 640, w: 18, walk: 5, segs: full('Battery Pl') },
  { id: 'S590', z: 590, w: 11, walk: 3.5, segs: [[-365, 330, 'Rector St', 'w'], [330, 490, 'Wall St', 'e']] },
  { id: 'S555', z: 555, w: 9, walk: 3, segs: [[330, 490, 'Pine St', 'w']] },
  { id: 'S520', z: 520, w: 12, walk: 4, segs: full('Liberty St', 'e') },
  { id: 'S480', z: 480, w: 9, walk: 3, segs: [[-120, 330, 'Cortlandt St', 'w'], [330, 490, 'Maiden Ln', 'e']] },
  { id: 'S445', z: 445, w: 9, walk: 3, segs: [[330, 490, 'John St', 'w']] },
  { id: 'S410', z: 410, w: 11, walk: 4, segs: [[-120, 490, 'Fulton St', 'e']] },
  { id: 'S350', z: 350, w: 14, walk: 4.5, segs: full('Vesey St') },
  { id: 'S280', z: 280, w: 16, walk: 4.5, segs: full('Chambers St') },
  { id: 'S215', z: 215, w: 11, walk: 4, segs: full('Duane St', 'w') },
  { id: 'S150', z: 150, w: 16, walk: 4.5, segs: full('Worth St') },
  { id: 'S80', z: 80, w: 11, walk: 4.5, segs: full('Franklin St', 'e') },
  { id: 'S0', z: 0, w: 12, walk: 4.5, segs: full('N Moore St', 'w') },
  { id: 'S-70', z: -70, w: 12, walk: 4.5, segs: full('Beach St', 'e') },
  { id: 'S-140', z: -140, w: 20, walk: 5, segs: full('Canal St') },
  { id: 'S-210', z: -210, w: 12, walk: 4.5, segs: full('Grand St', 'w') },
  { id: 'S-280', z: -280, w: 12, walk: 4.5, segs: full('Spring St', 'e') },
  { id: 'S-350', z: -350, w: 24, walk: 5, segs: full('Houston St') },
  { id: 'S-415', z: -415, w: 11, walk: 4, segs: full('Bleecker St', 'w') },
  { id: 'S-475', z: -475, w: 12, walk: 4.5, segs: [[-365, 125, 'W 4th St', 'e'], [125, 330, 'Washington Sq South', 'e'], [330, 490, 'E 4th St', 'e']] },
  { id: 'S-560', z: -560, w: 12, walk: 4.5, segs: [[-365, 125, 'Waverly Pl', 'w'], [125, 330, 'Washington Sq North', 'w'], [330, 490, 'E 8th St', 'w']] },
  { id: 'S-640', z: -640, w: 20, walk: 5, segs: full('14th St') },
  { id: 'S-730', z: -730, w: 20, walk: 5, segs: full('23rd St') },
  { id: 'S-800', z: -800, w: 20, walk: 5, segs: full('34th St') },
  { id: 'S-860', z: -860, w: 12, walk: 4.5, segs: full('40th St', 'w') },
  { id: 'S-960', z: -960, w: 24, walk: 6, segs: full('42nd St') },
  { id: 'S-1025', z: -1025, w: 12, walk: 4.5, segs: full('44th St', 'w') },
  { id: 'S-1090', z: -1090, w: 12, walk: 4.5, segs: full('47th St', 'w') },
  { id: 'S-1155', z: -1155, w: 12, walk: 4.5, segs: full('50th St', 'w') },
  { id: 'S-1220', z: -1220, w: 12, walk: 4.5, segs: full('53rd St', 'e') },
  { id: 'S-1300', z: -1300, w: 20, walk: 5, segs: full('57th St') },
  { id: 'S-1370', z: -1370, w: 20, walk: 6, segs: [[-365, -120, 'W 59th St', 0], [-120, 250, 'Central Park South', 0], [250, 490, 'E 59th St', 0]] },
  { id: 'S-1440', z: -1440, w: 12, walk: 4.5, segs: [[-365, -120, 'W 63rd St', 'e'], [250, 490, 'E 63rd St', 'w']] },
  { id: 'S-1510', z: -1510, w: 12, walk: 4.5, segs: [[-365, -120, 'W 66th St', 'w'], [250, 490, 'E 66th St', 'e']] },
  { id: 'S-1580', z: -1580, w: 12, walk: 4.5, segs: [[-365, -120, 'W 69th St', 'e'], [250, 490, 'E 69th St', 'w']] },
  { id: 'S-1650', z: -1650, w: 16, walk: 5, segs: [[-365, -120, 'W 72nd St', 0], [-120, 250, 'Terrace Dr', 0], [250, 490, 'E 72nd St', 0]] },
  { id: 'S-1720', z: -1720, w: 12, walk: 4.5, segs: [[-365, -120, 'W 75th St', 'w'], [250, 490, 'E 75th St', 'e']] },
  { id: 'S-1795', z: -1795, w: 14, walk: 4.5, segs: [[-365, -120, 'W 79th St', 0], [250, 490, 'E 79th St', 0]] },
  { id: 'S-1870', z: -1870, w: 12, walk: 4.5, segs: [[-365, -120, 'W 82nd St', 'w'], [250, 490, 'E 82nd St', 'e']] },
  { id: 'S-1945', z: -1945, w: 20, walk: 5, segs: [[-365, -120, 'W 86th St', 0], [-120, 250, '86th St Transverse', 0], [250, 490, 'E 86th St', 0]] },
  { id: 'S-2015', z: -2015, w: 20, walk: 5, segs: [[-365, -120, 'W 96th St', 0], [-120, 250, '97th St Transverse', 0], [250, 490, 'E 96th St', 0]] },
];

export const BROADWAY = { id: 'BWY', name: 'Broadway', w: 20, walk: 5, dir: 's', pts: [[330, -560], [250, -730], [125, -800], [0, -1155], [-120, -1370]] };
export const CIRCLE = { id: 'columbus', c: [-120, -1370], rIn: 22, rOut: 40 };

export const DISTRICTS = [
  { id: 'battery', name: 'The Battery', z: [645, 800] },
  { id: 'fidi', name: 'Financial District', z: [345, 645] },
  { id: 'tribeca', name: 'Tribeca', z: [-140, 345] },
  { id: 'soho', name: 'SoHo', z: [-355, -140] },
  { id: 'village', name: 'Greenwich Village', z: [-645, -355] },
  { id: 'midtown', name: 'Midtown', z: [-1375, -645] },
  { id: 'uws', name: 'Upper West Side', z: [-2400, -1375], x: [-400, -125] },
  { id: 'park', name: 'Central Park', z: [-2400, -1375], x: [-125, 245] },
  { id: 'ues', name: 'Upper East Side', z: [-2400, -1375], x: [245, 520] },
];
export const SUBDISTRICTS = [
  { id: 'chinatown', name: 'Chinatown', x: [335, 520], z: [-145, 155] },
  { id: 'times', name: 'Times Square', x: [-60, 135], z: [-1165, -950] },
  { id: 'cpw', name: 'Central Park West', x: [-200, -120], z: [-2400, -1375] },
];

export const SPECIAL = [
  { at: [-240, 435], kind: 'landmark', id: 'wtc', name: 'World Trade Center', frontDir: [0, -1] },
  { at: [370, -995], kind: 'landmark', id: 'sedgewick', name: 'The Sedgewick Hotel', frontDir: [-1, 0] },
  { at: [200, -910], kind: 'landmark', id: 'library', name: 'New York Public Library', frontDir: [1, 0], split: { axis: 'x', v: 178, side: 1, other: 'park', otherId: 'bryant_park', otherName: 'Bryant Park' } },
  { at: [-180, -1475], kind: 'landmark', id: 'spook_central', name: '55 Central Park West', frontDir: [1, 0], split: { axis: 'x', v: -186, side: 1, other: 'build' } },
  { at: [24, -990], kind: 'landmark', id: 'times_square', name: 'One Times Square', frontDir: [0, -1] },
  { at: [225, -785], kind: 'tower', id: 'empire_state', name: 'Empire State Building', floors: 102, h: 381 },
  { at: [290, 555], kind: 'church', id: 'trinity', name: 'Trinity Church' },
  { at: [264, -660], kind: 'flatiron', id: 'flatiron', name: 'Flatiron Building', floors: 22 },
  { at: [345, -690], kind: 'park', id: 'union_square', name: 'Union Square' },
  { at: [290, -765], kind: 'park', id: 'madison_square', name: 'Madison Square Park' },
  { at: [230, -520], kind: 'park', id: 'washington_square', name: 'Washington Square Park' },
  { at: [-170, -1690], kind: 'landmark2', id: 'dakota', name: 'The Dakota', split: { axis: 'x', v: -180, side: 1, other: 'build' } },
];

export const FIREHOUSE = { id: 'firehouse', name: 'Hook & Ladder 8', address: '14 N Moore St', box: [-31, -40.5, -15, -10.5], frontDir: [0, 1], driveway: [-21.4, -17.2], door: -19.3, floorY: 0.15 };
export const V1ZONES = [
  { id: 'nw', rect: [-54.5, -59.5, -15, -10.5], cut: { axis: 'x', v: -54.5, keep: 1 } },
  { id: 'ne', rect: [15, -59.5, 54.5, -10.5], cut: { axis: 'x', v: 54.5, keep: -1 } },
  { id: 'sw', rect: [-54.5, 10.5, -15, 70], cut: { axis: 'x', v: -54.5, keep: 1 } },
  { id: 'se', rect: [15, 10.5, 54.5, 70], cut: { axis: 'x', v: 54.5, keep: -1 }, park: { id: 'varick_park', name: 'Varick St sitting area' } },
];
export const TAVERN = { id: 'tavern_green', name: 'Tavern on the Green', box: [-100, -1585, -62, -1545] };
export const CASTLE = { id: 'castle_clinton', c: [-250, 705], r: 18 };

export const PARK_FEATURES = {
  pond: { id: 'the_pond', name: 'The Pond', poly: [[122, -1402], [218, -1400], [226, -1426], [206, -1462], [164, -1472], [128, -1452], [114, -1424]] },
  lake: { id: 'the_lake', name: 'The Lake', poly: [[-50, -1722], [40, -1714], [140, -1722], [182, -1752], [120, -1796], [20, -1788], [-50, -1780], [-82, -1750]] },
  lawn: { id: 'great_lawn', name: 'Great Lawn', poly: [[-40, -1962], [190, -1962], [196, -2000], [-46, -2000]] },
  meadow: { id: 'sheep_meadow', name: 'Sheep Meadow', poly: [[-60, -1450], [40, -1445], [55, -1520], [10, -1560], [-60, -1555]] },
  bethesda: { id: 'bethesda', name: 'Bethesda Fountain', c: [80, -1690], r: 14 },
  mall: { id: 'the_mall', from: [80, -1440], to: [80, -1640], w: 11 },
  gapstow: { id: 'gapstow', from: [168, -1412], to: [176, -1458] },
  bow: { id: 'bow_bridge', from: [64, -1712], to: [70, -1796] },
};

export const PARK_PATHS = [
  { id: 'cp_mall', w: 9, pts: [[80, -1386], [80, -1440], [80, -1560], [80, -1640], [80, -1676]] },
  { id: 'cp_south', w: 4, pts: [[-104, -1384], [-60, -1400], [-10, -1392], [40, -1398], [80, -1410], [118, -1396], [170, -1390], [236, -1386]] },
  { id: 'cp_pond_e', w: 3.5, pts: [[236, -1440], [222, -1432], [216, -1410]] },
  { id: 'cp_pond_n', w: 3.5, pts: [[118, -1396], [116, -1440], [140, -1478], [186, -1478], [222, -1468], [236, -1500]] },
  { id: 'cp_gapstow', w: 3, pts: [[168, -1396], [168, -1412], [176, -1458], [186, -1478]] },
  { id: 'cp_meadow', w: 3.5, pts: [[-10, -1392], [-70, -1440], [-70, -1500], [-66, -1560], [-20, -1572], [40, -1560], [80, -1560]] },
  { id: 'cp_tavern', w: 4, pts: [[-104, -1545], [-96, -1565], [-70, -1500]] },
  { id: 'cp_west72', w: 4, pts: [[-104, -1650], [-40, -1650], [20, -1660], [60, -1682], [80, -1690]] },
  { id: 'cp_terrace', w: 6, pts: [[80, -1676], [80, -1690], [80, -1704]] },
  { id: 'cp_lake_s', w: 3.5, pts: [[80, -1704], [64, -1712], [20, -1708], [-40, -1712], [-90, -1730], [-104, -1760]] },
  { id: 'cp_bow', w: 3, pts: [[64, -1712], [70, -1796], [60, -1830], [0, -1860], [-60, -1870], [-104, -1870]] },
  { id: 'cp_east72', w: 4, pts: [[80, -1690], [140, -1680], [200, -1662], [236, -1650]] },
  { id: 'cp_lake_e', w: 3.5, pts: [[140, -1680], [196, -1740], [200, -1800], [170, -1860], [100, -1900], [40, -1940], [0, -1955]] },
  { id: 'cp_lawn_w', w: 4, pts: [[-104, -1945], [-60, -1952], [0, -1955], [60, -1956], [120, -1956], [236, -1945]] },
  { id: 'cp_east66', w: 3.5, pts: [[236, -1510], [180, -1530], [120, -1560], [80, -1600]] },
  { id: 'wsq_a', w: 4, pts: [[146, -548], [237, -517], [318, -486]] },
  { id: 'wsq_b', w: 4, pts: [[146, -486], [237, -517], [318, -548]] },
  { id: 'wsq_c', w: 5, pts: [[250, -548], [250, -486]] },
  { id: 'usq_a', w: 4, pts: [[340, -720], [370, -686], [400, -650]] },
  { id: 'usq_b', w: 4, pts: [[400, -720], [370, -686], [315, -655]] },
  { id: 'msq_a', w: 3.5, pts: [[262, -788], [290, -765], [318, -742]] },
  { id: 'msq_b', w: 3.5, pts: [[318, -788], [290, -765], [262, -742]] },
  { id: 'bryant_a', w: 4, pts: [[137, -910], [176, -910]] },
  { id: 'bryant_b', w: 3.5, pts: [[140, -872], [140, -948]] },
  { id: 'bat_prom', w: 6, pts: [[-385, 655], [-300, 690], [-230, 730], [-150, 752], [-40, 752], [100, 748], [260, 730], [420, 690], [505, 650]] },
  { id: 'bat_in', w: 4, pts: [[-150, 656], [-150, 752]] },
  { id: 'bat_in2', w: 4, pts: [[120, 656], [100, 748]] },
  { id: 'bat_castle', w: 4, pts: [[-300, 690], [-250, 705]] },
];

export const PIERS = [
  ...[600, 430, 245, 60, -110, -300, -500, -700, -910, -1120, -1340, -1590, -1840].map((z, i) => ({ id: 'hudson_' + i, side: 'w', z, len: 120 + ((i * 37) % 3) * 15, w: 24, shed: i % 4 !== 2 })),
  ...[{ z: 380, len: 70, w: 34, shed: true, name: 'Seaport' }, { z: 230, len: 60, w: 20 }, { z: -60, len: 55, w: 18 }, { z: -420, len: 60, w: 20 }, { z: -860, len: 50, w: 18 }].map((p, i) => ({ id: 'east_' + i, side: 'e', ...p })),
  { id: 'ferry', side: 's', x: 470, len: 70, w: 50, shed: true, name: 'Staten Island Ferry' },
  { id: 'battery_pier', side: 's', x: -150, len: 55, w: 16, shed: false, name: 'Battery Pier' },
];

export const SITES = [
  { id: 'hotdog_corner', name: 'Hot dog stand', address: 'N Moore St & Varick St', kind: 'outdoor', at: [17.6, 12.7], radius: 26, types: ['onionhead', 'swarm'], food: 'v1' },
  { id: 'tribeca_dock', name: 'Loading dock', address: 'Washington St & Beach St', kind: 'outdoor', at: [-228, -88], radius: 22, types: ['onionhead', 'terror_dog'], food: 'dock' },
  { id: 'chinatown', name: 'Golden Dragon restaurant', address: 'Mott St & Canal St', kind: 'outdoor', at: [418, -110], radius: 24, types: ['onionhead', 'swarm'], food: 'cart' },
  { id: 'wtc_plaza', name: 'World Trade Center plaza', address: 'Church St & Vesey St', kind: 'outdoor', at: [-200, 440], radius: 40, types: ['swarm', 'terror_dog'] },
  { id: 'wall_street', name: 'Trinity Church', address: 'Broadway & Wall St', kind: 'outdoor', at: [317, 575], radius: 24, types: ['library', 'swarm'] },
  { id: 'battery_pier', name: 'The Battery pier', address: 'Battery Park', kind: 'outdoor', at: [-150, 760], radius: 28, types: ['taxi', 'swarm', 'terror_dog'], food: 'cart' },
  { id: 'seaport', name: 'South Street Seaport', address: 'South St & Fulton St', kind: 'outdoor', at: [545, 380], radius: 28, types: ['onionhead', 'taxi'], food: 'cart' },
  { id: 'soho_loft', name: 'Cast-iron lofts', address: 'Greene St & Spring St', kind: 'outdoor', at: [250, -292], radius: 22, types: ['swarm', 'terror_dog'] },
  { id: 'subway_canal', name: 'Canal St subway', address: 'Canal St & 7th Ave South', kind: 'outdoor', at: [14, -152], radius: 18, types: ['swarm', 'taxi'] },
  { id: 'washington_square', name: 'Washington Square arch', address: 'Washington Sq North & 5th Ave', kind: 'outdoor', at: [250, -535], radius: 32, types: ['terror_dog', 'swarm', 'library'], food: 'cart' },
  { id: 'herald_square', name: 'Herald Square', address: 'Broadway & 34th St', kind: 'outdoor', at: [118, -790], radius: 28, types: ['taxi', 'onionhead'], food: 'cart' },
  { id: 'library_steps', name: 'Library steps', address: '5th Ave & 42nd St', kind: 'outdoor', at: [238, -906], radius: 26, types: ['library', 'swarm'] },
  { id: 'library_reading_room', name: 'Library reading room', address: '476 5th Ave', kind: 'indoor', at: [200, -906], radius: 18, types: ['library'], interior: 'library:reading_room' },
  { id: 'times_square', name: 'Times Square', address: 'Broadway & 7th Ave', kind: 'outdoor', at: [15, -1075], radius: 36, types: ['taxi', 'onionhead', 'swarm'], food: 'cart' },
  { id: 'sedgewick_ballroom', name: 'Sedgewick Hotel ballroom', address: 'Madison Ave & 43rd St', kind: 'indoor', at: [370, -984], radius: 22, types: ['onionhead', 'swarm'], interior: 'sedgewick:ballroom', food: 'banquet' },
  { id: 'columbus_circle', name: 'Columbus Circle', address: 'Columbus Circle', kind: 'outdoor', at: [-120, -1370], radius: 40, types: ['taxi', 'terror_dog'] },
  { id: 'spook_central', name: '55 Central Park West', address: '55 Central Park West', kind: 'outdoor', at: [-133, -1475], radius: 24, types: ['terror_dog', 'swarm'] },
  { id: 'tavern_green', name: 'Tavern on the Green', address: 'Central Park West & 67th St', kind: 'outdoor', at: [-80, -1535], radius: 28, types: ['terror_dog', 'onionhead'], food: 'tavern' },
  { id: 'cp_pond', name: 'The Pond', address: 'Central Park South & 5th Ave', kind: 'outdoor', at: [150, -1480], radius: 36, types: ['swarm', 'terror_dog'], food: 'cart' },
  { id: 'bethesda', name: 'Bethesda Fountain', address: 'Central Park, 72nd St', kind: 'outdoor', at: [80, -1690], radius: 30, types: ['swarm', 'library'] },
];

export const SUBWAY = [
  { at: [14, -152], name: 'Canal St' }, { at: [-14, 12], name: 'Franklin St' }, { at: [-106, 290], name: 'Chambers St' }, { at: [-14, -363], name: 'Houston St' },
  { at: [138, -652], name: '14th St' }, { at: [-14, -941], name: 'Times Sq 42 St' }, { at: [138, -812], name: '34 St Herald Sq' }, { at: [-133, -1383], name: '59 St Columbus Circle' },
  { at: [340, 602], name: 'Wall St' }, { at: [-106, 362], name: 'Cortlandt St' }, { at: [262, -1312], name: '5 Av 59 St' },
];

export const FAR = {
  nj: { x: [-2600, -1300], z: [-2600, 900] },
  brooklyn: { x: [1150, 2600], z: [-250, 1500] },
  queens: { x: [1250, 2600], z: [-2900, -250] },
  bronx: { x: [-1300, 1250], z: [-3000, -2450] },
  governors: { c: [320, 1500], r: 260 },
  liberty: [-1250, 2250],
  ellis: [-1050, 1650],
  bridges: [
    { id: 'brooklyn_bridge', a: [520, 300], b: [1150, 330], towers: [0.22, 0.78], h: 84, deck: 40 },
    { id: 'queensboro', a: [520, -1370], b: [1250, -1370], towers: [0.25, 0.5, 0.75], h: 100, deck: 42, truss: true },
  ],
};
