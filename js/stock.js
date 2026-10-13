/* ══ Stock, prix et lots ════════════════════════════════════════════════════
   D'où vient le stock affiché, par ordre de priorité croissante :
     1. la page elle-même (attributs data-stock et data-prix de chaque fiche) ;
     2. le Google Sheet, relu toutes les minutes (quantités, prix, décotes) ;
     3. les réservations locales : après une demande de commande, ce navigateur
        retire les quantités commandées, en attendant que le Sheet soit mis à jour.

   ⚠ Les réservations locales ne concernent QUE le navigateur du client qui a
   commandé : les autres visiteurs ne les voient pas. Le seul stock partagé est
   celui du Google Sheet.

   Publie Catalogue.stock et prévient le reste du site par l'événement
   « stock:maj » à chaque changement.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const C = window.Catalogue;
  const { $, $$, config, memoire } = C;

  /* ── Fiches : une entrée par code, lue dans la page ── */
  const fiches = {};
  $$(".card[data-prix]").forEach((carte) => {
    const prix = parseFloat(carte.dataset.prix);
    fiches[carte.dataset.code] = {
      nom: carte.dataset.nom,
      prix,                    // prix en vigueur (celui du Sheet s'il en donne un)
      prixPage: prix,          // prix écrit dans la page, référence du garde-fou
      poids: parseInt(carte.dataset.poids, 10),
      stock: parseInt(carte.dataset.stock, 10)
    };
  });

  /* ── Réservations locales ──
     Chaque réservation retient le stock du Sheet au moment de la commande
     (« base ») : dès que le Sheet affiche un autre chiffre, c'est qu'il a été mis
     à jour, et la réservation s'efface pour ne pas retirer deux fois la même
     quantité. */
  const CLE_RESERVATIONS = "stock-overrides-raccords";
  let reservations = memoire.lire(CLE_RESERVATIONS, {});
  if (!reservations || typeof reservations !== "object") reservations = {};
  Object.keys(reservations).forEach((code) => {
    const reservation = reservations[code];
    // ancien format (un simple nombre) : base inconnue, fixée à la prochaine lecture du Sheet
    if (typeof reservation === "number") reservations[code] = { qte: reservation, base: null };
    // toute autre forme (mémoire abîmée ou modifiée à la main) est ignorée
    const propre = reservations[code];
    if (!fiches[code] || !propre || !Number.isFinite(propre.qte)
        || (propre.base !== null && !Number.isFinite(propre.base))) delete reservations[code];
  });
  const sauverReservations = () => memoire.ecrire(CLE_RESERVATIONS, reservations);

  function stockActuel(code) {
    const fiche = fiches[code];
    if (!fiche) return 0;
    const reservation = reservations[code];
    return Math.max(0, fiche.stock - (reservation ? reservation.qte : 0));
  }

  function reserver(code, quantite) {
    const reservation = reservations[code] || { qte: 0, base: fiches[code].stock };
    reservation.qte += quantite;
    reservations[code] = reservation;
    sauverReservations();
  }

  function effacerReservations() {
    reservations = {};
    sauverReservations();
  }

  /* ── Lots ── */
  const enteteDuLot = (num) => $(`.lot-entete[data-lot="${num}"]`);

  /* Codes des fiches d'une partie : celles qui suivent son bandeau. */
  function codesDuLot(entete) {
    const suite = entete.nextElementSibling;
    return suite ? $$(".card[data-code]", suite).map((carte) => carte.dataset.code) : [];
  }

  function reserverLot(num) {
    const entete = enteteDuLot(num);
    if (!entete) return;
    codesDuLot(entete).forEach((code) => {
      if (fiches[code]) reservations[code] = { qte: fiches[code].stock, base: fiches[code].stock };
    });
    sauverReservations();
  }

  /* Décote d'un lot (en %) : celle de l'onglet « Lots » du Sheet, sinon la décote
     par défaut. La partie vendue à l'unité n'a pas de remise de lot. */
  let decotesLots = {};
  function decoteLot(num) {
    const entete = enteteDuLot(num);
    if (entete && entete.classList.contains("valeur-entete")) return 0;
    if (typeof decotesLots[num] === "number") return decotesLots[num];
    return typeof config.decoteDefaut === "number" ? config.decoteDefaut : 35;
  }

  /* Tout ce qu'il faut savoir d'un lot à l'instant présent : prix recalculé sur le
     stock disponible et les prix en vigueur, nombre de références et de pièces
     restantes. null si le lot n'existe pas ou n'a plus aucune pièce. */
  function infosLot(num) {
    const entete = enteteDuLot(num);
    if (!entete) return null;
    let occasion = 0, refs = 0, pieces = 0;
    codesDuLot(entete).forEach((code) => {
      const fiche = fiches[code];
      const quantite = stockActuel(code);
      if (!fiche || quantite <= 0) return;
      occasion += fiche.prix * quantite;
      refs++;
      pieces += quantite;
    });
    if (!refs) return null;
    const decote = decoteLot(num);
    return {
      nom: entete.dataset.lotNom, decote, refs, pieces, occasion,
      prix: Math.round(occasion * (1 - decote / 100) * 100) / 100
    };
  }

  /* ── Affichage : stock des fiches, ruptures, état des lots ── */
  function afficherStockFiche(carte) {
    const code = carte.dataset.code;
    const reste = stockActuel(code);
    const enRupture = reste <= 0;
    carte.classList.toggle("rupture", enRupture);
    /* Certaines références se comptent en lots ou en cartons, pas en pièces. */
    const unite = carte.dataset.unite || "pièce";
    const unites = carte.dataset.unitep || unite + "s";
    const texteStock = $(".stock", carte);
    if (texteStock) {
      texteStock.innerHTML = enRupture
        ? "<strong>Épuisé</strong>"
        : `Stock disponible : <strong>${reste} ${reste > 1 ? unites : unite}</strong>`;
    }
    const champ = $(".achat input", carte);
    if (champ) {
      champ.max = Math.max(1, reste);
      if (parseInt(champ.value || 1, 10) > reste) champ.value = Math.max(1, reste);
    }
  }

  function afficherEtatLot(entete) {
    const codes = codesDuLot(entete).filter((code) => fiches[code]);
    const epuisees = codes.filter((code) => stockActuel(code) <= 0).length;
    const toutEpuise = codes.length > 0 && epuisees === codes.length;
    const suite = entete.nextElementSibling;
    const photo = suite ? $(".lot-photo", suite) : null;
    if (photo) photo.classList.toggle("epuise", toutEpuise);

    const etiquette = $(".lot-tout", entete);
    if (!etiquette) return;
    /* Un lot reste achetable en entier tant qu'il lui reste une référence : son
       prix est recalculé sur les seules pièces disponibles. */
    etiquette.classList.toggle("indispo", toutEpuise);
    const caseLot = $("input", etiquette);
    if (caseLot) caseLot.disabled = toutEpuise || Boolean(C.panier?.estValidee());

    let note = $(".lot-note-indispo", entete);
    if (!epuisees) {
      if (note) note.remove();
      return;
    }
    const texte = toutEpuise
      ? "Ce lot est entièrement épuisé : plus aucune référence disponible."
      : (epuisees > 1 ? `${epuisees} références de ce lot sont épuisées` : "Une référence de ce lot est épuisée")
        + " : le lot complet comprend les références restantes, à un prix recalculé.";
    if (!note) {
      note = document.createElement("p");
      note.className = "lot-note-indispo";
      etiquette.insertAdjacentElement("beforebegin", note);
    }
    note.textContent = texte;
  }

  /* Met toute la page en accord avec le stock, puis prévient les autres scripts
     (panier, totaux) par l'événement « stock:maj ». */
  function appliquerEtat() {
    $$(".card[data-code]").forEach((carte) => {
      if (fiches[carte.dataset.code]) afficherStockFiche(carte);
    });
    $$(".lot-entete").forEach(afficherEtatLot);
    window.dispatchEvent(new Event("stock:maj"));
  }

  /* ── Google Sheet ──
     Les adresses et réglages sont dans config.js. Toute case vide ou illisible est
     ignorée : le site garde alors la valeur écrite dans la page. */
  const ECART_PRIX_MAX = config.ecartPrixMax || 10;

  function afficherPrix(code) {
    const carte = $(`.card[data-code="${code}"]`);
    if (!carte) return;
    carte.dataset.prix = fiches[code].prix.toFixed(2);
    const span = $(".px span:last-child", carte);
    if (span) span.innerHTML = "<em>notre prix</em>" + C.prix(fiches[code].prix);
  }

  /* Onglet principal : colonnes « Code », « Qté » et « Prix unitaire (€) ».
     Renvoie le nombre de valeurs prises en compte. */
  function appliquerStock(texte) {
    const lignes = C.parserCSV(texte);
    if (!lignes.length) return 0;
    const entetes = lignes[0].map(C.normaliserEntete);
    const iCode = entetes.indexOf("code");
    const iQte = entetes.indexOf("qte");
    const iPrix = entetes.findIndex((h) => h.startsWith("prix unitaire"));
    if (iCode < 0 || iQte < 0) return 0;

    let prisesEnCompte = 0, reservationsChangees = false;
    lignes.slice(1).forEach((cases) => {
      const code = (cases[iCode] || "").trim();
      const fiche = fiches[code];
      if (!fiche) return;

      let quantite = C.nombreFr(cases[iQte]);
      if (!isNaN(quantite)) {
        quantite = Math.max(0, Math.floor(quantite));
        const reservation = reservations[code];
        if (reservation) {
          if (reservation.base === null) { reservation.base = quantite; reservationsChangees = true; }
          else if (reservation.base !== quantite) { delete reservations[code]; reservationsChangees = true; }
        }
        fiche.stock = quantite;
        prisesEnCompte++;
      }

      if (iPrix >= 0) {
        const prix = C.nombreFr(cases[iPrix]);
        if (prix > 0 && Math.abs(prix - fiche.prix) > 0.0001) {
          if (prix > fiche.prixPage * ECART_PRIX_MAX || prix < fiche.prixPage / ECART_PRIX_MAX) {
            console.warn(`Prix ignoré pour ${code} : ${prix} € dans le Sheet, ${fiche.prixPage} € dans la page `
              + `(écart supérieur à ${ECART_PRIX_MAX} fois).`);
          } else {
            fiche.prix = prix;
            afficherPrix(code);
            prisesEnCompte++;
          }
        }
      }
    });
    if (reservationsChangees) sauverReservations();
    return prisesEnCompte;
  }

  /* Onglet « Lots » : colonnes « N° lot » et « Décote (%) ».
     « 35 », « 35 % » et « 0,35 » donnent tous 35 %. Renvoie true si une décote a changé. */
  function appliquerLots(texte) {
    const lignes = C.parserCSV(texte);
    if (!lignes.length) return false;
    const entetes = lignes[0].map(C.normaliserEntete);
    const iLot = entetes.findIndex((h) => h.includes("lot") && !h.includes("prix") && !h.includes("valeur"));
    const iDecote = entetes.findIndex((h) => h.startsWith("decote"));
    if (iLot < 0 || iDecote < 0) return false;

    const nouvelles = {};
    lignes.slice(1).forEach((cases) => {
      const num = C.nombreFr(cases[iLot]);
      let decote = C.nombreFr(cases[iDecote]);
      if (isNaN(num) || isNaN(decote)) return;
      if (decote > 0 && decote < 1) decote = Math.round(decote * 10000) / 100;
      if (decote >= 0 && decote < 100) nouvelles[String(Math.floor(num))] = decote;
    });
    const change = JSON.stringify(nouvelles) !== JSON.stringify(decotesLots);
    decotesLots = nouvelles;
    return change;
  }

  function lireCSV(adresse) {
    // l'horodatage empêche le navigateur de resservir une ancienne copie
    const url = adresse + (adresse.includes("?") ? "&" : "?") + "_=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then((reponse) => (reponse.ok ? reponse.text() : null))
      .catch(() => null);   // échec silencieux : le site garde ses valeurs
  }

  function lireSheet() {
    Promise.all([
      config.sheetStockCsv ? lireCSV(config.sheetStockCsv) : null,
      config.sheetLotsCsv ? lireCSV(config.sheetLotsCsv) : null
    ]).then(([texteStock, texteLots]) => {
      let change = false;
      if (texteStock && appliquerStock(texteStock) > 0) change = true;
      if (texteLots && appliquerLots(texteLots)) change = true;
      if (change) appliquerEtat();
    });
  }

  /* Lecture au chargement, puis à intervalle régulier et à chaque retour sur
     l'onglet. Lancée une fois tous les scripts prêts. */
  function demarrerSynchronisation() {
    if (!config.sheetStockCsv && !config.sheetLotsCsv) return;
    lireSheet();
    const intervalle = typeof config.relectureSecondes === "number" ? config.relectureSecondes : 60;
    if (intervalle > 0) {
      setInterval(lireSheet, intervalle * 1000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) lireSheet(); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrerSynchronisation);
  else demarrerSynchronisation();

  C.stock = {
    fiches, stockActuel, reserver, reserverLot, effacerReservations,
    codesDuLot, decoteLot, infosLot, appliquerEtat
  };
})();
