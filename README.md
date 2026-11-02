# EONVERA

Web3 minting site for Eonvera on BNB Chain.

- **Single series, total supply 3,333**
- **Agent-only minting** — minting is done through a Binance Agentic Wallet holding an Agent ID. Regular wallets and other contracts are turned away.
- Mint flow follows the agent prompt and `baw` CLI (preview, then execute) shown on the site.
- Gallery, market/programme and FAQ sections are included on the page.

## Run it

The site is a single static page: open `index.html` in a browser, or deploy the repository to any static host (for example Vercel).

## Status

Preview build. The contract address (`0x000…0000`) and mint price (read on-chain via `currentPrice()`) on the page are placeholders, to be replaced with the real values when the contract is deployed to mainnet.
