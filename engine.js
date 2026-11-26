/* ============================================================
 * DC DECKBUILDER — RULES ENGINE (pure JS, no DOM)
 * ------------------------------------------------------------
 * Loaded with plain <script src="engine.js"> after cards.js.
 * Exposes window.DCENGINE. No ES modules (file:// constraint).
 *
 * Implements every locked ruling from our chat:
 *  - Turn = Action -> Buying -> Clean-up; Power earned by playing
 *    cards is spent in Buying on Line-Up / Kick stack / SV top.
 *  - Bought/gained cards go to your Discards unless text reroutes
 *    (Aquaman's Trident & Aquaman persona: top of deck; Dark
 *    Knight/Catwoman: into hand; Solomon Grundy: may top of deck).
 *  - Attacks (Villain Attack text) and FIRST APPEARANCE—ATTACKs
 *    resolve one target at a time, clockwise starting after the
 *    attacker. Every FA attack can be defended against (general-
 *    ization); defending avoids the effect entirely. Defense cards
 *    go to your Discards when used, except Blue Beetle which stays
 *    in hand and is reusable. Empty hand -> skipped for that part.
 *  - Black Manta FA: each player discards top of own deck; cost 0
 *    just discards; cost >=1 chooses Destroy it OR discard hand
 *    (revealed card discarded with it).
 *  - J'onn: playing him plays the active SV for you (section-1
 *    effects, cross-play triggers count), NOT a defeat, no FA
 *    attack, un-defeatable for the rest of your turn, returns to
 *    top of stack at end of your turn.
 *  - Brainiac/Starro/X-Ray Vision cross-plays: you get Power/
 *    effects; cards return to respective owners' Discards (X-Ray
 *    Vision: top of owner's deck). Cross-plays count as "played
 *    this turn" for your own triggers (Batman, High-Tech Hero,
 *    Cyborg personas).
 *  - The Flash persona: goes first; +1 draw on the FIRST card-
 *    effect that makes you draw one or more cards each of your
 *    turns.
 *  - Captain Cold FA: all Personas face down (abilities disabled)
 *    until Captain Cold is defeated, then flip back up.
 *  - "Gain a Weakness" -> from public stack to your Discards;
 *    only The Joker puts a Weakness on top of a deck. Short
 *    supply dealt clockwise starting after the attacker; if the
 *    public stack is empty the effect just doesn't happen.
 *  - Main Deck exhaustion: when a refill/replace needs cards and
 *    the face-down pile is empty, that player finishes their turn
 *    first, then VP is tallied.
 *  - Destroyed cards stay destroyed forever (optional lobby
 *    setting refills Weakness/Kick from the destroyed pile).
 *  - Scoring: sum VP over every card you own (Hand+Deck+Discards+
 *    Locations); destroyed excluded; negatives count (Weakness -1);
 *    variable endgame values: Bizarro = 2 per Weakness in your
 *    deck (REPLACES printed VP; zero Weaknesses -> 0), Suicide
 *    Squad = 1 per Suicide Squad in your deck, Green Arrow /
 *    Utility Belt conditional 5-VP upgrades.
 * ============================================================ */
var DCENGINE = (function () {
  "use strict";

  /* ================= RNG (seeded, serializable) ================= */
  function nextRand(st) {
    var a = (st.rng + 0x6D2B79F5) | 0;
    st.rng = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffleInPlace(st, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(st) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function cloneState(st) { return JSON.parse(JSON.stringify(st)); }
  function log(st, msg) { st.log.push(msg); }

  /* Record a card that was revealed face-up by an effect. game.html pops it up
   * (the #peek overlay, auto-dismiss after 10s or click-off) and it stays in the LOG. */
  function pushReveal(st, id, forIdx) { st.reveals.push({ id: id, for: forIdx }); } // only pops out for the seat it concerns (pumpReveals filters)

  /* ================= card data access ================= */
  function C(id) { return DCCARDS.byId[id]; }
  function typeOf(id) { return C(id).type; }
  function isMainDeckType(t) {
    return t === 'equipment' || t === 'hero' || t === 'location' ||
           t === 'villain' || t === 'superpower';
  }

  /* Per-turn substate; a fresh one starts every turn (cleanUp). */
  function freshTurn(idx) {
    return {
      idx: idx, phase: 'action', power: 0,
      playedIds: [], playedTypesThisTurn: {}, crossPlays: [],
      playedCards: [], // cards "in use" this turn; swept to Discards at end of turn
      _isFirstPlay: false,
      svDefeatedThisTurn: false, kickBoughtThisTurn: false, jonId: null, rasBottom: false,
      riddlerAvail: false, riddlerUsed: false, riddlerPaid: false, // #2: Riddler "+1 instead" pays once even if you go back and forth
      borrowedLineup: [], locFired: {}, pendingQueue: [], _afterDefeat: false,
      boughtGainedThisTurn: [], villainsBoughtGained: 0,
      _spNames: {}, _cybSP: false, _cybEq: false, _glAwarded: false,
      _flashFired: false, _koa: false, _deferredPower: null
    };
  }

  /* ================= setup ================= */
  function newGame(cfg) {
    // cfg: { players: [{name, personaId}], seed:int, refillDestroyed:bool }
    var st = {
      rng: (cfg.seed | 0),
      refillDestroyed: !!cfg.refillDestroyed,
      players: [], lineup: [null, null, null, null, null],
      faceDown: [], svStack: [], kickStack: [], weaknessStack: [],
      box: [], // cards out of game (in the box): unused SVs/starters/personas
      destroyed: [],
      turn: null, // assigned after setup (first-turn player known)
      pending: null, attackQueue: null, pendingFA: null,
      log: [], reveals: [], over: false, scores: null, exhausted: false
    };

    // --- Main Deck from set composition (Kick excluded) ---
    var deck = [];
    Object.keys(DCCARDS.set).forEach(function (id) {
      var n = DCCARDS.set[id];
      if (!isMainDeckType(typeOf(id))) return;
      if (id === 'kick') return; // Kick stack is outside the Main Deck
      for (var i = 0; i < n; i++) deck.push(id);
    });
    shuffleInPlace(st, deck);
    for (var s = 0; s < 5; s++) st.lineup[s] = deck.pop();
    st.faceDown = deck; // face-down pile at the end of the line-up

    // --- Super-Villain stack: Ra's Al Ghul atop seven shuffled ---
    var others = DCCARDS.cards.filter(function (c) { return c.type === 'sv' && c.id !== 'ras-al-ghul'; })
      .map(function (c) { return c.id; });
    shuffleInPlace(st, others);
    st.svStack = ['ras-al-ghul'].concat(others.slice(0, 7));
    // The remaining Super Villains stay in the box (out of game).
    for (var r = 7; r < others.length; r++) st.box.push(others[r]);

    // --- public stacks ---
    var kickN = DCCARDS.set.kick || 16, weakN = DCCARDS.set.weakness || 20;
    for (var k = 0; k < kickN; k++) st.kickStack.push('kick');
    for (var w = 0; w < weakN; w++) st.weaknessStack.push('weakness');

    // --- players + starter decks (7 Punch + 3 Vulnerability) ---
    cfg.players.forEach(function (p, i) {
      var start = [];
      for (var a = 0; a < 7; a++) start.push('punch');
      for (var b = 0; b < 3; b++) start.push('vulnerability');
      shuffleInPlace(st, start);
      st.players.push({
        id: i, name: p.name, personaId: p.personaId, faceDown: false,
        hand: start.slice(0, 5), deck: start.slice(5), discards: [],
        locations: [], heldUnderPersona: [] // Atrocitus FA cards
      });
    });

    // --- unused Starter and Persona cards stay in the box (out of game) ---
    var nP = st.players.length;
    for (var u = 0; u < Math.max(0, (DCCARDS.set.punch || 36) - 7 * nP); u++) st.box.push('punch');
    for (var v = 0; v < Math.max(0, (DCCARDS.set.vulnerability || 16) - 3 * nP); v++) st.box.push('vulnerability');
    DCCARDS.cards.forEach(function (c) {
      if (c.type !== 'persona') return;
      var used = cfg.players.some(function (p) { return p.personaId === c.id; });
      if (!used) st.box.push(c.id);
    });

    // --- first turn: The Flash goes first if in play; otherwise a random seat.
    // Seeded, so a game still replays identically per seed (AI determinism).
    var fi = -1;
    st.players.forEach(function (p, i) { if (p.personaId === 'the-flash-mc') fi = i; });
    st.turn = freshTurn(fi >= 0 ? fi : Math.floor(nextRand(st) * st.players.length));

    log(st, 'Game set up. ' + st.players.length + ' players.');
    return st;
  }

  /* ================= drawing & exhaustion ================= */
  function reshuffle(st, p) {
    if (p.deck.length === 0 && p.discards.length > 0) {
      p.deck = shuffleInPlace(st, p.discards.splice(0));
      log(st, p.name + ' shuffles their Discards into a new Deck.');
    }
  }
  function drawCards(st, p, n) {
    for (var i = 0; i < n; i++) {
      reshuffle(st, p);
      if (p.deck.length === 0) break; // can't draw; hand simply stays short
      p.hand.push(p.deck.pop());
    }
    return p.hand.length;
  }

  /* Draw driven by a CARD's text (as opposed to the clean-up refill).
   * The Flash persona: first such event each of your turns -> +1 card. */
  function cardDraw(st, p, n) {
    var before = p.hand.length;
    drawCards(st, p, n);
    if (p.hand.length > before && !p.faceDown &&
        p.personaId === 'the-flash-mc' && !st.turn._flashFired) {
      st.turn._flashFired = true;
      drawCards(st, p, 1);
      log(st, p.name + "'s Super Hero grants an additional card.");
    }
  }

  /* Take cards from the face-down Main Deck pile. Returns how many
   * were taken. Sets st.exhausted when a take was needed and the
   * pile was empty (rulebook: game ends after that player's turn). */
  function takeFromFaceDown(st, n) {
    var got = [];
    for (var i = 0; i < n; i++) {
      if (st.faceDown.length === 0) { st.exhausted = true; break; }
      got.push(st.faceDown.pop());
    }
    return got;
  }

  /* ================= power ================= */
  function addPower(st, p, n) {
    if (!n) return;
    st.turn.power += n;
  }

  /* Power contributed when card `id` is played by player p.
   * Variable/conditional values are explicit; simple "+N Power"
   * cards fall through to the printed-text parse. */
  function powerOf(st, p, id) {
    var t = st.turn;
    switch (id) {
      // Super-Villains add Power via their top effect when played (see
      // applyPlay) — skip the text parse so "+N Power" isn't double-counted.
      case 'king-of-atlantis': return t._koa ? 3 : 1; // _koa set by its pending choice
      case 'mera': { // "your discard pile is empty" — she sits in it now, so exclude herself
        var n = 0; p.discards.forEach(function (c) { if (c !== 'mera') n++; });
        return n === 0 ? 4 : 2;
      }
      case 'swamp-thing': return p.locations.length > 0 ? 5 : 2;
      case 'high-tech-hero': {
        var seen = t.playedTypesThisTurn || {};
        return (seen.superpower || seen.equipment) ? 3 : 1;
      }
      case 'the-riddler': return 0; // power only via its Buying-phase choice
      case 'batmobile': return t._isFirstPlay ? 0 : 1; // first card: no +1
      case 'power-ring': {
        var top = p.deck.length ? p.deck[p.deck.length - 1] : null;
        return (top && C(top).cost >= 1) ? 3 : 2;
      }
      default: break;
    }
    var m = /\+(\d+)\s*Power/.exec(C(id).text);
    return m ? parseInt(m[1], 10) : 0;
  }

  /* ================= playing cards ================= */
  function playedTypes(st, p) {
    if (!st.turn.playedIds) st.turn.playedIds = [];
    if (st.turn.playedTypesThisTurn === undefined) st.turn.playedTypesThisTurn = {};
  }
  function markPlayed(st, p, id, cross) {
    var t = st.turn;
    playedTypes(st, p);
    t.playedIds.push(id);
    if (cross && !t.crossPlays) t.crossPlays = [];
    if (cross) t.crossPlays.push(id);
    var ty = typeOf(id);
    t.playedTypesThisTurn[ty] = true;
    // Location ongoing triggers are handled by hooks.afterPlay.
  }

  /* Cards whose Power depends on a choice their own play sets up: the
   * Power is added once that pending choice resolves (see doAction). */
  var POWER_VIA_PENDING = { 'king-of-atlantis': true };

  /* Shared core of every play (own or cross): mark triggers, run the
   * card's onPlay hook, add Power, then passive after-play effects
   * (Location ongoing draws, Persona bonuses). */
  function applyPlay(st, p, id, cross) {
    var t = st.turn;
    t._isFirstPlay = t.playedIds.length === 0;
    markPlayed(st, p, id, cross);
    // Super-Villains fire their top effect when PLAYED (not at defeat). Their
    // Power comes from that effect, so we skip the normal powerOf parse.
    var svHook = (DCENGINE.hooks.onDefeat || {})[id];
    if (svHook) {
      svHook(st, p);
    } else {
      var hook = (DCENGINE.hooks.onPlay || {})[id];
      if (hook) hook(st, p); // may set pending choices / cross-plays etc.
    }
    if (st.pending && POWER_VIA_PENDING[id]) {
      t._deferredPower = id; // added once the choice resolves
    } else if (!svHook) {
      addPower(st, p, powerOf(st, p, id));
    }
    t._isFirstPlay = false;
    if (DCENGINE.hooks.afterPlay) DCENGINE.hooks.afterPlay(st, p, id);
  }

  /* Central play: move card to owner's Discards (Locations stay in
   * front of their owner), log, then apply. `cross` = cross-played by
   * this player (Starro/Brainiac/X-Ray Vision/Emerald Knight) — counts
   * toward the player's own triggers per our ruling. */
  function playCard(st, p, id, opts) {
    opts = opts || {};
    var fromLineupSlot = opts.fromLineupSlot; // Emerald Knight borrow
    if (fromLineupSlot != null) st.lineup[fromLineupSlot] = null;
    else p.hand.splice(p.hand.indexOf(id), 1);

    if (typeOf(id) === 'location') p.locations.push(id);
    else st.turn.playedCards.push(id); // "in use" this turn; to Discards at end of turn
    log(st, p.name + ' played ' + C(id).name + '.');
    applyPlay(st, p, id, !!opts.cross);
    return st;
  }

  /* Cross-play: effects and Power go to the playing player p; the card
   * itself stays with its owner (caller arranges final placement). */
  function playCross(st, p, ownerId, id) {
    log(st, p.name + ' cross-played ' + C(id).name + ' for their own benefit.');
    applyPlay(st, p, id, true);
  }

  /* ================= attacks & defense ================= */
  function defenseCardsInHand(st, p) {
    var cap = ['blue-beetle', 'bulletproof', 'lasso-of-truth', 'super-speed', 'the-cape-and-cowl'];
    return p.hand.filter(function (c) { return cap.indexOf(c) >= 0; });
  }

  /* Fire an attack. `fa` true = First Appearance ("Each player" text:
   * hits ALL players clockwise starting after the attacker, so the
   * attacker/defeater is last); false = regular Attack text (all OTHER
   * players). Sets st.attackQueue for one-at-a-time resolution. */
  function fireAttack(st, attackerIdx, cardId, fa) {
    var q = [];
    if (fa) {
      q.push(attackerIdx); // prior-SV-defeater is attacked FIRST (#4), then the rest clockwise
      for (var i = 1; i < st.players.length; i++) q.push((attackerIdx + i) % st.players.length);
    } else {
      for (var j = 1; j < st.players.length; j++) q.push((attackerIdx + j) % st.players.length);
    }
    st.attackQueue = { targets: q, cardId: cardId, fa: !!fa, collected: [], attacker: attackerIdx };
    log(st, C(cardId).name + (fa ? ' First Appearance—Attack' : ' Attack') + ': ' +
        (q.length ? q.map(function (i) { return st.players[i].name; }).join(', ') : 'no targets'));
  }

  /* Resolve the next queued target: defend or succumb. If the effect
   * opens a pending choice, the queue waits (q.awaiting) until it is
   * resolved; doAction then calls advanceTarget. */
  function resolveTarget(st, a) {
    var q = st.attackQueue;
    var p = st.players[q.targets[0]];
    if (a.kind === 'defend') {
      // play the defense card per its text; avoids the effect entirely
      log(st, p.name + ' defends with ' + C(a.cardId).name + '.');
      var hook = (DCENGINE.hooks.defense || {})[a.cardId];
      if (hook) hook(st, p); // moves/keeps the card per its text
      else { p.hand.splice(p.hand.indexOf(a.cardId), 1); p.discards.push(a.cardId); }
    } else { // succumb
      var hooksFa = (DCENGINE.hooks.fa || {})[q.cardId];
      var hooksAtk = (DCENGINE.hooks.attack || {})[q.cardId];
      if (q.fa && hooksFa) hooksFa(st, p, q);
      else if (!q.fa && hooksAtk) hooksAtk(st, p, q);
    }
    if (st.pending) { q.awaiting = true; return; } // choice must resolve first
    advanceTarget(st);
  }

  function advanceTarget(st) {
    var q = st.attackQueue;
    if (!q) return;
    q.targets.shift();
    if (q.targets.length === 0) finishAttack(st);
  }

  function finishAttack(st) {
    var q = st.attackQueue;
    // cross-play collection (Starro / Brainiac): play collected cards
    var fin = (DCENGINE.hooks.finishAttack || {})[q.cardId];
    if (fin) fin(st, q); // hooks read q.collected / q.attacker
    st.attackQueue = null;
  }

  /* ================= gain / buy ================= */
  function gainToDiscards(st, p, id) {
    // standard Gain: from public area to your Discards unless rerouted
    var t = st.turn;
    t.boughtGainedThisTurn.push(id);
    if (typeOf(id) === 'villain') t.villainsBoughtGained++;
    log(st, p.name + ' gains ' + C(id).name + '.');
    // Reroute check (Aquaman persona / Aquaman's Trident / Dark Knight):
    var chk = DCENGINE.hooks.rerouteCheck;
    if (chk) {
      var r = chk(st, p, id);
      if (r) { setPending(st, r); return; } // placement waits for the choice
    }
    p.discards.push(id);
  }

  /* Set a pending choice. If one is already on the table it goes into
   * the per-turn queue and is pumped in after the current one resolves. */
  function setPending(st, obj) {
    if (!st.pending) st.pending = obj;
    else st.turn.pendingQueue.push(obj);
  }

  function gainWeakness(st, p, n) {
    for (var i = 0; i < n; i++) {
      if (st.weaknessStack.length === 0) return; // empty: effect doesn't happen
      st.weaknessStack.pop();
      p.discards.push('weakness');
    }
    log(st, p.name + ' gain' + (n > 1 ? 's' : '') + ' Weakness card' + (n > 1 ? 's' : '') + '.');
  }

  /* ================= clean-up & refill ================= */
  function refillLineup(st) {
    // Overflow cards (index >= 5), added by card effects such as The Anti-Monitor's
    // First Appearance, move into free base slots BEFORE anything is drawn from the
    // Main Deck — a freed slot takes an overlapping card down into the row.
    var moved = true;
    while (moved) {
      moved = false;
      for (var i = 0; i < 5; i++) {
        if (st.lineup[i] === null) {
          for (var k = 5; k < st.lineup.length; k++) {
            if (st.lineup[k] !== null) {
              st.lineup[i] = st.lineup[k];
              st.lineup.splice(k, 1); // drop the vacated overflow position
              log(st, C(st.lineup[i]).name + ' moves into the Line-Up.');
              moved = true;
              break;
            }
          }
        }
      }
    }
    // Only the base 5 slots refill from the Main Deck. Overflow cards are "extra"
    // and do NOT get refilled when they leave (bought/defeated).
    for (var i2 = 0; i2 < 5; i2++) {
      if (st.lineup[i2] === null) takeFromFaceDown(st, 1).forEach(function (c) { st.lineup[i2] = c; });
    }
  }

  function cleanUp(st) {
    var p = st.players[st.turn.idx];
    // unplayed hand -> Discards
    if (p.hand.length) log(st, p.name + ' discards their remaining hand.');
    p.discards.push.apply(p.discards, p.hand.splice(0));

    // Cards held "in use" this turn now go to the owner's Discards.
    if (st.turn.playedCards.length) {
      p.discards.push.apply(p.discards, st.turn.playedCards);
      st.turn.playedCards = [];
    }

    // J'onn: the SV he "played" was never removed from the stack, so it is
    // already on top; nothing to move (defensive check only).
    if (st.turn.jonId && st.svStack[0] !== st.turn.jonId) {
      var j = st.svStack.indexOf(st.turn.jonId);
      if (j >= 0) st.svStack.splice(j, 1);
      st.svStack.unshift(st.turn.jonId);
    }
    if (st.turn.jonId) log(st, C(st.turn.jonId).name + ' returns to the top of the Super-Villain stack.');

    // Emerald Knight borrowed cards return to their Line-Up slots
    st.turn.borrowedLineup.forEach(function (b) {
      if (st.lineup[b.slot] === null) st.lineup[b.slot] = b.id;
    });

    // Ra's Al Ghul: bottom of owner's deck before drawing a new hand
    if (st.turn.rasBottom && p.discards.indexOf('ras-al-ghul') >= 0) {
      p.discards.splice(p.discards.indexOf('ras-al-ghul'), 1);
      p.deck.unshift('ras-al-ghul'); // unshift = bottom (drawn last)
      log(st, "Ra's Al Ghul goes to the bottom of " + p.name + "'s deck.");
    }

    // Wonder Woman persona: extra draws for Villains bought/gained this turn
    if (p.personaId === 'wonder-woman-mc' && !p.faceDown && st.turn.villainsBoughtGained > 0) {
      drawCards(st, p, st.turn.villainsBoughtGained);
      log(st, p.name + "'s Super Hero draws " + st.turn.villainsBoughtGained + ' extra card' + (st.turn.villainsBoughtGained > 1 ? 's' : '') + '.');
    }

    drawCards(st, p, 5);
    refillLineup(st);

    // End-of-turn card effects (e.g. Aquaman's Trident). Runs while this turn's
    // playedIds / boughtGainedThisTurn are still intact, before the next turn starts.
    if (DCENGINE.hooks.endOfTurn) DCENGINE.hooks.endOfTurn(st, p);

    // reset per-turn state
    st.turn = freshTurn((st.turn.idx + 1) % st.players.length);
    // A Super-Villain that emerged last turn fires its First Appearance Attack at the start of this player's turn.
    if (st.pendingFA && !st.over && !st.exhausted) { var faRef = st.pendingFA.ref, faId = st.pendingFA.cardId; st.pendingFA = null; fireAttack(st, faRef, faId, true); }
    if (st.exhausted) endGame(st);
  }

  function endGame(st) {
    st.over = true;
    st.scores = scoreGame(st);
    log(st, 'Main Deck exhausted. Final scores: ' +
      st.players.map(function (p) { return p.name + ' ' + st.scores[p.id]; }).join(', ') + '.');
  }

  /* ================= scoring ================= */
  function countInDeck(p, id) {
    var n = 0; p.deck.forEach(function (c) { if (c === id) n++; }); return n;
  }
  function scoreGame(st) {
    var out = {};
    st.players.forEach(function (p) {
      var total = 0, all = p.hand.concat(p.deck, p.discards, p.locations, p.id === st.turn.idx ? st.turn.playedCards : []); // in-use cards count too (unswept on the SV-defeat ending) — but only for their OWNER; never credit another player's pile
      all.forEach(function (id) {
        var base = C(id).vp;
        if (id === 'bizarro') base = 2 * countInDeck(p, 'weakness'); // REPLACES printed VP
        else if (id === 'suicide-squad') base = countInDeck(p, 'suicide-squad');
        else if (id === 'green-arrow' && countOtherTypeInDeck(p, 'hero', id) >= 4) base = 5;
        else if (id === 'utility-belt' && countOtherTypeInDeck(p, 'equipment', id) >= 4) base = 5;
        total += base;
      });
      out[p.id] = total;
    });
    return out;
  }
  function countOtherTypeInDeck(p, type, exceptId) {
    var n = 0;
    p.deck.forEach(function (c) { if (typeOf(c) === type && c !== exceptId) n++; });
    return n;
  }

  /* ================= actions / doAction API ================= */
  function actions(st) {
    if (st.over) return [];
    var out = [];
    var p = st.players[st.turn.idx];

    if (st.pending) { // a choice is on the table for some player
      return st.pending.actions;
    }
    if (st.attackQueue) {
      var t0 = st.players[st.attackQueue.targets[0]];
      out.push({ kind: 'succumb' });
      defenseCardsInHand(st, t0).forEach(function (c) { out.push({ kind: 'defend', cardId: c }); });
      return out;
    }

    if (st.turn.phase === 'action') {
      p.hand.forEach(function (id) { out.push({ kind: 'play', cardId: id }); });
      out.push({ kind: 'to-buying' });
    } else { // buying
      st.lineup.forEach(function (id, i) { if (id && C(id).cost <= st.turn.power) out.push({ kind: 'buy-lineup', slot: i }); });
      if (!st.turn.kickBoughtThisTurn && st.kickStack.length && 3 <= st.turn.power) out.push({ kind: 'buy-kick' });
      var top = st.svStack[0];
      if (top && !st.turn.svDefeatedThisTurn && !st.turn.jonId && svCost(st, p, top) <= st.turn.power) {
        out.push({ kind: 'defeat-sv', cardId: top });
      }
      if (st.turn.riddlerAvail && st.turn.power >= 3) out.push({ kind: 'riddler-use' });
      if (p.hand.length) out.push({ kind: 'back-to-action' }); // #2: go back and play leftover hand cards
      out.push({ kind: 'end-buying' });
    }
    return out;
  }

  function svCost(st, p, id) {
    var cost = C(id).cost;
    // Green Arrow's Bow stacks: each one played this turn (own or cross-played — both land in
    // playedIds via markPlayed) makes Super-Villains cost 2 less to defeat.
    if (st.turn.playedIds) {
      var bows = st.turn.playedIds.filter(function (x) { return x === 'green-arrows-bow'; }).length;
      cost -= 2 * bows;
    }
    return Math.max(0, cost);
  }

  /* Reveal the new top of the Super-Villain stack and fire its First
   * Appearance—Attack (if any). Deferred by _afterDefeat when the
   * defeated SV's own effect is still waiting on a pending choice. */
  function revealNext(st) {
    var next = st.svStack[0];
    if (next != null) {
      log(st, C(next).name + ' is revealed.');
      var faHook = (DCENGINE.hooks.fa || {})[next];
      if (faHook) st.pendingFA = { cardId: next, ref: st.turn.idx }; // hold until start of next turn
    } else {
      endGame(st); // all Super Villains defeated: game ends immediately
    }
  }

  function doAction(st, a) {
    if (st.over) return st;
    var p = st.players[st.turn.idx];

    if (st.pending) { // resolve the pending choice (validated by its hook)
      DCENGINE.hooks.resolvePending(st, a);
      var t2 = st.turn;
      if (t2._deferredPower) { addPower(st, p, powerOf(st, p, t2._deferredPower)); t2._deferredPower = null; }
      if (!st.pending && t2.pendingQueue.length) st.pending = t2.pendingQueue.shift(); // pump next queued choice
      if (!st.pending && t2._afterDefeat) { t2._afterDefeat = false; revealNext(st); }
      if (!st.pending && st.attackQueue && st.attackQueue.awaiting) { st.attackQueue.awaiting = false; advanceTarget(st); }
      return st;
    }
    if (st.attackQueue) { resolveTarget(st, a); return st; }

    switch (a.kind) {
      case 'play': playCard(st, p, a.cardId); break;
      case 'to-buying':
        // Riddler: unused ability pays out +1 Power instead (once — #2's go-back must not re-pay)
        if (st.turn.riddlerAvail && !st.turn.riddlerUsed && !st.turn.riddlerPaid) { addPower(st, p, 1); st.turn.riddlerPaid = true; }
        st.turn.phase = 'buying';
        break;
      case 'back-to-action': // #2: return to the Action phase to play leftover hand cards
        st.turn.phase = 'action';
        break;
      case 'buy-lineup': {
        var id = st.lineup[a.slot];
        st.lineup[a.slot] = null;
        st.turn.power -= C(id).cost;
        gainToDiscards(st, p, id);
        log(st, p.name + ' buys ' + C(id).name + ' from the Line-Up.');
        break;
      }
      case 'buy-kick': {
        st.kickStack.pop();
        st.turn.kickBoughtThisTurn = true;
        st.turn.power -= 3;
        log(st, p.name + ' buys a Kick.');
        // A Kick is bought this turn, so reroute checks apply to it too.
        st.turn.boughtGainedThisTurn.push('kick');
        var chk2 = DCENGINE.hooks.rerouteCheck;
        if (chk2) { var r2 = chk2(st, p, 'kick'); if (r2) { setPending(st, r2); break; } }
        p.discards.push('kick');
        break;
      }
      case 'defeat-sv': {
        var sv = st.svStack.shift();
        st.turn.power -= svCost(st, p, sv);
        st.turn.svDefeatedThisTurn = true;
        // Defeating acquires the SV (into your Discards) — its top effect now
        // fires when you PLAY it. Reveal the next Super Villain right away.
        p.discards.push(sv);
        st.turn.villainsBoughtGained++; // defeating acquires a Villain -> Wonder Woman's end-of-turn draw (#6)
        log(st, p.name + ' defeats ' + C(sv).name + '.');
        if (sv === 'captain-cold') { // Personas flip back up
          st.players.forEach(function (o) { o.faceDown = false; });
          log(st, 'All Super Heroes flip face up.');
        }
        revealNext(st);
        break;
      }
      case 'riddler-use': {
        st.turn.power -= 3;
        var top = takeFromFaceDown(st, 1)[0];
        if (top != null) {
          st.turn.riddlerUsed = true;
          gainToDiscards(st, p, top);
          log(st, 'The Riddler gains ' + C(top).name + ' from the Main Deck.');
        }
        break;
      }
      case 'end-buying': cleanUp(st); break;
    }
    return st;
  }

  /* ================= public API ================= */
  var api = {
    newGame: newGame,
    actions: actions,
    doAction: doAction,
    cloneState: cloneState,
    scoreGame: scoreGame,
    nextRand: nextRand, // for tests
    hooks: {}           // filled by engine-cards.js
  };

  /* Internal API used only by engine-cards.js (the hooks). */
  api._ = {
    C: C, typeOf: typeOf, log: log, markPlayed: markPlayed,
    reshuffle: reshuffle, drawCards: drawCards, cardDraw: cardDraw,
    addPower: addPower, powerOf: powerOf,
    shuffleInPlace: shuffleInPlace, nextRand: nextRand,
    takeFromFaceDown: takeFromFaceDown, setPending: setPending, refillLineup: refillLineup,
    gainToDiscards: gainToDiscards, gainWeakness: gainWeakness,
    fireAttack: fireAttack, playCross: playCross,
    pushReveal: pushReveal,
    defenseCardsInHand: defenseCardsInHand
  };

  return api;
})();
