# Publishing to the Chrome Web Store

Step-by-step checklist. Listing text and permission justifications live in
[store-listing.md](store-listing.md); the privacy policy is [privacy.md](privacy.md).

## One-time setup

- [ ] **Register a Chrome Web Store developer account.** Go to the
      [developer dashboard](https://chrome.google.com/webstore/devconsole), sign in with the Google
      account that will own the item, accept the developer agreement and pay the one-time US$5
      registration fee.
- [ ] **Turn on 2-Step Verification** on that Google account (required to publish).
- [ ] **Fill the Account tab:** publisher display name, contact email, and verify the email address.
      The publisher name is public on the listing.
- [ ] **Decide trader / non-trader status** (EU Digital Services Act). A free hobby project is
      usually "non-trader"; a trader must also publish an address and phone number.
- [ ] **Enable GitHub Pages for the privacy policy:** repository **Settings → Pages → Build and
      deployment → Source: Deploy from a branch → Branch: `main`, folder: `/docs` → Save.** After the
      first build the policy is at `https://razvandalca.github.io/tab-herder/privacy/`. Open it once to
      check it loads.

## Every release

### 1. Prepare the version

- [ ] Make sure `main` is green in CI and `bun run e2e` passes locally.
- [ ] If permissions, stored data or network behaviour changed since the last release, update
      [store-listing.md](store-listing.md), [privacy.md](privacy.md) (and its "Last updated" date) and the
      README permissions table. Check the manifest with:
      ```sh
      grep -nE "permissions|host_permissions" manifest.config.ts
      ```
- [ ] Bump `version` in `package.json` (semver: `0.1.0` → `0.2.0` for features, `0.1.1` for fixes).
      The manifest reads it from there. The Web Store rejects an upload whose version is not higher
      than the published one.
- [ ] Commit, open a PR, merge to `main`.

### 2. Tag and build the release zip

- [ ] Tag the merged commit and push the tag (replace the version):
      ```sh
      git checkout main && git pull
      git tag v0.2.0
      git push origin v0.2.0
      ```
- [ ] Wait for the **Release** workflow: it checks the tag matches `package.json`, runs typecheck and
      unit tests, runs `bun run package`, and creates a GitHub Release with
      `tab-herder-<version>.zip` attached.
- [ ] Download the zip from the GitHub Release (or build it locally with `bun run package`; it lands
      in `release/tab-herder-<version>.zip` with `manifest.json` at the archive root).
- [ ] Optional sanity check: unzip it into a temp folder and load it with **Load unpacked** on
      `chrome://extensions`.

### 3. Regenerate store assets (when the UI changed, and for the first upload)

- [ ] `bun run icons` → `release/store-icon-128.png`
- [ ] `bun run build && bun run screenshots` → five 1280×800 PNGs in `release/screenshots/`
      (run `bunx playwright install chromium` once first). Look through them before uploading.

### 4. Upload in the developer dashboard

- [ ] First release: **Items → New item → upload the zip.** Later releases: open the item →
      **Package → Upload new package.**
- [ ] **Store listing tab:** paste the detailed description, pick the category, upload the store
      icon and the screenshots, set homepage and support URLs — all from
      [store-listing.md](store-listing.md#store-listing-tab).
- [ ] **Privacy practices tab:** single purpose, one justification per permission, "no remote code",
      data-usage answers and the three certifications, privacy policy URL — from
      [store-listing.md](store-listing.md#privacy-practices-tab). Compare the permission list the
      dashboard shows with the table; any missing row means the docs have drifted.
- [ ] **Distribution tab:** visibility, regions, free.
- [ ] **Save draft**, then **Submit for review.** Leave "publish automatically after review" on, or
      turn it off to publish by hand.

### 5. After review

- [ ] Review usually takes from a few hours to a few days; items requesting broad host access
      (even optional `<all_urls>`) may take longer. Rejection emails name the policy — fix, bump the
      patch version, and resubmit.
- [ ] Once live, add the Web Store link to the README and to the GitHub Release notes.

## Pending permission changes

Features in flight may add permissions (for example `sidePanel` for a side panel). When such a PR
merges, add its row to the README table and to
[store-listing.md](store-listing.md#permission-justifications) before the next upload, and update
[privacy.md](privacy.md) if it stores new data.
