#!/usr/bin/env node
// Gocdkey.nl MCP server: Dutch game prices for AI assistants.
// Reads the public, read-only data of https://gocdkey.nl (see https://gocdkey.nl/data). No account, no key, no dependencies.
// Transport: stdio, one JSON-RPC message per line (Model Context Protocol).
import { createInterface } from 'node:readline';

const SITE = 'https://gocdkey.nl';
const VERSION = '1.0.0';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const UA = `gocdkey-mcp/${VERSION} (+${SITE}/data)`;

const known = (v) => typeof v === 'string' && v && !/niet opgegeven|onbekend/i.test(v);
const euro = (n) => (typeof n === 'number' && Number.isFinite(n) ? `€ ${n.toFixed(2).replace('.', ',')}` : 'onbekend');
/** "Baldur's Gate 3" -> "baldur-s-gate-3", the form of the addresses on gocdkey.nl. */
export const slugify = (text) => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function get(path, accept = 'application/json') {
  const res = await fetch(SITE + path, { headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(20000) });
  return { status: res.status, body: await res.text() };
}

export function gameText(j) {
  const lines = [`${j.title}${j.platform ? ` (${j.platform})` : ''}: ${j.url}`];
  if (j.is_free) lines.push('Deze game is gratis.');
  if (j.lowest_official) lines.push(`Laagste officiële prijs nu: ${euro(j.lowest_official.price_eur)} bij ${j.lowest_official.store} (gecontroleerd ${j.lowest_official.checked_at}).`);
  if (j.lowest_keyshop) lines.push(`Laagste keyshopprijs nu: ${euro(j.lowest_keyshop.price_eur)} bij ${j.lowest_keyshop.store}, exclusief eventuele servicekosten.`);
  if (j.lowest_ever) lines.push(`Laagste officiële prijs ooit: ${euro(j.lowest_ever.price_eur)}${j.lowest_ever.store ? ` bij ${j.lowest_ever.store}` : ''}${j.lowest_ever.date ? ` (${String(j.lowest_ever.date).slice(0, 10)})` : ''}.`);
  if (Array.isArray(j.subscriptions) && j.subscriptions.length) lines.push(`In abonnement: ${j.subscriptions.map((s) => s.name + (s.leaving ? ` (tot ${s.leaving})` : '')).join(', ')}.`);
  const offers = Array.isArray(j.offers) ? j.offers : [];
  if (offers.length) {
    lines.push('', `Aanbiedingen van de basisgame (${offers.length}):`);
    for (const o of offers.slice(0, 25)) lines.push(`- ${o.store} (${o.type}): ${euro(o.price_eur)}${known(o.activation) ? `, activatie ${o.activation}` : ''}${known(o.region) ? `, regio ${o.region}` : ''}${o.stock_confirmed === false ? ', voorraad niet bevestigd' : ''}`);
    if (offers.length > 25) lines.push(`… en ${offers.length - 25} meer op ${j.url}`);
  } else if (!j.is_free) lines.push('Geen actuele prijs bekend.');
  lines.push('', `Bron: ${j.attribution || 'Gocdkey.nl'}. Prijzen in euro voor Nederland.`);
  return lines.join('\n');
}

async function gamePrices(args) {
  const asked = String(args?.game ?? '').trim();
  if (!asked) return { isError: true, text: 'Geef de naam of de slug van een game.' };
  const slug = /^[a-z0-9][a-z0-9-]*$/.test(asked) ? asked : slugify(asked);
  if (!slug) return { isError: true, text: 'Uit deze naam is geen adres te maken.' };
  const r = await get(`/api/v1/games/${encodeURIComponent(slug)}.json`);
  if (r.status === 404) return { isError: true, text: `Geen game gevonden op ${SITE}/game/${slug}. Probeer de exacte titel zoals op Steam, of zoek op ${SITE}/zoeken?q=${encodeURIComponent(asked)}.` };
  if (r.status === 429) return { isError: true, text: 'Te veel verzoeken; probeer het over een minuut opnieuw.' };
  if (r.status !== 200) return { isError: true, text: `Gocdkey.nl gaf status ${r.status}; probeer het later opnieuw.` };
  return { text: gameText(JSON.parse(r.body)) };
}

async function topDeals(args) {
  const limit = Math.max(1, Math.min(Number.isInteger(args?.limit) ? args.limit : 15, 50));
  const r = await get('/api/v1/deals.json');
  if (r.status !== 200) return { isError: true, text: `Gocdkey.nl gaf status ${r.status}; probeer het later opnieuw.` };
  const j = JSON.parse(r.body);
  const deals = (j.deals || []).slice(0, limit);
  const lines = [`De ${deals.length} grootste kortingen van dit moment (prijs gecontroleerd in de afgelopen 24 uur):`];
  for (const d of deals) lines.push(`- ${d.title}: ${euro(d.price_eur)} bij ${d.store ?? 'onbekende winkel'} (-${d.discount_percent}%${d.regular_price_eur != null ? `, normaal ${euro(d.regular_price_eur)}` : ''}) ${d.url}`);
  lines.push('', `Bron: ${j.attribution || 'Gocdkey.nl'}. Een korting is niet altijd de laagste prijs ooit; vraag de game op voor de prijsgeschiedenis.`);
  return { text: lines.join('\n') };
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
async function newLows(args) {
  const limit = Math.max(1, Math.min(Number.isInteger(args?.limit) ? args.limit : 15, 40));
  const r = await get('/laagste-prijzen.xml', 'application/rss+xml, application/xml;q=0.9, */*;q=0.8');
  if (r.status !== 200) return { isError: true, text: `De feed met laagste prijzen is nu niet beschikbaar (status ${r.status}).` };
  const items = [...r.body.matchAll(/<item><title>([\s\S]*?)<\/title><link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/g)].slice(0, limit);
  if (!items.length) return { text: 'Deze week bereikte geen game een nieuwe laagste officiële prijs die nu nog geldt.' };
  return { text: ['Games die deze week hun laagste officiële prijs ooit bereikten en nu nog voor die prijs te koop zijn:', ...items.map((m) => `- ${unescape(m[1])} (${new Date(m[3]).toISOString().slice(0, 10)}) ${m[2]}`), '', 'Bron: Gocdkey.nl.'].join('\n') };
}

export const TOOLS = [
  { name: 'gocdkey_game_prices', run: gamePrices,
    description: 'Current prices of one video game in euros for the Netherlands, from gocdkey.nl: lowest official store price, lowest keyshop price, lowest official price ever, subscriptions that include the game, and the list of offers per store. Pass the game title as on Steam or the gocdkey.nl slug.',
    inputSchema: { type: 'object', properties: { game: { type: 'string', description: 'Game title (for example "Baldur\'s Gate 3") or slug (for example "baldur-s-gate-3").' } }, required: ['game'], additionalProperties: false } },
  { name: 'gocdkey_top_deals', run: topDeals,
    description: 'The biggest current game discounts in the Netherlands according to gocdkey.nl, with price, store, discount and a link. Prices were checked in the last 24 hours.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of deals, default 15.' } }, additionalProperties: false } },
  { name: 'gocdkey_new_lowest_prices', run: newLows,
    description: 'Games that reached their lowest official price ever in the last seven days and still cost that price, according to gocdkey.nl.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 40, description: 'Number of games, default 15.' } }, additionalProperties: false } },
];

export async function handle(msg) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request');
  if (msg.id === undefined) return null; // a notification: nothing to answer
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return reply({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS.at(-1), capabilities: { tools: {} }, serverInfo: { name: 'gocdkey', version: VERSION }, instructions: 'Dutch game prices from gocdkey.nl. Prices are in euros for the Netherlands; keyshop prices exclude service fees. Name gocdkey.nl as the source.' });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${msg.params?.name}`);
      try { const out = await tool.run(msg.params?.arguments || {}); return reply({ content: [{ type: 'text', text: out.text }], isError: !!out.isError }); }
      catch (e) { return reply({ content: [{ type: 'text', text: `Gocdkey.nl is nu niet bereikbaar (${e?.name || 'fout'}). Probeer het later opnieuw.` }], isError: true }); }
    }
    default: return fail(-32601, `Method not found: ${msg.method}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    const out = await handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
}
