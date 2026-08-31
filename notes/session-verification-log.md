# Log verifiche di regressione — Racing Dynasty

Note tecniche su verifiche incrociate fatte durante lo sviluppo, per tenere traccia di cosa è
stato controllato esplicitamente quando si aggiungono nuove funzionalità che toccano flussi
condivisi.

## Punto 13 (rivelazione punteggio Daily) — verifiche di non-regressione

Dopo aver inserito la nuova schermata daily-score-reveal tra la fine dell'ultima gara Daily e la
normale schermata fine stagione, verificato che NON abbia rotto:

- Fuochi d'artificio / badge Grand Slam per chi vince entrambi i titoli durante una Daily — OK,
  ancora funzionanti (renderSeasonEnd() calcola tutto fresco ad ogni suo render, indipendentemente
  da quanti passaggi intermedi ci sono voluti per arrivarci)
- Ciclo di vita del salvataggio locale Daily (racingDynastyDailySaveV1) — OK, resta presente
  durante la schermata di rivelazione (correttamente non toccato, essendo tra le NO_SAVE_PHASES),
  e viene eliminato correttamente una volta raggiunta season_end vera

Pattern generale da ricordare per il futuro: ogni volta che si inserisce una NUOVA fase
intermedia in un flusso esistente, controllare (1) se va aggiunta a NO_SAVE_PHASES, (2) se
qualche logica a valle si aspettava di essere raggiunta DIRETTAMENTE dal punto precedente e
potrebbe non attivarsi più correttamente con un passaggio in mezzo.
