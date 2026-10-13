/* ══ Réglages du catalogue ═══════════════════════════════════════════════════
   C'est le seul fichier à modifier pour brancher le Google Sheet ou changer une
   règle de vente. Le mode d'emploi complet est dans docs/GOOGLE-SHEET.md.

   sheetStockCsv  adresse CSV publiée de l'onglet principal (colonnes « Code »,
                  « Qté » et « Prix unitaire (€) »). Vide : le site garde les
                  quantités et les prix écrits dans la page.
   sheetLotsCsv   adresse CSV publiée de l'onglet « Lots » (colonnes « N° lot »
                  et « Décote (%) »). Vide : tous les lots prennent decoteDefaut.
   relectureSecondes  intervalle de relecture du Sheet. Google ne rafraîchit sa
                  copie publiée qu'environ toutes les 5 minutes : descendre sous
                  60 ne rend pas la mise à jour plus rapide. 0 = une seule lecture.
   decoteDefaut   remise (en %) d'un lot complet quand le Sheet n'en fixe pas.
   ecartPrixMax   garde-fou : un prix du Sheet plus de 10 fois plus haut ou plus
                  bas que celui de la page est ignoré (faute de frappe probable).
   seuilCommande  montant minimum (€) pour valider une demande de commande.
   emailCommandes adresse qui reçoit les demandes de commande.

   ⚠ L'adresse « /export?format=csv » d'un Sheet est privée : un visiteur ne peut
   pas la lire. Il faut l'adresse obtenue par Fichier > Partager > Publier sur le
   web > CSV. Pour l'onglet principal, ne pas ajouter « gid=0&single=true » :
   l'onglet publié ne porte pas le numéro 0 et Google répondrait une erreur 400.
   ══════════════════════════════════════════════════════════════════════════ */
window.CONFIG_CATALOGUE = {
  sheetStockCsv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR5a4FB35NcUqeXUIoXvJJ_D_Pyzrg4hR9TQwdSYYvgN-m9w55g7Lqco7xTf88xaNGAo9zH1bQzBYuc/pub?output=csv",
  sheetLotsCsv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR5a4FB35NcUqeXUIoXvJJ_D_Pyzrg4hR9TQwdSYYvgN-m9w55g7Lqco7xTf88xaNGAo9zH1bQzBYuc/pub?gid=1053747071&single=true&output=csv",
  relectureSecondes: 60,
  decoteDefaut: 35,
  ecartPrixMax: 10,
  seuilCommande: 15,
  emailCommandes: "toscanguiffault@gmail.com"
};
