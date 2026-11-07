# Extension store readiness (Chrome Web Store, Mozilla Add-ons)

Nothing has been submitted. Submission needs owner accounts and a production domain.

## Package status

| Check | Result |
|-------|--------|
| Manifest V3, both browsers | built and parsed by `tests/unit/extension-build.test.ts` |
| Firefox add-on ID preserved: `extension@snaptype.app` (do not change, or Mozilla treats it as a different add-on) | PASS (test) |
| `web-ext lint` (Mozilla addons-linter v8) on the production Firefox build | 0 errors, 0 warnings, 1 notice: `data_collection_permissions` will become mandatory |
| Production build requires explicit `https` API/app URLs, strips loopback permissions, derives the single host permission from the API URL | PASS (test) |
| Version source of truth: `apps/extension/package.json` stamped into both manifests | PASS (test) |
| Chrome Web Store dashboard validation | NOT TESTED (needs account) |
| Real-browser run in Chrome | PASS (27-check E2E); Firefox NOT TESTED |

## Building the release packages

```bash
SNAPTYPE_API_URL=https://<your-host>/api/v1 SNAPTYPE_APP_URL=https://<your-host> \
  npm run build:extension:prod && npm run package:extensions:prod
# -> dist/chrome-extension.zip, dist/firefox-extension.zip
```
Do not publish packages built in CI: they point at placeholder `.test` hosts and are labelled as validation only.

## Permissions and why

| Permission | Reason |
|-----------|--------|
| host: the SnapType API origin | sign in, sync snippets/workspaces, record usage |
| `storage` | keep the session token and selected workspace |
| `alarms` | periodic background sync in a Manifest V3 service worker (no timers) |
| `contextMenus` | "open SnapType assistant" menu entry |
| `activeTab` | popup actions on the current tab |
| content script on `<all_urls>` | expansion must run in any text field the user types in; it skips password and other sensitive inputs. This broad match is the main review risk and must be justified in the store listing |

## Data handled (basis for the privacy form; owner must review and sign off)

- Sent to the SnapType server: email address (sign-in), session token, snippet content and metadata the user creates, workspace membership, snippet usage counts.
- Not sent: what the user types in pages, page contents, browsing history. Shortcut matching is local. (Verified by reading the code; no network capture was done.)
- Stored in the browser: session token and selected workspace id. Snippet bodies are kept in the service worker's memory, not written to disk by the extension (per code; not independently verified).
- Firefox `data_collection_permissions` categories are a legal declaration. **Owner decision**: the linter suggests adding the key; pick the categories that match the policy above (authentication information and the user's own content are the relevant candidates).

## Listing text (accurate draft)

> SnapType expands short shortcuts into your saved snippets in web text fields. Write a snippet once in the SnapType dashboard, type its shortcut anywhere, and get the full text, including fill-in fields, dates and other dynamic commands. Snippets sync from your account and can be shared in workspaces. Requires a SnapType account (email code sign-in).

Do not add: speed claims, "works everywhere", "private/secure" superlatives, or store-compatibility claims that have not been tested.

## Screenshots

Six 1280x800 images per store in `docs/release/store/{chrome,firefox}/` (see `docs/release/store/README.md` for how they were made and what they are, including the fictional demo page and the fact that Firefox images reuse the Chrome captures).

## Context menu entries (for the permission/feature description)

On editable fields: a SnapType submenu with the assistant, up to 8 favourite or most-used snippets and Sync. On selected text: "Save selection as a SnapType snippet" (opens the dashboard with the text prefilled). On the toolbar button: open dashboard, sync. Signed out: a single sign-in entry. No extra permission is required beyond `contextMenus`.

## Update strategy

Bump `apps/extension/package.json` version, rebuild, upload the new zip to each store. Keep the Firefox ID and, for Chrome, upload to the same store item so the extension ID is unchanged.
