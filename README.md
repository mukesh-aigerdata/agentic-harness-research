# Aigerdata internal harness leaderboard

A static site: `index.html`, `styles.css`, `app.js`, and `data.js`. It has no build step and no dependencies. It needs only Google Fonts.

## Update the data

1. Run the evaluation. It writes `eval-results/phase2_chunk1.json`.
2. Run `python3 scripts/build_leaderboard_data.py` from the repo root.
3. The script writes `leaderboard/data.js`. It stops if a ticket ID, repository name, or file path leaks into the output.

Edit the public task descriptions in `TASKS` inside the script. Do not edit them in `data.js`.

## Preview

Open `leaderboard/index.html` in a browser. A server is not necessary.

## Publish on GitHub Pages

Publish only this folder, so that `docs/` and the eval results stay private:

```bash
git subtree push --prefix leaderboard origin gh-pages
```

Then set **Settings → Pages → Source** to the `gh-pages` branch, root folder.

Note: on a private repository, Pages needs a paid GitHub plan. The Pages site is public unless the organisation uses Enterprise Cloud private Pages. The page sets `noindex`, but anyone with the URL can open it.
