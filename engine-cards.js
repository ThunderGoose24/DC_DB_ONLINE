/* ============================================================
 * DC DECKBUILDER — CARD HOOKS (per-card effects + choices)
 * ------------------------------------------------------------
 * Loaded with plain <script src="engine-cards.js"> after engine.js.
 * Fills DCENGINE.hooks: onPlay / defense / attack / fa / finishAttack
 * / onDefeat / rerouteCheck / afterPlay / resolvePending.
 *
 * Pending-choice framework: any effect that needs a player decision
 * sets st.pending = { kind, actions:[...], ...data }. engine.js's
 * doAction routes the chosen action here via hooks.resolvePending;
 * choices opened while another is on the table are queued in
 * st.turn.pendingQueue and pumped one at a time. Pending objects are
 * plain data (JSON-serializable) — no closures. Stateful pickers keep
 * st.pending alive across picks until their max is reached or the
 * player finishes early; only then does resolvePending clear it.
 * ============================================================ */
(function () {
  "use strict";

  var E = DCENGINE._;
  function C(id) { return DCCARDS.byId[id]; }
  function typeOf(id) { return C(id).type; }
  function log(st, m) { E.log(st, m); }
  function randIdx(st, n) { return Math.floor(E.nextRand(st) * n); }

  /* remove a card from hand or discards (whichever holds it) */
  function removeWhere(p, id) {
    var i = p.hand.indexOf(id);
    if (i >= 0) { p.hand.splice(i, 1); return; }
    i = p.discards.indexOf(id);
    if (i >= 0) p.discards.splice(i, 1);
  }

  /* One pick action per unpicked INSTANCE — duplicate IDs in the pool
   * stay individually pickable (count-based, not membership). */
  function unpickedActs(cands, picked) {
    var avail = {}, used = {};
    cands.forEach(function (id) { avail[id] = (avail[id] || 0) + 1; });
    picked.forEach(function (id) { used[id] = (used[id] || 0) + 1; });
    var acts = [];
    cands.forEach(function (id) { if ((used[id] || 0) < avail[id]) acts.push({ k: 'pick', id: id }); });
    return acts;
  }

  /* actions list for a stateful picker: one per unpicked candidate,
   * plus an explicit "done" when picks have started or it's optional. */
  function pickActs(pend, cands) {
    var acts = unpickedActs(cands, pend.picked);
    if (pend.optional || pend.picked.length > 0) acts.push({ k: 'done' });
    return acts;
  }

  /* same, but the picker must reach its max — no early "done". */
  function mustPickActs(pend, cands) {
    return unpickedActs(cands, pend.picked);
  }

  /* ================= reroute checks (buy/gain time) ============ */
  function rerouteCheck(st, p, id) {
    var t = st.turn;
    // Dark Knight / Catwoman: "you may put a card you bought or gained
    // this turn into your hand" — per-card yes/no at gain time.
    if (t.playedIds.indexOf('dark-knight') >= 0 && t.playedIds.indexOf('catwoman') >= 0)
      return { kind: 'hand', id: id, actions: [{ k: 'yes' }, { k: 'no' }] };
    // Aquaman's Trident is now an END-OF-TURN effect (see endOfTurn), not a per-card reroute.
    // Aquaman persona: cost <=5 only; disabled while face down.
    if (!p.faceDown && p.personaId === 'aquaman-mc' && C(id).cost <= 5)
      return { kind: 'top', id: id, actions: [{ k: 'yes' }, { k: 'no' }] };
    // Solomon Grundy: may put himself on top of his owner's deck.
    if (id === 'solomon-grundy')
      return { kind: 'top', id: id, actions: [{ k: 'yes' }, { k: 'no' }] };
    return null;
  }

  /* ================= passive after-play effects ================ */
  function afterPlay(st, p, id) {
    var t = st.turn;
    if (!p.faceDown) { // Captain Cold flips Personas face down (disabled)
      switch (p.personaId) {
        case 'batman-mc': // +1 Power per Equipment played this turn
          if (typeOf(id) === 'equipment') E.addPower(st, p, 1);
          break;
        case 'superman-mc': { // +1 per DIFFERENT Super Power name
          if (typeOf(id) === 'superpower' && !t._spNames[C(id).name]) {
            t._spNames[C(id).name] = true; E.addPower(st, p, 1);
          }
          break;
        }
        case 'cyborg-mc':
          if (typeOf(id) === 'superpower') {
            if (!t._cybSP) { t._cybSP = true; E.addPower(st, p, 1); }
          } else if (typeOf(id) === 'equipment' && !t._cybEq) {
            t._cybEq = true; E.drawCards(st, p, 1);
            log(st, p.name + "'s Super Hero draws a card.");
          }
          break;
        case 'green-lantern-mc': { // 3+ different names, cost >=1 -> +3 once
          var names = {};
          t.playedIds.forEach(function (x) { if (C(x).cost >= 1) names[C(x).name] = true; });
          if (!t._glAwarded && Object.keys(names).length >= 3) {
            t._glAwarded = true; E.addPower(st, p, 3);
          }
          break;
        }
      }
    }
    // Location ongoing triggers: "your first X on each of your turns"
    var ty = typeOf(id);
    p.locations.forEach(function (loc) {
      var ok = false;
      switch (loc) {
        case 'arkham-asylum': ok = (ty === 'villain'); break;
        case 'fortress-of-solitude': ok = (ty === 'superpower'); break;
        case 'the-batcave': ok = (ty === 'equipment'); break;
        case 'the-watchtower': ok = (ty === 'hero'); break;
        case 'titans-tower': ok = (C(id).cost === 2 || C(id).cost === 3); break;
      }
      if (ok && !t.locFired[loc]) {
        t.locFired[loc] = true;
        E.cardDraw(st, p, 1);
        log(st, C(loc).name + ': ' + p.name + ' draws a card.');
      }
    });
  }

  /* ================= end-of-turn effects ======================== */
  function endOfTurn(st, p) {
    // Aquaman's Trident: "You may put any one card you buy or gain this turn on top of your deck."
    if (st.turn.playedIds.indexOf('aquamans-trident') < 0) return;
    var cands = st.turn.boughtGainedThisTurn.slice();
    if (!cands.length) return; // nothing bought/gained this turn: no choice
    var acts = [{ k: 'skip' }];
    cands.forEach(function (id, i) { acts.push({ k: 'pick', n: i, id: id }); });
    E.setPending(st, { kind: 'trident', owner: p.id, list: cands, actions: acts });
  }

  /* ================= onPlay (Action phase, from hand) ========== */
  var onPlay = {
    'batmobile': function (st, p) { // first card this turn: no +1; draw five
      if (st.turn._isFirstPlay) {
        log(st, p.name + "'s Batmobile is the first card of their turn.");
        p.discards.push.apply(p.discards, p.hand.splice(0));
        E.cardDraw(st, p, 5);
      }
    },
    'kid-flash': function (st, p) { E.cardDraw(st, p, 1); },
    'the-fastest-man-alive': function (st, p) { E.cardDraw(st, p, 2); },
    'super-speed': function (st, p) { E.cardDraw(st, p, 1); },

    'power-ring': function (st, p) { // reveal top of your deck; it stays on top (not discarded)
      if (!p.deck.length) return;
      var top = p.deck[p.deck.length - 1];
      log(st, C(top).name + " is revealed from the top of " + p.name + "'s deck.");
      E.pushReveal(st, top);
    },

    'man-of-steel': function (st, p) { // all Super Powers from discards -> hand
      for (var n = 0; n < p.discards.length; n++) {
        if (typeOf(p.discards[n]) === 'superpower') {
          var id = p.discards.splice(n, 1)[0];
          p.hand.push(id);
          log(st, C(id).name + ' returns to ' + p.name + "'s hand.");
          n--;
        }
      }
    },

    'princess-diana-of-themyscira': function (st, p) { // gain Villains cost<=7
      st.lineup.forEach(function (id, slot) {
        if (id && typeOf(id) === 'villain' && C(id).cost <= 7) {
          st.lineup[slot] = null;
          E.gainToDiscards(st, p, id); // reroute checks apply
        }
      });
    },

    'dark-knight': function (st, p) { // gain ALL Equipment in the Line-Up
      st.lineup.forEach(function (id, slot) {
        if (id && typeOf(id) === 'equipment') {
          st.lineup[slot] = null;
          E.gainToDiscards(st, p, id); // Catwoman hand-reroute checked there
        }
      });
    },

    'emerald-knight': function (st, p) {
      var slots = [];
      st.lineup.forEach(function (id, i) {
        if (id && (typeOf(id) === 'equipment' || typeOf(id) === 'hero' || typeOf(id) === 'superpower')) slots.push(i);
      });
      if (!slots.length) return; // nothing eligible: effect doesn't happen
      var acts = [];
      slots.forEach(function (s) { acts.push({ k: 'take', slot: s, id: st.lineup[s] }); });
      E.setPending(st, { kind: 'ek', actions: acts });
    },

    "jonn-jonzz": function (st, p) { // plays the active SV for you (ruling)
      var sv = st.svStack[0];
      if (!sv) return;
      st.turn.jonId = sv; // un-defeatable for the rest of your turn
      log(st, p.name + " plays " + C(sv).name + " from the stack (no First Appearance—Attack).");
      E.markPlayed(st, p, sv, true); // cross-play triggers count
      var h = (DCENGINE.hooks.onDefeat || {})[sv];
      if (h) h(st, p); // section-1 effects only; card stays atop the stack
    },

    'king-of-atlantis': function (st, p) {
      if (!p.discards.length) return;
      var acts = [{ k: 'keep' }];
      p.discards.forEach(function (id) { acts.push({ k: 'dest', id: id }); });
      E.setPending(st, { kind: 'koa', actions: acts }); // Power deferred by engine
    },

    'lobo': function (st, p) { // may destroy up to two in hand/discards
      var cands = p.hand.concat(p.discards);
      if (!cands.length) return;
      var pend = { kind: 'lobo', picked: [], max: 2, optional: true, pool: cands.slice() };
      pend.actions = pickActs(pend, pend.pool); // options stay stable (snapshot); duplicates re-pickable
      E.setPending(st, pend);
    },

    'heat-vision': function (st, p) { // may destroy one in hand/discards
      if (!p.hand.length && !p.discards.length) return;
      var pend = { kind: 'hv', picked: [], max: 1, optional: true };
      pend.actions = pickActs(pend, p.hand.concat(p.discards));
      E.setPending(st, pend);
    },

    'nth-metal': function (st, p) { // look at top of deck; may destroy it
      if (!p.deck.length) return;
      var top = p.deck[p.deck.length - 1];
      log(st, p.name + " looks at the top card: " + C(top).name + '.');
      E.setPending(st, { kind: 'nth', id: top, actions: [{ k: 'dest' }, { k: 'keep' }] });
    },

    'supergirl': function (st, p) { // may take a Kick from the stack to hand
      if (!st.kickStack.length) return;
      E.setPending(st, { kind: 'sgirl', actions: [{ k: 'take' }, { k: 'skip' }] });
    },

    'the-bat-signal': function (st, p) { // put a Hero from discards -> hand
      var opts = [];
      p.discards.forEach(function (id) { if (typeOf(id) === 'hero') opts.push(id); });
      if (!opts.length) return;
      var acts = [];
      opts.forEach(function (id) { acts.push({ k: 'pick', id: id }); });
      E.setPending(st, { kind: 'tohand', type: 'hero', actions: acts });
    },

    'robin': function (st, p) { // put an Equipment from discards -> hand
      var opts = [];
      p.discards.forEach(function (id) { if (typeOf(id) === 'equipment') opts.push(id); });
      if (!opts.length) return;
      var acts = [];
      opts.forEach(function (id) { acts.push({ k: 'pick', id: id }); });
      E.setPending(st, { kind: 'tohand', type: 'equipment', actions: acts });
    },

    'zatanna-zatara': function (st, p) { // up to two from discards -> bottom of deck
      if (!p.discards.length) return;
      var pend = { kind: 'zz', picked: [], max: 2, optional: true, pool: p.discards.slice() };
      pend.actions = pickActs(pend, pend.pool); // options stay stable (snapshot); duplicates re-pickable
      E.setPending(st, pend);
    },

    'two-face': function (st, p) { // even/odd vs top of deck
      if (!p.deck.length) return;
      var top = p.deck[p.deck.length - 1]; // revealed (not popped yet — resolvePending pops it)
      log(st, C(top).name + " is revealed from the top of " + p.name + "'s deck.");
      E.pushReveal(st, top); // pop out so you can read it; also shown in the choice modal via pend.id
      E.setPending(st, { kind: 'tf', id: top, actions: [{ k: 'even' }, { k: 'odd' }] });
    },

    'clayface': function (st, p) { // choose a card you played this turn; play again
      var list = st.turn.playedIds.filter(function (x) { return x !== 'clayface'; });
      if (!list.length) return;
      var acts = [];
      list.forEach(function (id, i) { acts.push({ k: 'pick', n: i, id: id }); });
      E.setPending(st, { kind: 'cf', list: list, actions: acts });
    },

    'suicide-squad': function (st, p) { // 2 OTHER Suicide Squad played this turn
      var n = st.turn.playedIds.filter(function (x) { return x === 'suicide-squad'; }).length;
      if (n < 3) return; // includes the one just played
      log(st, "Suicide Squad synergy: each foe discards his hand.");
      st.players.forEach(function (o) {
        if (o.id === p.id) return;
        o.discards.push.apply(o.discards, o.hand.splice(0));
      });
    },

    /* Villains whose text contains an Attack clause: playing them opens
     * the attack queue (one target at a time; defend or succumb). */
    'bane': function (st, p) { E.fireAttack(st, p.id, 'bane', false); },
    'harley-quinn': function (st, p) { E.fireAttack(st, p.id, 'harley-quinn', false); },
    'poison-ivy': function (st, p) { E.fireAttack(st, p.id, 'poison-ivy', false); },
    'scarecrow': function (st, p) { E.fireAttack(st, p.id, 'scarecrow', false); },
    'starro': function (st, p) { E.fireAttack(st, p.id, 'starro', false); },

    'the-penguin': function (st, p) { // draw two, then choose and discard exactly two
      E.cardDraw(st, p, 2);
      var pool = p.hand.slice();
      if (!pool.length) return; // nothing left to discard
      var pend = { kind: 'penguin', picked: [], max: Math.min(2, pool.length), pool: pool };
      pend.actions = mustPickActs(pend, pend.pool); // exactly two; options stay stable (snapshot)
      E.setPending(st, pend);
    },

    'cheetah': function (st, p) { // gain any Line-Up card cost <=4
      var slots = [];
      st.lineup.forEach(function (id, i) { if (id && C(id).cost <= 4) slots.push(i); });
      if (!slots.length) return;
      var acts = [{ k: 'skip' }];
      slots.forEach(function (s) { acts.push({ k: 'take', slot: s, id: st.lineup[s] }); });
      E.setPending(st, { kind: 'cheetah', actions: acts });
    },

    'xray-vision': function (st, p) { // foes reveal deck tops; play one cross
      if (st.turn._xrayActive) return; // already resolving an X-Ray Vision cross-play — don't recurse
      var opts = [];
      st.players.forEach(function (o) {
        if (o.id === p.id || !o.deck.length) return;
        var top = o.deck[o.deck.length - 1];
        log(st, C(top).name + " is revealed from " + o.name + "'s deck.");
        if (typeOf(top) !== 'location') opts.push({ owner: o.id, id: top });
      });
      if (!opts.length) return; // nothing eligible to play: effect doesn't happen
      st.turn._xrayActive = true; // set only when a choice is actually opened
      var acts = [];
      opts.forEach(function (o, i) { acts.push({ k: 'pick', n: i, owner: o.owner, id: o.id }); });
      E.setPending(st, { kind: 'xray', actions: acts });
    },

    'the-riddler': function (st, p) { // repeatable pay-3 gain in Buying phase
      st.turn.riddlerAvail = true;
    }
  };

  /* ================= defense cards ============================ */
  function useDefense(st, p, id) { // default: the card goes to Discards
    var i = p.hand.indexOf(id);
    if (i >= 0) p.hand.splice(i, 1);
    p.discards.push(id);
  }

  var defense = {
    'blue-beetle': function (st, p) { /* stays in hand and is reusable */ },
    'lasso-of-truth': function (st, p) { useDefense(st, p, 'lasso-of-truth'); E.cardDraw(st, p, 1); },
    'the-cape-and-cowl': function (st, p) { useDefense(st, p, 'the-cape-and-cowl'); E.cardDraw(st, p, 2); },
    'super-speed': function (st, p) { useDefense(st, p, 'super-speed'); E.cardDraw(st, p, 2); },
    'bulletproof': function (st, p) { // draw one, then MAY destroy a discard
      useDefense(st, p, 'bulletproof');
      E.cardDraw(st, p, 1);
      if (!p.discards.length) return;
      var pend = { kind: 'bp', picked: [], max: 1, optional: true };
      pend.actions = pickActs(pend, p.discards);
      E.setPending(st, pend);
    }
  };

  /* ================= regular Attack text (per target) ======== */
  var attack = {
    'bane': function (st, p) { // each foe chooses and discards a card
      if (!p.hand.length) return;
      var pend = { kind: 'bane', picked: [], max: 1 };
      pend.actions = pickActs(pend, p.hand);
      E.setPending(st, pend);
    },
    'harley-quinn': function (st, p) { // P/V from discards -> top of deck
      var opts = [];
      p.discards.forEach(function (id) { if (id === 'punch' || id === 'vulnerability') opts.push(id); });
      if (!opts.length) return;
      var acts = [];
      opts.forEach(function (id, i) { acts.push({ k: 'pick', n: i, id: id }); });
      E.setPending(st, { kind: 'hq', actions: acts });
    },
    'poison-ivy': function (st, p) { // top of deck discarded; cost>=1 -> Weakness
      if (!p.deck.length) return;
      var top = p.deck.pop();
      p.discards.push(top);
      log(st, C(top).name + " is discarded from the top of " + p.name + "'s deck.");
      E.pushReveal(st, top); // pop out what was revealed (stays in LOG too)
      if (C(top).cost >= 1) E.gainWeakness(st, p, 1);
    },
    'scarecrow': function (st, p) { E.gainWeakness(st, p, 1); },
    'starro': function (st, p, q) { // top discarded; non-Location collected
      if (!p.deck.length) return;
      var top = p.deck.pop();
      p.discards.push(top);
      log(st, C(top).name + " is discarded from the top of " + p.name + "'s deck.");
      E.pushReveal(st, top); // pop out each revealed card so you see what got played this turn
      if (typeOf(top) !== 'location') q.collected.push({ owner: p.id, id: top });
    }
  };

  /* ================= FIRST APPEARANCE—ATTACK (per target) === */
  var fa = {
    'atrocitus': function (st, p) { // random hand card held under the Persona
      if (!p.hand.length) return;
      var id = p.hand.splice(randIdx(st, p.hand.length), 1)[0];
      p.heldUnderPersona.push(id);
      log(st, p.name + " puts a card face down under their Super Hero.");
    },
    'black-manta': function (st, p) { // discard top of own deck; cost>=1 chooses
      if (!p.deck.length) return;
      var top = p.deck.pop();
      log(st, C(top).name + " is discarded from the top of " + p.name + "'s deck.");
      if (C(top).cost >= 1) {
        E.setPending(st, { kind: 'bmfa', id: top, actions: [{ k: 'dest' }, { k: 'hand' }] });
      } else {
        p.discards.push(top); // cost 0: just discards
      }
    },
    'brainiac': function (st, p, q) { // choose two -> shared face-down pool
      if (!p.hand.length) return;
      var max = Math.min(2, p.hand.length);
      var pend = { kind: 'bifa', picked: [], max: max, owner: p.id, pool: p.hand.slice() };
      pend.actions = mustPickActs(pend, pend.pool); // exactly two (or all held); options stay stable
      E.setPending(st, pend);
    },
    'captain-cold': function (st, p) { // Persona face down until defeated
      if (!p.faceDown) { p.faceDown = true; log(st, p.name + "'s Super Hero flips face down."); }
    },
    'darkseid': function (st, p) { // discard two unless a Villain is revealed
      var vIdx = -1;
      for (var i = 0; i < p.hand.length; i++) if (typeOf(p.hand[i]) === 'villain') { vIdx = i; break; }
      if (vIdx >= 0) { log(st, p.name + " reveals a Villain and keeps their hand."); return; }
      var n = Math.min(2, p.hand.length);
      for (var k = 0; k < n; k++) p.discards.push(p.hand.splice(randIdx(st, p.hand.length), 1)[0]);
      log(st, p.name + " discards " + n + ' card' + (n > 1 ? 's' : '') + '.');
    },
    'deathstroke': function (st, p) { // destroy H/SV/E or gain a Weakness
      var opts = [];
      p.hand.concat(p.discards).forEach(function (id) {
        var ty = typeOf(id);
        if (ty === 'hero' || ty === 'superpower' || ty === 'equipment') opts.push({ loc: p.hand.indexOf(id) >= 0 ? 'hand' : 'discards', id: id });
      });
      if (!opts.length) { E.gainWeakness(st, p, 1); return; }
      var acts = [];
      opts.forEach(function (o, i) { acts.push({ k: 'pick', n: i, loc: o.loc, id: o.id }); });
      E.setPending(st, { kind: 'dsfa', actions: acts });
    },
    'lex-luthor': function (st, p) { // a Weakness per Villain in the Line-Up
      var n = 0;
      st.lineup.forEach(function (id) { if (id && typeOf(id) === 'villain') n++; });
      if (n) E.gainWeakness(st, p, n);
    },
    'parallax': function (st, p) { // reveal hand; discard all cost <=2
      var keep = [], dump = [];
      p.hand.forEach(function (id) { if (C(id).cost >= 3) keep.push(id); else dump.push(id); });
      if (dump.length) log(st, p.name + " discards " + dump.length + ' card' + (dump.length > 1 ? 's' : '') + '.');
      p.discards.push.apply(p.discards, dump); // discarded cards go to Discards
      p.hand = keep;
    },
    'sinestro': function (st, p) { // discard one per Hero in hand (flagged read)
      var heroes = p.hand.filter(function (id) { return typeOf(id) === 'hero'; }).length;
      if (!heroes) return;
      var n = Math.min(heroes, p.hand.length);
      for (var i = 0; i < n; i++) {
        p.discards.push(p.hand.splice(randIdx(st, p.hand.length), 1)[0]);
      }
      log(st, p.name + " discards " + n + ' card(s).');
    },
    'the-anti-monitor': function (st, p) { // choose cost>=1 -> the Line-Up
      var opts = [];
      p.hand.forEach(function (id) { if (C(id).cost >= 1) opts.push(id); });
      if (!opts.length) return;
      var acts = [];
      opts.forEach(function (id, i) { acts.push({ k: 'pick', n: i, id: id }); });
      E.setPending(st, { kind: 'amfa', list: p.hand.slice(), actions: acts });
    },
    'the-joker': function (st, p, q) { // a card to the left player's Discards
      if (!p.hand.length) return;
      var left = st.players[(p.id + 1) % st.players.length];
      var acts = [];
      p.hand.forEach(function (id, i) { acts.push({ k: 'pick', n: i, id: id }); });
      E.setPending(st, { kind: 'jkfa', leftIdx: left.id, actions: acts });
    }
  };

  /* ================= finishAttack (after all targets) ========= */
  var finishAttack = {
    'starro': function (st, q) { // play collected cards for the Starro player
      var owner = st.players[q.attacker];
      q.collected.forEach(function (c) { E.playCross(st, owner, c.owner, c.id); });
    },
    'brainiac': function (st, q) { // shuffle pool face down; deal two back each
      var pool = [];
      q.collected.forEach(function (c) { if (c.id) pool.push(c.id); });
      E.shuffleInPlace(st, pool);
      st.players.forEach(function (o) {
        for (var i = 0; i < 2 && pool.length > 0; i++) o.hand.push(pool.pop());
      });
      log(st, 'Brainiac: the chosen cards are shuffled and dealt back.');
    },
    'the-joker': function (st, q) { // recipients put a Weakness atop their deck
      q.collected.forEach(function (c) {
        var r = st.players[c.recipient];
        if (C(c.id).cost >= 1 && st.weaknessStack.length) {
          st.weaknessStack.pop();
          r.deck.push('weakness'); // top of deck = end of array
          log(st, C(c.id).name + " was received by " + r.name + "; a Weakness goes atop their deck.");
        }
      });
    }
  };

  /* ================= onDefeat (Buying phase, for defeater) === */
  var onDefeat = {
    'atrocitus': function (st, p) { // +2; held cards return to deck tops
      E.addPower(st, p, 2);
      st.players.forEach(function (o) {
        if (!o.heldUnderPersona.length) return;
        o.heldUnderPersona.forEach(function (id) { o.deck.push(id); }); // top of deck = end of array
        log(st, o.name + "'s held card" + (o.heldUnderPersona.length > 1 ? 's' : '') + " return to the top of their deck.");
        o.heldUnderPersona = [];
      });
      if (!p.discards.length) return;
      var pend = { kind: 'at', picked: [], max: 2, optional: true, pool: p.discards.slice() };
      pend.actions = pickActs(pend, pend.pool); // options stay stable (snapshot); duplicates re-pickable
      E.setPending(st, pend); // may destroy up to two in discards
    },
    'black-manta': function (st, p) { E.addPower(st, p, 3); E.cardDraw(st, p, 1); },
    'brainiac': function (st, p) { // foes reveal random hand cards; play non-Loc
      st.players.forEach(function (o) {
        if (o.id === p.id || !o.hand.length) return;
        var id = o.hand.splice(randIdx(st, o.hand.length), 1)[0];
        log(st, C(id).name + " is revealed from " + o.name + "'s hand.");
        E.pushReveal(st, id); // pop out every revealed card so any player can see it (stays in LOG)
        if (typeOf(id) !== 'location') {
          E.playCross(st, p, o.id, id); // Power/effects to the defeater
          o.discards.push(id);         // returns to the owner's Discards
        } else {
          o.hand.push(id);            // Location: revealed but not played
        }
      });
    },
    'captain-cold': function (st, p) { // +2, +1 per foe with a Hero in discards
      var n = 2;
      st.players.forEach(function (o) {
        if (o.id === p.id) return;
        o.discards.some(function (c) { if (typeOf(c) === 'hero') { n++; return true; } return false; });
      });
      E.addPower(st, p, n);
    },
    'darkseid': function (st, p) { // may destroy two in hand: +5 else +3
      if (p.hand.length >= 2) {
        var pend = { kind: 'ds', stage: 0, picked: [], max: 2, pool: p.hand.slice() };
        pend.actions = [{ k: 'go' }, { k: 'no' }];
        E.setPending(st, pend);
      } else {
        E.addPower(st, p, 3);
      }
    },
    'deathstroke': function (st, p) { // may gain H/V from Line-Up; else +3
      var slots = [];
      st.lineup.forEach(function (id, i) {
        if (id && (typeOf(id) === 'hero' || typeOf(id) === 'villain')) slots.push(i);
      });
      if (!slots.length) { E.addPower(st, p, 3); return; }
      var acts = [{ k: 'skip' }];
      slots.forEach(function (s) { acts.push({ k: 'take', slot: s, id: st.lineup[s] }); });
      E.setPending(st, { kind: 'dsgain', actions: acts });
    },
    'lex-luthor': function (st, p) { E.cardDraw(st, p, 3); },
    'parallax': function (st, p) { // double your Power this turn
      st.turn.power *= 2;
      log(st, "Parallax doubles " + p.name + "'s Power to " + st.turn.power + '.');
    },
    "ras-al-ghul": function (st, p) { // +3; bottom of deck at end of turn
      E.addPower(st, p, 3);
      st.turn.rasBottom = true;
    },
    'sinestro': function (st, p) { // top of main deck: Hero -> +3 & destroy
      var got = E.takeFromFaceDown(st, 1)[0];
      if (!got) return; // exhausted pile: nothing revealed
      log(st, C(got).name + " is revealed from the Main Deck.");
      E.pushReveal(st, got); // pop out the revealed main-deck card (stays in LOG too)
      if (typeOf(got) === 'hero') { E.addPower(st, p, 3); st.destroyed.push(got); }
      else p.hand.push(got);
    },
    'the-anti-monitor': function (st, p) { // +2; destroy Line-Up cards, replace
      E.addPower(st, p, 2);
      var cands = [];
      st.lineup.forEach(function (id, s) { if (id !== null) cands.push({ slot: s, id: id }); });
      if (!cands.length) return;
      var pend = { kind: 'am', picked: [], optional: true };
      pend.actions = amActs(st, pend);
      E.setPending(st, pend);
    },
    'the-joker': function (st, p) { // +2; each foe chooses disc vs you draw
      E.addPower(st, p, 2);
      var foes = [];
      st.players.forEach(function (o) { if (o.id !== p.id) foes.push(o.id); });
      if (!foes.length) return;
      E.setPending(st, { kind: 'jkm', idx: 0, foes: foes, actions: [{ k: 'disc' }, { k: 'draw' }] });
    }
  };

  /* Anti-Monitor pending actions (slot-based, so duplicates are safe). */
  function amActs(st, pend) {
    var acts = [];
    st.lineup.forEach(function (id, s) { if (id !== null && pend.picked.indexOf(s) < 0) acts.push({ k: 'take', slot: s, id: id }); });
    acts.push({ k: 'done' });
    return acts;
  }

  /* ================= resolvePending (the dispatcher) ========== */
  function resolvePending(st, a) {
    var pend = st.pending;
    if (!pend || !a) return;
    // Attack/defense choices belong to the TARGET being resolved (the
    // defender / attacked player), not the attacker's turn player. The Joker's
    // per-foe choice belongs to that FOE; Aquaman's Trident (end of turn) belongs
    // to the player who played it, even though st.turn has already advanced. Every
    // other pending belongs to the turn player playing their own cards.
    var ownerIdx = st.turn.idx;
    if (pend.kind === 'trident') ownerIdx = pend.owner;
    else if (pend.kind === 'jkm') ownerIdx = pend.foes[pend.idx];
    else if (st.attackQueue && st.attackQueue.awaiting) ownerIdx = st.attackQueue.targets[0];
    var p = st.players[ownerIdx];
    var keepPending = false;

    switch (pend.kind) {
      case 'top': // Aquaman persona / Trident / Solomon Grundy
        if (a.k === 'yes') { p.deck.push(pend.id); log(st, C(pend.id).name + " goes on top of " + p.name + "'s deck."); }
        else p.discards.push(pend.id);
        break;

      case 'hand': // Dark Knight / Catwoman: into your hand?
        if (a.k === 'yes') { p.hand.push(pend.id); log(st, C(pend.id).name + " goes into " + p.name + "'s hand."); }
        else p.discards.push(pend.id);
        break;

      case 'trident': // Aquaman's Trident (end of turn): one bought/gained card -> top of deck
        if (a.k === 'skip') break; // leave everything in Discards
        removeWhere(p, a.id); p.deck.push(a.id);
        log(st, C(a.id).name + " goes on top of " + p.name + "'s deck.");
        break;

      case 'tohand': // Bat-Signal / Robin: pick one from Discards
        removeWhere(p, a.id);
        p.hand.push(a.id);
        log(st, C(a.id).name + " goes into " + p.name + "'s hand.");
        break;

      case 'koa': // King of Atlantis: destroy or keep (+3 / +1 deferred)
        if (a.k === 'dest') {
          st.turn._koa = true;
          removeWhere(p, a.id);
          st.destroyed.push(a.id);
          log(st, C(a.id).name + " is destroyed.");
        }
        break;

      case 'ek': { // Emerald Knight: take from Line-Up, play it
        var ek = pend.actions.filter(function (x) { return x.k === 'take' && x.slot === a.slot; })[0];
        st.lineup[a.slot] = null;
        st.turn.borrowedLineup.push({ slot: a.slot, id: ek.id });
        E.playCross(st, p, p.id, ek.id); // effects/Power to the player
        break;
      }

      case 'cheetah':
        if (a.k === 'take') { st.lineup[a.slot] = null; E.gainToDiscards(st, p, a.id); }
        break;

      case 'xray': { // cross-play the revealed card; it stays atop owner's deck
        E.playCross(st, p, a.owner, a.id);
        st.turn._xrayActive = false; // allow any later X-Ray Vision this turn to trigger normally
        break;
      }

      case 'tf': { // Two-Face: even/odd vs top of deck (0 is even)
          var top = p.deck.pop();
          if (top == null) break; // deck emptied before this resolved; nothing to peek
          var match = (a.k === 'even') ? (C(top).cost % 2 === 0) : (C(top).cost % 2 === 1);
          if (match) { p.hand.push(top); log(st, C(top).name + " is drawn to the hand."); }
          else { p.discards.push(top); log(st, C(top).name + " is discarded."); }
        break;
      }

      case 'sgirl': // Supergirl: Kick from stack to hand?
        if (a.k === 'take') { st.kickStack.pop(); p.hand.push('kick'); log(st, p.name + " takes a Kick into their hand."); }
        break;

      case 'nth': // Nth Metal: destroy the peeked top card?
        if (a.k === 'dest') { p.deck.pop(); st.destroyed.push(pend.id); log(st, C(pend.id).name + " is destroyed."); }
        break;

      case 'cf': { // Clayface: play a card you played this turn — again
        var cid = pend.list[a.n];
        E.playCross(st, p, p.id, cid); // it sits in your Discards; stays there
        break;
      }

      /* ---- stateful pickers (pick / done) ---- */
      case 'lobo': // destroy up to two from hand+discards (options stay stable via snapshot pool)
        if (a.k === 'done') break;
        removeWhere(p, a.id); st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = pickActs(pend, pend.pool); }
        break;

      case 'hv': // Heat Vision: destroy one from hand+discards
        if (a.k === 'done') break;
        removeWhere(p, a.id); st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        pend.picked.push(a.id);
        break;

      case 'zz': // Zatanna: up to two from discards -> bottom of deck (options stay stable via snapshot pool)
        if (a.k === 'done') break;
        removeWhere(p, a.id); p.deck.unshift(a.id); log(st, C(a.id).name + " goes on the bottom of " + p.name + "'s deck.");
        pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = pickActs(pend, pend.pool); }
        break;

      case 'penguin': { // draw two, then choose and discard exactly two (options stay stable via snapshot)
        pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = mustPickActs(pend, pend.pool); }
        else {
          pend.picked.forEach(function (x) { var i = p.hand.indexOf(x); if (i >= 0) p.hand.splice(i, 1); p.discards.push(x); });
          log(st, p.name + " discards their chosen cards.");
        }
        break;
      }

      case 'ds': // Darkseid: destroy exactly two from hand -> +5 else +3 (options stay stable via snapshot pool)
        if (a.k === 'no') { E.addPower(st, p, 3); break; }
        if (a.k === 'go') { pend.stage = 1; keepPending = true; pend.actions = mustPickActs(pend, pend.pool); break; }
        if (a.k === 'done') break; // unreachable: no done is offered
        removeWhere(p, a.id); st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = mustPickActs(pend, pend.pool); }
        else E.addPower(st, p, 5);
        break;

      case 'am': { // Anti-Monitor: destroy Line-Up cards, then replace them
        if (a.k === 'done') {
          var done2 = [];
          pend.picked.forEach(function (s) { done2.push(s); });
          done2.forEach(function (s) {
            st.destroyed.push(st.lineup[s]); log(st, C(st.lineup[s]).name + " is destroyed from the Line-Up.");
            st.lineup[s] = null;
            var got = E.takeFromFaceDown(st, 1)[0]; // replace them
            if (got != null) st.lineup[s] = got;
          });
        } else {
          pend.picked.push(a.slot);
          keepPending = true;
          pend.actions = amActs(st, pend);
        }
        break;
      }

      case 'bifa': // Brainiac FA: chosen cards go to the shared pool (options stay stable via snapshot pool)
        if (a.k === 'done') { bifaDone(st, pend); break; }
        removeWhere(p, a.id); pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = mustPickActs(pend, pend.pool); }
        else bifaDone(st, pend);
        break;

      case 'dsfa': // Deathstroke FA: destroy the chosen H/SV/E card
        if (a.loc === 'hand') { var hi = p.hand.indexOf(a.id); if (hi >= 0) p.hand.splice(hi, 1); }
        else { var di = p.discards.indexOf(a.id); if (di >= 0) p.discards.splice(di, 1); }
        st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        break;

      case 'amfa': { // Anti-Monitor FA: chosen card -> the Line-Up
        var ai = p.hand.indexOf(a.id);
        if (ai >= 0) p.hand.splice(ai, 1);
        var slot3 = st.lineup.indexOf(null);
        if (slot3 >= 0) { st.lineup[slot3] = a.id; log(st, C(a.id).name + " is added to the Line-Up."); }
        else { st.lineup.push(a.id); log(st, C(a.id).name + " is added to the Line-Up (overlapping - no free slot)."); }
        break;
      }

      case 'jkfa': // Joker FA: card to the left player's Discards
        var jid = p.hand.indexOf(a.id);
        if (jid >= 0) p.hand.splice(jid, 1);
        st.players[pend.leftIdx].discards.push(a.id);
        log(st, C(a.id).name + " goes to " + st.players[pend.leftIdx].name + "'s Discards.");
        st.attackQueue.collected.push({ recipient: pend.leftIdx, id: a.id });
        break;

      case 'bmfa': // Black Manta FA: destroy it OR discard your hand
        if (a.k === 'dest') { st.destroyed.push(pend.id); log(st, C(pend.id).name + " is destroyed."); }
        else { p.discards.push(pend.id); p.discards.push.apply(p.discards, p.hand.splice(0)); log(st, p.name + " discards their hand."); }
        break;

      case 'jkm': // The Joker main: per-foe discard-or-you-draw sequence
        var foe = st.players[pend.foes[pend.idx]];
        if (a.k === 'disc' && foe.hand.length) {
          foe.discards.push(foe.hand.splice(randIdx(st, foe.hand.length), 1)[0]);
          log(st, foe.name + " discards a random card.");
        } else {
          var jokerP = st.players[st.turn.idx]; // "you" = the player who used The Joker (not the foe)
          E.cardDraw(st, jokerP, 1);
          log(st, jokerP.name + " draws a card instead.");
        }
        pend.idx++;
        if (pend.idx < pend.foes.length) keepPending = true;
        break;

      case 'bane': // Bane: chosen card goes to their Discards
        removeWhere(p, a.id); p.discards.push(a.id); log(st, C(a.id).name + " is discarded.");
        break;

      case 'hq': { // Harley Quinn: P/V from discards -> top of deck
        var hid = p.discards.indexOf(a.id);
        if (hid >= 0) p.discards.splice(hid, 1);
        p.deck.push(a.id); // top of deck
        log(st, C(a.id).name + " goes on top of " + p.name + "'s deck.");
        break;
      }

      case 'bp': // Bulletproof: may destroy a discard after defending
        if (a.k === 'done') break;
        removeWhere(p, a.id); st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        pend.picked.push(a.id);
        break;

      case 'dsgain': // Deathstroke: gain the chosen Line-Up card
        if (a.k === 'take') { st.lineup[a.slot] = null; E.gainToDiscards(st, p, a.id); }
        else E.addPower(st, p, 3);
        break;

      case 'at': // Atrocitus: destroy up to two from discards (options stay stable via snapshot pool)
        if (a.k === 'done') break;
        removeWhere(p, a.id); st.destroyed.push(a.id); log(st, C(a.id).name + " is destroyed.");
        pend.picked.push(a.id);
        if (pend.picked.length < pend.max) { keepPending = true; pend.actions = pickActs(pend, pend.pool); }
        break;
    }

    if (!keepPending) st.pending = null; // completed (stateful ones refresh above)
  }

  function bifaDone(st, pend) {
    var q = st.attackQueue;
    pend.picked.forEach(function (x) { q.collected.push({ owner: pend.owner, id: x }); });
  }

  /* ================= wire up ================================ */
  DCENGINE.hooks.onPlay = onPlay;
  DCENGINE.hooks.defense = defense;
  DCENGINE.hooks.attack = attack;
  DCENGINE.hooks.fa = fa;
  DCENGINE.hooks.finishAttack = finishAttack;
  DCENGINE.hooks.onDefeat = onDefeat;
  DCENGINE.hooks.rerouteCheck = rerouteCheck;
  DCENGINE.hooks.endOfTurn = endOfTurn;
  DCENGINE.hooks.afterPlay = afterPlay;
  DCENGINE.hooks.resolvePending = resolvePending;

})();
