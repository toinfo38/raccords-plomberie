/* ══ Outils communs ═════════════════════════════════════════════════════════
   Tous les scripts du catalogue partagent un seul objet global,
   window.Catalogue, plutôt qu'une série de variables globales. Ce fichier le
   crée et y range les petites fonctions utilisées partout.

   Ordre de chargement (index.html) :
     config.js   réglages modifiables
     outils.js   ce fichier
     stock.js    fiches, stock, prix, lots, lecture du Google Sheet
     panier.js   panier, ajout, lots complets, annulation, verrouillage
     commande.js validation de la demande, message et preuve
     photos.js   carrousels et agrandissement des photos
     catalogue.js recherche, totaux, sommaire et navigation
   ══════════════════════════════════════════════════════════════════════════ */
window.Catalogue = {};

(() => {
  const C = window.Catalogue;

  C.config = window.CONFIG_CATALOGUE || {};

  /* Raccourcis de sélection */
  C.$ = (selecteur, racine = document) => racine.querySelector(selecteur);
  C.$$ = (selecteur, racine = document) => Array.from(racine.querySelectorAll(selecteur));

  /* Prix d'un article : « 1234,50 € » (fiches, panier, message de commande). */
  C.prix = (valeur) => valeur.toFixed(2).replace(".", ",") + " €";

  /* Montant d'un total : « 1 234,50 € », milliers séparés par une espace fine
     insécable (bandeaux de lot, récapitulatif). */
  C.montant = (valeur) => {
    const [entier, decimales] = (Math.round(valeur * 100) / 100).toFixed(2).split(".");
    return entier.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + "," + decimales + " €";
  };

  /* « 35 » -> « 35 », « 12.5 » -> « 12,5 » */
  C.pourcent = (valeur) => String(valeur).replace(".", ",");

  /* Tout texte inséré dans la page par innerHTML passe par ici : un nom de pièce
     ou une valeur relue du navigateur ne doit jamais pouvoir être interprété
     comme du code. */
  const ENTITES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  C.echapper = (texte) => String(texte).replace(/[&<>"']/g, (c) => ENTITES[c]);

  /* Minuscules et sans accents : « Coudé » -> « coude » (recherche). */
  C.sansAccents = (texte) => texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /* « 3,5 » « 1 234,50 € » « 35 % » -> nombre ; NaN si la case n'est pas un nombre. */
  C.nombreFr = (texte) => {
    const t = String(texte || "").replace(/[\s\u00a0\u202f€%]/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  };

  /* Lecture d'un CSV (Google Sheet publié) : gère les champs entre guillemets
     contenant des virgules, les guillemets doublés "" et les retours à la ligne
     (le tableau contient de longs textes truffés de virgules). Renvoie un tableau
     de lignes, chaque ligne étant un tableau de cases. Les lignes vides sont ignorées. */
  C.parserCSV = (texte) => {
    const lignes = [];
    let ligne = [], champ = "", enGuillemets = false;
    const finDeLigne = () => {
      ligne.push(champ);
      champ = "";
      if (ligne.some((c) => c.trim().length)) lignes.push(ligne);
      ligne = [];
    };
    for (let i = 0; i < texte.length; i++) {
      const car = texte[i];
      if (enGuillemets) {
        if (car === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
        else if (car === '"') enGuillemets = false;
        else champ += car;
      } else if (car === '"') enGuillemets = true;
      else if (car === ",") { ligne.push(champ); champ = ""; }
      else if (car === "\n") finDeLigne();
      else if (car !== "\r") champ += car;
    }
    finDeLigne();
    return lignes;
  };

  /* En-tête de colonne comparable : « Qté » -> « qte », « Décote (%) » -> « decote (%) ». */
  C.normaliserEntete = (entete) => C.sansAccents(entete.trim());

  /* Mémoire du navigateur (localStorage). Elle peut être indisponible (navigation
     privée, stockage bloqué) ou contenir une valeur abîmée : le site doit alors
     continuer à fonctionner, simplement sans se souvenir de rien. */
  C.memoire = {
    lire(cle, parDefaut) {
      try {
        const brut = localStorage.getItem(cle);
        return brut === null ? parDefaut : JSON.parse(brut);
      } catch (e) {
        return parDefaut;
      }
    },
    lireTexte(cle) {
      try { return localStorage.getItem(cle); } catch (e) { return null; }
    },
    ecrire(cle, valeur) {
      try { localStorage.setItem(cle, typeof valeur === "string" ? valeur : JSON.stringify(valeur)); }
      catch (e) { /* stockage plein ou interdit : sans gravité */ }
    },
    effacer(cle) {
      try { localStorage.removeItem(cle); } catch (e) { /* idem */ }
    }
  };
})();
