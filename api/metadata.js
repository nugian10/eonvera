// Eonvera — ERC-721 metadata endpoint (Vercel serverless function)
// GET /api/metadata?id=<tokenId>
// Reads the work's seed, rule, era and palette straight from the deployed
// contract on BNB Chain and serves standard NFT metadata. The contract's
// baseURI should be set to: https://eonvera.vercel.app/api/metadata?id=
// (tokenURI = baseURI + tokenId, so each token resolves to its own record.)

const CONTRACT = "0xeF5F124de6eabD2972728A4058D7379d57c423DA";
const SITE = "https://eonvera.vercel.app";
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

export default async function handler(req, res) {
  const id = Number(req.query && req.query.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "id must be a positive integer" });
    return;
  }
  try {
    const minted = Number(decUint(await ethCall(SEL.totalMinted)));
    if (id > minted) {
      res.status(404).json({ error: `Eonvera #${id} has not been minted yet` });
      return;
    }
    const arg = encUint(id);
    const [seedHex, ruleHex, eraHex, palHex] = await Promise.all([
      ethCall(SEL.workSeed + arg),
      ethCall(SEL.workRule + arg),
      ethCall(SEL.workEraName + arg),
      ethCall(SEL.workPaletteName + arg),
    ]);
    const rule = Number(decUint(ruleHex));
    const era = decString(eraHex);
    const palette = decString(palHex);
    const seedShort = seedHex.slice(0, 10) + "…" + seedHex.slice(-4);

    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.status(200).json({
      name: `Eonvera #${id}`,
      description:
        `A generative work of the Eon Engine — Rule ${rule}, ${era} era, ${palette} palette. ` +
        `Its seed was drawn from block-time at the moment of minting and is locked on-chain forever. ` +
        `One of 3,333 works on BNB Chain, minted only by an agent.`,
      image: `${SITE}/api/art?id=${id}`,
      external_url: SITE,
      attributes: [
        { trait_type: "Rule", value: rule },
        { trait_type: "Era", value: era },
        { trait_type: "Palette", value: palette },
        { trait_type: "Seed", value: seedShort },
        { trait_type: "Series", value: "Eonvera — Single Series" },
      ],
    });
  } catch (e) {
    res.status(502).json({ error: "chain read failed" });
  }
}
