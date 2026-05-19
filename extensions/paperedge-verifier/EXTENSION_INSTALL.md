# PaperEdge Verifier — Chrome Extension Install

## What it does

When you click "Start verification" on a trade in PaperEdge, the app opens each
book's page in a new tab. This extension injects a small overlay onto those pages
showing the expected side, odds, and line from your trade. You enter what you
actually see, click a result button, and the extension posts it back to PaperEdge.

**The extension does NOT:**
- Scrape odds or any data from sportsbook pages
- Read your account, balance, or bet history
- Automate any clicks or form fills
- Send data anywhere except `localhost:3000`

## Install (developer mode — local use only)

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** on (top-right switch)
3. Click **Load unpacked**
4. Select this folder: `paperedge/extensions/paperedge-verifier/`
5. The "PaperEdge Verifier" extension appears — pin it to your toolbar

## Using the extension

1. Start PaperEdge: `npm run dev` in the `paperedge/` folder
2. Go to `http://localhost:3000` and open a trade that has legs
3. Click **Start verification** on the verify page — books open in new tabs
4. On each book's page, the overlay appears in the top-right corner
5. Search for the market, fill in what you observe, click the appropriate button
6. The result is saved to PaperEdge automatically
7. Close the tab, repeat for the other book

## Toolbar popup

Click the PaperEdge icon in Chrome's toolbar to see which trade is currently
being verified. If PaperEdge isn't running, the popup will tell you.

## Troubleshooting

| Problem | Fix |
|---|---|
| Overlay doesn't appear | Check the extension is enabled at `chrome://extensions/` |
| "Can't reach PaperEdge" | Run `npm run dev` in the `paperedge/` folder |
| "No active trade" | Click "Start verification" on a trade in PaperEdge first |
| Overlay appears but save fails | Make sure PaperEdge is running at `localhost:3000` |
| Book opens but wrong URL | Edit the deep link template at `/books/[id]/deep-links` in PaperEdge |

## Supported books

The overlay activates only on these domains:

- `novig.us`
- `getfliff.com`
- `sportzino.com`
- `kalshi.com`
- `thescore.com`

It does nothing on any other website.

## Publishing (optional, future)

To share with other users without developer mode, publish to the Chrome Web Store:
1. Zip this folder
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload the zip and complete the review process (usually 1–3 days)
