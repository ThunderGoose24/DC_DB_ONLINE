/* Loads Trystero (ESM) and hands it to the page's classic scripts.
 * Resolved via the <script type="importmap"> in lobby.html / game.html.
 * This is a module so it only runs when served over http(s)/localhost — which is
 * exactly when online play is available; local file:// play never needs it. */
import { joinRoom, createUserIdentity, importUserIdentity, exportUserIdentity } from 'trystero';

const SS_KEY = '__dc_deckbuilder_identity__';

// Per-tab identity: distinct per browser tab (so two people can share one machine) yet stable
// across lobby -> game navigation within the same tab. sessionStorage is scoped to a single
// tab and survives its navigations, so re-joining the room in game.html matches the very same
// roster entry this tab wrote in the lobby — while another tab on the same machine gets its own.
async function ensureIdentity() {
  let stored = null;
  try { stored = sessionStorage.getItem(SS_KEY); } catch (e) {}
  if (!stored) {
    const fresh = await createUserIdentity();
    stored = exportUserIdentity(fresh);
    try { sessionStorage.setItem(SS_KEY, stored); } catch (e) {}
  }
  return importUserIdentity(stored);
}

async function joinDCRoom(roomId) {
  const identity = await ensureIdentity();
  return joinRoom({ appId: 'dc-deckbuilder', maxUsers: 4, identity }, roomId);
}

window.__DCROOM__ = { joinDCRoom };
if (typeof window.__onDCROOMReady__ === 'function') window.__onDCROOMReady__(window.__DCROOM__);
