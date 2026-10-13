/* ══ Panier ═════════════════════════════════════════════════════════════════
   Contenu du panier (mémorisé dans le navigateur), boutons « Ajouter », cases
   « Ajouter tout le lot », ouverture et fermeture du volet, annulation, et
   verrouillage du catalogue après une demande de commande.

   Le panier ne retient que des codes et des quantités (et le nom des lots) :
   les prix sont relus à chaque affichage, pour suivre le Google Sheet.

   Publie Catalogue.panier.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const C = window.Catalogue;
  const { $, $$, config, memoire, stock } = C;
  const { fiches } = stock;

  const SEUIL = config.seuilCommande || 15;
  const MODE_PAR_DEFAUT = "Retrait sur place";

  /* ── Contenu, mémorisé sous la même clé qu'avant la réorganisation ──
     refs    : { code: quantité }
     lots    : { numéro: { nom } }
     prixVus : { code: prix au moment de l'ajout } (pour signaler un prix qui a changé)
     mode    : mode de réception choisi */
  const CLE_PANIER = "panier-raccords";
  let panier = memoire.lire(CLE_PANIER, null);
  if (!panier || typeof panier !== "object") panier = {};
  /* La mémoire du navigateur peut avoir été modifiée ou abîmée : on ne garde que
     des codes connus avec des quantités entières, des numéros de lot, des prix
     numériques et un mode de réception proposé par la page. */
  const objet = (valeur) => (valeur && typeof valeur === "object" ? valeur : {});
  panier.refs = objet(panier.refs);
  panier.lots = objet(panier.lots);
  panier.prixVus = objet(panier.prixVus);
  Object.keys(panier.refs).forEach((code) => {
    const quantite = panier.refs[code];
    if (!fiches[code] || !Number.isInteger(quantite) || quantite <= 0) delete panier.refs[code];
  });
  Object.keys(panier.lots).forEach((num) => {
    if (!/^\d+$/.test(num) || !$(`.lot-entete[data-lot="${num}"]`)) delete panier.lots[num];
    else panier.lots[num] = { nom: $(`.lot-entete[data-lot="${num}"]`).dataset.lotNom };
  });
  Object.keys(panier.prixVus).forEach((code) => {
    if (!fiches[code] || typeof panier.prixVus[code] !== "number") delete panier.prixVus[code];
  });
  const modes = $$('input[name="mode-reception"]').map((radio) => radio.value);
  if (!modes.includes(panier.mode)) panier.mode = MODE_PAR_DEFAUT;

  const sauver = () => memoire.ecrire(CLE_PANIER, panier);
  const enregistrer = () => { sauver(); dessiner(); };
  const estVide = () => !Object.keys(panier.refs).length && !Object.keys(panier.lots).length;

  function vider() {
    panier.refs = {};
    panier.lots = {};
    panier.prixVus = {};
    sauver();
  }

  /* ── Commande validée : catalogue verrouillé jusqu'à l'annulation ── */
  const CLE_COMMANDE = "commande-validee-raccords";
  let commandeValidee = memoire.lireTexte(CLE_COMMANDE) === "1";
  const commandes = () => $$(".achat button, .achat input, .lot-tout input");

  function verrouiller() {
    commandeValidee = true;
    memoire.ecrire(CLE_COMMANDE, "1");
    document.body.classList.add("commande-validee");
    commandes().forEach((el) => { el.disabled = true; });
  }

  function deverrouiller() {
    commandeValidee = false;
    memoire.effacer(CLE_COMMANDE);
    document.body.classList.remove("commande-validee");
    commandes().forEach((el) => { el.disabled = false; });
    stock.appliquerEtat();   // ré-applique les seuls verrous légitimes (ruptures réelles)
  }

  /* ── Mode de réception, repris dans le message de commande ── */
  $$('input[name="mode-reception"]').forEach((radio) => {
    radio.checked = radio.value === panier.mode;
    radio.addEventListener("change", () => {
      if (radio.checked) { panier.mode = radio.value; sauver(); }
    });
  });
  const modeReception = () => panier.mode || MODE_PAR_DEFAUT;

  /* ── Fiches et lots déjà au panier ── */
  function majEtatsLots() {
    $$(".lot-entete").forEach((entete) => {
      const actif = Boolean(panier.lots[entete.dataset.lot]);
      const etiquette = $(".lot-tout", entete);
      const caseLot = $(".lot-tout input", entete);
      if (caseLot) caseLot.checked = actif;
      if (etiquette) etiquette.classList.toggle("actif", actif);
      stock.codesDuLot(entete).forEach((code) => {
        const bloc = $(`.achat[data-code="${code}"]`);
        if (!bloc) return;
        bloc.classList.toggle("dans-lot", actif);
        let note = $(".achat-note", bloc.parentElement);
        if (actif && !note) {
          note = document.createElement("p");
          note.className = "achat-note";
          note.textContent = "Inclus dans le lot complet ci-dessus";
          bloc.insertAdjacentElement("afterend", note);
        } else if (!actif && note) {
          note.remove();
        }
      });
    });
  }

  /* ── Affichage du panier ── */
  function ligneReference(code, quantite, fiche) {
    const avant = panier.prixVus[code];
    const prixChange = typeof avant === "number" && Math.abs(avant - fiche.prix) > 0.001;
    return `<div class="l"><span class="n">${code} <small>${C.echapper(fiche.nom)}</small></span>`
      + `<span>${quantite} × ${C.prix(fiche.prix)}`
      + (prixChange ? `<small class="prix-change">prix actualisé, avant ${C.prix(avant)}</small>` : "")
      + "</span>"
      + `<button class="x" data-x="${code}" data-type="ref" title="retirer">×</button></div>`;
  }

  function ligneLot(num, lot) {
    return `<div class="l"><span class="n">Lot complet — ${C.echapper(lot.nom)} `
      + `<small>${lot.refs} référence${lot.refs > 1 ? "s" : ""}, remise ${C.pourcent(lot.decote)} %</small></span>`
      + `<span>${C.prix(lot.prix)}</span>`
      + `<button class="x" data-x="${num}" data-type="lot" title="retirer">×</button></div>`;
  }

  function dessiner() {
    let total = 0, poids = 0, html = "", retraits = 0;

    Object.keys(panier.refs).forEach((code) => {
      const fiche = fiches[code];
      if (!fiche) return;
      /* une référence épuisée entre-temps (Sheet mis à jour) quitte le panier */
      const quantite = Math.min(panier.refs[code], stock.stockActuel(code));
      if (quantite <= 0) {
        delete panier.refs[code];
        delete panier.prixVus[code];
        retraits++;
        return;
      }
      panier.refs[code] = quantite;
      total += fiche.prix * quantite;
      poids += fiche.poids * quantite;
      html += ligneReference(code, quantite, fiche);
    });

    Object.keys(panier.lots).forEach((num) => {
      const lot = stock.infosLot(num);
      if (!lot) { delete panier.lots[num]; retraits++; return; }
      total += lot.prix;
      html += ligneLot(num, lot);
    });

    if (retraits) {
      sauver();
      const plusieurs = retraits > 1;
      html = `<p class="panier-retrait">${plusieurs ? "Des articles de votre panier viennent" : "Un article de votre panier vient"}`
        + ` d'être épuisé${plusieurs ? "s" : ""} et ${plusieurs ? "en ont été retirés" : "en a été retiré"}.</p>` + html;
    }

    const lignes = $("#panier .lignes");
    lignes.innerHTML = html || '<p style="color:#8e989d;font-size:13px;padding:14px 0">Votre panier est vide.</p>';
    $("#panier .tot").innerHTML = `<span>Total commande</span><span>${C.prix(total)}</span>`;
    $("#panier .pds").textContent = poids
      ? `Poids estimé ${(poids / 1000).toFixed(1).replace(".", ",")} kg — les frais de port seront convenus ensemble.`
      : "";

    /* seuil de commande, coordonnées et bouton de validation */
    const seuil = $("#panier .seuil");
    const coordonnees = $("#panier .etape-coord");
    const bouton = $("#panier .go");
    const champEmail = $("#cli-email");
    const emailValide = /.+@.+\..+/.test(champEmail ? champEmail.value : "");
    if (total > SEUIL) {
      seuil.classList.add("ok");
      coordonnees.style.display = "flex";
      bouton.disabled = !emailValide;
    } else {
      seuil.classList.remove("ok");
      seuil.textContent = (total > 0
        ? `Ajoutez encore ${C.prix(SEUIL - total)} pour pouvoir valider une demande de commande`
        : "Ajoutez des références ou un lot complet pour pouvoir valider une demande de commande")
        + ` (montant minimum ${C.prix(SEUIL)}, hors frais de port).`;
      coordonnees.style.display = "none";
      bouton.disabled = true;
    }

    /* bouton flottant « Panier » */
    const ouvrir = $("#panier-ouvre");
    if (commandeValidee) {
      ouvrir.textContent = "Commande validée ✓";
      ouvrir.classList.remove("seuil-atteint");
      ouvrir.classList.add("commande-validee-etat");
    } else {
      ouvrir.textContent = total > 0 ? `Panier — ${C.prix(total)}` : "Panier";
      ouvrir.classList.remove("commande-validee-etat");
      ouvrir.classList.toggle("seuil-atteint", total > SEUIL);
    }

    /* « Annuler la commande » n'apparaît que s'il y a quelque chose à annuler :
       un panier non vide, ou une demande déjà validée (le panier est alors vidé,
       mais c'est ce bouton qui rouvre le catalogue). */
    const aAnnuler = commandeValidee || !estVide();
    $("#btn-annuler-commande").hidden = !aAnnuler;
    if (!aAnnuler) $(".confirmation-annulation")?.remove();

    $$("[data-x]", lignes).forEach((croix) => {
      croix.onclick = () => {
        const cle = croix.dataset.x;
        if (croix.dataset.type === "lot") delete panier.lots[cle];
        else { delete panier.refs[cle]; delete panier.prixVus[cle]; }
        enregistrer();
      };
    });
    majEtatsLots();
  }

  /* ── Boutons − / + / Ajouter de chaque fiche ── */
  $$(".achat[data-code]").forEach((bloc) => {
    const code = bloc.dataset.code;
    const champ = $("input", bloc);
    const bouton = $(".add", bloc);
    const maximum = () => Math.max(1, stock.stockActuel(code));
    const valeur = () => parseInt(champ.value || 1, 10);

    $(".moins", bloc).onclick = () => { champ.value = Math.max(1, valeur() - 1); };
    $(".plus", bloc).onclick = () => { champ.value = Math.min(maximum(), valeur() + 1); };
    champ.onchange = () => { champ.value = Math.min(maximum(), Math.max(1, valeur() || 1)); };
    bouton.onclick = () => {
      if (bloc.classList.contains("dans-lot")) return;
      if (bloc.closest(".card").classList.contains("rupture")) return;
      const quantite = Math.min(maximum(), Math.max(1, valeur()));
      panier.refs[code] = Math.min(maximum(), (panier.refs[code] || 0) + quantite);
      panier.prixVus[code] = fiches[code].prix;
      enregistrer();
      bouton.classList.add("ok");
      bouton.textContent = "Ajouté";
      setTimeout(() => { bouton.classList.remove("ok"); bouton.textContent = "Ajouter"; }, 1100);
    };
  });

  /* ── Cases « Ajouter tout le lot au panier » ── */
  $$(".lot-tout input").forEach((caseLot) => {
    caseLot.onchange = () => {
      const entete = caseLot.closest(".lot-entete");
      const num = entete.dataset.lot;
      if (caseLot.checked) {
        /* seul le nom est retenu : le prix est recalculé à chaque affichage */
        panier.lots[num] = { nom: entete.dataset.lotNom };
        stock.codesDuLot(entete).forEach((code) => { delete panier.refs[code]; delete panier.prixVus[code]; });
      } else {
        delete panier.lots[num];
      }
      enregistrer();
    };
  });

  /* ── Ouverture et fermeture du volet ──
     Sur grand écran, le volet réduit la largeur de la page au lieu de la couvrir.
     Ce changement de largeur modifie la hauteur de tout ce qui précède la position
     de lecture : on repère un élément visible avant, puis on compense exactement
     son déplacement, pour que le lecteur ne bouge pas. */
  function basculerLargeurPage(ouvert) {
    const repere = document.elementFromPoint(Math.round(window.innerWidth / 2), 120);
    const avant = repere ? repere.getBoundingClientRect().top : null;
    document.body.classList.toggle("panier-ouvert", ouvert);
    if (repere && avant !== null) {
      const apres = repere.getBoundingClientRect().top;
      if (apres !== avant) window.scrollBy(0, apres - avant);
    }
  }
  const volet = $("#panier");
  function fermer() {
    volet.classList.remove("on");
    basculerLargeurPage(false);
  }
  $("#panier-ouvre").onclick = () => {
    const ouvert = volet.classList.toggle("on");
    basculerLargeurPage(ouvert);
  };
  $("#panier .fermer").onclick = fermer;
  $("#btn-continuer-achats").onclick = fermer;

  /* ── Annulation : panier vidé, réservations effacées, catalogue rouvert ── */
  $("#btn-annuler-commande").onclick = () => {
    if ($(".confirmation-annulation")) return;   // déjà affichée
    const bloc = document.createElement("div");
    bloc.className = "confirmation-annulation";
    bloc.innerHTML = "<p>Annuler la commande ? Le panier sera vidé et le catalogue redeviendra accessible.</p>"
      + '<div class="choix"><button type="button" class="oui">Oui, annuler</button>'
      + '<button type="button" class="non">Non</button></div>';
    $(".panier-actions-permanentes").appendChild(bloc);
    $(".non", bloc).onclick = () => bloc.remove();
    $(".oui", bloc).onclick = () => {
      vider();
      stock.effacerReservations();
      deverrouiller();
      const preuve = $("#panier .preuve");
      preuve.style.display = "none";
      preuve.innerHTML = "";
      $("#panier .lignes").style.display = "";
      $("#panier .etape-coord").style.display = "none";
      $("#panier footer").style.display = "";
      ["#cli-email", "#cli-nom"].forEach((s) => { const champ = $(s); if (champ) champ.value = ""; });
      bloc.remove();
      dessiner();
    };
  };

  const champEmail = $("#cli-email");
  if (champEmail) champEmail.oninput = dessiner;

  /* Tout changement de stock ou de prix (Google Sheet, commande, annulation)
     redessine le panier. */
  window.addEventListener("stock:maj", dessiner);

  C.panier = {
    contenu: () => panier, estVide, vider, dessiner, verrouiller,
    estValidee: () => commandeValidee, modeReception
  };

  dessiner();
  stock.appliquerEtat();
  if (commandeValidee) verrouiller();
})();
