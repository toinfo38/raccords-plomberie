/* ══ Photos : carrousels et agrandissement ══════════════════════════════════
   Carrousels : photos en fondu enchaîné, flèches et points de navigation.
   Défilement automatique sur les grandes photos de lot, les pièces à l'unité
   (3 s) et le carrousel d'introduction (5 s, arrêté au survol, jamais si le
   visiteur a demandé à son appareil de limiter les animations).

   Agrandissement : un clic sur une photo l'ouvre en grand avec toutes les
   photos de son carrousel ; flèches, clavier (← → Échap) et clic à côté pour
   fermer. Désactivé sur les fiches épuisées et quand le catalogue est verrouillé.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const { $, $$ } = window.Catalogue;

  /* ── Carrousels ── */
  function afficher(carrousel, index) {
    const diapos = Array.from($(".car-track", carrousel).children);
    if (!diapos.length) return;   // carrousel encore vide (« Photos à venir »)
    const n = diapos.length;
    const position = ((index % n) + n) % n;
    carrousel.dataset.idx = position;
    diapos.forEach((diapo, i) => diapo.classList.toggle("on", i === position));
    $$(".car-dot", carrousel).forEach((point, i) => point.classList.toggle("on", i === position));
  }
  const avancer = (carrousel, sens) => afficher(carrousel, (parseInt(carrousel.dataset.idx, 10) || 0) + sens);

  /* Figé : catalogue verrouillé, fiche épuisée ou lot épuisé. */
  const estFige = (carrousel) => document.body.classList.contains("commande-validee")
    || Boolean(carrousel.closest(".card.rupture"))
    || carrousel.classList.contains("epuise");

  /* Préparation : nombre de photos (data-slides, qui masque flèches et points
     s'il y en a moins de deux), points créés s'il en manque (carrousel
     d'introduction, où il suffit d'ajouter des photos dans le HTML), première
     photo affichée. */
  $$(".carrousel").forEach((carrousel) => {
    const nombre = $$(".car-slide", carrousel).length;
    carrousel.setAttribute("data-slides", nombre);
    const points = $(".car-dots", carrousel);
    if (points && points.children.length !== nombre) {
      points.innerHTML = "";
      for (let i = 0; i < nombre; i++) {
        const point = document.createElement("span");
        point.className = "car-dot" + (i === 0 ? " on" : "");
        points.appendChild(point);
      }
    }
    const premiere = $(".car-slide", carrousel);
    if (premiere && !$(".car-slide.on", carrousel)) premiere.classList.add("on");
  });

  /* ── Défilement automatique ── */
  const INTERVALLE = 3000;
  const INTERVALLE_INTRO = 5000;
  const AUTOMATIQUES = ".lot-photo, .valeur-photo, .intro-photos";
  const animationsReduites = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const minuteries = new WeakMap();
  let enPause = false;   // pendant l'agrandissement d'une photo

  function demarrer(carrousel) {
    if ($$(".car-slide", carrousel).length < 2) return;   // rien à faire défiler
    clearInterval(minuteries.get(carrousel));
    const intro = carrousel.classList.contains("intro-photos");
    if (intro && animationsReduites) return;
    minuteries.set(carrousel, setInterval(() => {
      if (!enPause && !estFige(carrousel) && !(intro && carrousel.matches(":hover"))) avancer(carrousel, 1);
    }, intro ? INTERVALLE_INTRO : INTERVALLE));
  }
  $$(AUTOMATIQUES).forEach(demarrer);

  document.addEventListener("click", (evenement) => {
    const fleche = evenement.target.closest(".car-prev, .car-next");
    if (!fleche) return;
    const carrousel = fleche.closest(".carrousel");
    if (estFige(carrousel)) return;
    avancer(carrousel, fleche.classList.contains("car-next") ? 1 : -1);
    // une action manuelle relance le compte à rebours, sans double défilement
    if (carrousel.matches(AUTOMATIQUES)) demarrer(carrousel);
  });

  /* ── Agrandissement ── */
  const fenetre = $("#lightbox");
  const piste = $(".lb-track", fenetre);
  const points = $(".lb-dots", fenetre);
  let index = 0, total = 0;

  function ouvrir(carrousel, depart) {
    piste.innerHTML = "";
    points.innerHTML = "";
    $$(".car-slide", carrousel).forEach((diapo, i) => {
      const grande = document.createElement("div");
      grande.className = "lb-slide" + (i === depart ? " on" : "");
      grande.innerHTML = diapo.innerHTML;
      piste.appendChild(grande);
      const point = document.createElement("span");
      point.className = "lb-dot" + (i === depart ? " on" : "");
      points.appendChild(point);
    });
    total = piste.children.length;
    index = depart || 0;
    fenetre.classList.add("on");
    document.body.style.overflow = "hidden";
    enPause = true;
  }
  function positionner() {
    Array.from(piste.children).forEach((diapo, i) => diapo.classList.toggle("on", i === index));
    $$(".lb-dot", points).forEach((point, i) => point.classList.toggle("on", i === index));
  }
  const precedente = () => { index = (index - 1 + total) % total; positionner(); };
  const suivante = () => { index = (index + 1) % total; positionner(); };
  function fermer() {
    fenetre.classList.remove("on");
    document.body.style.overflow = "";
    enPause = false;
  }

  document.addEventListener("click", (evenement) => {
    const image = evenement.target.closest(".art.carrousel .car-slide img");
    if (!image || evenement.target.closest(".car-prev, .car-next")) return;
    const carrousel = image.closest(".art.carrousel");
    if (estFige(carrousel)) return;
    ouvrir(carrousel, parseInt(carrousel.dataset.idx, 10) || 0);
  });
  $(".lb-close", fenetre).onclick = fermer;
  fenetre.addEventListener("click", (evenement) => { if (evenement.target === fenetre) fermer(); });
  $(".lb-prev", fenetre).onclick = precedente;
  $(".lb-next", fenetre).onclick = suivante;
  document.addEventListener("keydown", (evenement) => {
    if (!fenetre.classList.contains("on")) return;
    if (evenement.key === "Escape") fermer();
    if (evenement.key === "ArrowLeft") precedente();
    if (evenement.key === "ArrowRight") suivante();
  });
})();
