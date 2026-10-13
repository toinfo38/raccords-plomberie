/* ══ Demande de commande ════════════════════════════════════════════════════
   Au clic sur « Valider la demande de commande » :
     1. le message de commande est rédigé (détail, tableau récapitulatif) ;
     2. le panier est vidé, le stock commandé réservé dans ce navigateur, et le
        catalogue verrouillé jusqu'à l'annulation ;
     3. le volet affiche la preuve de validation et les moyens de l'envoyer
        (application mail, Gmail, Outlook.com, copie, fichier texte).

   Le site est statique : il ne peut rien envoyer lui-même. C'est le client qui
   transmet le message, qui déclenche la préparation de la commande.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const C = window.Catalogue;
  const { $, config, stock, panier } = C;
  const { fiches } = stock;

  const DESTINATAIRE = config.emailCommandes || "toscanguiffault@gmail.com";

  /* Texte aligné en colonnes : complète à droite (gauche) ou à gauche (droite). */
  const aGauche = (texte, largeur) => String(texte).padEnd(largeur);
  const aDroite = (texte, largeur) => String(texte).padStart(largeur);

  function nouvelleReference() {
    const jour = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `CMD-${jour}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  /* Rédige le message à partir du panier. Ne modifie rien. */
  function rediger({ reference, nom, email }) {
    const { refs, lots } = panier.contenu();
    const references = [], lotsAchetes = [];
    const detailUnite = [], detailLots = [], tableau = [];
    let total = 0;

    Object.keys(refs).forEach((code) => {
      const fiche = fiches[code];
      if (!fiche) return;
      const quantite = refs[code];
      const sousTotal = fiche.prix * quantite;
      total += sousTotal;
      references.push({ code, quantite });
      detailUnite.push(`${code} — ${fiche.nom}\n  Quantité : ${quantite} x ${C.prix(fiche.prix)} = ${C.prix(sousTotal)}`);
    });

    Object.keys(lots).forEach((num) => {
      const lot = stock.infosLot(num);
      if (!lot) return;
      total += lot.prix;
      lotsAchetes.push(num);
      const entete = $(`.lot-entete[data-lot="${num}"]`);
      const lignes = [];
      let avantRemise = 0;
      (entete ? stock.codesDuLot(entete) : []).forEach((code) => {
        const fiche = fiches[code];
        const quantite = stock.stockActuel(code);
        if (!fiche || quantite <= 0) return;   // référence épuisée : hors du lot
        const sousTotal = fiche.prix * quantite;
        avantRemise += sousTotal;
        lignes.push("  " + aGauche(code, 8) + aGauche(fiche.nom, 42) + aDroite(quantite, 4)
          + " x " + aDroite(C.prix(fiche.prix), 9) + " = " + aDroite(C.prix(sousTotal), 10));
      });
      const remise = avantRemise * lot.decote / 100;
      detailLots.push(
        `Lot complet : ${lot.nom}\n`
        + "Références comprises dans ce lot :\n"
        + lignes.join("\n") + "\n"
        + "  " + aGauche("", 54) + "----------\n"
        + aGauche("  Total avant remise (valeur d'occasion)", 56) + aDroite(C.prix(avantRemise), 10) + "\n"
        + aGauche(`  Remise lot complet (-${C.pourcent(lot.decote)}%)`, 56) + aDroite("-" + C.prix(remise), 10) + "\n"
        + aGauche("  Prix final du lot", 56) + aDroite(C.prix(lot.prix), 10)
      );
      tableau.push({ libelle: `Lot complet — ${lot.nom}`, quantite: `${lot.refs} réf.`, prix: "", total: lot.prix });
    });

    Object.keys(refs).forEach((code) => {
      const fiche = fiches[code];
      if (!fiche) return;
      tableau.push({ libelle: `${code} — ${fiche.nom}`, quantite: refs[code], prix: C.prix(fiche.prix), total: fiche.prix * refs[code] });
    });

    /* tableau récapitulatif : texte aligné, sans HTML ni image, donc très léger */
    const recapitulatif =
      aGauche("Lot / Référence", 46) + aDroite("Qté", 8) + aDroite("Prix", 10) + aDroite("Total", 12) + "\n"
      + "-".repeat(76) + "\n"
      + tableau.map((l) => aGauche(l.libelle, 46) + aDroite(String(l.quantite), 8) + aDroite(l.prix, 10) + aDroite(C.prix(l.total), 12)).join("\n") + "\n"
      + "-".repeat(76) + "\n"
      + aGauche("TOTAL FINAL DE LA COMMANDE", 64) + aDroite(C.prix(total), 12);

    const separateur = "================================================\n";
    const corps = `Nouvelle demande de commande ${reference}\n`
      + `Date : ${new Date().toLocaleDateString("fr-FR")}\n`
      + `Client : ${nom || "non renseigné"} (${email})\n`
      + `Mode de réception : ${panier.modeReception()}\n\n`
      + separateur + "DÉTAIL DE LA COMMANDE\n" + separateur + "\n"
      + (detailUnite.length ? "--- Références à l'unité ---\n\n" + detailUnite.join("\n\n") + "\n\n" : "")
      + (detailLots.length ? detailLots.join("\n\n") + "\n\n" : "")
      + separateur + "RÉCAPITULATIF\n" + separateur + "\n"
      + recapitulatif + "\n\n"
      + `Total final : ${C.prix(total)} (hors frais de port, à convenir)\n\n`
      + "Ceci n'est pas un paiement : cette demande sera confirmée par email puis"
      + " finalisée via une annonce Leboncoin dédiée.\n\n"
      + "Le stock a été inventorié pièce par pièce et chaque référence\n"
      + "identifiée avec soin. Sur un ensemble de cette taille, une erreur\n"
      + "d'identification reste malgré tout possible : si une pièce ne\n"
      + "correspondait pas à sa fiche, signalez-le nous, nous la reprenons\n"
      + "ou nous ajustons la commande.";

    return { corps, total, tableau, references, lotsAchetes };
  }

  /* Liens d'envoi : application mail, Gmail et Outlook.com, client en copie. */
  function liensEnvoi(sujet, corps, email) {
    const copie = email.trim().toLowerCase() !== DESTINATAIRE.toLowerCase() ? email : "";
    const enc = encodeURIComponent;
    return {
      copie,
      mailto: `mailto:${DESTINATAIRE}${copie ? "?cc=" + enc(copie) : "?"}&subject=${enc(sujet)}&body=${enc(corps)}`,
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(DESTINATAIRE)}${copie ? "&cc=" + enc(copie) : ""}&su=${enc(sujet)}&body=${enc(corps)}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(DESTINATAIRE)}${copie ? "&cc=" + enc(copie) : ""}&subject=${enc(sujet)}&body=${enc(corps)}`
    };
  }

  function afficherPreuve({ reference, total, tableau, sujet, corps, liens }) {
    const e = C.echapper;
    $("#panier .lignes").style.display = "none";
    $("#panier .etape-coord").style.display = "none";
    $("#panier footer").style.display = "none";
    const preuve = $("#panier .preuve");
    preuve.style.display = "block";
    preuve.innerHTML =
      "<h4>Demande prête à être transmise</h4>"
      + `<p>Référence : <span class="ref">${reference}</span></p>`
      + `<p class="mode">Mode de réception : <strong>${e(panier.modeReception())}</strong></p>`
      + "<ul><li>" + tableau.map((l) => e(`${l.libelle} — ${C.prix(l.total)}`)).join("</li><li>") + "</li></ul>"
      + `<p><strong>Total : ${C.prix(total)}</strong> (hors frais de port, à convenir)</p>`
      + '<p class="delai">La préparation de votre commande ne peut débuter qu\'après réception du mail '
      + "de commande par le gestionnaire du site. La validation ici ne déclenche donc rien automatiquement : "
      + "il faut envoyer le message ci-dessous pour que la préparation commence.</p>"
      + '<p class="avert">Ce site est statique : il ne peut pas garantir l\'envoi automatique d\'un email. '
      + "Choisissez ci-dessous la méthode qui correspond à votre messagerie. Le mail contient le détail complet "
      + "et un tableau récapitulatif (texte uniquement, sans photo — reste très léger).</p>"
      + '<div class="preuve-actions">'
      + `<a class="pv-btn" href="${liens.mailto}">Ouvrir l'application mail</a>`
      + `<a class="pv-btn" target="_blank" rel="noopener" href="${liens.gmail}">Ouvrir dans Gmail</a>`
      + `<a class="pv-btn" target="_blank" rel="noopener" href="${liens.outlook}">Ouvrir dans Outlook.com</a>`
      + '<button type="button" class="pv-btn" id="pv-copier">Copier le texte de la demande</button>'
      + '<button type="button" class="pv-btn" id="pv-telecharger">Télécharger la preuve (.txt)</button>'
      + "</div>"
      + '<p class="pv-statut" id="pv-statut"></p>'
      + '<p class="relance">Quel que soit le moyen choisi, transmettez-nous ce message '
      + `(destinataire : ${DESTINATAIRE}${liens.copie ? ", vous en copie" : ""}) pour valider votre demande — ce n'est pas un paiement. `
      + "Nous revenons vers vous par email pour organiser la suite (annonce Leboncoin dédiée et frais de port).</p>";

    const texteComplet = `À : ${DESTINATAIRE}${liens.copie ? "\nCC : " + liens.copie : ""}\nObjet : ${sujet}\n\n${corps}`;
    $("#pv-copier").onclick = () => {
      const statut = $("#pv-statut");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texteComplet)
          .then(() => { statut.textContent = "Texte copié — collez-le dans un nouvel email."; })
          .catch(() => { statut.textContent = "Copie automatique impossible ; sélectionnez et copiez le texte manuellement."; });
      } else {
        statut.textContent = "Copie automatique non disponible sur ce navigateur ; utilisez plutôt le téléchargement.";
      }
    };
    $("#pv-telecharger").onclick = () => {
      const url = URL.createObjectURL(new Blob([texteComplet], { type: "text/plain;charset=utf-8" }));
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `preuve-${reference}.txt`;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    };
  }

  $("#panier .go").onclick = () => {
    const erreur = $("#panier .err");
    const email = $("#cli-email")?.value || "";
    const nom = $("#cli-nom")?.value || "";
    if (!/.+@.+\..+/.test(email)) {
      erreur.textContent = "Merci de renseigner une adresse email valide.";
      erreur.style.display = "block";
      return;
    }
    erreur.style.display = "none";

    const reference = nouvelleReference();
    const sujet = `Demande de commande ${reference}`;
    const message = rediger({ reference, nom, email });
    const liens = liensEnvoi(sujet, message.corps, email);

    /* La demande est « partie » du point de vue du panier : on le vide, puis on
       réserve le stock commandé (dans ce navigateur seulement) et on verrouille
       le catalogue. appliquerEtat redessine ensuite toute la page. */
    panier.vider();
    message.references.forEach(({ code, quantite }) => stock.reserver(code, quantite));
    message.lotsAchetes.forEach((num) => stock.reserverLot(num));
    panier.verrouiller();
    stock.appliquerEtat();

    afficherPreuve({ reference, total: message.total, tableau: message.tableau, sujet, corps: message.corps, liens });
  };
})();
