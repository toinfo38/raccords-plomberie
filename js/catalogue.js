/* ══ Catalogue : recherche, totaux, sommaire et navigation ═════════════════ */
(() => {
  const C = window.Catalogue;
  const { $, $$, config, stock } = C;


  /* ═══ 1. Recherche et filtres ═════════════════════════════════════════════
     Texte libre (tous les mots doivent figurer dans la fiche, sans tenir compte
     des accents), famille / lot, diamètre. Les intertitres, les grilles et les
     parties entières sans résultat sont masqués. Les références épuisées restent
     affichées. */
  const champRecherche = $("#f-texte");
  const choixLot = $("#f-lot");
  const choixDiametre = $("#f-diametre");
  const compteur = $("#f-compte");
  const messageVide = $("#f-vide");
  const cartes = $$(".card[data-cherche]");
  const estVisible = (element) => element.style.display !== "none";

  function filtrer() {
    const mots = C.sansAccents(champRecherche.value).split(/\s+/).filter(Boolean);
    let visibles = 0;
    cartes.forEach((carte) => {
      const retenue = mots.every((mot) => carte.dataset.cherche.includes(mot))
        && (!choixLot.value || carte.dataset.lotnum === choixLot.value)
        && (!choixDiametre.value || carte.dataset.diametre === choixDiametre.value);
      carte.style.display = retenue ? "" : "none";
      if (retenue) visibles++;
    });
    $$(".grid").forEach((grille) => {
      const reste = Array.from(grille.children).some(estVisible);
      grille.style.display = reste ? "" : "none";
      const titre = grille.previousElementSibling;
      if (titre && titre.tagName === "H3") titre.style.display = reste ? "" : "none";
    });
    $$(".lot-entete").forEach((entete) => {
      const suite = entete.nextElementSibling;
      const reste = suite ? $$(".grid", suite).some(estVisible) : false;
      entete.style.display = reste ? "" : "none";
      if (suite) suite.style.display = reste ? "" : "none";
    });
    compteur.textContent = visibles + (visibles > 1 ? " références" : " référence");
    messageVide.classList.toggle("on", visibles === 0);
  }
  [champRecherche, choixLot, choixDiametre].forEach((champ) => {
    champ.addEventListener("input", filtrer);
    champ.addEventListener("change", filtrer);
  });

  /* Vide le texte et les deux filtres. Renvoie true s'il y avait une recherche. */
  function effacerRecherche() {
    const champs = [champRecherche, choixLot, choixDiametre];
    if (!champs.some((champ) => champ.value)) return false;
    champs.forEach((champ) => { champ.value = ""; });
    filtrer();
    return true;
  }
  $("#f-raz").onclick = () => {
    [champRecherche, choixLot, choixDiametre].forEach((champ) => { champ.value = ""; });
    filtrer();
    champRecherche.focus();
  };

  /* La barre de recherche est collante et sa hauteur change avec la largeur
     d'écran. On la mesure (variable CSS --h-filtres) pour que les bandeaux de
     lot se posent juste en dessous au lieu de passer derrière. */
  const barre = $(".filtres");
  function mesurerBarre() {
    const hauteur = Math.round(barre.getBoundingClientRect().height);
    if (hauteur > 0) document.documentElement.style.setProperty("--h-filtres", hauteur + "px");
  }
  mesurerBarre();
  ["resize", "orientationchange", "load"].forEach((evenement) => window.addEventListener(evenement, mesurerBarre));
  if (window.ResizeObserver) new ResizeObserver(mesurerBarre).observe(barre);

  filtrer();


  /* ═══ 2. Totaux ═══════════════════════════════════════════════════════════
     Bandeaux des lots, sommaire d'introduction et récapitulatif « Valeur du
     stock » sont recalculés à partir des fiches et du stock disponible, à chaque
     changement (événement « stock:maj »). Aucun montant n'est figé dans le HTML.
     Le prix d'un lot vient de stock.infosLot, comme dans le panier. */
  const fiches = $$(".card[data-code]");
  const entetes = $$(".lot-entete");
  const poser = (id, texte) => { const element = document.getElementById(id); if (element) element.textContent = texte; };

  function calculer() {
    let neufTotal = 0, occasionTotal = 0, lotsTotal = 0, piecesTotal = 0, refsTotal = 0;

    entetes.forEach((entete) => {
      const num = entete.dataset.lot;
      let refs = 0, pieces = 0, occasion = 0, neuf = 0;
      fiches.forEach((carte) => {
        if (carte.dataset.lotnum !== num) return;
        refs++;
        const fiche = stock.fiches[carte.dataset.code];
        if (!fiche) return;
        const quantite = stock.stockActuel(carte.dataset.code);
        pieces += quantite;
        occasion += fiche.prix * quantite;
        /* prix neuf : milieu de la fourchette de marché */
        if (carte.dataset.neufmin) {
          const milieu = (parseFloat(carte.dataset.neufmin) + parseFloat(carte.dataset.neufmax)) / 2;
          neuf += milieu * quantite;
        }
      });
      const decote = stock.decoteLot(num);
      const prixLot = Math.round(occasion * (1 - decote / 100) * 100) / 100;

      entete.dataset.lotPieces = pieces;
      entete.dataset.lotRefs = refs;
      if (decote) entete.dataset.lotPrix = prixLot.toFixed(2);
      const badge = $(".lot-prix-final .badge", entete);
      if (badge) badge.textContent = `-${C.pourcent(decote)}%`;
      const chiffres = $(".lot-chiffres", entete);
      if (chiffres) chiffres.textContent = `${refs} référence${refs > 1 ? "s" : ""} · ${pieces} pièce${pieces > 1 ? "s" : ""}`;
      const barres = $$(".lot-prix-ligne .barre", entete);
      if (barres.length >= 2) {
        barres[0].textContent = C.montant(neuf);
        barres[1].textContent = C.montant(occasion);
      }
      const valeur = $(".lot-prix-final .val", entete);
      if (valeur) valeur.textContent = C.montant(prixLot);
      const sommaire = $(`.som-carte[href="#partie-${num}"] .som-info`);
      if (sommaire) sommaire.textContent = `${refs} réf. · ${pieces} pièce${pieces > 1 ? "s" : ""}`;

      neufTotal += neuf;
      occasionTotal += occasion;
      lotsTotal += prixLot;
      piecesTotal += pieces;
      refsTotal += refs;
    });

    /* Récapitulatif : trois chiffres, tous sur le stock encore disponible. */
    const base = typeof config.decoteDefaut === "number" ? config.decoteDefaut : 35;
    poser("rc-neuf", C.montant(neufTotal));
    poser("rc-occasion", C.montant(occasionTotal));
    poser("rc-decote", C.montant(occasionTotal * (1 - base / 100)));
    poser("rc-taux", C.pourcent(base) + " %");
    poser("rc-pieces-dispo", String(piecesTotal));
    const nbLots = entetes.filter((entete) => stock.decoteLot(entete.dataset.lot) > 0).length;
    poser("rc-pied", `${refsTotal} références réparties en ${entetes.length} parties. Prendre les ${nbLots} lots en entier, `
      + `plus les pièces à l'unité, revient à ${C.montant(lotsTotal)} au lieu de ${C.montant(occasionTotal)} pièce par pièce, `
      + `soit ${C.montant(occasionTotal - lotsTotal)} d'écart.`);
  }
  window.addEventListener("stock:maj", calculer);
  calculer();


  /* ═══ 3. Aller à une partie ═══════════════════════════════════════════════
     Les liens « #partie-N » visent le bandeau du lot, qui est collant. Pour un
     élément collant, le navigateur cale la page sur n'importe quelle position où
     il est déjà épinglé : sur les premières parties, il s'arrêtait au milieu de
     la section au lieu de son début. On vise donc la section elle-même, avec la
     même réserve que le scroll-margin-top de la feuille de style.

     Le sommaire a priorité sur la recherche : cliquer sur une partie (sommaire
     d'introduction ou marge de gauche) efface la recherche et les filtres, pour
     que la partie choisie s'affiche en entier. */
  const ANCRE_PARTIE = /^#partie-\d+$/;
  const hauteurBarre = () => barre.getBoundingClientRect().height;

  function allerA(ancre) {
    const cible = $(ancre);
    const section = cible && cible.closest(".lot-section");
    if (!section) return false;
    const y = section.getBoundingClientRect().top + window.pageYOffset - (hauteurBarre() + 22);
    window.scrollTo(0, Math.max(0, Math.round(y)));
    return true;
  }

  document.addEventListener("click", (evenement) => {
    const lien = evenement.target.closest('a[href^="#partie-"]');
    if (!lien) return;
    const ancre = lien.getAttribute("href");
    effacerRecherche();
    if (allerA(ancre)) {
      evenement.preventDefault();
      history.replaceState(null, "", ancre);
    }
  });
  /* même correction pour une adresse ouverte directement sur une ancre */
  window.addEventListener("hashchange", () => {
    if (ANCRE_PARTIE.test(location.hash)) allerA(location.hash);
  });


  /* ═══ 4. Sommaire flottant et adresse de la page ══════════════════════════
     Le sommaire de la marge reste caché tant qu'on est dans l'introduction, puis
     suit la lecture : la partie courante est celle dont le bandeau est passé
     sous la barre de recherche. Le calcul est refait au plus une fois par image.

     L'adresse de la page suit la même partie courante (#partie-N, ou rien dans
     l'introduction). Sans cela, elle restait figée sur la dernière partie cliquée :
     un rechargement ou un lien partagé renvoyait à cette partie-là, et non à celle
     qu'on lisait. */
  const rail = $(".rail");
  const elements = $$(".rail-item", rail);
  const sections = elements.map((lien) => {
    const cible = $(lien.getAttribute("href"));
    return cible ? cible.closest(".lot-section") : null;
  });
  let actif = -1, enAttente = false, suivreAdresse = false;

  function majAdresse() {
    if (!suivreAdresse) return;
    const ancre = actif >= 0 ? elements[actif].getAttribute("href") : "";
    if (location.hash === ancre) return;
    try { history.replaceState(null, "", ancre || location.pathname + location.search); }
    catch (e) { /* certains navigateurs limitent le nombre de changements : sans gravité */ }
  }

  function placer() {
    enAttente = false;
    const seuil = hauteurBarre() + 48;
    let courant = -1;
    for (let i = 0; i < sections.length; i++) {
      if (!sections[i]) continue;
      const cadre = sections[i].getBoundingClientRect();
      if (cadre.top <= seuil && cadre.bottom > seuil) { courant = i; break; }
      if (cadre.top <= seuil) courant = i;   // on est passé dessous : on retient la dernière
    }
    /* caché tant qu'aucune partie n'est atteinte, et une fois le catalogue fini */
    const derniere = sections[sections.length - 1];
    const fini = derniere && derniere.getBoundingClientRect().bottom < seuil;
    rail.hidden = courant < 0 || fini;

    if (courant !== actif) {
      if (actif >= 0) elements[actif].removeAttribute("aria-current");
      if (courant >= 0) {
        elements[courant].setAttribute("aria-current", "true");
        /* garder la pastille courante visible si le rail a dû défiler */
        const element = elements[courant], hauteur = rail.clientHeight;
        if (element.offsetTop < rail.scrollTop || element.offsetTop + element.offsetHeight > rail.scrollTop + hauteur) {
          rail.scrollTop = element.offsetTop - hauteur / 2 + element.offsetHeight / 2;
        }
      }
      actif = courant;
      majAdresse();
    }
  }
  const demander = () => { if (!enAttente) { enAttente = true; requestAnimationFrame(placer); } };
  window.addEventListener("scroll", demander, { passive: true });
  window.addEventListener("resize", demander);

  /* À l'ouverture d'une adresse en #partie-N, on y va. Pas après un simple
     rechargement : le navigateur remet déjà le lecteur là où il était. Ensuite
     seulement, l'adresse se met à suivre la lecture. */
  window.addEventListener("load", () => {
    const navigation = performance.getEntriesByType?.("navigation")[0];
    const rechargement = navigation && navigation.type === "reload";
    setTimeout(() => {
      if (!rechargement && ANCRE_PARTIE.test(location.hash)) allerA(location.hash);
      suivreAdresse = true;
      placer();
      majAdresse();
    }, 0);
  });
  placer();
})();
