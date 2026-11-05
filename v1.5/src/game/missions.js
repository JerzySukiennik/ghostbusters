// Jobs: Janine's calls per map site (card, radio line, ghost type, fee) and the ghost roster each bust spawns, the solo group plus an extra group for a big crew.
import { GHOSTS } from '../ghosts/index.js';
import { Ghost } from './ghost.js';

export const JOBS = [
  { site: 'hotdog_corner', type: 'onionhead', title: 'Hot dog stand', text: 'N Moore St & Varick St. Something green is eating everything on the cart. Then the cart.', find: 'Find the ghost. Follow the munching.' },
  { site: 'wtc_plaza', type: 'swarm', title: 'World Trade Center plaza', text: 'Church St & Vesey St. A pack of little glowing things on the fountain. A lot of them.', find: 'Find the swarm. Follow the chittering.' },
  { site: 'library_steps', type: 'library', title: 'Library steps', text: '5th Ave & 42nd St. An old lady floating between the lions, telling people to be quiet.', find: 'Find her. Follow the shushing.' },
  { site: 'herald_square', type: 'taxi', title: 'Herald Square', text: 'Broadway & 34th St. A taxi with no driver keeps doing laps around the square. Honking.', find: 'Find the cab. Follow the horn.' },
  { site: 'washington_square', type: 'terror_dog', title: 'Washington Square arch', text: 'Something big and black with red eyes is chasing the chess players.', find: 'Find the dog. Follow the snarling.' },
  { site: 'chinatown', type: 'onionhead', title: 'Golden Dragon', text: "Mott St & Canal St. Something is eating the whole kitchen. Who's paying for the duck?", find: 'Find the ghost. Follow the munching.' },
  { site: 'battery_pier', type: 'taxi', title: 'Battery pier', text: "A cab drove off the pier. The driver's still in it. Dead since 1940.", find: 'Find the cab. Follow the horn.' },
  { site: 'soho_loft', type: 'terror_dog', title: 'Cast-iron lofts', text: 'Greene St & Spring St. An artist says his sculptures are howling.', find: 'Find the dog. Follow the howling.' },
  { site: 'wall_street', type: 'swarm', title: 'Trinity Church', text: 'Broadway & Wall St. The organist says the graveyard is getting up.', find: 'Find the swarm. Follow the chittering.' },
  { site: 'subway_canal', type: 'taxi', title: 'Canal St subway', text: 'Canal St & 7th Ave South. Things are coming out of the tunnel with nobody driving.', find: 'Find the cab. Follow the horn.' },
  { site: 'times_square', type: 'onionhead', title: 'Times Square', text: 'Broadway & 7th Ave. Half the city is watching something eat a hot dog truck. Try not to be on TV.', find: 'Find the ghost. Follow the munching.' },
];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function pickJob(sites, params) {
  const byId = (id) => (sites || []).find((s) => s.id === id) || null;
  let base = JOBS.find((j) => j.site === params.get('site')) || JOBS[0];
  if (!byId(base.site)) base = JOBS[0];
  const site = byId(base.site);
  const forced = GHOSTS[params.get('ghost')] ? params.get('ghost') : null;
  const type = forced || base.type, beh = GHOSTS[type];
  const n = beh.count ? beh.count[0] + (hash(base.site) % (beh.count[1] - beh.count[0] + 1)) : 1;
  const extra = (site?.types || []).find((t) => t !== type && t !== 'swarm' && GHOSTS[t]) || (type === 'swarm' ? 'onionhead' : type);
  const roster = [];
  for (let i = 0; i < n; i++) roster.push({ type, grp: 0, idx: i });
  roster.push({ type: extra, grp: 1, idx: 0 });
  const fee = beh.bounty * 5 * n;
  const nm = (type === 'onionhead' ? '' : 'The ') + beh.name;
  const what = n > 1 ? `${nm} is in the trap, all ${n} of them.` : `${nm} is in the trap.`;
  const find = forced && forced !== base.type ? 'Find the ghost.' : base.find;
  const next = JOBS[(JOBS.indexOf(base) + 1) % JOBS.length].site;
  return { ...base, type, n, roster, site: base.site, siteData: site, fee, what, find, next, line: 'job_' + base.site, pay: `${money(fee)} · Class ${beh.cls}` };
}

export function makeGhosts(job, deps) {
  return job.roster.map((r, i) => new Ghost({ ...deps, id: i, type: r.type, site: job.siteData, grp: r.grp, idx: r.idx }));
}
