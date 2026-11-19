/* ============================================================
 * DC DECKBUILDER — AI OPPONENTS
 * ------------------------------------------------------------
 * Pure policy over the public engine API (window.DCENGINE): given a
 * state, returns one legal action from DCENGINE.actions(st) — it
 * never invents action shapes. Levels: 'easy' | 'medium' | 'hard'.
 * Deterministic: no Math.random; ties break by list order, so a game
 * replays identically per seed. Loaded after engine-cards.js (needs
 * only the public API + DCCARDS). No ES modules — file:// constraint.
 * ============================================================ */
var AI = (function () {
  "use strict";

  function C(id) { return DCCARDS.byId[id]; }
  function vpOf(id) { var c = C(id); return c ? (c.vp || 0) : 0; }
  function costOf(id) { var c = C(id); return c ? (c.cost || 0) : 0; }

  /* VP a player currently controls (hand+deck+discards+locations). */
  function ownedVP(st, p) {
    var n = 0;
    p.hand.concat(p.deck, p.discards, p.locations).forEach(function (id) { n += vpOf(id); });
    return n;
  }

  /* ---- pending choices ---------------------------------------- */
  /* Per-kind direction for "pick a card" choices: 'high' = sacrifice
   * your most valuable card, 'low' = dump your least valuable one. */
  var PICK_HIGH = { lobo: 1, hv: 1, zz: 1, at: 1, ds: 1, tohand: 1, trident: 1 };
  var PICK_LOW = { jkfa: 1, dsfa: 1, amfa: 1, penguin: 1, bifa: 1 };

  function easyPending(acts) {
    var d = null;
    acts.forEach(function (a) { if (a.k === 'done') d = a; });
    return d || acts[0];
  }

  /* Medium/Hard pending brain. Returns one action from `acts`. */
  function pickPending(st, acts) {
    var kind = st.pending.kind;
    var done = null, yes = null;

    /* Reroutes (Dark Knight/Catwoman hand, Trident/Aquaman top):
     * always take — strictly better than the card going to Discards. */
    for (var i = 0; i < acts.length; i++) if (acts[i].k === 'yes') yes = acts[i];
    if (yes) return yes;

    /* King of Atlantis: destroy a discard worth something, else keep
     * the +1 fallback. */
    if (kind === 'koa') {
      var kd = null;
      acts.forEach(function (a) {
        if (a.k === 'dest' && vpOf(a.id) > 0 && (!kd || vpOf(a.id) > vpOf(kd.id))) kd = a;
      });
      return kd || acts[0]; // keep is always listed first
    }

    /* Two-Face: the choice carries no card info — just answer. */
    if (kind === 'tf') return acts[0];

    /* Take-from-Line-Up offers (Emerald Knight / Cheetah / Supergirl /
     * Deathstroke gain): take the most valuable one. */
    if (kind === 'ek' || kind === 'cheetah' || kind === 'sgirl' || kind === 'dsgain') {
      var bt = null;
      acts.forEach(function (a) {
        if (a.k === 'take' && (!bt || vpOf(a.id) > vpOf(bt.id))) bt = a;
      });
      return bt || acts[0];
    }

    /* Anti-Monitor main: destroy the most valuable Line-Up card. */
    if (kind === 'am') {
      var bs = null;
      acts.forEach(function (a) {
        if (a.k === 'take' && (!bs || vpOf(a.id) > vpOf(bs.id))) bs = a;
      });
      return bs || acts[0];
    }

    /* Stateful pickers: choose by value direction. */
    var picks = [];
    acts.forEach(function (a) { if (a.k === 'pick' || a.k === 'dest') picks.push(a); });
    if (picks.length) {
      var high = !!PICK_HIGH[kind], low = !!PICK_LOW[kind];
      var bp = picks[0];
      picks.forEach(function (a) {
        if (high && vpOf(a.id) > vpOf(bp.id)) bp = a;
        else if (low && vpOf(a.id) < vpOf(bp.id)) bp = a;
      });
      return bp;
    }

    /* Fallback: done when offered, else the first option. */
    acts.forEach(function (a) { if (a.k === 'done') done = a; });
    return done || acts[0];
  }

  /* ---- buying phase ------------------------------------------- */
  function lineupId(st, b) { return st.lineup[b.slot]; }

  function easyBuying(acts, st) {
    var cheap = null, endb = null;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.kind === 'buy-lineup') {
        if (!cheap || costOf(lineupId(st, a)) < costOf(lineupId(st, cheap))) cheap = a;
      } else if (a.kind === 'end-buying') endb = a;
    }
    return cheap || endb || acts[0]; // passive: no defeats/kicks/Riddler
  }

  function mediumBuying(acts, st) {
    var defeat = null, bestBuy = null, kick = null, riddler = null, endb = null;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.kind === 'defeat-sv') defeat = a;
      else if (a.kind === 'buy-lineup') {
        /* Best VP-per-cost among affordable Line-Up cards. */
        if (!bestBuy) bestBuy = a;
        else {
          var v1 = vpOf(lineupId(st, a)) * costOf(lineupId(st, bestBuy));
          var v2 = vpOf(lineupId(st, bestBuy)) * costOf(lineupId(st, a));
          if (v1 > v2 || (v1 === v2 && costOf(lineupId(st, a)) < costOf(lineupId(st, bestBuy)))) bestBuy = a;
        }
      } else if (a.kind === 'buy-kick') kick = a;
      else if (a.kind === 'riddler-use') riddler = a;
      else endb = a;
    }
    if (defeat) return defeat; // biggest swing + advances the game
    if (bestBuy) return bestBuy;
    if (riddler) return riddler;
    if (kick) return kick;
    return endb || acts[0];
  }

  /* Hard: simulate each option on a throwaway clone, keep the best. */
  function hardBuying(acts, st) {
    var p = st.players[st.turn.idx], base = ownedVP(st, p);
    var cands = [], i;
    for (i = 0; i < acts.length; i++) {
      var k = acts[i].kind;
      if (k === 'defeat-sv' || k === 'buy-lineup' || k === 'riddler-use' || k === 'buy-kick') cands.push(acts[i]);
    }
    if (!cands.length) return acts[0]; // only end-buying left

    var bestA = null, bestD = -1e9;
    for (i = 0; i < cands.length; i++) {
      var cl = DCENGINE.cloneState(st);
      DCENGINE.doAction(cl, cands[i]);
      var d = ownedVP(cl, cl.players[cl.turn.idx]) - base;
      if (d > bestD) { bestD = d; bestA = cands[i]; } // strict >: first max wins ties
    }
    return bestA || acts[0];
  }

  /* ---- top level ---------------------------------------------- */
  function choose(st, level) {
    var lvl = level || 'medium';
    var acts = DCENGINE.actions(st);
    if (!acts.length) return null; // caller asserts non-empty while running
    var i;

    /* 1) a choice is on the table */
    if (st.pending) return lvl === 'easy' ? easyPending(acts) : pickPending(st, acts);

    /* 2) an attack resolves target-by-target */
    if (st.attackQueue) {
      if (lvl !== 'easy') for (i = 0; i < acts.length; i++) if (acts[i].kind === 'defend') return acts[i];
      for (i = 0; i < acts.length; i++) if (acts[i].kind === 'succumb') return acts[i];
      return acts[0];
    }

    /* 3) Action phase: play cards until the hand is empty */
    if (st.turn.phase === 'action') {
      var plays = [];
      for (i = 0; i < acts.length; i++) if (acts[i].kind === 'play') plays.push(acts[i]);
      if (!plays.length) return acts[0]; // hand empty -> to-buying
      /* Runaway-hand guard: draw-heavy cards (Lex Luthor, The Fastest Man Alive…)
       * can keep refilling the hand so it never drains. If we've already played
       * well past a normal turn, stop and move on to Buying instead of looping. */
      if (st.turn.playedIds && st.turn.playedIds.length >= 15) {
        for (i = 0; i < acts.length; i++) if (acts[i].kind === 'to-buying') return acts[i];
      }
      /* Batmobile is weakest first: don't lead with it unless alone. */
      if (lvl !== 'easy' && plays.length > 1) {
        for (i = 0; i < plays.length; i++) if (plays[i].cardId !== 'batmobile') return plays[i];
      }
      return plays[0];
    }

    /* 4) Buying phase */
    if (lvl === 'easy') return easyBuying(acts, st);
    if (lvl === 'medium') return mediumBuying(acts, st);
    return hardBuying(acts, st);
  }

  return { choose: choose };
})();
