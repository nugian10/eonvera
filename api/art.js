// Eonvera — artwork endpoint (Vercel serverless function)
// GET /api/art?id=<tokenId>
// Renders the work's art as SVG, derived deterministically from the seed the
// contract locked on-chain at mint time (workSeed), its cellular rule
// (workRule) and its palette (workPaletteName). Same seed -> same art, forever.

const CONTRACT = "0xeF5F124de6eabD2972728A4058D7379d57c423DA";
const RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];
const SEL = {
  totalMinted: "0xa2309ff8",
  workSeed: "0x6602d44a",
  workRule: "0xfa954996",
  workEraName: "0xd926632d",
  workPaletteName: "0xa6f00888",
};

const PALETTES = {
  "Signal Lime": { main: "#B7FF2C", deep: "#4C7A0D", light: "#E9FFB0", spark: "#FFF6D8" },
  "Ember Field": { main: "#FF7847", deep: "#8F2E0E", light: "#FFC4A3", spark: "#FFE9D2" },
  "Deep Tide": { main: "#59D8C9", deep: "#14524B", light: "#C2FFF6", spark: "#E8FFFB" },
};

function encUint(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

async function ethCall(data) {
  let lastErr;
  for (const rpc of RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: CONTRACT, data }, "latest"],
        }),
      });
      const j = await r.json();
      if (j && j.result) return j.result;
      lastErr = new Error((j && j.error && j.error.message) || "empty result");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all RPC endpoints failed");
}

function decUint(hex) {
  return BigInt(hex);
}

function decString(hex) {
  const h = hex.slice(2);
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(parseInt(h.slice(128 + i * 2, 130 + i * 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export async function getWork(id) {
  const minted = Number(decUint(await ethCall(SEL.totalMinted)));
  if (!Number.isInteger(id) || id < 1 || id > minted) return null;
  const arg = encUint(id);
  const [seedHex, ruleHex, eraHex, palHex] = await Promise.all([
    ethCall(SEL.workSeed + arg),
    ethCall(SEL.workRule + arg),
    ethCall(SEL.workEraName + arg),
    ethCall(SEL.workPaletteName + arg),
  ]);
  return {
    id,
    seed: seedHex,
    rule: Number(decUint(ruleHex)),
    era: decString(eraHex),
    palette: decString(palHex),
  };
}

// Deterministic xorshift stream seeded from the on-chain seed.
function rngFrom(seedHex) {
  let s = BigInt(seedHex) | 1n;
  const MASK = (1n << 256n) - 1n;
  return function next() {
    s ^= (s << 13n) & MASK;
    s ^= s >> 7n;
    s ^= (s << 17n) & MASK;
    return Number(s % 1000000n) / 1000000;
  };
}

export function renderArt(seedHex, rule, paletteName) {
  const W = 64;
  const H = 64;
  const CELL = 10;
  const pal = PALETTES[paletteName] || PALETTES["Signal Lime"];
  const next = rngFrom(seedHex);

  // Initial row drawn from the seed stream.
  let row = new Array(W);
  for (let x = 0; x < W; x++) row[x] = next() < 0.42 ? 1 : 0;

  const byColor = { main: [], deep: [], light: [], spark: [] };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!row[x]) continue;
      const r = next();
      const key = r < 0.62 ? "main" : r < 0.85 ? "deep" : r < 0.97 ? "light" : "spark";
      byColor[key].push(`M${x * CELL} ${y * CELL}h${CELL}v${CELL}h${-CELL}z`);
    }
    const nxt = new Array(W);
    for (let x = 0; x < W; x++) {
      const l = row[(x + W - 1) % W];
      const c = row[x];
      const rr = row[(x + 1) % W];
      nxt[x] = (rule >> ((l << 2) | (c << 1) | rr)) & 1;
    }
    row = nxt;
  }

  let paths = "";
  for (const key of ["deep", "main", "light", "spark"]) {
    if (byColor[key].length) {
      paths += `<path fill="${pal[key]}" d="${byColor[key].join("")}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * CELL}" height="${H * CELL}" viewBox="0 0 ${W * CELL} ${H * CELL}"><rect width="100%" height="100%" fill="#050607"/>${paths}</svg>`;
}

export default async function handler(req, res) {
  const id = Number(req.query && req.query.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "id must be a positive integer" });
    return;
  }
  try {
    const work = await getWork(id);
    if (!work) {
      res.status(404).json({ error: `Eonvera #${id} has not been minted yet` });
      return;
    }
    res.setHeader("content-type", "image/svg+xml; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.status(200).send(renderArt(work.seed, work.rule, work.palette));
  } catch (e) {
    res.status(502).json({ error: "chain read failed" });
  }
}
