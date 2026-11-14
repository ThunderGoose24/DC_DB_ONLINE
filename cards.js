/* ============================================================
 * DC DECKBUILDER — CARD DATABASE (base set, 2012 Cryptozoic/CZE)
 * ------------------------------------------------------------
 * Single source of truth for all card data. Loaded by plain
 * <script src="cards.js"> (no ES modules — file:// constraint).
 * Exposes window.DCCARDS = { cards, byId, set, totals }.
 *
 * Fields per design:
 *   id      slug matching assets/cards/<id>.jpg
 *   name    printed card title
 *   type    persona | equipment | hero | villain | sv | superpower
 *           | location | starter | weakness
 *   cost    bottom-right badge (Power needed to purchase)
 *   vp      bottom-left star (Victory Points; -1 for Weakness)
 *   text    full verbatim body text as printed (unlabeled section,
 *           including Defense/Attack clauses and parentheticals);
 *           "\n" separates printed paragraphs
 *   fa      FIRST APPEARANCE—ATTACK text (Super Villains only), null otherwise
 *   ongoing Location per-turn trigger (Locations only), null otherwise
 *
 * The DATA block below is strict JSON — keep it parseable by tooling.
 * ============================================================ */
var DCCARDS = (function () {
  "use strict";

  var DATA = /*JSON*/[
    {"id":"aquaman-mc","name":"Aquaman","type":"persona","cost":0,"vp":0,
     "text":"You may put any cards with cost 5 or less you buy or gain during your turn on top of your deck.","fa":null,"ongoing":null},
    {"id":"batman-mc","name":"Batman","type":"persona","cost":0,"vp":0,
     "text":"+1 Power for each Equipment you play during your turn.","fa":null,"ongoing":null},
    {"id":"cyborg-mc","name":"Cyborg","type":"persona","cost":0,"vp":0,
     "text":"If you play one or more Super Powers during your turn, +1 Power.\nIf you play one or more Equipment during your turn, draw a card.","fa":null,"ongoing":null},
    {"id":"green-lantern-mc","name":"Green Lantern","type":"persona","cost":0,"vp":0,
     "text":"If you play three or more cards with different names and cost 1 or more during your turn, +3 Power.","fa":null,"ongoing":null},
    {"id":"superman-mc","name":"Superman","type":"persona","cost":0,"vp":0,
     "text":"+1 Power for each different Super Power you play during your turn.","fa":null,"ongoing":null},
    {"id":"the-flash-mc","name":"The Flash","type":"persona","cost":0,"vp":0,
     "text":"You go first.\nThe first time a card tells you to draw one or more cards during each of your turns, draw an additional card.","fa":null,"ongoing":null},
    {"id":"wonder-woman-mc","name":"Wonder Woman","type":"persona","cost":0,"vp":0,
     "text":"For each Villain you buy or gain during your turn, draw an extra card at the end of your turn.","fa":null,"ongoing":null},

    {"id":"aquamans-trident","name":"Aquaman's Trident","type":"equipment","cost":3,"vp":1,
     "text":"+2 Power\nYou may put any one card you buy or gain this turn on top of your deck.","fa":null,"ongoing":null},
    {"id":"batmobile","name":"Batmobile","type":"equipment","cost":2,"vp":1,
     "text":"If this is the first card you play this turn, discard your hand and draw five cards.\nOtherwise, +1 Power.","fa":null,"ongoing":null},
    {"id":"green-arrows-bow","name":"Green Arrow's Bow","type":"equipment","cost":4,"vp":1,
     "text":"+2 Power\nSuper-Villains cost you 2 less to defeat this turn.","fa":null,"ongoing":null},
    {"id":"lasso-of-truth","name":"Lasso of Truth","type":"equipment","cost":2,"vp":1,
     "text":"+1 Power\nDefense: You may discard this card to avoid an Attack.\nIf you do, draw a card.","fa":null,"ongoing":null},
    {"id":"nth-metal","name":"Nth Metal","type":"equipment","cost":3,"vp":1,
     "text":"+1 Power\nLook at the top card of your deck. You may destroy it.","fa":null,"ongoing":null},
    {"id":"power-ring","name":"Power Ring","type":"equipment","cost":3,"vp":1,
     "text":"Reveal the top card of your deck.\nIf its cost is 1 or greater, +3 Power.\nOtherwise, +2 Power.","fa":null,"ongoing":null},
    {"id":"the-bat-signal","name":"The Bat-Signal","type":"equipment","cost":5,"vp":1,
     "text":"+1 Power\nPut a Hero from your discard pile into your hand.","fa":null,"ongoing":null},
    {"id":"the-cape-and-cowl","name":"The Cape and Cowl","type":"equipment","cost":4,"vp":1,
     "text":"+2 Power\nDefense: You may discard this card to avoid an Attack.\nIf you do, draw two cards.","fa":null,"ongoing":null},
    {"id":"utility-belt","name":"Utility Belt","type":"equipment","cost":5,"vp":1,
     "text":"+2 Power\nAt the end of the game, if you have four or more other Equipment in your deck, this card is worth 5 VPs.","fa":null,"ongoing":null},

    {"id":"blue-beetle","name":"Blue Beetle","type":"hero","cost":6,"vp":2,
     "text":"+3 Power\nDefense: You may reveal this card from your hand to avoid an Attack. (It stays in your hand.)","fa":null,"ongoing":null},
    {"id":"catwoman","name":"Catwoman","type":"hero","cost":2,"vp":1,
     "text":"+2 Power","fa":null,"ongoing":null},
    {"id":"dark-knight","name":"Dark Knight","type":"hero","cost":5,"vp":1,
     "text":"+2 Power\nGain all Equipment in the Line-Up. Then, if you play or have played Catwoman this turn, you may put a card you bought or gained this turn into your hand.","fa":null,"ongoing":null},
    {"id":"emerald-knight","name":"Emerald Knight","type":"hero","cost":5,"vp":1,
     "text":"Remove an Equipment, Hero, or Super Power from the Line-Up.\nPlay it, then return it to the Line-Up at the end of your turn.","fa":null,"ongoing":null},
    {"id":"green-arrow","name":"Green Arrow","type":"hero","cost":5,"vp":1,
     "text":"+2 Power\nAt the end of the game, if you have four or more other Heroes in your deck, this card is worth 5 VPs.","fa":null,"ongoing":null},
    {"id":"high-tech-hero","name":"High-Tech Hero","type":"hero","cost":3,"vp":1,
     "text":"+1 Power\nIf you play or have played a Super Power or Equipment this turn, additional +2 Power.","fa":null,"ongoing":null},
    {"id":"jonn-jonzz","name":"J'onn J'onzz","type":"hero","cost":6,"vp":2,
     "text":"Play the top card of the Super-Villain stack,\nthen return it to the top of the stack.\n(The First Appearance—Attack does not happen.)","fa":null,"ongoing":null},
    {"id":"kid-flash","name":"Kid Flash","type":"hero","cost":2,"vp":1,
     "text":"Draw a card.","fa":null,"ongoing":null},
    {"id":"king-of-atlantis","name":"King of Atlantis","type":"hero","cost":5,"vp":1,
     "text":"You may destroy a card in your discard pile. If you do, +3 Power.\nOtherwise, +1 Power.","fa":null,"ongoing":null},
    {"id":"man-of-steel","name":"Man of Steel","type":"hero","cost":8,"vp":3,
     "text":"+3 Power\nPut all Super Powers from your discard pile into your hand.","fa":null,"ongoing":null},
    {"id":"mera","name":"Mera","type":"hero","cost":3,"vp":1,
     "text":"If your discard pile is empty, +4 Power.\nOtherwise, +2 Power.","fa":null,"ongoing":null},
    {"id":"princess-diana-of-themyscira","name":"Princess Diana of Themyscira","type":"hero","cost":7,"vp":2,
     "text":"Gain all Villains with cost 7 or less in the Line-Up.","fa":null,"ongoing":null},
    {"id":"robin","name":"Robin","type":"hero","cost":3,"vp":1,
     "text":"+1 Power\nPut an Equipment from your discard pile into your hand.","fa":null,"ongoing":null},
    {"id":"supergirl","name":"Supergirl","type":"hero","cost":4,"vp":1,
     "text":"You may put a Kick card from the Kick stack into your hand.","fa":null,"ongoing":null},
    {"id":"swamp-thing","name":"Swamp Thing","type":"hero","cost":4,"vp":1,
     "text":"If you control a Location, +5 Power.\nOtherwise, +2 Power.","fa":null,"ongoing":null},
    {"id":"the-fastest-man-alive","name":"The Fastest Man Alive","type":"hero","cost":5,"vp":1,
     "text":"Draw two cards.","fa":null,"ongoing":null},
    {"id":"zatanna-zatara","name":"Zatanna Zatara","type":"hero","cost":4,"vp":1,
     "text":"+1 Power\nYou may put up to two cards from your discard pile on the bottom of your deck.","fa":null,"ongoing":null},

    {"id":"bane","name":"Bane","type":"villain","cost":4,"vp":1,
     "text":"+2 Power\nAttack: Each foe chooses and discards a card.","fa":null,"ongoing":null},
    {"id":"bizarro","name":"Bizarro","type":"villain","cost":7,"vp":1,
     "text":"+3 Power\nAt the end of the game, this card is worth 2 VPs for each Weakness in your deck.","fa":null,"ongoing":null},
    {"id":"cheetah","name":"Cheetah","type":"villain","cost":2,"vp":1,
     "text":"Gain any card with cost 4 or less from the Line-Up.","fa":null,"ongoing":null},
    {"id":"clayface","name":"Clayface","type":"villain","cost":4,"vp":1,
     "text":"Choose a card you played this turn. Play it again. (Effects and Power generated the first time you played it remain.)","fa":null,"ongoing":null},
    {"id":"doomsday","name":"Doomsday","type":"villain","cost":6,"vp":2,
     "text":"+4 Power","fa":null,"ongoing":null},
    {"id":"gorilla-grodd","name":"Gorilla Grodd","type":"villain","cost":5,"vp":2,
     "text":"+3 Power","fa":null,"ongoing":null},
    {"id":"harley-quinn","name":"Harley Quinn","type":"villain","cost":2,"vp":1,
     "text":"+1 Power\nAttack: Each foe puts a Punch or Vulnerability from his discard pile on top of his deck.","fa":null,"ongoing":null},
    {"id":"lobo","name":"Lobo","type":"villain","cost":7,"vp":2,
     "text":"+3 Power\nYou may destroy up to two cards in your hand and/or discard pile.","fa":null,"ongoing":null},
    {"id":"poison-ivy","name":"Poison Ivy","type":"villain","cost":3,"vp":1,
     "text":"+1 Power\nAttack: Each foe discards the top card of his deck.\nIf its cost is 1 or greater, that player gains a Weakness.","fa":null,"ongoing":null},
    {"id":"scarecrow","name":"Scarecrow","type":"villain","cost":5,"vp":1,
     "text":"+2 Power\nAttack: Each foe gains a Weakness.","fa":null,"ongoing":null},
    {"id":"solomon-grundy","name":"Solomon Grundy","type":"villain","cost":6,"vp":2,
     "text":"When you buy or gain this Villain, you may put him on top of your deck.\n+3 Power","fa":null,"ongoing":null},
    {"id":"starro","name":"Starro","type":"villain","cost":7,"vp":2,
     "text":"Attack: Each foe discards the top card of his deck.\nPlay all non-Location cards discarded this way.","fa":null,"ongoing":null},
    {"id":"suicide-squad","name":"Suicide Squad","type":"villain","cost":4,"vp":1,
     "text":"+2 Power\nIf you already played two other Suicide Squad cards this turn, each foe discards his hand.\nAt the end of the game, this card is worth 1 VP for each Suicide Squad in your deck.","fa":null,"ongoing":null},
    {"id":"the-penguin","name":"The Penguin","type":"villain","cost":3,"vp":1,
     "text":"Draw two cards, then choose and discard two cards from your hand.","fa":null,"ongoing":null},
    {"id":"the-riddler","name":"The Riddler","type":"villain","cost":3,"vp":1,
     "text":"You may pay 3 Power. If you do, gain the top card of the main deck.\nUse this ability any number of times this turn.\nIf you choose not to, +1 Power instead.","fa":null,"ongoing":null},
    {"id":"two-face","name":"Two-Face","type":"villain","cost":2,"vp":1,
     "text":"+1 Power\nChoose even or odd, then reveal the top card of your deck.\nIf its cost matches your choice, draw it. If not, discard it.\n(0 is even.)","fa":null,"ongoing":null},

    {"id":"atrocitus","name":"Atrocitus","type":"sv","cost":10,"vp":5,
     "text":"+2 Power\nDestroy up to two cards in your discard pile.",
     "fa":"Each player puts a random card from his hand under his Super Hero. When this Villain is defeated, put each of those cards on top of its owner's deck.","ongoing":null},
    {"id":"black-manta","name":"Black Manta","type":"sv","cost":8,"vp":4,
     "text":"+3 Power and draw a card.",
     "fa":"Each player discards the top card of his deck. If you discarded a card with cost 1 or more, choose one: Destroy it; or discard your hand.","ongoing":null},
    {"id":"brainiac","name":"Brainiac","type":"sv","cost":11,"vp":6,
     "text":"Each foe reveals a random card from his hand. Play each revealed non-Location.",
     "fa":"Each player chooses two cards from his hand and puts them on the table face down.\nShuffle all of the chosen cards face down,\nthen deal two back to each player at random.","ongoing":null},
    {"id":"captain-cold","name":"Captain Cold","type":"sv","cost":9,"vp":5,
     "text":"+2 Power, and an additional +1 Power for each foe with a Hero in his discard pile.",
     "fa":"Each player flips his Super Hero face down until this Villain is defeated.","ongoing":null},
    {"id":"darkseid","name":"Darkseid","type":"sv","cost":11,"vp":6,
     "text":"You may destroy two cards in your hand. If you do, +5 Power.\nOtherwise, +3 Power.",
     "fa":"Each player discards two cards unless he reveals a Villain from his hand.","ongoing":null},
    {"id":"deathstroke","name":"Deathstroke","type":"sv","cost":9,"vp":5,
     "text":"You may gain a Hero or Villain from the Line-Up. If you don't,\n+3 Power.",
     "fa":"Each player reveals their hand and destroys a Hero, Super Power or Equipment in their hand or discard pile.\nEach who cannot gains a Weakness.","ongoing":null},
    {"id":"lex-luthor","name":"Lex Luthor","type":"sv","cost":10,"vp":5,
     "text":"Draw three cards.",
     "fa":"Each player gains a Weakness for each Villain in the Line-Up.","ongoing":null},
    {"id":"parallax","name":"Parallax","type":"sv","cost":12,"vp":6,
     "text":"Double your Power this turn.",
     "fa":"Each player reveals his hand and discards all cards with cost 2 or less.","ongoing":null},
    {"id":"ras-al-ghul","name":"Ra's Al Ghul","type":"sv","cost":8,"vp":4,
     "text":"+3 Power\nAt the end of your turn, put this card on the bottom of its owner's deck before drawing a new hand.\n(This card starts the game on top of the Super-Villain stack.)",
     "fa":null,"ongoing":null},
    {"id":"sinestro","name":"Sinestro","type":"sv","cost":10,"vp":5,
     "text":"Reveal the top card of the main deck. If it's a Hero, +3 Power and then destroy it.\nOtherwise, put it into your hand.",
     "fa":"Each player reveals his hand and discards a card for each Hero he revealed this way.","ongoing":null},
    {"id":"the-anti-monitor","name":"The Anti-Monitor","type":"sv","cost":12,"vp":6,
     "text":"+2 Power\nDestroy any number of cards in the Line-Up, then replace them.",
     "fa":"Each player reveals his hand,\nchooses a card with cost 1 or greater from it,\nand adds that card to the Line-Up.","ongoing":null},
    {"id":"the-joker","name":"The Joker","type":"sv","cost":10,"vp":5,
     "text":"+2 Power and each foe chooses: He discards a random card;\nor you draw a card.",
     "fa":"Each player puts a card from his hand into the discard pile of the player on his left.\nIf the card you received has a cost of 1 or greater, put a Weakness on top of your deck.","ongoing":null},

    {"id":"bulletproof","name":"Bulletproof","type":"superpower","cost":4,"vp":1,
     "text":"+2 Power\nDefense: You may discard this card to avoid an Attack.\nIf you do, draw a card and you may destroy a card in your discard pile.","fa":null,"ongoing":null},
    {"id":"heat-vision","name":"Heat Vision","type":"superpower","cost":6,"vp":2,
     "text":"+3 Power\nYou may destroy a card in your hand or discard pile.","fa":null,"ongoing":null},
    {"id":"kick","name":"Kick","type":"superpower","cost":3,"vp":1,
     "text":"+2 Power","fa":null,"ongoing":null},
    {"id":"super-speed","name":"Super Speed","type":"superpower","cost":3,"vp":1,
     "text":"Draw a card.\nDefense: You may discard this card to avoid an Attack.\nIf you do, draw two cards.","fa":null,"ongoing":null},
    {"id":"super-strength","name":"Super Strength","type":"superpower","cost":7,"vp":2,
     "text":"+5 Power","fa":null,"ongoing":null},
    {"id":"xray-vision","name":"X-Ray Vision","type":"superpower","cost":3,"vp":1,
     "text":"Each foe reveals the top card of his deck. Choose a non-Location card revealed this way, play it,\nthen return it to the top of its owner's deck.","fa":null,"ongoing":null},

    {"id":"arkham-asylum","name":"Arkham Asylum","type":"location","cost":5,"vp":1,
     "text":"When you play this card, leave it in front of you for the rest of the game.",
     "fa":null,"ongoing":"When you play your first Villain on each of your turns, draw a card."},
    {"id":"fortress-of-solitude","name":"Fortress of Solitude","type":"location","cost":5,"vp":1,
     "text":"When you play this card, leave it in front of you for the rest of the game.",
     "fa":null,"ongoing":"When you play your first Super Power on each of your turns, draw a card."},
    {"id":"the-batcave","name":"The Batcave","type":"location","cost":5,"vp":1,
     "text":"When you play this card, leave it in front of you for the rest of the game.",
     "fa":null,"ongoing":"When you play your first Equipment on each of your turns, draw a card."},
    {"id":"the-watchtower","name":"The Watchtower","type":"location","cost":5,"vp":1,
     "text":"When you play this card, leave it in front of you for the rest of the game.",
     "fa":null,"ongoing":"When you play your first Hero on each of your turns, draw a card."},
    {"id":"titans-tower","name":"Titans Tower","type":"location","cost":5,"vp":1,
     "text":"When you play this card, leave it in front of you for the rest of the game.",
     "fa":null,"ongoing":"When you play your first card with cost 2 or 3 on each of your turns, draw a card."},

    {"id":"punch","name":"Punch","type":"starter","cost":0,"vp":0,
     "text":"+1 Power","fa":null,"ongoing":null},
    {"id":"vulnerability","name":"Vulnerability","type":"starter","cost":0,"vp":0,
     "text":"","fa":null,"ongoing":null},

    {"id":"weakness","name":"Weakness","type":"weakness","cost":0,"vp":-1,
     "text":"Weakness cards reduce your score at the end of the game.","fa":null,"ongoing":null}
  ]/*END-JSON*/;

  /* ------------------------------------------------------------
   * SET — copies per design.
   * PROVISIONAL: Hero and Villain per-design counts come from a fan
   * wiki (cardguide.fandom.com) whose type totals do NOT match the
   * rulebook-verified box contents (Hero 38 vs 32, Villain 31 vs 33;
   * grand total 225 vs 221). All other types match exactly. Pending
   * user verification against the physical box — see cards-review.html.
   * ------------------------------------------------------------ */
  var SET = {
    punch: 35, vulnerability: 15, kick: 16, weakness: 20,
    "aquaman-mc": 1, "batman-mc": 1, "cyborg-mc": 1, "green-lantern-mc": 1,
    "superman-mc": 1, "the-flash-mc": 1, "wonder-woman-mc": 1,
    atrocitus: 1, "black-manta": 1, brainiac: 1, "captain-cold": 1,
    darkseid: 1, deathstroke: 1, "lex-luthor": 1, parallax: 1,
    "ras-al-ghul": 1, sinestro: 1, "the-anti-monitor": 1, "the-joker": 1,
    "arkham-asylum": 1, "fortress-of-solitude": 1, "the-batcave": 1,
    "the-watchtower": 1, "titans-tower": 1,
    "aquamans-trident": 3, "green-arrows-bow": 3, "lasso-of-truth": 3,
    "nth-metal": 4, "power-ring": 3, "the-bat-signal": 3, batmobile: 3,
    "the-cape-and-cowl": 3, "utility-belt": 3,
    bulletproof: 3, "heat-vision": 3, "super-speed": 4, "super-strength": 3,
    "xray-vision": 3,
    "blue-beetle": 1, catwoman: 3, "green-arrow": 3, "high-tech-hero": 3,
    "jonn-jonzz": 1, "kid-flash": 4, "king-of-atlantis": 1, mera: 2,
    "princess-diana-of-themyscira": 1, robin: 3, supergirl: 2,
    "swamp-thing": 2, "dark-knight": 1, "emerald-knight": 1,
    "the-fastest-man-alive": 1, "man-of-steel": 1, "zatanna-zatara": 2,
    bane: 2, bizarro: 1, cheetah: 2, clayface: 2, doomsday: 2,
    "gorilla-grodd": 2, "harley-quinn": 2, lobo: 1, "poison-ivy": 2,
    scarecrow: 2, "solomon-grundy": 2, starro: 1, "suicide-squad": 6,
    "the-penguin": 2, "the-riddler": 2, "two-face": 2
  };

  var byId = {};
  DATA.forEach(function (c) { byId[c.id] = c; });

  /* Type totals for the physical box (per-design counts verified by the
   * owner against their copy; see cards-review.html). Note: starter is
   * counted as 35 Punch + 15 Vulnerability = 50, which makes the grand
   * total 219 — the rulebook's Game Pieces list says 36/16 (=52, total
   * 221); flagged with the owner. */
  var EXPECTED = {
    equipment: 28, hero: 32, location: 5, persona: 7,
    starter: 50, superpowerInclKick: 32, sv: 12, villain: 33, weakness: 20,
    total: 219, mainDeck: 114
  };

  return { cards: DATA, byId: byId, set: SET, expected: EXPECTED };
})();
