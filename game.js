/* ============================================================
   RACING DYNASTY — Roguelike GP Manager
   Motore di gioco: base browsergame, dati dal database V1
   ============================================================ */

// V0.9.7.8.11 — PWA: gli asset (immagini, audio) sono ora file separati in assets/ e audio/,
// caricati normalmente dal browser via <img>/<audio src="...">, non piu' base64 incorporato.
// Il gioco DATA invece serve subito e ovunque nel codice come oggetto JS gia' pronto: lo carichiamo
// con una XHR SINCRONA (unica eccezione, deliberata) cosi' il resto del file — migliaia di righe
// che oggi si aspettano DATA gia' popolato — non deve cambiare. Richiede di essere servito via
// http(s) (anche in locale), NON funziona aprendo il file direttamente col doppio click.
// V0.9.7.8.33: numero di versione mostrato al giocatore, centralizzato in un unico punto —
// prima era scritto a mano in 3 punti diversi e si era disallineato (mostrava ancora v0.9.5
// nonostante decine di aggiornamenti successivi). Aggiornare SOLO qui d'ora in poi.
const GAME_VERSION = 'v0.9.7.8.33';
const DATA = (function(){
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'data/data.json', false);
  xhr.send(null);
  if(xhr.status!==200 && xhr.status!==0){
    document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:sans-serif;text-align:center;">Impossibile caricare data/data.json (status '+xhr.status+').<br>Questa app va servita via http/https (anche in locale), non aperta col doppio click.</div>';
    throw new Error('Caricamento dati fallito');
  }
  return JSON.parse(xhr.responseText);
})();
// V0.9.3.1: piccola normalizzazione di coerenza costo/potenza/rischio sugli upgrade — non stravolge
// i valori originali (miscela 55/45), corregge solo gli scostamenti piu' evidenti dal modello atteso.
(function rebalanceUpgrades(){
  if(!DATA.upgrade || !DATA.upgrade.length) return;
  const BASE_PER_POINT = 1300000;
  DATA.upgrade.forEach(u=>{
    if(!u.guadagno || u.guadagno<=0) return;
    const riskDiscount = 1 - (u.probfallimento/100)*0.35;
    const modelCost = BASE_PER_POINT * u.guadagno * riskDiscount;
    u.costo = Math.round((0.55*u.costo + 0.45*modelCost)/100000)*100000;
  });
})();
const INTRO_CAR_URI = 'assets/intro-car.png'; // V0.9.2: intro con vettura vista da dietro
// V0.9.7.8.11: SHARE_POSES/CIRCUIT_TROPHIES/ACHIEVEMENT_ICONS non servono piu' come oggetti —
// i percorsi si calcolano al volo (vedi sharePoseSrc/circuitTrophySrc/achievementIconSrc piu' sotto).

/* ============================================================
   V0.9.7.8.2 — AUDIO MANAGER
   Placeholder sintetizzati via Web Audio API (nessun file esterno): stessi 18 nomi/hook
   della tabella SFX fornita da Gio, cosi' quando arrivano i file veri (Kenney/Mixkit) basta
   sostituire la funzione synth corrispondente con un vero <audio>/AudioBufferSourceNode che
   carica /sounds/<nome>.ogg — il resto del codice (i punti in cui chiamiamo playSfx(...)) non
   deve cambiare. Due volumi separati (SFX/Musica) come richiesto nel report playtest; il volume
   Musica e' gia' predisposto in UI/storage anche se nessuna musica e' ancora implementata.
   ============================================================ */
const AUDIO_SETTINGS_KEY = 'racingDynastyAudioV1';
function loadAudioSettings(){
  try{
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    return raw ? { sfxVolume:0.6, musicVolume:0.5, sfxEnabled:true, musicEnabled:true, hapticEnabled:true, ...JSON.parse(raw) } : { sfxVolume:0.6, musicVolume:0.5, sfxEnabled:true, musicEnabled:true, hapticEnabled:true };
  }catch(e){ return { sfxVolume:0.6, musicVolume:0.5, sfxEnabled:true, musicEnabled:true, hapticEnabled:true }; }
}
let audioSettings = loadAudioSettings();

// V0.9.7.8.26 — SISTEMA LINGUA: fase 1. Copre titolo, menu, hub, impostazioni, crediti — la parte
// SEMPRE visibile del gioco. Obiettivi (50), eventi narrativi di gara (120) e Guida restano in
// italiano per ora, sono un secondo giro di lavoro dato il volume di testo.
function loadLang(){
  try{ return localStorage.getItem('racingDynastyLangV1') || 'it'; }catch(e){ return 'it'; }
}
let currentLang = loadLang();
function saveLang(){ try{ localStorage.setItem('racingDynastyLangV1', currentLang); }catch(e){} }
function hasLangBeenChosen(){ try{ return localStorage.getItem('racingDynastyLangChosenV1')==='1'; }catch(e){ return false; } }
function markLangChosen(){ try{ localStorage.setItem('racingDynastyLangChosenV1','1'); }catch(e){} }
const I18N = {
  it: {
    back_to_mode_select: '← Torna al Bivio', museum_shared_tag: 'condiviso tra le modalità',
    mode_select_title: 'Che tipo di carriera vuoi?', mode_select_subtitle: 'Due modalità completamente separate — puoi avere entrambe in corso allo stesso tempo.',
    mode_select_team: 'Carriera Scuderia', mode_select_team_desc: 'Gestisci una scuderia intera: piloti, componenti, budget. La modalità classica.', mode_select_team_hint: 'Tocca per scegliere — Carriera Scuderia',
    mode_select_driver: 'Carriera Pilota', mode_select_driver_desc: 'Sei un pilota solo, dal debutto in Kart al ritiro. Cresci, firmi contratti, costruisci un palmarès.', mode_select_driver_hint: 'Tocca per scegliere — Carriera Pilota',
    dc_pick_profile: 'Tocca per scegliere', dc_title: 'Crea il tuo pilota', dc_subtitle: 'Parti dal Kart, a 18 anni, con tutto ancora da dimostrare.',
    dc_name_placeholder: 'Es. Nome Cognome', dc_profile_eyebrow: 'Scegli il tuo profilo di partenza',
    dc_profile_subtitle: `Archetipo e mentalità abbinati — parti "acerbo" in questo stile, l'effetto pieno arriva rafforzandolo in gara.`,
    dc_confirm: 'Conferma e debutta →', dc_default_name: 'Pilota Senza Nome',
    dc_done_title: 'Pilota creato', dc_done_subtitle: 'Punto 2 completato — da qui in poi serve l\'Hub vero (punto 3).',
    dc_done_world_info: (n)=>`Il mondo delle 30 scuderie è pronto: ${n} in Kart, 10 in Serie Minore, 10 in Serie Elite, ognuna con una storia simulata alle spalle.`,
    dc_done_footer: 'Schermata temporanea di verifica — non ancora giocabile oltre questo punto.',
    sl_go_msg: 'VIA!!', sl_ready_msg: 'Pronti...', sl_lighting_msg: 'Si accendono le luci…',
    menu_exit_fullscreen: 'Esci da Schermo Intero',
    draft_founding: 'Fondazione scuderia',
    promo_banner_tagline: 'Piccolo studio, giochi fuori misura', promo_banner_cta: 'Scopri di più ↗',
    se_fs_title: "Ti sta piacendo?", se_fs_body: "Questo è il primo gioco di FUORISCALA, uno studio indipendente piccolo piccolo. Passa a trovarci — un click, zero impegno, e ci aiuti a fare il prossimo.",
    se_fs_cta: "Scopri FUORISCALA ↗",
    share_trophy_title: '🏆 SALA TROFEI', share_trophy_stats: (r,t,w)=>`${r}/${t} circuiti corsi  ·  ${w}/${t} vinti`,
    share_world_champion: 'CAMPIONE DEL MONDO', share_drivers_title: (team)=>`${team} — Titolo Piloti`,
    share_season_over: (pos)=>`Stagione conclusa — P${pos} Costruttori`, share_full_season: 'Stagione Completa (20 gare)',
    share_quick_season: 'Stagione Veloce (10 gare)', share_manager_tag: 'ROGUELIKE GP MANAGER',
    share_wins: (n)=>`${n} vittorie`, share_podiums: (n)=>`${n} podi`, share_points: (n)=>`${n} punti`,
    share_dnfs: (n)=>`${n} ritiri`, share_champion_line: (n)=>`${n}, Campione`, share_beat_me: 'PROVA A BATTERMI',
    splash_presents: 'FUORISCALA presenta', splash_tap_continue: 'tocca per continuare',
    sl_races_word: 'GARE',
    settings_sfx_vol_short: 'Effetti Sonori', settings_music_vol_short: 'Musica',
    menu_home: 'Home', menu_section_game: 'GIOCO', menu_section_progress: 'PROGRESSI', menu_section_info: 'INFO', menu_section_app: 'APP',
    status_retired: 'RITIRATO', status_retired_short: 'RIT', status_box: 'BOX', status_penalty: 'PENALITÀ', status_on_track: 'In pista', status_leader: 'Leader',
    pg_rain_expected: 'Pioggia attesa', pg_rain_risk: (p)=>`Rischio pioggia ${p}%`, pg_dry_track: 'Pista asciutta',
    pg_rating_gap: 'Distacco Rating dal Rivale', pg_main_rival: 'Rivale principale', pg_none_yet: 'Ancora nessuna',
    pg_lineup: (team)=>`Schieramento — ${team}`, pg_team_rating: 'Rating Squadra', pg_weather_forecast: 'Meteo Previsto',
    pg_go_to_race: 'Vai alla Gara →', pg_details_toggle: '🔍 Dettagli — componenti, statistiche, griglia completa',
    cat_aero_pack: 'Pacchetto Aerodinamico', cat_tire_supplier: 'Fornitore Gomme',
    pcard_guaranteed: 'UPGRADE GARANTITO', pcard_development: 'SVILUPPO', pcard_cost: 'Costo', pcard_no_risk: 'Nessun rischio',
    pcard_insufficient_budget: 'Budget insufficiente', pcard_tap_buy: 'Tocca per acquistare',
    pcard_frozen: (max)=>`Budget insufficiente — nemmeno l'investimento minimo (rischio ${max}%) è alla tua portata ora.`,
    pcard_invest_cost: 'Costo', pcard_slider_hint: '← più economico, più rischio &nbsp;·&nbsp; più sicuro, più caro →',
    pcard_if_fails: (m)=>`Se fallisce: ${m}`, pcard_more_info: 'Più info', pcard_dev_area: (a)=>`Area di sviluppo: ${a}`,
    pcard_duration: (d)=>`Durata effetto: ${d}`, pcard_risk_range: (min,max,hasMalus)=>`Il rischio va sempre da ${max}% (investimento minimo, più economico) a ${min}% (investimento massimo, mai a zero)${hasMalus?'. In caso di fallimento potrebbe applicarsi un malus':''}.`,
    pcard_confirm_invest: 'Conferma Investimento',
    pcard_mentality: 'Mentalità', pcard_type: 'Tipologia', pcard_in_use: 'In uso ora',
    pcard_scouting_title: (l)=>`Scouting Libero — ${l}`, pcard_scouting_hint: 'Confronta con quello che hai già in squadra: un tocco apre il confronto dettagliato prima di confermare.',
    pcard_scouting_note: (k)=>`<b style="color:var(--text);">Le sostituzioni che abbassano il rating non chiudono il turno</b> — puoi farne più di una, se disponibile. Il semicerchio indica la ${k} del pezzo — passa il mouse per il nome. Le righe verdi ti danno un bonus sinergia se le scegli.`,
    pcard_synergy_plus: (l)=>`+ Sinergia ${l}`, pcard_synergy_plus_short: (l)=>`+ ${l}`, pcard_synergy_minus: (l)=>`− Sinergia ${l}`, pcard_synergy_minus_short: (l)=>`− ${l}`,
    classify_upgrade: 'UPGRADE GARANTITO', classify_opportunity: 'OPPORTUNITÀ', classify_trade: 'SCAMBIO', classify_replacement: 'SOSTITUZIONE',
    eff_qualifying: 'Qualifica', eff_dry_race: 'Gara asciutta', eff_wet_race: 'Gara bagnata',
    eff_reliability: 'Affidabilità', eff_fast_circuits: 'Prestazione circuiti veloci', eff_street_circuits: 'Prestazione circuiti cittadini',
    pc_confirm_title: (l)=>`Conferma Sostituzione — ${l}`, pc_semaforo_title: 'Effetto su Semaforo e Rating Scuderia',
    pc_before: 'PRIMA', pc_after: 'DOPO', pc_rating: 'RATING',
    pc_disclaimer: 'Una volta confermato, il componente attuale non può essere recuperato in questa carriera. I dettagli del confronto sono qui sotto.',
    pc_gain: (n)=>`Incassi: +${n}`, pc_cost: (n)=>`Costo: -${n}`, pc_budget_avail: (n)=>`Budget disponibile: ${n}`,
    pc_downgrade_note: 'Rating più basso di quello attuale: questo scambio non chiude il turno.',
    pc_cant_afford: 'Budget insufficiente per questa sostituzione.',
    pc_confirm_btn: 'Conferma', pc_cancel_btn: 'Annulla', pc_current_vs_proposed: 'Attuale vs Proposto',
    pc_current: 'ATTUALE', pc_proposed: 'PROPOSTO', pc_current_traits: 'Bonus/Malus/Abilità attuali', pc_proposed_traits: 'Bonus/Malus/Abilità proposti',
    pc_trait: 'Trait', pc_estimated_effect: 'Effetto Stimato sulla Scuderia', pc_avg_all_circuits: 'MEDIA SU TUTTI I CIRCUITI',
    pit_rivals_plural: 'Le Tue Rivali', pit_rivals_single: 'La Tua Rivale', pit_quick_ref: 'RIFERIMENTO RAPIDO', pit_strength: 'forza',
    upg_developing: 'Sviluppo in corso…', upg_tap_skip: 'Tocca per saltare',
    upg_failed: 'Sviluppo Fallito', upg_success: 'Sviluppo Riuscito!', upg_risk_taken: (p)=>` · rischio corso: ${p}%`,
    upg_no_gain: 'Nessun guadagno questa volta.', upg_gain_global: (n)=>`+${n} RATING diffuso su tutta la vettura`,
    upg_gain_area: (n,a)=>`+${n} RATING su ${a}`, upg_continue: 'Continua →',
    upcoming_title: 'Prossimi Circuiti', upcoming_most_useful: 'COMPONENTE PIÙ UTILE', upcoming_next: 'PROSSIMA', upcoming_race: (n)=>`GARA ${n}`,
    museum_title: '🏛️ Museo Dynasty', museum_tagline: 'Ogni pilota e componente portato fino in fondo a una stagione, o sostituito lungo il percorso, resta qui per sempre.',
    museum_completion: 'COMPLETAMENTO', museum_back: '← Torna Indietro', museum_drivers: 'Piloti', museum_components: 'Componenti',
    museum_no_drivers: 'Nessun pilota ancora sbloccato: portane uno fino a fine stagione, o sostituiscilo, per iniziare la collezione.',
    museum_no_components: 'Nessun componente ancora sbloccato.',
    tr_title: '🏆 Sala Trofei', tr_tagline: 'Un trofeo per ogni circuito — oro se vinto, grigio se corso, nascosto se non ancora visto.',
    tr_raced: 'CIRCUITI CORSI', tr_won: 'CIRCUITI VINTI', tr_share: '📤 Condividi Sala Trofei', tr_museum_btn: '🏛️ Museo Dynasty', tr_back: '← Torna Indietro',
    mss_eyebrow: (r,tot)=>`🏁 MID SEASON DRAFT — Gara ${r}/${tot}`, mss_title: "L'unica finestra di mercato piloti della stagione",
    mss_subtitle: "Puoi sostituire nessuno, uno solo, o entrambi i piloti: la scelta è indipendente per ciascun sedile e resta valida fino all'ultima gara. Nessun rischio: se paghi il prezzo di scouting, ottieni il pilota. Da qui in poi, per il resto della stagione, i piloti restano fissi — lo sviluppo componenti riprende regolarmente dalla prossima pit-lane.",
    mss_pilot_main: 'Pilota Principale', mss_pilot_second: 'Secondo Pilota', mss_confirm: 'Conferma Scelte e Prosegui →',
    rcs_beat_single: (n)=>`Hai battuto la tua rivale, ${n}.`, rcs_lost_single: (n)=>`${n} ti ha battuto in classifica.`,
    rcs_tied: 'Hai chiuso in parità con la tua rivale.', rcs_beat_all: (n)=>`Hai battuto tutte le tue rivali (${n}).`,
    rcs_lost_all: (n)=>`Le tue rivali ti hanno battuto tutte (${n}).`, rcs_mixed: (b,l)=>`Hai battuto ${b}, ma perso da ${l}.`,
    se_doppietta_pill: 'DOPPIETTA', se_doppietta_title: '🏆🏆 DOPPIO TITOLO MONDIALE',
    se_driver_champ_pill: 'CAMPIONE PILOTI', se_driver_champ_title: '🏆 CAMPIONE DEL MONDO PILOTI',
    se_constr_champ_pill: 'CAMPIONE COSTRUTTORI', se_constr_champ_title: '🏆 CAMPIONE DEL MONDO COSTRUTTORI',
    se_end_pill: 'FINE STAGIONE', se_end_top3: (n,p)=>`Complimenti ${n} ha chiuso in P${p}`, se_end_other: (n,p)=>`${n} chiude la stagione in P${p}`,
    se_summary: (team,pts,wins,pod,dnf,tot,budget)=>`${team} chiude la stagione con ${pts} punti complessivi, ${wins} vittorie, ${pod} podi e ${dnf} ritiri su ${tot} gare. Budget residuo: ${budget}.`,
    se_new_career: 'Nuova Carriera', se_share: '📤 Condividi Risultato', se_your_drivers: 'I Tuoi Piloti',
    se_pilot1: (n)=>`Pilota #1 — ${n}`, se_pilot2: (n)=>`Pilota #2 — ${n}`, se_drivers_pos: (p)=>`Posizione Piloti: P${p}`,
    se_stats: (pts,wins,pod,dnf)=>`${pts} punti · ${wins} vittorie · ${pod} podi · ${dnf} ritiri`,
    se_team_constr_pos: (team,pos)=>`Scuderia <b>${team}</b> — Posizione Costruttori: <b style="color:var(--cyan);">P${pos}</b>`,
    se_final_drivers: 'Classifica Piloti Finale', se_final_constr: 'Classifica Costruttori Finale', se_champion: 'CAMPIONE',
    se_th_pos: 'Pos', se_th_driver: 'Pilota', se_th_team: 'Scuderia', se_th_points: 'Punti',
    se_you_badge: 'TU', se_ex_badge: 'EX', se_rival_badge: 'RIVALE',
    se_footer: 'Ogni nuova run genera un nuovo draft di piloti e componenti — la stagione in corso viene salvata automaticamente.',
    expl_retired: 'Ritirato — nessun punto raccolto in questo Gran Premio.',
    expl_gained: (grid,pos,delta)=>`Partito P${grid}, arrivato P${pos}: <b>+${delta} posizion${delta===1?'e':'i'}</b> guadagnat${delta===1?'a':'e'} in gara.`,
    expl_lost: (grid,pos,delta)=>`Partito P${grid}, arrivato P${pos}: <b>${delta} posizion${delta===-1?'e':'i'}</b> perse in gara.`,
    expl_same: (grid)=>`Partito e arrivato P${grid}: nessun cambio di posizione rispetto alla griglia.`,
    expl_dominant: (area,rating,band)=>`Circuito che richiede soprattutto <b>${area}</b>: la tua è a ${rating} — fascia ${band}.`,
    expl_band_excellent: 'eccellente', expl_band_good: 'buona', expl_band_average: 'nella media', expl_band_below: 'sotto la media', expl_band_weak: 'debole',
    expl_rain_changed: 'Meteo cambiato in gara: pioggia arrivata.', expl_rain_wet: 'Gara sul bagnato.',
    expl_rain_handling: (name,stat)=>`Gestione pioggia di ${name}: ${stat}.`,
    expl_safety_car: 'Safety Car in gara: griglia compattata, occasione di sorpasso o di difesa a seconda della posizione.',
    race_result_retired: 'RIT', race_result_retired_full: 'RITIRATO',
    race_result_you_badge: 'TU', race_result_rival_badge: 'RIVALE', race_result_no_events: 'Nessun evento di rilievo in questo Gran Premio.',
    race_result_title: (n,tot)=>`Risultato Gran Premio ${n}/${tot}`, race_result_continue: 'Continua →',
    race_result_why: '❓ Perché sei arrivato così', race_result_finish_order: 'Ordine di Arrivo', race_result_20_drivers: '20 PILOTI',
    race_result_th_pos: 'Pos', race_result_th_num: '#', race_result_th_driver: 'Pilota', race_result_th_team: 'Scuderia', race_result_th_points: 'Punti',
    race_result_event_log: 'Log Eventi di Gara', race_result_show_full_log: (n)=>`Mostra il log completo della gara (${n} eventi)`,
    rival_ahead: (n)=>`+${n} su di loro`, rival_behind: (n)=>`${n} da recuperare`, rival_tied: 'in parità',
    rival_you_badge: 'TU', rival_constructor_points: 'punti costruttori · forza',
    rival_title_initial: '🎯 La Tua Rivalità', rival_title_new: '↗ Nuova Rivalità',
    rival_subtitle_initial_plural: 'In base alla forza della tua scuderia, queste sono le tue scuderie rivali. Batterle è il primo obiettivo della stagione, prima ancora del titolo.',
    rival_subtitle_initial_single: 'In base alla forza della tua scuderia, questa è la tua scuderia rivale. Batterle è il primo obiettivo della stagione, prima ancora del titolo.',
    rival_subtitle_new: (names)=>`Hai superato ${names}: non c'è più partita con loro.`,
    rival_new_goal_plural: ' I tuoi nuovi obiettivi:', rival_new_goal_single: ' Il tuo nuovo obiettivo:',
    rival_continue: 'Continua →',
    sponsor_technical: 'Sponsor Tecnico', sponsor_secondary: 'Sponsor Secondario',
    sponsor_desc_title_prizes: 'sui premi gara.', sponsor_desc_title_condition: 'Attivo solo mentre resti in Top 8 in classifica Costruttori — se scendi sotto, il bonus si sospende (torna da solo se rientri in Top 8).',
    sponsor_desc_tecnico: (cat)=>`Sblocca da subito gli upgrade "${cat}" normalmente riservati agli sponsor. Nessun bonus economico diretto.`,
    sponsor_desc_secondario_amount: '+0.3M a gara', sponsor_desc_secondario_rest: ', fisso, garantito, senza alcuna condizione.',
    sponsor_choose_subtitle: 'Scegli il tuo sponsor per la stagione', sponsor_choose_one: "Scegli una sola offerta per l'intera stagione",
    sponsor_headline: 'Chi ti accompagna quest\'anno?', sponsor_subtitle: 'La scelta vale per tutta la stagione e non si può cambiare a metà strada.',
    naming_title: 'Dai un nome alla tua scuderia', naming_optional: 'Facoltativo — se lo lasci vuoto useremo un nome automatico (es. "Dynasty Racing").',
    naming_placeholder: 'Es. Nova Racing Team', naming_inspire: '🎲 Ispira la scuderia', naming_nation: 'Nazione della Scuderia',
    naming_confirm: 'Conferma e inizia il Draft →',
    sl_choose: 'Scegli la lunghezza della stagione', sl_subtitle: 'Un tocco e si passa alla scelta della difficoltà.',
    sl_quick: 'STAGIONE VELOCE', sl_quick_desc: 'Il formato classico: 10 Gran Premi, pit-lane completo (upgrade e scouting, pilota incluso) ad ogni gara.', sl_quick_hint: 'Tocca per scegliere — Stagione Veloce',
    sl_full: 'STAGIONE COMPLETA', sl_full_desc: 'Il doppio dei Gran Premi. Gli upgrade dei componenti restano disponibili come sempre, ma il Secondo Pilota si può cambiare una sola volta, in una finestra dedicata tra la gara 10 e la gara 11.', sl_full_hint: 'Tocca per scegliere — Stagione Completa',
    sl_trophy_room: 'SALA TROFEI', sl_raced: 'CORSI', sl_won: 'VINTI', sl_trophy_desc: 'Un trofeo per ogni circuito del mondo — rivivi le tue vittorie e scopri quanti ne mancano ancora alla collezione completa.', sl_trophy_hint: 'Tocca per aprire — Sala Trofei',
    sl_museum: 'MUSEO DYNASTY', sl_completion: 'COMPLETAMENTO', sl_museum_desc: 'Piloti e componenti portati fino in fondo a una stagione, o sostituiti lungo il percorso, restano qui per sempre.', sl_museum_hint: 'Tocca per aprire — Museo Dynasty',
    sl_garage: 'GARAGE', sl_garage_desc: 'Personalizza la livrea del telaio con pattern sbloccabili completando obiettivi.', sl_garage_soon: '🔒 PROSSIMAMENTE',
    diff_new_career: 'Nuova Carriera', diff_choose: 'Scegli la difficoltà',
    diff_subtitle: 'Incide solo sui reroll disponibili nel draft — un tocco e si parte.',
    diff_last_used: ' · ultima usata', diff_tap_hint: (l)=>`Tocca per avviare — ${l}`,
    pitlane_window: 'Pit Lane · Finestra di Sviluppo', pitlane_headline: 'Scegli come investire prima della prossima gara',
    pitlane_subtitle: 'Nodo roguelike: puoi comprare un upgrade permanente, sostituire un componente tramite scouting, oppure conservare il budget.',
    pitlane_skip: 'Salta — conserva il budget', pitlane_team_now: 'La Tua Scuderia Ora', pitlane_strength: 'FORZA',
    draft_reroll: (n)=>`Reroll — ${n} rimasti`, draft_hardcore_no_reroll: 'HARDCORE · NESSUN REROLL DISPONIBILE',
    draft_pilot_nth: (nth)=>`Pilota (${nth})`, draft_choose_one: 'Scegli una sola offerta per questo turno',
    draft_headline: "Cogli l'attimo, o l'attesa ti premierà?",
    draft_subtitle: 'Le altre offerte di questo turno spariscono: al turno successivo torneranno proposte nuove per le categorie ancora libere.',
    draft_already_chosen: 'GIA SCELTE QUESTA SESSIONE', draft_taken: ' · PRESO', draft_pilot_first_taken: 'Pilota (1º) · PRESO',
    sponsor_suspended: 'sospeso',
    hub_next_gp: 'Prossimo Gran Premio', hub_rain: 'Pioggia', hub_safety_car: 'Safety Car',
    hub_overtake: 'Sorpasso', hub_degradation: 'Degrado', hub_team_strength: 'FORZA SCUDERIA (P1/P2)',
    hub_pos_drivers: 'POS. PILOTI', hub_pos_constructors: 'POS. COSTRUTTORI', hub_go_to_gp: 'Vai al Gran Premio →',
    hub_rivalry: '🏆 Rivalità', hub_calendar: '🗓️ Calendario Stagione', hub_race_word: 'GARA',
    hub_your_team: '🏎️ La Tua Scuderia', hub_dominant_component: 'Componente dominante', hub_special_event: 'Evento speciale',
    hub_weather: 'Clima', comp_driver1: 'Pilota #1', comp_driver2: 'Pilota #2', comp_engine: 'Motore',
    comp_chassis: 'Telaio', comp_aero: 'Aerodinamica', comp_tires: 'Gomme', comp_strategist: 'Team Principal',
    // Titolo
    title_tagline_return: (race,total)=>`Bentornato — hai una stagione in corso (Gara ${race}/${total})`,
    title_continue: '▶ Continua Stagione', title_new: 'Nuova Stagione', title_delete: '🗑 Cancella Salvataggio',
    title_cta: '🏁 Scegli la tua sfida e scendi in pista — ', title_cta_bold: 'premi per iniziare',
    // Menu laterale
    menu_new_career: 'Nuova Carriera', menu_trophy_room: 'Sala Trofei', menu_guide: 'Guida',
    menu_achievements: 'Obiettivi', menu_settings: 'Impostazioni', menu_credits: 'Crediti',
    menu_fullscreen: 'Schermo Intero', menu_language: 'Lingua',
    // Impostazioni comuni
    settings_title: '⚙️ Impostazioni', settings_sfx_vol: 'Volume Effetti', settings_music_vol: 'Volume Musica',
    settings_haptic: 'Feedback Aptico', settings_speed: 'Velocità Gara Predefinita', settings_decision_timer: 'Countdown Decisioni',
    settings_export: 'Esporta Run (.json)', settings_import: 'Importa Run (.json)', settings_install: "Installa l'App",
    settings_reset: 'Ripristina Tutto (Prima Apertura)', on: 'Attivo', off: 'Disattivato',
    // Crediti
    credits_title: '🏢 Crediti', credits_tagline: 'Piccolo studio. Giochi fuori misura.',
    credits_first_game: 'Il primo gioco di FUORISCALA', credits_dev: 'Sviluppato e pubblicato da',
    credits_created: 'Creato da',
    // Hub — etichette HUD
    hud_reroll: 'Reroll', hud_budget: 'Budget', hud_sponsor: 'Sponsor', hud_race: 'Gara',
    hud_best_driver: 'Miglior Pilota', hud_constructors: 'Costruttori',
    // Log gara live
    race_lap: 'GIRO', race_retirement: (d,tm)=>`Ritiro per ${d} (${tm})`, race_your_driver_bang: ' — è un tuo pilota!',
    race_your_driver_paren: ' (tuo pilota)', race_safety_car_track: 'SAFETY CAR in pista',
    race_restart: 'Ripartenza, gara regolare', race_weather_change: (w)=>`Il meteo cambia: pista ${w}`,
    weather_wet: 'bagnata', weather_dry: 'asciutta', race_pit_wave: 'Ondata di soste ai box',
    race_gains: 'guadagna', race_loses: 'perde', race_position: 'posizione', race_positions: 'posizioni',
    race_lights_out: 'Si spengono i semafori, si parte!', race_checkered: 'BANDIERA A SCACCHI — gara conclusa!',
  },
  en: {
    back_to_mode_select: '← Back to Selection', museum_shared_tag: 'shared across modes',
    mode_select_title: 'What kind of career do you want?', mode_select_subtitle: 'Two completely separate modes — you can have both in progress at the same time.',
    mode_select_team: 'Team Career', mode_select_team_desc: 'Manage an entire team: drivers, components, budget. The classic mode.', mode_select_team_hint: 'Tap to choose — Team Career',
    mode_select_driver: 'Driver Career', mode_select_driver_desc: 'You are a single driver, from your Kart debut to retirement. Grow, sign contracts, build a legacy.', mode_select_driver_hint: 'Tap to choose — Driver Career',
    dc_pick_profile: 'Tap to choose', dc_title: 'Create your driver', dc_subtitle: 'You start in Kart, at 18, with everything still to prove.',
    dc_name_placeholder: 'E.g. First Last', dc_profile_eyebrow: 'Choose your starting profile',
    dc_profile_subtitle: 'Archetype and mentality paired together — you start "green" in this style, full effect comes from strengthening it in races.',
    dc_confirm: 'Confirm and debut →', dc_default_name: 'Unnamed Driver',
    dc_done_title: 'Driver created', dc_done_subtitle: "Step 2 complete — from here on the real Hub (step 3) is needed.",
    dc_done_world_info: (n)=>`The world of 30 teams is ready: ${n} in Kart, 10 in Minor Series, 10 in Elite Series, each with a simulated history behind it.`,
    dc_done_footer: 'Temporary verification screen — not yet playable beyond this point.',
    sl_go_msg: 'GO!!', sl_ready_msg: 'Ready...', sl_lighting_msg: 'Lights coming on…',
    menu_exit_fullscreen: 'Exit Fullscreen',
    draft_founding: 'Team founding',
    promo_banner_tagline: 'Small studio, outsized games', promo_banner_cta: 'Learn more ↗',
    se_fs_title: "Enjoying it?", se_fs_body: "This is FUORISCALA's first game, a tiny independent studio. Come say hi — one click, zero commitment, and it helps us make the next one.",
    se_fs_cta: "Discover FUORISCALA ↗",
    share_trophy_title: '🏆 TROPHY ROOM', share_trophy_stats: (r,t,w)=>`${r}/${t} circuits raced  ·  ${w}/${t} won`,
    share_world_champion: 'WORLD CHAMPION', share_drivers_title: (team)=>`${team} — Drivers' Title`,
    share_season_over: (pos)=>`Season over — P${pos} Constructors`, share_full_season: 'Full Season (20 races)',
    share_quick_season: 'Quick Season (10 races)', share_manager_tag: 'ROGUELIKE GP MANAGER',
    share_wins: (n)=>`${n} wins`, share_podiums: (n)=>`${n} podiums`, share_points: (n)=>`${n} points`,
    share_dnfs: (n)=>`${n} retirements`, share_champion_line: (n)=>`${n}, Champion`, share_beat_me: 'TRY TO BEAT ME',
    splash_presents: 'FUORISCALA presents', splash_tap_continue: 'tap to continue',
    sl_races_word: 'RACES',
    settings_sfx_vol_short: 'Sound Effects', settings_music_vol_short: 'Music',
    menu_home: 'Home', menu_section_game: 'GAME', menu_section_progress: 'PROGRESS', menu_section_info: 'INFO', menu_section_app: 'APP',
    status_retired: 'RETIRED', status_retired_short: 'DNF', status_box: 'PIT', status_penalty: 'PENALTY', status_on_track: 'On track', status_leader: 'Leader',
    pg_rain_expected: 'Rain expected', pg_rain_risk: (p)=>`Rain risk ${p}%`, pg_dry_track: 'Dry track',
    pg_rating_gap: 'Rating Gap to Rival', pg_main_rival: 'Main rival', pg_none_yet: 'None yet',
    pg_lineup: (team)=>`Lineup — ${team}`, pg_team_rating: 'Team Rating', pg_weather_forecast: 'Weather Forecast',
    pg_go_to_race: 'Go to Race →', pg_details_toggle: '🔍 Details — components, stats, full grid',
    cat_aero_pack: 'Aero Package', cat_tire_supplier: 'Tyre Supplier',
    pcard_guaranteed: 'GUARANTEED UPGRADE', pcard_development: 'DEVELOPMENT', pcard_cost: 'Cost', pcard_no_risk: 'No risk',
    pcard_insufficient_budget: 'Insufficient budget', pcard_tap_buy: 'Tap to buy',
    pcard_frozen: (max)=>`Insufficient budget — not even the minimum investment (${max}% risk) is within reach right now.`,
    pcard_invest_cost: 'Cost', pcard_slider_hint: '← cheaper, more risk &nbsp;·&nbsp; safer, more expensive →',
    pcard_if_fails: (m)=>`If it fails: ${m}`, pcard_more_info: 'More info', pcard_dev_area: (a)=>`Development area: ${a}`,
    pcard_duration: (d)=>`Effect duration: ${d}`, pcard_risk_range: (min,max,hasMalus)=>`Risk always ranges from ${max}% (minimum investment, cheaper) to ${min}% (maximum investment, never zero)${hasMalus?'. On failure a malus may apply':''}.`,
    pcard_confirm_invest: 'Confirm Investment',
    pcard_mentality: 'Mentality', pcard_type: 'Type', pcard_in_use: 'Currently in use',
    pcard_scouting_title: (l)=>`Free Scouting — ${l}`, pcard_scouting_hint: 'Compare with what you already have on the team: a tap opens the detailed comparison before confirming.',
    pcard_scouting_note: (k)=>`<b style="color:var(--text);">Replacements that lower the rating don't close the turn</b> — you can make more than one, if available. The half-circle shows the piece's ${k} — hover for the name. Green rows give you a synergy bonus if you pick them.`,
    pcard_synergy_plus: (l)=>`+ ${l} Synergy`, pcard_synergy_plus_short: (l)=>`+ ${l}`, pcard_synergy_minus: (l)=>`− ${l} Synergy`, pcard_synergy_minus_short: (l)=>`− ${l}`,
    classify_upgrade: 'GUARANTEED UPGRADE', classify_opportunity: 'OPPORTUNITY', classify_trade: 'TRADE-OFF', classify_replacement: 'REPLACEMENT',
    eff_qualifying: 'Qualifying', eff_dry_race: 'Dry race', eff_wet_race: 'Wet race',
    eff_reliability: 'Reliability', eff_fast_circuits: 'Performance on fast circuits', eff_street_circuits: 'Performance on street circuits',
    pc_confirm_title: (l)=>`Confirm Replacement — ${l}`, pc_semaforo_title: 'Effect on Semaphore and Team Rating',
    pc_before: 'BEFORE', pc_after: 'AFTER', pc_rating: 'RATING',
    pc_disclaimer: "Once confirmed, the current component can't be recovered in this career. Comparison details are below.",
    pc_gain: (n)=>`You get: +${n}`, pc_cost: (n)=>`Cost: -${n}`, pc_budget_avail: (n)=>`Available budget: ${n}`,
    pc_downgrade_note: "Lower rating than the current one: this swap doesn't close the turn.",
    pc_cant_afford: 'Not enough budget for this replacement.',
    pc_confirm_btn: 'Confirm', pc_cancel_btn: 'Cancel', pc_current_vs_proposed: 'Current vs Proposed',
    pc_current: 'CURRENT', pc_proposed: 'PROPOSED', pc_current_traits: 'Current Bonus/Malus/Ability', pc_proposed_traits: 'Proposed Bonus/Malus/Ability',
    pc_trait: 'Trait', pc_estimated_effect: 'Estimated Effect on Team', pc_avg_all_circuits: 'AVERAGE ACROSS ALL CIRCUITS',
    pit_rivals_plural: 'Your Rivals', pit_rivals_single: 'Your Rival', pit_quick_ref: 'QUICK REFERENCE', pit_strength: 'strength',
    upg_developing: 'Development in progress…', upg_tap_skip: 'Tap to skip',
    upg_failed: 'Development Failed', upg_success: 'Development Succeeded!', upg_risk_taken: (p)=>` · risk taken: ${p}%`,
    upg_no_gain: 'No gain this time.', upg_gain_global: (n)=>`+${n} RATING spread across the whole car`,
    upg_gain_area: (n,a)=>`+${n} RATING on ${a}`, upg_continue: 'Continue →',
    upcoming_title: 'Upcoming Circuits', upcoming_most_useful: 'MOST USEFUL COMPONENT', upcoming_next: 'NEXT', upcoming_race: (n)=>`RACE ${n}`,
    museum_title: '🏛️ Dynasty Museum', museum_tagline: 'Every driver and component carried through to the end of a season, or replaced along the way, stays here forever.',
    museum_completion: 'COMPLETION', museum_back: '← Back', museum_drivers: 'Drivers', museum_components: 'Components',
    museum_no_drivers: "No drivers unlocked yet: carry one to the end of a season, or replace it, to start the collection.",
    museum_no_components: 'No components unlocked yet.',
    tr_title: '🏆 Trophy Room', tr_tagline: 'A trophy for every circuit — gold if won, gray if raced, hidden if not seen yet.',
    tr_raced: 'CIRCUITS RACED', tr_won: 'CIRCUITS WON', tr_share: '📤 Share Trophy Room', tr_museum_btn: '🏛️ Dynasty Museum', tr_back: '← Back',
    mss_eyebrow: (r,tot)=>`🏁 MID SEASON DRAFT — Race ${r}/${tot}`, mss_title: "The season's only driver market window",
    mss_subtitle: "You can replace none, just one, or both drivers: the choice is independent for each seat and stays valid until the last race. No risk: if you pay the scouting price, you get the driver. From here on, for the rest of the season, drivers are fixed — component development resumes normally from the next pit lane.",
    mss_pilot_main: 'Main Driver', mss_pilot_second: 'Second Driver', mss_confirm: 'Confirm Choices and Continue →',
    rcs_beat_single: (n)=>`You beat your rival, ${n}.`, rcs_lost_single: (n)=>`${n} beat you in the standings.`,
    rcs_tied: 'You finished tied with your rival.', rcs_beat_all: (n)=>`You beat all your rivals (${n}).`,
    rcs_lost_all: (n)=>`Your rivals all beat you (${n}).`, rcs_mixed: (b,l)=>`You beat ${b}, but lost to ${l}.`,
    se_doppietta_pill: 'GRAND SLAM', se_doppietta_title: '🏆🏆 DOUBLE WORLD TITLE',
    se_driver_champ_pill: 'DRIVERS\' CHAMPION', se_driver_champ_title: "🏆 DRIVERS' WORLD CHAMPION",
    se_constr_champ_pill: 'CONSTRUCTORS\' CHAMPION', se_constr_champ_title: "🏆 CONSTRUCTORS' WORLD CHAMPION",
    se_end_pill: 'SEASON END', se_end_top3: (n,p)=>`Congratulations, ${n} finished P${p}`, se_end_other: (n,p)=>`${n} closes the season in P${p}`,
    se_summary: (team,pts,wins,pod,dnf,tot,budget)=>`${team} closes the season with ${pts} total points, ${wins} wins, ${pod} podiums and ${dnf} retirements across ${tot} races. Remaining budget: ${budget}.`,
    se_new_career: 'New Career', se_share: '📤 Share Result', se_your_drivers: 'Your Drivers',
    se_pilot1: (n)=>`Driver #1 — ${n}`, se_pilot2: (n)=>`Driver #2 — ${n}`, se_drivers_pos: (p)=>`Drivers' Position: P${p}`,
    se_stats: (pts,wins,pod,dnf)=>`${pts} points · ${wins} wins · ${pod} podiums · ${dnf} retirements`,
    se_team_constr_pos: (team,pos)=>`Team <b>${team}</b> — Constructors' Position: <b style="color:var(--cyan);">P${pos}</b>`,
    se_final_drivers: 'Final Drivers\' Standings', se_final_constr: "Final Constructors' Standings", se_champion: 'CHAMPION',
    se_th_pos: 'Pos', se_th_driver: 'Driver', se_th_team: 'Team', se_th_points: 'Points',
    se_you_badge: 'YOU', se_ex_badge: 'EX', se_rival_badge: 'RIVAL',
    se_footer: 'Every new run generates a new draft of drivers and components — the current season is saved automatically.',
    expl_retired: 'Retired — no points scored in this Grand Prix.',
    expl_gained: (grid,pos,delta)=>`Started P${grid}, finished P${pos}: <b>+${delta} position${delta===1?'':'s'}</b> gained in the race.`,
    expl_lost: (grid,pos,delta)=>`Started P${grid}, finished P${pos}: <b>${delta} position${delta===-1?'':'s'}</b> lost in the race.`,
    expl_same: (grid)=>`Started and finished P${grid}: no change of position from the grid.`,
    expl_dominant: (area,rating,band)=>`Circuit that mainly demands <b>${area}</b>: yours is at ${rating} — ${band} tier.`,
    expl_band_excellent: 'excellent', expl_band_good: 'good', expl_band_average: 'average', expl_band_below: 'below average', expl_band_weak: 'weak',
    expl_rain_changed: 'Weather changed during the race: rain arrived.', expl_rain_wet: 'Race in wet conditions.',
    expl_rain_handling: (name,stat)=>`${name}'s rain handling: ${stat}.`,
    expl_safety_car: "Safety Car during the race: field bunched up, an opportunity to overtake or defend depending on position.",
    race_result_retired: 'DNF', race_result_retired_full: 'RETIRED',
    race_result_you_badge: 'YOU', race_result_rival_badge: 'RIVAL', race_result_no_events: 'No notable events in this Grand Prix.',
    race_result_title: (n,tot)=>`Grand Prix Result ${n}/${tot}`, race_result_continue: 'Continue →',
    race_result_why: '❓ Why you finished like this', race_result_finish_order: 'Finishing Order', race_result_20_drivers: '20 DRIVERS',
    race_result_th_pos: 'Pos', race_result_th_num: '#', race_result_th_driver: 'Driver', race_result_th_team: 'Team', race_result_th_points: 'Points',
    race_result_event_log: 'Race Event Log', race_result_show_full_log: (n)=>`Show full race log (${n} events)`,
    rival_ahead: (n)=>`+${n} ahead of them`, rival_behind: (n)=>`${n} to catch up`, rival_tied: 'tied',
    rival_you_badge: 'YOU', rival_constructor_points: 'constructor points · strength',
    rival_title_initial: '🎯 Your Rivalry', rival_title_new: '↗ New Rivalry',
    rival_subtitle_initial_plural: "Based on your team's strength, these are your rival teams. Beating them is the season's first goal, even before the title.",
    rival_subtitle_initial_single: "Based on your team's strength, this is your rival team. Beating them is the season's first goal, even before the title.",
    rival_subtitle_new: (names)=>`You've overtaken ${names}: there's no more contest with them.`,
    rival_new_goal_plural: ' Your new targets:', rival_new_goal_single: ' Your new target:',
    rival_continue: 'Continue →',
    sponsor_technical: 'Technical Sponsor', sponsor_secondary: 'Secondary Sponsor',
    sponsor_desc_title_prizes: 'on race prizes.', sponsor_desc_title_condition: 'Active only while you stay in the Top 8 of the Constructors\' standings — if you drop below, the bonus is suspended (comes back on its own if you re-enter the Top 8).',
    sponsor_desc_tecnico: (cat)=>`Immediately unlocks "${cat}" upgrades normally reserved for sponsors. No direct economic bonus.`,
    sponsor_desc_secondario_amount: '+0.3M per race', sponsor_desc_secondario_rest: ', fixed, guaranteed, no conditions.',
    sponsor_choose_subtitle: 'Choose your sponsor for the season', sponsor_choose_one: 'Choose only one offer for the whole season',
    sponsor_headline: "Who's with you this year?", sponsor_subtitle: "The choice applies for the whole season and can't be changed midway.",
    naming_title: 'Name your team', naming_optional: 'Optional — if you leave it blank we\'ll use an automatic name (e.g. "Dynasty Racing").',
    naming_placeholder: 'E.g. Nova Racing Team', naming_inspire: '🎲 Inspire the team', naming_nation: 'Team Nationality',
    naming_confirm: 'Confirm and start the Draft →',
    sl_choose: 'Choose the season length', sl_subtitle: 'One tap and you move to choosing difficulty.',
    sl_quick: 'QUICK SEASON', sl_quick_desc: 'The classic format: 10 Grands Prix, full pit lane (upgrades and scouting, driver included) every race.', sl_quick_hint: 'Tap to choose — Quick Season',
    sl_full: 'FULL SEASON', sl_full_desc: 'Double the Grands Prix. Component upgrades remain available as always, but the Second Driver can be swapped once, in a dedicated window between race 10 and race 11.', sl_full_hint: 'Tap to choose — Full Season',
    sl_trophy_room: 'TROPHY ROOM', sl_raced: 'RACED', sl_won: 'WON', sl_trophy_desc: 'A trophy for every circuit in the world — relive your wins and see how many are left for the full collection.', sl_trophy_hint: 'Tap to open — Trophy Room',
    sl_museum: 'DYNASTY MUSEUM', sl_completion: 'COMPLETION', sl_museum_desc: 'Drivers and components carried through a full season, or replaced along the way, stay here forever.', sl_museum_hint: 'Tap to open — Dynasty Museum',
    sl_garage: 'GARAGE', sl_garage_desc: 'Customize your chassis livery with patterns unlockable by completing achievements.', sl_garage_soon: '🔒 COMING SOON',
    diff_new_career: 'New Career', diff_choose: 'Choose difficulty',
    diff_subtitle: 'Only affects the rerolls available in the draft — one tap and you\'re off.',
    diff_last_used: ' · last used', diff_tap_hint: (l)=>`Tap to start — ${l}`,
    pitlane_window: 'Pit Lane · Development Window', pitlane_headline: 'Choose how to invest before the next race',
    pitlane_subtitle: 'Roguelike node: you can buy a permanent upgrade, replace a component via scouting, or save your budget.',
    pitlane_skip: 'Skip — save the budget', pitlane_team_now: 'Your Team Right Now', pitlane_strength: 'STRENGTH',
    draft_reroll: (n)=>`Reroll — ${n} left`, draft_hardcore_no_reroll: 'HARDCORE · NO REROLLS AVAILABLE',
    draft_pilot_nth: (nth)=>`Driver (${nth})`, draft_choose_one: 'Choose only one offer for this turn',
    draft_headline: 'Seize the moment, or will waiting pay off?',
    draft_subtitle: "The other offers this turn disappear: next turn, new proposals will appear for the categories still open.",
    draft_already_chosen: 'ALREADY CHOSEN THIS SESSION', draft_taken: ' · TAKEN', draft_pilot_first_taken: 'Driver (1st) · TAKEN',
    sponsor_suspended: 'suspended',
    hub_next_gp: 'Next Grand Prix', hub_rain: 'Rain', hub_safety_car: 'Safety Car',
    hub_overtake: 'Overtaking', hub_degradation: 'Degradation', hub_team_strength: 'TEAM STRENGTH (P1/P2)',
    hub_pos_drivers: 'DRIVERS POS.', hub_pos_constructors: 'CONSTRUCTORS POS.', hub_go_to_gp: 'Go to Grand Prix →',
    hub_rivalry: '🏆 Rivalry', hub_calendar: '🗓️ Season Calendar', hub_race_word: 'RACE',
    hub_your_team: '🏎️ Your Team', hub_dominant_component: 'Dominant component', hub_special_event: 'Special event',
    hub_weather: 'Weather', comp_driver1: 'Driver #1', comp_driver2: 'Driver #2', comp_engine: 'Engine',
    comp_chassis: 'Chassis', comp_aero: 'Aerodynamics', comp_tires: 'Tires', comp_strategist: 'Team Principal',
    title_tagline_return: (race,total)=>`Welcome back — you have a season in progress (Race ${race}/${total})`,
    title_continue: '▶ Continue Season', title_new: 'New Season', title_delete: '🗑 Delete Save',
    title_cta: '🏁 Choose your challenge and hit the track — ', title_cta_bold: 'tap to start',
    menu_new_career: 'New Career', menu_trophy_room: 'Trophy Room', menu_guide: 'Guide',
    menu_achievements: 'Achievements', menu_settings: 'Settings', menu_credits: 'Credits',
    menu_fullscreen: 'Fullscreen', menu_language: 'Language',
    settings_title: '⚙️ Settings', settings_sfx_vol: 'Sound Effects Volume', settings_music_vol: 'Music Volume',
    settings_haptic: 'Haptic Feedback', settings_speed: 'Default Race Speed', settings_decision_timer: 'Decision Countdown',
    settings_export: 'Export Run (.json)', settings_import: 'Import Run (.json)', settings_install: 'Install the App',
    settings_reset: 'Reset Everything (First Launch)', on: 'On', off: 'Off',
    credits_title: '🏢 Credits', credits_tagline: 'Small studio. Outsized games.',
    credits_first_game: "FUORISCALA's first game", credits_dev: 'Developed and published by',
    credits_created: 'Created by',
    hud_reroll: 'Reroll', hud_budget: 'Budget', hud_sponsor: 'Sponsor', hud_race: 'Race',
    hud_best_driver: 'Best Driver', hud_constructors: 'Constructors',
    race_lap: 'LAP', race_retirement: (d,tm)=>`Retirement for ${d} (${tm})`, race_your_driver_bang: " — that's your driver!",
    race_your_driver_paren: ' (your driver)', race_safety_car_track: 'SAFETY CAR on track',
    race_restart: 'Restart, race green', race_weather_change: (w)=>`Weather changes: track ${w}`,
    weather_wet: 'wet', weather_dry: 'dry', race_pit_wave: 'Wave of pit stops',
    race_gains: 'gains', race_loses: 'loses', race_position: 'position', race_positions: 'positions',
    race_lights_out: "Lights out, and away we go!", race_checkered: 'CHECKERED FLAG — race complete!',
  },
  es: {
    back_to_mode_select: '← Volver a la Selección', museum_shared_tag: 'compartido entre modos',
    mode_select_title: '¿Qué tipo de carrera quieres?', mode_select_subtitle: 'Dos modos completamente separados — puedes tener ambos en curso al mismo tiempo.',
    mode_select_team: 'Carrera de Escudería', mode_select_team_desc: 'Gestiona una escudería entera: pilotos, componentes, presupuesto. El modo clásico.', mode_select_team_hint: 'Toca para elegir — Carrera de Escudería',
    mode_select_driver: 'Carrera de Piloto', mode_select_driver_desc: 'Eres un solo piloto, desde tu debut en Kart hasta el retiro. Creces, firmas contratos, construyes un palmarés.', mode_select_driver_hint: 'Toca para elegir — Carrera de Piloto',
    dc_pick_profile: 'Toca para elegir', dc_title: 'Crea tu piloto', dc_subtitle: 'Empiezas en Kart, a los 18 años, con todo por demostrar.',
    dc_name_placeholder: 'Ej. Nombre Apellido', dc_profile_eyebrow: 'Elige tu perfil de partida',
    dc_profile_subtitle: 'Arquetipo y mentalidad combinados — empiezas "verde" en este estilo, el efecto completo llega reforzándolo en carrera.',
    dc_confirm: 'Confirmar y debutar →', dc_default_name: 'Piloto Sin Nombre',
    dc_done_title: 'Piloto creado', dc_done_subtitle: 'Paso 2 completado — a partir de aquí hace falta el Hub real (paso 3).',
    dc_done_world_info: (n)=>`El mundo de las 30 escuderías está listo: ${n} en Kart, 10 en Serie Menor, 10 en Serie Élite, cada una con una historia simulada detrás.`,
    dc_done_footer: 'Pantalla de verificación temporal — todavía no jugable más allá de este punto.',
    sl_go_msg: '¡VAMOS!!', sl_ready_msg: 'Listos...', sl_lighting_msg: 'Se encienden las luces…',
    menu_exit_fullscreen: 'Salir de Pantalla Completa',
    draft_founding: 'Fundación de la escudería',
    promo_banner_tagline: 'Estudio pequeño, juegos fuera de escala', promo_banner_cta: 'Saber más ↗',
    se_fs_title: "¿Te está gustando?", se_fs_body: "Este es el primer juego de FUORISCALA, un estudio independiente muy pequeño. Pásate a vernos — un clic, cero compromiso, y nos ayudas a hacer el próximo.",
    se_fs_cta: "Descubre FUORISCALA ↗",
    share_trophy_title: '🏆 SALA DE TROFEOS', share_trophy_stats: (r,t,w)=>`${r}/${t} circuitos disputados  ·  ${w}/${t} ganados`,
    share_world_champion: 'CAMPEÓN DEL MUNDO', share_drivers_title: (team)=>`${team} — Título de Pilotos`,
    share_season_over: (pos)=>`Temporada terminada — P${pos} Constructores`, share_full_season: 'Temporada Completa (20 carreras)',
    share_quick_season: 'Temporada Rápida (10 carreras)', share_manager_tag: 'ROGUELIKE GP MANAGER',
    share_wins: (n)=>`${n} victorias`, share_podiums: (n)=>`${n} podios`, share_points: (n)=>`${n} puntos`,
    share_dnfs: (n)=>`${n} retiros`, share_champion_line: (n)=>`${n}, Campeón`, share_beat_me: 'INTENTA VENCERME',
    splash_presents: 'FUORISCALA presenta', splash_tap_continue: 'toca para continuar',
    sl_races_word: 'CARRERAS',
    settings_sfx_vol_short: 'Efectos de Sonido', settings_music_vol_short: 'Música',
    menu_home: 'Inicio', menu_section_game: 'JUEGO', menu_section_progress: 'PROGRESO', menu_section_info: 'INFO', menu_section_app: 'APP',
    status_retired: 'RETIRADO', status_retired_short: 'RET', status_box: 'BOX', status_penalty: 'PENALIZACIÓN', status_on_track: 'En pista', status_leader: 'Líder',
    pg_rain_expected: 'Lluvia prevista', pg_rain_risk: (p)=>`Riesgo de lluvia ${p}%`, pg_dry_track: 'Pista seca',
    pg_rating_gap: 'Diferencia de Rating con el Rival', pg_main_rival: 'Rival principal', pg_none_yet: 'Todavía ninguna',
    pg_lineup: (team)=>`Alineación — ${team}`, pg_team_rating: 'Rating del Equipo', pg_weather_forecast: 'Previsión Meteorológica',
    pg_go_to_race: 'Ir a la Carrera →', pg_details_toggle: '🔍 Detalles — componentes, estadísticas, parrilla completa',
    cat_aero_pack: 'Paquete Aerodinámico', cat_tire_supplier: 'Proveedor de Neumáticos',
    pcard_guaranteed: 'MEJORA GARANTIZADA', pcard_development: 'DESARROLLO', pcard_cost: 'Coste', pcard_no_risk: 'Sin riesgo',
    pcard_insufficient_budget: 'Presupuesto insuficiente', pcard_tap_buy: 'Toca para comprar',
    pcard_frozen: (max)=>`Presupuesto insuficiente — ni siquiera la inversión mínima (riesgo ${max}%) está a tu alcance ahora.`,
    pcard_invest_cost: 'Coste', pcard_slider_hint: '← más económico, más riesgo &nbsp;·&nbsp; más seguro, más caro →',
    pcard_if_fails: (m)=>`Si falla: ${m}`, pcard_more_info: 'Más información', pcard_dev_area: (a)=>`Área de desarrollo: ${a}`,
    pcard_duration: (d)=>`Duración del efecto: ${d}`, pcard_risk_range: (min,max,hasMalus)=>`El riesgo siempre va del ${max}% (inversión mínima, más económica) al ${min}% (inversión máxima, nunca cero)${hasMalus?'. Si falla podría aplicarse un malus':''}.`,
    pcard_confirm_invest: 'Confirmar Inversión',
    pcard_mentality: 'Mentalidad', pcard_type: 'Tipología', pcard_in_use: 'En uso ahora',
    pcard_scouting_title: (l)=>`Scouting Libre — ${l}`, pcard_scouting_hint: 'Compara con lo que ya tienes en el equipo: un toque abre la comparación detallada antes de confirmar.',
    pcard_scouting_note: (k)=>`<b style="color:var(--text);">Las sustituciones que bajan el rating no cierran el turno</b> — puedes hacer más de una, si hay disponibles. El semicírculo indica la ${k} de la pieza — pasa el ratón para ver el nombre. Las filas verdes te dan un bonus de sinergia si las eliges.`,
    pcard_synergy_plus: (l)=>`+ Sinergia ${l}`, pcard_synergy_plus_short: (l)=>`+ ${l}`, pcard_synergy_minus: (l)=>`− Sinergia ${l}`, pcard_synergy_minus_short: (l)=>`− ${l}`,
    classify_upgrade: 'MEJORA GARANTIZADA', classify_opportunity: 'OPORTUNIDAD', classify_trade: 'INTERCAMBIO', classify_replacement: 'SUSTITUCIÓN',
    eff_qualifying: 'Clasificación', eff_dry_race: 'Carrera en seco', eff_wet_race: 'Carrera en mojado',
    eff_reliability: 'Fiabilidad', eff_fast_circuits: 'Rendimiento en circuitos rápidos', eff_street_circuits: 'Rendimiento en circuitos urbanos',
    pc_confirm_title: (l)=>`Confirmar Sustitución — ${l}`, pc_semaforo_title: 'Efecto en el Semáforo y el Rating de Escudería',
    pc_before: 'ANTES', pc_after: 'DESPUÉS', pc_rating: 'RATING',
    pc_disclaimer: 'Una vez confirmado, el componente actual no se puede recuperar en esta carrera. Los detalles de la comparación están abajo.',
    pc_gain: (n)=>`Ingresas: +${n}`, pc_cost: (n)=>`Coste: -${n}`, pc_budget_avail: (n)=>`Presupuesto disponible: ${n}`,
    pc_downgrade_note: 'Rating más bajo que el actual: este cambio no cierra el turno.',
    pc_cant_afford: 'Presupuesto insuficiente para esta sustitución.',
    pc_confirm_btn: 'Confirmar', pc_cancel_btn: 'Cancelar', pc_current_vs_proposed: 'Actual vs Propuesto',
    pc_current: 'ACTUAL', pc_proposed: 'PROPUESTO', pc_current_traits: 'Bonus/Malus/Habilidad actuales', pc_proposed_traits: 'Bonus/Malus/Habilidad propuestos',
    pc_trait: 'Rasgo', pc_estimated_effect: 'Efecto Estimado en la Escudería', pc_avg_all_circuits: 'MEDIA EN TODOS LOS CIRCUITOS',
    pit_rivals_plural: 'Tus Rivales', pit_rivals_single: 'Tu Rival', pit_quick_ref: 'REFERENCIA RÁPIDA', pit_strength: 'fuerza',
    upg_developing: 'Desarrollo en curso…', upg_tap_skip: 'Toca para saltar',
    upg_failed: 'Desarrollo Fallido', upg_success: '¡Desarrollo Conseguido!', upg_risk_taken: (p)=>` · riesgo asumido: ${p}%`,
    upg_no_gain: 'Sin ganancia esta vez.', upg_gain_global: (n)=>`+${n} RATING repartido en todo el coche`,
    upg_gain_area: (n,a)=>`+${n} RATING en ${a}`, upg_continue: 'Continuar →',
    upcoming_title: 'Próximos Circuitos', upcoming_most_useful: 'COMPONENTE MÁS ÚTIL', upcoming_next: 'PRÓXIMA', upcoming_race: (n)=>`CARRERA ${n}`,
    museum_title: '🏛️ Museo Dynasty', museum_tagline: 'Cada piloto y componente llevado hasta el final de una temporada, o sustituido por el camino, se queda aquí para siempre.',
    museum_completion: 'COMPLETADO', museum_back: '← Volver', museum_drivers: 'Pilotos', museum_components: 'Componentes',
    museum_no_drivers: 'Todavía no has desbloqueado ningún piloto: llévalo hasta el final de una temporada, o sustitúyelo, para empezar la colección.',
    museum_no_components: 'Todavía no has desbloqueado ningún componente.',
    tr_title: '🏆 Sala de Trofeos', tr_tagline: 'Un trofeo por cada circuito — dorado si ganado, gris si disputado, oculto si aún no visto.',
    tr_raced: 'CIRCUITOS DISPUTADOS', tr_won: 'CIRCUITOS GANADOS', tr_share: '📤 Compartir Sala de Trofeos', tr_museum_btn: '🏛️ Museo Dynasty', tr_back: '← Volver',
    mss_eyebrow: (r,tot)=>`🏁 MID SEASON DRAFT — Carrera ${r}/${tot}`, mss_title: 'La única ventana de mercado de pilotos de la temporada',
    mss_subtitle: 'Puedes sustituir a ninguno, a uno solo, o a ambos pilotos: la elección es independiente para cada asiento y sigue siendo válida hasta la última carrera. Sin riesgo: si pagas el precio de scouting, obtienes al piloto. A partir de aquí, durante el resto de la temporada, los pilotos quedan fijos — el desarrollo de componentes se reanuda con normalidad desde el próximo pit lane.',
    mss_pilot_main: 'Piloto Principal', mss_pilot_second: 'Segundo Piloto', mss_confirm: 'Confirmar Elecciones y Continuar →',
    rcs_beat_single: (n)=>`Has vencido a tu rival, ${n}.`, rcs_lost_single: (n)=>`${n} te ha vencido en la clasificación.`,
    rcs_tied: 'Has terminado empatado con tu rival.', rcs_beat_all: (n)=>`Has vencido a todas tus rivales (${n}).`,
    rcs_lost_all: (n)=>`Tus rivales te han vencido a todas (${n}).`, rcs_mixed: (b,l)=>`Has vencido a ${b}, pero has perdido contra ${l}.`,
    se_doppietta_pill: 'GRAN SLAM', se_doppietta_title: '🏆🏆 DOBLE TÍTULO MUNDIAL',
    se_driver_champ_pill: 'CAMPEÓN DE PILOTOS', se_driver_champ_title: '🏆 CAMPEÓN DEL MUNDO DE PILOTOS',
    se_constr_champ_pill: 'CAMPEÓN DE CONSTRUCTORES', se_constr_champ_title: '🏆 CAMPEÓN DEL MUNDO DE CONSTRUCTORES',
    se_end_pill: 'FIN DE TEMPORADA', se_end_top3: (n,p)=>`Enhorabuena, ${n} ha terminado P${p}`, se_end_other: (n,p)=>`${n} cierra la temporada en P${p}`,
    se_summary: (team,pts,wins,pod,dnf,tot,budget)=>`${team} cierra la temporada con ${pts} puntos totales, ${wins} victorias, ${pod} podios y ${dnf} retiros en ${tot} carreras. Presupuesto restante: ${budget}.`,
    se_new_career: 'Nueva Carrera', se_share: '📤 Compartir Resultado', se_your_drivers: 'Tus Pilotos',
    se_pilot1: (n)=>`Piloto #1 — ${n}`, se_pilot2: (n)=>`Piloto #2 — ${n}`, se_drivers_pos: (p)=>`Posición de Pilotos: P${p}`,
    se_stats: (pts,wins,pod,dnf)=>`${pts} puntos · ${wins} victorias · ${pod} podios · ${dnf} retiros`,
    se_team_constr_pos: (team,pos)=>`Escudería <b>${team}</b> — Posición de Constructores: <b style="color:var(--cyan);">P${pos}</b>`,
    se_final_drivers: 'Clasificación Final de Pilotos', se_final_constr: 'Clasificación Final de Constructores', se_champion: 'CAMPEÓN',
    se_th_pos: 'Pos', se_th_driver: 'Piloto', se_th_team: 'Escudería', se_th_points: 'Puntos',
    se_you_badge: 'TÚ', se_ex_badge: 'EX', se_rival_badge: 'RIVAL',
    se_footer: 'Cada nueva run genera un nuevo draft de pilotos y componentes — la temporada en curso se guarda automáticamente.',
    expl_retired: 'Retirado — sin puntos en este Gran Premio.',
    expl_gained: (grid,pos,delta)=>`Salió P${grid}, terminó P${pos}: <b>+${delta} posición${delta===1?'':'es'}</b> ganada${delta===1?'':'s'} en carrera.`,
    expl_lost: (grid,pos,delta)=>`Salió P${grid}, terminó P${pos}: <b>${delta} posición${delta===-1?'':'es'}</b> perdida${delta===-1?'':'s'} en carrera.`,
    expl_same: (grid)=>`Salió y terminó P${grid}: sin cambio de posición respecto a la parrilla.`,
    expl_dominant: (area,rating,band)=>`Circuito que exige sobre todo <b>${area}</b>: la tuya está en ${rating} — nivel ${band}.`,
    expl_band_excellent: 'excelente', expl_band_good: 'buena', expl_band_average: 'media', expl_band_below: 'por debajo de la media', expl_band_weak: 'floja',
    expl_rain_changed: 'El clima cambió en carrera: llegó la lluvia.', expl_rain_wet: 'Carrera en mojado.',
    expl_rain_handling: (name,stat)=>`Gestión de lluvia de ${name}: ${stat}.`,
    expl_safety_car: 'Safety Car en carrera: parrilla compactada, ocasión de adelantar o defender según la posición.',
    race_result_retired: 'RET', race_result_retired_full: 'RETIRADO',
    race_result_you_badge: 'TÚ', race_result_rival_badge: 'RIVAL', race_result_no_events: 'Sin eventos destacables en este Gran Premio.',
    race_result_title: (n,tot)=>`Resultado Gran Premio ${n}/${tot}`, race_result_continue: 'Continuar →',
    race_result_why: '❓ Por qué has terminado así', race_result_finish_order: 'Orden de Llegada', race_result_20_drivers: '20 PILOTOS',
    race_result_th_pos: 'Pos', race_result_th_num: '#', race_result_th_driver: 'Piloto', race_result_th_team: 'Escudería', race_result_th_points: 'Puntos',
    race_result_event_log: 'Registro de Eventos de Carrera', race_result_show_full_log: (n)=>`Mostrar registro completo de la carrera (${n} eventos)`,
    rival_ahead: (n)=>`+${n} por delante`, rival_behind: (n)=>`${n} por recuperar`, rival_tied: 'empatado',
    rival_you_badge: 'TÚ', rival_constructor_points: 'puntos de constructores · fuerza',
    rival_title_initial: '🎯 Tu Rivalidad', rival_title_new: '↗ Nueva Rivalidad',
    rival_subtitle_initial_plural: 'Según la fuerza de tu escudería, estas son tus escuderías rivales. Vencerlas es el primer objetivo de la temporada, incluso antes que el título.',
    rival_subtitle_initial_single: 'Según la fuerza de tu escudería, esta es tu escudería rival. Vencerla es el primer objetivo de la temporada, incluso antes que el título.',
    rival_subtitle_new: (names)=>`Has superado a ${names}: ya no hay partida con ellos.`,
    rival_new_goal_plural: ' Tus nuevos objetivos:', rival_new_goal_single: ' Tu nuevo objetivo:',
    rival_continue: 'Continuar →',
    sponsor_technical: 'Patrocinador Técnico', sponsor_secondary: 'Patrocinador Secundario',
    sponsor_desc_title_prizes: 'sobre los premios de carrera.', sponsor_desc_title_condition: 'Activo solo mientras te mantengas en el Top 8 de la clasificación de Constructores — si bajas de ahí, el bonus se suspende (vuelve solo si regresas al Top 8).',
    sponsor_desc_tecnico: (cat)=>`Desbloquea de inmediato las mejoras de "${cat}" normalmente reservadas a los patrocinadores. Sin bonus económico directo.`,
    sponsor_desc_secondario_amount: '+0.3M por carrera', sponsor_desc_secondario_rest: ', fijo, garantizado, sin condiciones.',
    sponsor_choose_subtitle: 'Elige tu patrocinador para la temporada', sponsor_choose_one: 'Elige solo una oferta para toda la temporada',
    sponsor_headline: '¿Quién te acompaña este año?', sponsor_subtitle: 'La elección vale para toda la temporada y no se puede cambiar a mitad de camino.',
    naming_title: 'Ponle nombre a tu escudería', naming_optional: 'Opcional — si lo dejas vacío usaremos un nombre automático (ej. "Dynasty Racing").',
    naming_placeholder: 'Ej. Nova Racing Team', naming_inspire: '🎲 Inspirar la escudería', naming_nation: 'Nacionalidad de la Escudería',
    naming_confirm: 'Confirmar y empezar el Draft →',
    sl_choose: 'Elige la duración de la temporada', sl_subtitle: 'Un toque y pasas a elegir la dificultad.',
    sl_quick: 'TEMPORADA RÁPIDA', sl_quick_desc: 'El formato clásico: 10 Grandes Premios, pit lane completo (mejoras y scouting, piloto incluido) en cada carrera.', sl_quick_hint: 'Toca para elegir — Temporada Rápida',
    sl_full: 'TEMPORADA COMPLETA', sl_full_desc: 'El doble de Grandes Premios. Las mejoras de componentes siguen disponibles como siempre, pero el Segundo Piloto se puede cambiar una sola vez, en una ventana dedicada entre la carrera 10 y la 11.', sl_full_hint: 'Toca para elegir — Temporada Completa',
    sl_trophy_room: 'SALA DE TROFEOS', sl_raced: 'DISPUTADOS', sl_won: 'GANADOS', sl_trophy_desc: 'Un trofeo por cada circuito del mundo — revive tus victorias y descubre cuántos faltan para la colección completa.', sl_trophy_hint: 'Toca para abrir — Sala de Trofeos',
    sl_museum: 'MUSEO DYNASTY', sl_completion: 'COMPLETADO', sl_museum_desc: 'Pilotos y componentes llevados hasta el final de una temporada, o sustituidos por el camino, se quedan aquí para siempre.', sl_museum_hint: 'Toca para abrir — Museo Dynasty',
    sl_garage: 'GARAGE', sl_garage_desc: 'Personaliza la librea del chasis con patrones desbloqueables completando logros.', sl_garage_soon: '🔒 PRÓXIMAMENTE',
    diff_new_career: 'Nueva Carrera', diff_choose: 'Elige la dificultad',
    diff_subtitle: 'Solo afecta a los rerolls disponibles en el draft — un toque y empiezas.',
    diff_last_used: ' · última usada', diff_tap_hint: (l)=>`Toca para empezar — ${l}`,
    pitlane_window: 'Pit Lane · Ventana de Desarrollo', pitlane_headline: 'Elige cómo invertir antes de la próxima carrera',
    pitlane_subtitle: 'Nodo roguelike: puedes comprar una mejora permanente, sustituir un componente mediante scouting, o conservar el presupuesto.',
    pitlane_skip: 'Saltar — conserva el presupuesto', pitlane_team_now: 'Tu Escudería Ahora', pitlane_strength: 'FUERZA',
    draft_reroll: (n)=>`Reroll — ${n} restantes`, draft_hardcore_no_reroll: 'HARDCORE · SIN REROLLS DISPONIBLES',
    draft_pilot_nth: (nth)=>`Piloto (${nth})`, draft_choose_one: 'Elige solo una oferta para este turno',
    draft_headline: '¿Aprovechas el momento, o esperar te recompensará?',
    draft_subtitle: 'Las demás ofertas de este turno desaparecen: en el próximo turno habrá nuevas propuestas para las categorías aún libres.',
    draft_already_chosen: 'YA ELEGIDAS EN ESTA SESIÓN', draft_taken: ' · ELEGIDO', draft_pilot_first_taken: 'Piloto (1º) · ELEGIDO',
    sponsor_suspended: 'suspendido',
    hub_next_gp: 'Próximo Gran Premio', hub_rain: 'Lluvia', hub_safety_car: 'Safety Car',
    hub_overtake: 'Adelantamiento', hub_degradation: 'Degradación', hub_team_strength: 'FUERZA DE ESCUDERÍA (P1/P2)',
    hub_pos_drivers: 'POS. PILOTOS', hub_pos_constructors: 'POS. CONSTRUCTORES', hub_go_to_gp: 'Ir al Gran Premio →',
    hub_rivalry: '🏆 Rivalidad', hub_calendar: '🗓️ Calendario de Temporada', hub_race_word: 'CARRERA',
    hub_your_team: '🏎️ Tu Escudería', hub_dominant_component: 'Componente dominante', hub_special_event: 'Evento especial',
    hub_weather: 'Clima', comp_driver1: 'Piloto #1', comp_driver2: 'Piloto #2', comp_engine: 'Motor',
    comp_chassis: 'Chasis', comp_aero: 'Aerodinámica', comp_tires: 'Neumáticos', comp_strategist: 'Team Principal',
    title_tagline_return: (race,total)=>`Bienvenido de nuevo — tienes una temporada en curso (Carrera ${race}/${total})`,
    title_continue: '▶ Continuar Temporada', title_new: 'Nueva Temporada', title_delete: '🗑 Borrar Partida',
    title_cta: '🏁 Elige tu desafío y sal a pista — ', title_cta_bold: 'toca para empezar',
    menu_new_career: 'Nueva Carrera', menu_trophy_room: 'Sala de Trofeos', menu_guide: 'Guía',
    menu_achievements: 'Logros', menu_settings: 'Ajustes', menu_credits: 'Créditos',
    menu_fullscreen: 'Pantalla Completa', menu_language: 'Idioma',
    settings_title: '⚙️ Ajustes', settings_sfx_vol: 'Volumen de Efectos', settings_music_vol: 'Volumen de Música',
    settings_haptic: 'Vibración', settings_speed: 'Velocidad de Carrera Predeterminada', settings_decision_timer: 'Cuenta Atrás de Decisiones',
    settings_export: 'Exportar Partida (.json)', settings_import: 'Importar Partida (.json)', settings_install: 'Instalar la App',
    settings_reset: 'Restablecer Todo (Primera Apertura)', on: 'Activado', off: 'Desactivado',
    credits_title: '🏢 Créditos', credits_tagline: 'Estudio pequeño. Juegos fuera de escala.',
    credits_first_game: 'El primer juego de FUORISCALA', credits_dev: 'Desarrollado y publicado por',
    credits_created: 'Creado por',
    hud_reroll: 'Reroll', hud_budget: 'Presupuesto', hud_sponsor: 'Patrocinador', hud_race: 'Carrera',
    hud_best_driver: 'Mejor Piloto', hud_constructors: 'Constructores',
    race_lap: 'VUELTA', race_retirement: (d,tm)=>`Retirada de ${d} (${tm})`, race_your_driver_bang: ' — ¡es tu piloto!',
    race_your_driver_paren: ' (tu piloto)', race_safety_car_track: 'SAFETY CAR en pista',
    race_restart: 'Reinicio, carrera en verde', race_weather_change: (w)=>`Cambia el clima: pista ${w}`,
    weather_wet: 'mojada', weather_dry: 'seca', race_pit_wave: 'Oleada de paradas en boxes',
    race_gains: 'gana', race_loses: 'pierde', race_position: 'posición', race_positions: 'posiciones',
    race_lights_out: '¡Se apagan los semáforos, arrancamos!', race_checkered: 'BANDERA A CUADROS — ¡carrera terminada!',
  },
};
function t(key, ...args){
  const dict = I18N[currentLang] || I18N.it;
  const val = dict[key] !== undefined ? dict[key] : I18N.it[key];
  if(typeof val === 'function') return val(...args);
  return val !== undefined ? val : key;
}

// V0.9.7.8.28: nomi dei 42 eventi narrativi di gara (su 120 righe totali, molte sono ripetizioni
// con severita' diversa dello stesso nome) — contestualizzati con terminologia motoristica reale,
// non traduzione letterale (es. "Diluvio" -> "Downpour" non "Flood").
const EVENT_NAME_EN = {
  'Ala danneggiata': 'Damaged Wing',
  'Bandiera rossa': 'Red Flag',
  'Blackout della telemetria': 'Telemetry Blackout',
  'Calcolo carburante perfetto': 'Perfect Fuel Calculation',
  'Caldo estremo': 'Extreme Heat',
  'Chiamata gomme errata': 'Wrong Tire Call',
  'Collisione ai box': 'Pit Lane Collision',
  'Contatto al via': 'First-Lap Contact',
  'Crollo gomme': 'Tire Cliff',
  'Detriti in pista': 'Track Debris',
  'Diluvio': 'Downpour',
  'Doppio pit stop': 'Double Pit Stop',
  'Drive-through': 'Drive-Through Penalty',
  'Errore individuale': 'Individual Mistake',
  'Errore sotto pressione': 'Error Under Pressure',
  'Foratura': 'Puncture',
  'Freddo estremo': 'Extreme Cold',
  'Gara accorciata': 'Shortened Race',
  'Giro perfetto': 'Perfect Lap',
  'Grandine': 'Hailstorm',
  'Guasto elettronico': 'Electronics Failure',
  'Guasto motore': 'Engine Failure',
  'Incidente multiplo': 'Multi-Car Incident',
  'Neve sul circuito': 'Snow on Track',
  'Overcut riuscito': 'Successful Overcut',
  'Partenza fulminea': 'Lightning Start',
  'Penalità 5 secondi': '5-Second Penalty',
  'Pioggia improvvisa': 'Sudden Rain',
  'Pista in asciugamento': 'Drying Track',
  'Pit stop lento': 'Slow Pit Stop',
  'Problema cambio': 'Gearbox Issue',
  'Record assoluto ai box': 'Pit Stop Record',
  'Rimonta furiosa': 'Furious Recovery',
  'Safety Car': 'Safety Car',
  'Sosta gratuita': 'Free Stop',
  'Squalifica': 'Disqualification',
  'Strategia a una sosta': 'One-Stop Strategy',
  'Surriscaldamento': 'Overheating',
  'Testacoda': 'Spin',
  'Undercut perfetto': 'Perfect Undercut',
  'Vento forte': 'Strong Wind',
  'Virtual Safety Car': 'Virtual Safety Car',
};
const EVENT_NAME_ES = {
  'Ala danneggiata': 'Ala Dañada',
  'Bandiera rossa': 'Bandera Roja',
  'Blackout della telemetria': 'Apagón de Telemetría',
  'Calcolo carburante perfetto': 'Cálculo de Combustible Perfecto',
  'Caldo estremo': 'Calor Extremo',
  'Chiamata gomme errata': 'Llamada de Neumáticos Errónea',
  'Collisione ai box': 'Colisión en Boxes',
  'Contatto al via': 'Contacto en la Salida',
  'Crollo gomme': 'Caída de Neumáticos',
  'Detriti in pista': 'Restos en Pista',
  'Diluvio': 'Diluvio',
  'Doppio pit stop': 'Doble Parada en Boxes',
  'Drive-through': 'Drive-Through',
  'Errore individuale': 'Error Individual',
  'Errore sotto pressione': 'Error Bajo Presión',
  'Foratura': 'Pinchazo',
  'Freddo estremo': 'Frío Extremo',
  'Gara accorciata': 'Carrera Acortada',
  'Giro perfetto': 'Vuelta Perfecta',
  'Grandine': 'Granizo',
  'Guasto elettronico': 'Avería Electrónica',
  'Guasto motore': 'Avería de Motor',
  'Incidente multiplo': 'Accidente Múltiple',
  'Neve sul circuito': 'Nieve en el Circuito',
  'Overcut riuscito': 'Overcut Exitoso',
  'Partenza fulminea': 'Salida Fulgurante',
  'Penalità 5 secondi': 'Penalización de 5 Segundos',
  'Pioggia improvvisa': 'Lluvia Repentina',
  'Pista in asciugamento': 'Pista Secándose',
  'Pit stop lento': 'Parada Lenta',
  'Problema cambio': 'Problema de Caja de Cambios',
  'Record assoluto ai box': 'Récord Absoluto en Boxes',
  'Rimonta furiosa': 'Remontada Furiosa',
  'Safety Car': 'Safety Car',
  'Sosta gratuita': 'Parada Gratuita',
  'Squalifica': 'Descalificación',
  'Strategia a una sosta': 'Estrategia a Una Parada',
  'Surriscaldamento': 'Sobrecalentamiento',
  'Testacoda': 'Trompo',
  'Undercut perfetto': 'Undercut Perfecto',
  'Vento forte': 'Viento Fuerte',
  'Virtual Safety Car': 'Virtual Safety Car',
};
function evName(nomeIt){
  if(currentLang==='en') return EVENT_NAME_EN[nomeIt] || nomeIt;
  if(currentLang==='es') return EVENT_NAME_ES[nomeIt] || nomeIt;
  return nomeIt;
}

// V0.9.7.8.33: nomi delle 39 nazioni usate nel gioco (piloti, circuiti, scelta scuderia) —
// tradotti EN/ES. Le chiavi restano SEMPRE in italiano (sono valori dato, usati per confronti
// e come 'value' nei form) — questa e' solo la funzione che sceglie il testo da MOSTRARE.
const NATION_NAME_EN = {
  'Argentina': 'Argentina',
  'Australia': 'Australia',
  'Austria': 'Austria',
  'Belgio': 'Belgium',
  'Brasile': 'Brazil',
  'Canada': 'Canada',
  'Cile': 'Chile',
  'Cina': 'China',
  'Colombia': 'Colombia',
  'Corea del Sud': 'South Korea',
  'Croazia': 'Croatia',
  'Danimarca': 'Denmark',
  'Emirati Arabi Uniti': 'United Arab Emirates',
  'Finlandia': 'Finland',
  'Francia': 'France',
  'Germania': 'Germany',
  'Giappone': 'Japan',
  'Grecia': 'Greece',
  'India': 'India',
  'Italia': 'Italy',
  'Marocco': 'Morocco',
  'Messico': 'Mexico',
  'Norvegia': 'Norway',
  'Nuova Zelanda': 'New Zealand',
  'Paesi Bassi': 'Netherlands',
  'Polonia': 'Poland',
  'Portogallo': 'Portugal',
  'Regno Unito': 'United Kingdom',
  'Romania': 'Romania',
  'Sconosciuta': 'Unknown',
  'Serbia': 'Serbia',
  'Spagna': 'Spain',
  'Stati Uniti': 'United States',
  'Sudafrica': 'South Africa',
  'Svezia': 'Sweden',
  'Svizzera': 'Switzerland',
  'Thailandia': 'Thailand',
  'Turchia': 'Turkey',
  'Ungheria': 'Hungary',
};
const NATION_NAME_ES = {
  'Argentina': 'Argentina',
  'Australia': 'Australia',
  'Austria': 'Austria',
  'Belgio': 'Bélgica',
  'Brasile': 'Brasil',
  'Canada': 'Canadá',
  'Cile': 'Chile',
  'Cina': 'China',
  'Colombia': 'Colombia',
  'Corea del Sud': 'Corea del Sur',
  'Croazia': 'Croacia',
  'Danimarca': 'Dinamarca',
  'Emirati Arabi Uniti': 'Emiratos Árabes Unidos',
  'Finlandia': 'Finlandia',
  'Francia': 'Francia',
  'Germania': 'Alemania',
  'Giappone': 'Japón',
  'Grecia': 'Grecia',
  'India': 'India',
  'Italia': 'Italia',
  'Marocco': 'Marruecos',
  'Messico': 'México',
  'Norvegia': 'Noruega',
  'Nuova Zelanda': 'Nueva Zelanda',
  'Paesi Bassi': 'Países Bajos',
  'Polonia': 'Polonia',
  'Portogallo': 'Portugal',
  'Regno Unito': 'Reino Unido',
  'Romania': 'Rumanía',
  'Sconosciuta': 'Desconocida',
  'Serbia': 'Serbia',
  'Spagna': 'España',
  'Stati Uniti': 'Estados Unidos',
  'Sudafrica': 'Sudáfrica',
  'Svezia': 'Suecia',
  'Svizzera': 'Suiza',
  'Thailandia': 'Tailandia',
  'Turchia': 'Turquía',
  'Ungheria': 'Hungría',
};
function nationLabel(nomeIt){
  if(currentLang==='en') return NATION_NAME_EN[nomeIt] || nomeIt;
  if(currentLang==='es') return NATION_NAME_ES[nomeIt] || nomeIt;
  return nomeIt;
}
function saveAudioSettings(){
  try{ localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings)); }catch(e){ /* ignorato */ }
}
let __actx = null;
function getAudioCtx(){
  if(__actx) return __actx;
  try{ __actx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ __actx = null; }
  return __actx;
}
// sblocco dell'AudioContext al primo gesto utente (necessario su tutti i browser mobile)
['click','touchstart','keydown'].forEach(ev=>{
  document.addEventListener(ev, function unlockAudioOnce(){
    const ctx = getAudioCtx();
    if(ctx && ctx.state==='suspended') ctx.resume().catch(()=>{});
  }, { once:false, passive:true });
});

function __noiseBuffer(ctx, durationSec){
  const n = Math.max(1, Math.floor(ctx.sampleRate*durationSec));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for(let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n); // rumore con fade-out lineare
  return buf;
}
function __tone(ctx, dest, {freq=440, type='sine', start=0, dur=0.15, gain=0.5, freqEnd=null, attack=0.005}={}){
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime+start);
  if(freqEnd!=null) osc.frequency.exponentialRampToValueAtTime(Math.max(1,freqEnd), ctx.currentTime+start+dur);
  g.gain.setValueAtTime(0, ctx.currentTime+start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime+start+attack);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+start+dur);
  osc.connect(g); g.connect(dest);
  osc.start(ctx.currentTime+start);
  osc.stop(ctx.currentTime+start+dur+0.02);
}
function __noiseHit(ctx, dest, {start=0, dur=0.2, gain=0.5, filterFreq=1200, filterType='lowpass'}={}){
  const src = ctx.createBufferSource();
  src.buffer = __noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = filterType; filt.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime+start);
  src.connect(filt); filt.connect(g); g.connect(dest);
  src.start(ctx.currentTime+start);
}

// V0.9.7.8.9: SFX bocciati dal playtest ("tremendi") — ridotti tutti a un unico segnaposto neutro,
// volutamente minimale (un click breve, sempre uguale), in attesa dei file audio veri (Kenney/Mixkit
// o altra fonte) che sostituiranno queste 18 voci una per una. Gli hook nel resto del codice
// (playSfx('nome_evento')) restano tutti agganciati esattamente dove sono: quando arrivano i file
// veri, basta cambiare SOLO questo oggetto, nessun altro punto del codice va toccato.
const __PLACEHOLDER_SFX = (ctx,dest)=> __tone(ctx,dest,{freq:900, type:'sine', dur:0.06, gain:0.15});
const SFX_SYNTH = {
  ui_click: __PLACEHOLDER_SFX,
  ui_confirm: __PLACEHOLDER_SFX,
  lights_out: __PLACEHOLDER_SFX,
  overtake: __PLACEHOLDER_SFX,
  overtaken: __PLACEHOLDER_SFX,
  pit_stop: __PLACEHOLDER_SFX,
  dnf_crash: __PLACEHOLDER_SFX,
  rain_start: __PLACEHOLDER_SFX,
  safety_car: __PLACEHOLDER_SFX,
  checkered_flag: __PLACEHOLDER_SFX,
  rival_beaten: __PLACEHOLDER_SFX,
  podium: __PLACEHOLDER_SFX,
  victory_fanfare: __PLACEHOLDER_SFX,
  upgrade_success: __PLACEHOLDER_SFX,
  upgrade_fail: __PLACEHOLDER_SFX,
  draft_reveal: __PLACEHOLDER_SFX,
  error_disabled: __PLACEHOLDER_SFX,
  notify_generic: __PLACEHOLDER_SFX,
};
// V0.9.7.8.2: punto centrale per riprodurre un SFX — silenzioso se il volume e' a zero o se
// l'AudioContext non e' ancora stato sbloccato da un gesto utente (nessun errore, fallisce muto).
let __suppressSfx = false;
// V0.9.7.8.10: feedback aptico al tocco — breve vibrazione, disattivabile dalle Opzioni. Silenzioso
// (nessun errore) sui dispositivi/browser che non supportano l'API Vibration (es. iOS Safari).
function triggerHaptic(){
  if(audioSettings.hapticEnabled===false) return;
  if(navigator.vibrate){ try{ navigator.vibrate(4); }catch(e){ /* ignorato */ } } // V0.9.7.8.10: ridotto da 10 a 4ms, era troppo intenso
}
// V0.9.7.8.10: vibrazione "tensiva" — pattern a impulsi, usata solo per le decisioni durante la
// gara live (meteo, safety car, pit, aggressivita'), volutamente diversa dal tocco generico cosi'
// si sente la differenza tra "ho premuto un bottone" e "devo decidere qualcosa adesso".
function triggerTensionHaptic(){
  if(audioSettings.hapticEnabled===false) return;
  if(navigator.vibrate){ try{ navigator.vibrate([12,40,12,40,20]); }catch(e){ /* ignorato */ } }
}
// V0.9.7.8.35: 12 dei 18 placeholder sostituiti con file audio veri. 'lights_out' e' escluso di
// proposito: ha una sua timing dedicata (5 accensioni + 1 scatto finale), gestita direttamente in
// beginRaceWithLights(), non un singolo suono unico. I restanti 5 (overtake/overtaken/pit_stop/
// dnf_crash/safety_car) restano sintetizzati per scelta esplicita di Gio, per ora.
const REAL_SFX_FILES = {
  ui_click: 'audio/sfx_ui_click.mp3',
  ui_confirm: 'audio/sfx_ui_confirm.mp3',
  error_disabled: 'audio/sfx_error_disabled.mp3',
  notify_generic: 'audio/sfx_notify_generic.mp3',
  draft_reveal: 'audio/sfx_draft_reveal.mp3',
  upgrade_success: 'audio/sfx_upgrade_success.mp3',
  upgrade_fail: 'audio/sfx_upgrade_fail.mp3',
  rain_start: 'audio/sfx_rain_start.mp3',
  checkered_flag: 'audio/sfx_checkered_flag.mp3',
  rival_beaten: 'audio/sfx_rival_beaten.mp3',
  podium: 'audio/sfx_podium.mp3',
  victory_fanfare: 'audio/sfx_victory_fanfare.mp3',
};
function playSfx(name, intensity){
  if(__suppressSfx) return;
  if(audioSettings.sfxEnabled===false) return;
  if((audioSettings.sfxVolume||0) <= 0) return;
  if(REAL_SFX_FILES[name]){ playRealSfx(REAL_SFX_FILES[name]); return; }
  const ctx = getAudioCtx();
  if(!ctx || ctx.state==='suspended') return;
  const synth = SFX_SYNTH[name];
  if(!synth) return;
  const dest = ctx.createGain();
  dest.gain.value = audioSettings.sfxVolume;
  dest.connect(ctx.destination);
  try{ synth(ctx, dest, intensity); }catch(e){ /* mai far crashare il gioco per un suono */ }
}

/* ============================================================
   V0.9.7.8.10 — MUSICA DI SOTTOFONDO
   Due tracce, due "zone": RACE (in gara + premiazione) usa Lap_Timer_Drift, OTHER (tutto il
   resto: menu, draft, hub, pit lane...) usa Pit_Lane_Drift. Cambio zona = crossfade morbido, mai
   un taglio netto. Ogni traccia riparte da un punto casuale ogni volta che (ri)comincia a suonare,
   TRANNE la primissima volta in assoluto che il gioco viene aperto in questa sessione: quella parte
   dall'inizio, come richiesto.
   ============================================================ */
// V0.9.7.8.36: la zona 'other' ora ha DUE tracce (Velvet Grid / Pit Lane Pulse) invece di una sola.
// Scelta casuale tra le due ad ogni "vero avvio" (non ad ogni crossfade — se si resta nella stessa
// zona, la traccia gia' in corso continua) — TRANNE il primissimo avvio in assoluto del gioco in
// questa sessione, che e' SEMPRE Pit Lane Pulse, come richiesto esplicitamente.
const MUSIC_TRACKS_OTHER = ['audio/velvet-grid.mp3', 'audio/pit-lane-pulse.mp3'];
const MUSIC_TRACKS = {
  race: 'audio/lap-timer-drift.mp3',
  other: null, // scelto dinamicamente da pickOtherTrack(), vedi sotto
};
function pickOtherTrack(){
  if(__musicIsVeryFirstPlay) return 'audio/pit-lane-pulse.mp3';
  return MUSIC_TRACKS_OTHER[Math.floor(rnd()*MUSIC_TRACKS_OTHER.length)];
}
const __musicAudioEls = { race:null, other:null };
let __musicCurrentZone = null;        // 'race' | 'other' | null (silenzio)
let __musicIsVeryFirstPlay = true;    // solo il primissimo avvio in assoluto parte da 0
let __musicFadeTimer = null;

function getMusicAudioEl(zone){
  if(__musicAudioEls[zone]) return __musicAudioEls[zone];
  const src = zone==='other' ? pickOtherTrack() : MUSIC_TRACKS[zone];
  if(!src) return null;
  const el = new Audio(src);
  el.loop = true;
  el.volume = 0;
  __musicAudioEls[zone] = el;
  return el;
}
// Fasi "in gara + premiazione" -> traccia race; tutto il resto -> traccia other.
const MUSIC_RACE_PHASES = new Set(['start_lights','race_live','race_result','season_end']);
function musicZoneForPhase(phase){
  return MUSIC_RACE_PHASES.has(phase) ? 'race' : 'other';
}
function stopMusicFade(){ if(__musicFadeTimer){ clearInterval(__musicFadeTimer); __musicFadeTimer=null; } }
// Crossfade lineare su ~1.4s: la traccia che esce scende a 0 (e si mette in pausa), quella che
// entra sale fino al volume musica impostato nelle Opzioni. Se la musica e' disattivata o il
// volume e' a zero, non facciamo partire nulla (silenzioso, nessun errore).
function crossfadeMusicTo(zone){
  if(__musicCurrentZone===zone) return;
  const prevZone = __musicCurrentZone;
  __musicCurrentZone = zone;
  stopMusicFade();
  const targetVol = (audioSettings.musicEnabled!==false) ? (audioSettings.musicVolume||0) : 0;
  const prevEl = prevZone ? getMusicAudioEl(prevZone) : null;
  const nextEl = zone ? getMusicAudioEl(zone) : null;
  if(nextEl && targetVol>0){
    if(nextEl.paused){
      // V0.9.7.8.36: ad ogni VERO riavvio della zona 'other' (non ad ogni crossfade — se la zona
      // era gia' in pausa vuol dire che stiamo ripartendo da capo, non continuando) ri-scegliamo
      // quale delle due tracce suonare. Il primissimo avvio in assoluto e' sempre Pit Lane Pulse
      // (pickOtherTrack() lo garantisce), i successivi sono casuali tra le due.
      if(zone==='other'){
        const chosenSrc = pickOtherTrack();
        if(!nextEl.src || !nextEl.src.endsWith(chosenSrc.replace('audio/',''))){
          nextEl.src = chosenSrc;
          nextEl.load();
        }
      }
      const startPlayback = ()=>{
        try{
          if(!__musicIsVeryFirstPlay && nextEl.duration && isFinite(nextEl.duration)){
            nextEl.currentTime = rnd()*nextEl.duration*0.9; // mai troppo vicino alla fine
          }
        }catch(e){ /* ignorato: partira' da dove puo' */ }
        nextEl.play().catch(()=>{ /* bloccato dall'autoplay, ripartira' al primo gesto utente */ });
      };
      if(__musicIsVeryFirstPlay){
        nextEl.currentTime = 0;
        startPlayback();
      } else if(nextEl.readyState >= 1 /* HAVE_METADATA */){
        startPlayback();
      } else {
        // i metadata (durata) non sono ancora pronti: aspettiamo l'evento invece di partire da 0
        // per errore e poi "saltare" a meta' traccia, che si sentirebbe come uno scatto brutto.
        nextEl.addEventListener('loadedmetadata', startPlayback, { once:true });
      }
      __musicIsVeryFirstPlay = false;
    }
  }
  const steps = 20, stepMs = 70; // ~1.4s totali
  let i = 0;
  __musicFadeTimer = setInterval(()=>{
    i++;
    const t = i/steps;
    if(prevEl) prevEl.volume = Math.max(0, targetVol*(1-t));
    if(nextEl) nextEl.volume = Math.min(targetVol, targetVol*t);
    if(i>=steps){
      stopMusicFade();
      if(prevEl && prevEl!==nextEl) prevEl.pause();
    }
  }, stepMs);
}
// Chiamata ad ogni render(): confronta la fase corrente con l'ultima zona suonata e fa la crossfade
// solo se serve davvero (nessun effetto se restiamo nella stessa zona).
function updateMusicForCurrentPhase(){
  if(!state || !state.phase) return;
  const zone = musicZoneForPhase(state.phase);
  crossfadeMusicTo(zone);
}
// Se il volume/toggle musica cambia dalle Opzioni mentre qualcosa sta gia' suonando, aggiorniamo
// subito il volume in corso senza aspettare un cambio di zona.
function applyMusicVolumeNow(){
  const targetVol = (audioSettings.musicEnabled!==false) ? (audioSettings.musicVolume||0) : 0;
  if(__musicFadeTimer) return; // durante un crossfade lasciamo che finisca lui
  const el = __musicCurrentZone ? __musicAudioEls[__musicCurrentZone] : null;
  if(el) el.volume = targetVol;
  if(targetVol<=0){ Object.values(__musicAudioEls).forEach(a=>{ if(a && !a.paused) a.pause(); }); }
  else if(el && el.paused){ crossfadeMusicTo(__musicCurrentZone); }
}
// Pre-creazione immediata di entrambe le tracce (anche se non ancora in play): i metadata
// (durata) hanno cosi' minuti per caricarsi in background, invece di doverli aspettare proprio
// nel momento in cui serve fare il salto a un punto casuale.
const INTRO_WHOOSH_SRC = 'audio/intro-passby.mp3';
let __introWhooshPlayed = false;
// V0.9.7.8.14: player generico per SFX da file audio VERI (non sintetizzati) — stesso identico
// meccanismo gia' usato per il passby d'apertura, riutilizzabile per qualunque nuovo suono reale.
function playRealSfx(path, volumeMult){
  if(__suppressSfx) return null;
  if(audioSettings.sfxEnabled===false || (audioSettings.sfxVolume||0)<=0) return null;
  try{
    const el = new Audio(path);
    el.loop = false;
    el.volume = Math.min(1, audioSettings.sfxVolume * (volumeMult!=null?volumeMult:1));
    el.play().catch(()=>{});
    return el;
  }catch(e){ return null; /* mai far crashare il gioco per un suono */ }
}
function playIntroWhoosh(){
  if(__introWhooshPlayed || !INTRO_WHOOSH_SRC) return;
  __introWhooshPlayed = true;
  playRealSfx(INTRO_WHOOSH_SRC);
}
// V0.9.7.8.20 — Installazione PWA: catturiamo l'evento che Chrome/Edge lanciano quando l'app e'
// installabile, cosi' possiamo offrire un bottone "Installa" nostro invece di aspettare che il
// giocatore trovi la voce nascosta nel menu del browser. Su iOS Safari questo evento non esiste
// (Apple non lo supporta): li' possiamo solo mostrare istruzioni testuali ("Condividi -> Aggiungi
// alla schermata Home"), non c'e' un vero prompt programmabile.
let __deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  __deferredInstallPrompt = e;
});
window.addEventListener('appinstalled', ()=>{ __deferredInstallPrompt = null; });
function isStandaloneApp(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
// Innesca il prompt nativo (Android/Chrome/Edge) se disponibile; su iOS mostra le istruzioni,
// perche' li' non esiste alcuna API per farlo in automatico.
async function triggerInstallPrompt(){
  if(__deferredInstallPrompt){
    __deferredInstallPrompt.prompt();
    try{ await __deferredInstallPrompt.userChoice; }catch(e){}
    __deferredInstallPrompt = null;
    return true;
  }
  return false; // il chiamante mostrera' le istruzioni manuali (iOS o browser non supportato)
}
// V0.9.7.8.20: schedina invito all'installazione — solo per chi NON gioca gia' dall'icona, mostrata
// a fine stagione subito dopo aver condiviso il risultato (momento in cui l'entusiasmo e' piu' alto).
function showInstallPitchCard(){
  if(isStandaloneApp() || document.getElementById('installPitchOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'installPitchOverlay';
  overlay.className = 'install-pitch-overlay';
  overlay.innerHTML = `
    <div class="install-pitch-card">
      <div class="install-pitch-emoji">🏁</div>
      <div class="install-pitch-title">Ti sta piacendo Racing Dynasty?</div>
      <div class="install-pitch-body">Installalo sul tuo dispositivo: si apre come un'app vera, a schermo intero, con un'icona tutta sua — niente barra del browser, niente da digitare.</div>
      <div class="install-pitch-actions">
        <button class="button primary" id="installPitchYes">📲 Installalo sul tuo dispositivo</button>
        <button class="install-pitch-dismiss" id="installPitchNo">Magari dopo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = ()=>{ overlay.remove(); };
  document.getElementById('installPitchNo').addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  document.getElementById('installPitchYes').addEventListener('click', async ()=>{
    const worked = await triggerInstallPrompt();
    if(!worked){
      close();
      if(isIOSDevice()){
        alert('Per installare Racing Dynasty su iPhone/iPad:\n\n1. Tocca il pulsante Condividi (il quadrato con la freccia verso l\'alto) in basso nel browser\n2. Scorri e scegli "Aggiungi alla schermata Home"\n3. Conferma con "Aggiungi"');
      } else {
        alert('Cerca la voce "Installa app" o "Aggiungi a schermata Home" nel menu del tuo browser (di solito le tre puntine in alto a destra).');
      }
    } else {
      close();
    }
  });
}
getMusicAudioEl('race'); getMusicAudioEl('other');
// V0.9.7.8.10: se il telefono si blocca (o si cambia app) l'audio non deve continuare a suonare
// in sottofondo — Page Visibility API, nessuna dipendenza da eventi del browser piu' fragili.
let __musicWasPlayingBeforeHide = null; // quale zona era in play prima di nascondersi
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    const el = __musicCurrentZone ? __musicAudioEls[__musicCurrentZone] : null;
    __musicWasPlayingBeforeHide = (el && !el.paused) ? __musicCurrentZone : null;
    Object.values(__musicAudioEls).forEach(a=>{ if(a && !a.paused) a.pause(); });
    if(__actx && __actx.state==='running') __actx.suspend().catch(()=>{});
  } else {
    if(__actx && __actx.state==='suspended') __actx.resume().catch(()=>{});
    if(__musicWasPlayingBeforeHide){
      const el = __musicAudioEls[__musicWasPlayingBeforeHide];
      const targetVol = (audioSettings.musicEnabled!==false) ? (audioSettings.musicVolume||0) : 0;
      if(el && el.paused && targetVol>0){ el.volume = targetVol; el.play().catch(()=>{}); }
    }
    __musicWasPlayingBeforeHide = null;
  }
});
['click','touchstart','keydown'].forEach(ev=>{
  document.addEventListener(ev, function unlockMusicOnce(){
    // V0.9.7.8.10 fix: al primo caricamento pagina il play() e' quasi certamente bloccato
    // dall'autoplay del browser (nessun gesto utente ancora avvenuto). crossfadeMusicTo() non
    // riproverebbe perche' la "zona" non e' cambiata — qui riproviamo direttamente play() sulla
    // traccia della zona corrente, con lo stesso punto di partenza casuale/zero gia' deciso.
    const el = __musicCurrentZone ? getMusicAudioEl(__musicCurrentZone) : null;
    if(el && el.paused){
      const targetVol = (audioSettings.musicEnabled!==false) ? (audioSettings.musicVolume||0) : 0;
      el.volume = targetVol;
      el.play().catch(()=>{});
    }
    playIntroWhoosh(); // V0.9.7.8.10: passby una tantum, solo alla primissima apertura
  }, { once:true, passive:true });
});


const LOGO_DATA_URI = 'assets/logo.png'; // V0.7.2: logo titolo
const RARITY_ORDER = ['Common','Rare','Epic','Legendary','Immortal'];
const POINTS_TABLE = [25,18,15,12,10,8,6,4,2,1];
const PRIZE_TABLE  = [3.2,2.5,2.0,1.6,1.3,1.0,0.8,0.6,0.4,0.2]; // milioni
const START_BUDGET = 20; // milioni

// --- V0.2: difficoltà e reroll ---
const DIFFICULTY_REROLLS = { facile:9, medio:6, difficile:3, hardcore:0 };
const DIFFICULTY_ORDER = ['facile','medio','difficile','hardcore'];
const DIFFICULTY_LABEL_IT = { facile:'Facile', medio:'Medio', difficile:'Difficile', hardcore:'Hardcore' };
const DIFFICULTY_LABEL_EN = { facile:'Easy', medio:'Medium', difficile:'Hard', hardcore:'Hardcore' };
const DIFFICULTY_LABEL_ES = { facile:'Fácil', medio:'Medio', difficile:'Difícil', hardcore:'Hardcore' };
const DIFFICULTY_DESC_IT = {
  facile:'9 reroll nel draft: più margine per rifare le offerte che non ti convincono.',
  medio:'6 reroll nel draft: qualche seconda possibilità, ma le scelte contano davvero.',
  difficile:'Solo 3 reroll nel draft: quasi ogni pesca va accettata così com\'è.',
  hardcore:'Zero reroll: quello che esce, esce. Nessuna seconda possibilità.'
};
const DIFFICULTY_DESC_EN = {
  facile:'9 rerolls in the draft: plenty of room to redo offers that don\'t convince you.',
  medio:'6 rerolls in the draft: a few second chances, but your choices really matter.',
  difficile:'Only 3 rerolls in the draft: almost every draw has to be accepted as it is.',
  hardcore:'Zero rerolls: what you get, you keep. No second chances.'
};
const DIFFICULTY_DESC_ES = {
  facile:'9 rerolls en el draft: más margen para repetir las ofertas que no te convencen.',
  medio:'6 rerolls en el draft: algunas segundas oportunidades, pero las decisiones cuentan de verdad.',
  difficile:'Solo 3 rerolls en el draft: casi todas las cartas hay que aceptarlas tal cual salen.',
  hardcore:'Cero rerolls: lo que sale, sale. Sin segundas oportunidades.'
};
function diffLabelSet(){ return currentLang==='en' ? DIFFICULTY_LABEL_EN : (currentLang==='es' ? DIFFICULTY_LABEL_ES : DIFFICULTY_LABEL_IT); }
function diffDescSet(){ return currentLang==='en' ? DIFFICULTY_DESC_EN : (currentLang==='es' ? DIFFICULTY_DESC_ES : DIFFICULTY_DESC_IT); }
const DIFFICULTY_LABEL = new Proxy({}, { get:(t,k)=> diffLabelSet()[k] });
const DIFFICULTY_DESC = new Proxy({}, { get:(t,k)=> diffDescSet()[k] });

// --- V0.2: distribuzione a fasce di rating per il draft (sostituisce l'estrazione sul solo "peso") ---
// La difficoltà NON tocca questa tabella: vale per tutte le difficoltà allo stesso modo.
const RATING_BANDS = [
  { min:40, max:59,  p:0.30 },   // Debole
  { min:60, max:69,  p:0.32 },   // Discreto
  { min:70, max:79,  p:0.30 },   // Intermedio
  { min:80, max:89,  p:0.075 },  // Ottimo
  { min:90, max:94,  p:0.0035 }, // Eccellente
  { min:95, max:99,  p:0.001 },  // Legendary
  { min:100,max:100, p:0.0005 }  // Immortal
];

const COMPONENT_LABEL = {
  motore:'Motore', telaio:'Telaio', aero:'Aerodinamica', gomme:'Gomme', stratega:'Team Principal', pilotSecond:'Secondo Pilota'
};

/* ---------------- V0.6: confronto sostituzioni ---------------- */
// Statistiche confrontate per categoria (spec 0.6, punti 3/4/5) — 'rating' sempre incluso.
const COMPARE_STATS = {
  motore:   [['rating','Rating'],['potenza','Potenza'],['affidabilita','Affidabilità'],['accelerazione','Accelerazione'],['consumo','Consumo'],['resistenza','Resistenza']],
  telaio:   [['rating','Rating'],['leggerezza','Leggerezza'],['bilanciamento','Bilanciamento'],['sicurezza','Sicurezza'],['affidabilita','Affidabilità'],['degradogomme','Degrado Gomme']],
  aero:     [['rating','Rating'],['velmax','Velocità Massima'],['curveveloci','Curve Veloci'],['curvelente','Curve Lente'],['stabilita','Stabilità'],['pioggia','Pioggia']],
  gomme:    [['rating','Rating'],['grip','Grip'],['durata','Durata'],['bagnato','Bagnato'],['warmup','Warmup'],['degrado','Degrado'],['versatilita','Versatilità']],
  stratega: [['rating','Rating'],['pitstop','Pit Stop'],['letturagara','Lettura Gara'],['safetycar','Safety Car'],['pioggia','Pioggia'],['pressione','Pressione'],['aggressivita','Aggressività'],['affidabilitadec','Affidabilità Decisionale']],
  pilotSecond: [['rating','Rating'],['qualifica','Qualifica'],['sorpassi','Sorpassi'],['pioggia','Pioggia'],['costanza','Costanza'],['pressione','Pressione'],['aggressivita','Aggressività'],['partenza','Partenza'],['ultimigiri','Ultimi Giri'],['gestionegomme','Gestione Gomme'],['affidabilita','Affidabilità']]
};
// Statistiche dove un valore PIU' BASSO è migliore (consumo, degrado gomme/telaio)
const INVERT_STATS = new Set(['consumo','degrado','degradogomme']);
// Statistica "situazionale" per categoria, usata per riconoscere un'OPPORTUNITÀ
const SITUATIONAL_STAT = { gomme:'bagnato', aero:'pioggia', stratega:'safetycar', pilotSecond:'pioggia' };
const CATEGORY_POOL = { motore:DATA.motori, telaio:DATA.telai, aero:DATA.aero, gomme:DATA.gomme, stratega:DATA.strategi, pilotSecond:DATA.piloti };

let state = null;
let driverCareerState = null; // V0.9.7.9: stato Carriera Pilota, separato e indipendente da 'state'
const app = document.getElementById('app');

/* ---------------- utilities ---------------- */
function rnd(){ return Math.random(); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function fmtM(v){ return (v>=0?'':'-') + Math.abs(v).toFixed(1) + 'M'; }
function pick(arr){ return arr[Math.floor(rnd()*arr.length)]; }

function weightedSampleDistinct(pool, n, weightKey, excludeIds){
  excludeIds = excludeIds || new Set();
  const avail = pool.filter(x => !excludeIds.has(x.id));
  const chosen = [];
  const local = avail.slice();
  for(let i=0;i<n && local.length>0;i++){
    const total = local.reduce((s,x)=>s + (x[weightKey]||1), 0);
    let r = rnd()*total;
    let idx = 0;
    for(; idx<local.length; idx++){
      r -= (local[idx][weightKey]||1);
      if(r<=0) break;
    }
    idx = Math.min(idx, local.length-1);
    chosen.push(local[idx]);
    local.splice(idx,1);
  }
  return chosen;
}

// --- V0.2: estrazione per fasce di rating (12/18/30/25/11/3.8/0.2%) ---
// Ogni carta e' un'estrazione indipendente: prima si sceglie la fascia secondo le probabilita'
// sopra (rinormalizzate sulle fasce che hanno ancora candidati disponibili), poi si sceglie
// l'elemento dentro la fascia pesando per "peso drop" originale (rarita' relativa nel db).
// Il vincolo di "nessun duplicato nella stessa terna" e' garantito escludendo via via gli id
// gia' estratti in questo giro.
function drawOneBanded(pool, excludeIds){
  const bands = RATING_BANDS
    .map(b => ({ ...b, items: pool.filter(x => !excludeIds.has(x.id) && x.rating >= b.min && x.rating <= b.max) }))
    .filter(b => b.items.length > 0);
  if(bands.length === 0) return null;
  const total = bands.reduce((s,b)=> s + b.p, 0);
  let r = rnd() * total;
  let chosenBand = bands[bands.length-1];
  for(const b of bands){ r -= b.p; if(r <= 0){ chosenBand = b; break; } }
  const items = chosenBand.items;
  const wtotal = items.reduce((s,x)=> s + (x.peso||1), 0);
  let r2 = rnd() * wtotal;
  for(const it of items){ r2 -= (it.peso||1); if(r2 <= 0) return it; }
  return items[items.length-1];
}

function drawBandedDistinct(pool, n, excludeIds){
  const local = new Set(excludeIds || []);
  const chosen = [];
  for(let i=0;i<n;i++){
    const item = drawOneBanded(pool, local);
    if(!item) break;
    chosen.push(item);
    local.add(item.id);
  }
  return chosen;
}

function rarityColor(r){
  return {Common:'var(--common)',Rare:'var(--rare)',Epic:'var(--epic)',Legendary:'var(--legendary)',Immortal:'var(--immortal)'}[r] || 'var(--common)';
}
// V0.9.7.6: THE GOAT ha un'identita' cromatica fissa (rosso Ferrari), sempre diversa dal colore di
// fascia standard, ovunque compaia una sua card — draft, scouting, squadra attuale, conferme.
function displayRarity(item){ return (item && item.nome==='THE GOAT') ? 'TheGoat' : (item ? item.rarita : ''); }
function displayRarityLabel(item){ return (item && item.nome==='THE GOAT') ? 'THE GOAT' : (item ? item.rarita : ''); }

// --- V0.3: pescaggio per rating piu' vicino (usato per assegnare piloti/componenti reali alle IA) ---
function pickNearestDistinct(pool, target, excludeIds){
  let best=null, bestDiff=Infinity;
  for(const x of pool){
    if(excludeIds.has(x.id)) continue;
    const diff = Math.abs(x.rating-target);
    if(diff<bestDiff || (diff===bestDiff && rnd()<0.5)){ bestDiff=diff; best=x; }
  }
  return best;
}
function pickNearest(pool, target){
  let best=pool[0], bestDiff=Infinity;
  for(const x of pool){
    const diff = Math.abs(x.rating-target);
    if(diff<bestDiff){ bestDiff=diff; best=x; }
  }
  return best;
}

/* ---------------- V0.5.1: bilanciamento griglia IA ---------------- */
// PROBLEMA DIAGNOSTICATO: il giocatore pesca 3 candidati a fasce di rating e sceglie il
// migliore (draft roguelike) — questo produce in media rating ~85-86 per pilota/componente.
// Le scuderie IA, invece, venivano assegnate con un singolo pescaggio "piu' vicino al target"
// del foglio originale (~75-79 di media): un distacco sistematico di ~9-10 punti su OGNI
// componente + pilota, che spiegava la vittoria troppo facile del giocatore.
//
// CORREZIONE: le scuderie IA usano ORA la STESSA identica meccanica del giocatore
// (drawBandedDistinct + scelta del migliore tra N candidati), stesse fasce di rating,
// stessa variabilita' casuale — nessun bonus/malus nascosto. L'unica differenza tra le
// 9 scuderie e' QUANTI candidati vengono valutati (N), un numero derivato dal "ratingbase"
// gia' presente nel database (l'identita' originale di ciascuna scuderia), che rispecchia
// scuderie con piu' o meno risorse: esattamente come il giocatore, che valuta sempre N=3.
const AI_TIER_ORDER = ['Debole','Debole','Centro gruppo','Centro gruppo','Centro gruppo','Centro gruppo','Forte','Forte','Elite'];
const AI_TIER_DRAWS = { 'Debole':1, 'Centro gruppo':2, 'Forte':4, 'Elite':5 };
// V0.9.3.1: la difficolta' ora incide su avversari, budget, premi e rischio scouting/upgrade, non solo sui reroll
const DIFFICULTY_PARAMS = {
  // V0.9.4.2.4: la difficolta' incide SOLO sui reroll disponibili nel draft — niente piu' budget/premi/IA/rischio diversi
  facile:    { budgetMult:1.0, prizeMult:1.0, aiTierMult:1.0, riskOffset:0 },
  medio:     { budgetMult:1.0, prizeMult:1.0, aiTierMult:1.0, riskOffset:0 },
  difficile: { budgetMult:1.0, prizeMult:1.0, aiTierMult:1.0, riskOffset:0 },
  hardcore:  { budgetMult:1.0, prizeMult:1.0, aiTierMult:1.0, riskOffset:0 },
};
function difficultyParams(){ return DIFFICULTY_PARAMS[state && state.difficulty] || DIFFICULTY_PARAMS.medio; }
// nota: 'Centro gruppo' a N=2 (~82.6 di media) resta leggermente sotto il giocatore
// a parita' di meccanica (N=3 -> ~85.7), cosi' una build media del giocatore non e'
// automaticamente competitiva; 'Forte'/'Elite' (N=4/5) superano invece la media giocatore.

function assignAITiers(teams){
  const sorted = teams.slice().sort((a,b)=> a.ratingbase-b.ratingbase);
  const tierOf = {};
  sorted.forEach((t,i)=>{ tierOf[t.id] = AI_TIER_ORDER[i] ?? 'Centro gruppo'; });
  return tierOf;
}

// pesca N candidati con la stessa distribuzione a fasce del giocatore e restituisce il
// migliore (rating piu' alto) tra quelli estratti — identica meccanica, N variabile.
function pickBestOfNDistinct(pool, n, excludeIds){
  const opts = drawBandedDistinct(pool, n, excludeIds);
  if(opts.length===0) return null;
  return opts.reduce((best,c)=> c.rating>best.rating ? c : best, opts[0]);
}

// V0.9.4.6.2: le IA non CERCANO sinergie (pescano sempre il rating migliore, come sempre), ma se
// il risultato contiene coppie per puro caso, ricevono lo stesso bonus reale del giocatore — stessa
// regola, nessun vantaggio/svantaggio nascosto. Struttura dati diversa (drivers[]/components{}),
// stessa logica di accoppiamento.
function applyAITeamSynergyBonuses(t){
  const slots = [
    { catKey:'pilotMain', item:t.drivers[0] }, { catKey:'pilotSecond', item:t.drivers[1] },
    { catKey:'motore', item:t.components.motore }, { catKey:'telaio', item:t.components.telaio },
    { catKey:'aero', item:t.components.aero }, { catKey:'gomme', item:t.components.gomme },
    { catKey:'stratega', item:t.components.stratega },
  ].filter(s=>s.item && s.item.sinergia);

  const groups = {};
  slots.forEach(s=>{ (groups[s.item.sinergia]=groups[s.item.sinergia]||[]).push(s); });

  let stackPct = 0;
  const flatPairs = [];
  Object.keys(groups).forEach(mentId=>{
    const items = groups[mentId];
    const pairCount = Math.floor(items.length/2);
    if(pairCount === 1) flatPairs.push([items[0], items[1]]);
    else if(pairCount >= 2){
      const pct = SYNERGY_STACK_PCT[Math.min(pairCount,3)] || SYNERGY_STACK_PCT[3];
      if(pct > stackPct) stackPct = pct;
    }
  });

  // V0.9.4.6.2: tetto a 99 (non 100) per le IA — l'Immortal (rating 100) resta esclusiva del
  // giocatore per regola di design; il bonus sinergia non deve mai poterlo aggirare.
  flatPairs.forEach(([a,b])=>{ a.item.rating = clamp(a.item.rating+SYNERGY_BONUS,1,99); b.item.rating = clamp(b.item.rating+SYNERGY_BONUS,1,99); });

  const allSlots = [
    {catKey:'pilotMain', item:t.drivers[0]}, {catKey:'pilotSecond', item:t.drivers[1]},
    {catKey:'motore', item:t.components.motore}, {catKey:'telaio', item:t.components.telaio},
    {catKey:'aero', item:t.components.aero}, {catKey:'gomme', item:t.components.gomme},
    {catKey:'stratega', item:t.components.stratega},
  ];
  if(stackPct > 0){
    allSlots.forEach(s=>{ if(s.item) s.item.rating = clamp(Math.round(s.item.rating*(1+stackPct)),1,99); });
  } else if(flatPairs.length >= 3){
    allSlots.forEach(s=>{ if(s.item) s.item.rating = clamp(Math.round(s.item.rating*(1+SYNERGY_DIVERSE_BONUS_PCT)),1,99); });
  }
}

// V0.9.4.6.2: forza complessiva e semaforo sinergie per una scuderia IA — stessa logica del giocatore,
// usati nei confronti rapidi (post-draft, schieramento, pagina rivale).
function aiTeamWeightedStrength(t){
  const comp = t.components;
  const r1 = weightedBase({pilota:t.drivers[0].rating, motore:comp.motore.rating, telaio:comp.telaio.rating, aero:comp.aero.rating, gomme:comp.gomme.rating, stratega:comp.stratega.rating});
  const r2 = weightedBase({pilota:t.drivers[1].rating, motore:comp.motore.rating, telaio:comp.telaio.rating, aero:comp.aero.rating, gomme:comp.gomme.rating, stratega:comp.stratega.rating});
  return Math.round((r1+r2)/2);
}

function aiTeamSynergyCircles(t){
  const comp = t.components;
  const slots = [
    { catKey:'pilotMain', roleLabel:'Pilota #1', item:t.drivers[0] }, { catKey:'pilotSecond', roleLabel:'Pilota #2', item:t.drivers[1] },
    { catKey:'motore', roleLabel:'Motore', item:comp.motore }, { catKey:'telaio', roleLabel:'Telaio', item:comp.telaio },
    { catKey:'aero', roleLabel:'Aero', item:comp.aero }, { catKey:'gomme', roleLabel:'Gomme', item:comp.gomme },
    { catKey:'stratega', roleLabel:'Team Principal', item:comp.stratega },
  ].filter(s=>s.item && s.item.sinergia).map(s=>({...s, mentId:s.item.sinergia}));
  const groups = {};
  slots.forEach(s=>{ (groups[s.mentId]=groups[s.mentId]||[]).push(s); });
  const lit = []; let leftovers = [];
  Object.keys(groups).forEach(mentId=>{
    const items = groups[mentId].slice();
    while(items.length>=2) lit.push({ lit:true, a:items.shift(), b:items.shift(), mentId });
    if(items.length===1) leftovers.push(items[0]);
  });
  const dead = [];
  while(leftovers.length>=2) dead.push({ lit:false, a:leftovers.shift(), b:leftovers.shift() });
  if(leftovers.length===1) dead.push({ lit:false, a:leftovers.shift(), b:null });
  return [...lit, ...dead];
}

function miniSemaforoHTML(circles){
  if(!circles.length) return '<span class="dim" style="font-size:11px;">Nessuna sinergia</span>';
  return circles.map(c=>{
    const glow = c.lit ? `style="--glow:${MENTALITA_DEFS[c.mentId].color};"` : '';
    const halfHTML = s => s ? `<div class="sem-half" style="background:${MENTALITA_DEFS[s.mentId].color};" title="${s.roleLabel} (${s.item.nome}) · ${(s.catKey==='pilotMain'||s.catKey==='pilotSecond')?'Mentalità':'Tipologia'}: ${MENTALITA_DEFS[s.mentId].label}"></div>` : `<div class="sem-half" style="background:rgba(255,255,255,0.06);"></div>`;
    return `<div class="sem-circle mini${c.lit?' full':''}" ${glow}>${halfHTML(c.a)}${halfHTML(c.b)}</div>`;
  }).join('');
}

function quickTeamCompareHTML(title){
  const t = state.team;
  const r1 = weightedBase({pilota:t.pilotMain.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating});
  const r2 = weightedBase({pilota:t.pilotSecond.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating});
  const myStrength = Math.round((r1+r2)/2);
  const myCircles = semaforoCirclesData();
  const rows = [`<div class="qtc-row qtc-you">
      <div class="qtc-name">${teamFlag('PLAYER')} ${teamDisplayName()} <span class="qtc-badge">TU</span></div>
      <div class="qtc-mini-sem">${miniSemaforoHTML(myCircles)}</div>
      <div class="qtc-rating" style="color:${teamStrengthColor(myStrength)};">${myStrength}</div>
    </div>`];
  (state.rivals||[]).forEach(rid=>{
    const rt = state.aiTeams.find(x=>x.id===rid);
    if(!rt) return;
    const rStrength = aiTeamWeightedStrength(rt);
    const rCircles = aiTeamSynergyCircles(rt);
    rows.push(`<div class="qtc-row">
      <div class="qtc-name">${teamFlag(rt.id)} ${rt.nome} <span class="qtc-badge rival">RIVALE</span></div>
      <div class="qtc-mini-sem">${miniSemaforoHTML(rCircles)}</div>
      <div class="qtc-rating" style="color:${teamStrengthColor(rStrength)};">${rStrength}</div>
    </div>`);
  });
  return `<div class="panel">
    <div class="panel-title"><h3 class="hdr">${title}</h3></div>
    <div class="qtc-list">${rows.join('')}</div>
  </div>`;
}

function buildAIGrid(aiTeamsRaw, usedIds, difficulty){
  const aiTierMult = (DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.medio).aiTierMult;
  const teams = aiTeamsRaw.map(t => ({...t}));
  const tierOf = assignAITiers(teams);
  // niente Immortal nella griglia IA (resta una carta esclusiva del giocatore, come in V0.3)
  const pilotiSenzaImmortal = DATA.piloti.filter(p=>p.rating<100);
  const poolSenzaImmortal = {
    motori: DATA.motori.filter(x=>x.rating<100),
    telai: DATA.telai.filter(x=>x.rating<100),
    aero: DATA.aero.filter(x=>x.rating<100),
    gomme: DATA.gomme.filter(x=>x.rating<100),
    strategi: DATA.strategi.filter(x=>x.rating<100)
  };

  teams.forEach(t=>{
    const n = Math.max(1, Math.round((AI_TIER_DRAWS[tierOf[t.id]] || 2) * aiTierMult));
    t.tier = tierOf[t.id];

    const d1 = pickBestOfNDistinct(pilotiSenzaImmortal, n, usedIds);
    usedIds.add(d1.id);
    const d2 = pickBestOfNDistinct(pilotiSenzaImmortal, n, usedIds);
    usedIds.add(d2.id);
    t.drivers = [ JSON.parse(JSON.stringify(d1)), JSON.parse(JSON.stringify(d2)) ];

    // componenti tecnici condivisi dai due piloti della scuderia (V0.3 punto 2),
    // generati con la stessa meccanica "pesca N, scegli il migliore" (V0.5.1)
    t.components = {
      motore:   JSON.parse(JSON.stringify(pickBestOfNDistinct(poolSenzaImmortal.motori, n, new Set()))),
      telaio:   JSON.parse(JSON.stringify(pickBestOfNDistinct(poolSenzaImmortal.telai, n, new Set()))),
      aero:     JSON.parse(JSON.stringify(pickBestOfNDistinct(poolSenzaImmortal.aero, n, new Set()))),
      gomme:    JSON.parse(JSON.stringify(pickBestOfNDistinct(poolSenzaImmortal.gomme, n, new Set()))),
      stratega: JSON.parse(JSON.stringify(pickBestOfNDistinct(poolSenzaImmortal.strategi, n, new Set())))
    };
    applyAITeamSynergyBonuses(t);
  });

  return teams;
}

/* ---------------- new run ---------------- */
function newRun(difficulty, seasonLength){
  difficulty = DIFFICULTY_REROLLS.hasOwnProperty(difficulty) ? difficulty : 'medio';
  seasonLength = (seasonLength===20) ? 20 : 10;
  const usedIds = new Set();
  const shuffledCircuits = DATA.circuiti.slice().sort(()=>rnd()-0.5).slice(0,seasonLength)
    .map(c=> ({ ...c, giri: computeRaceLaps(c) })); // V0.5.1: giri reali dalla lunghezza del circuito
  const aiTeamsRaw = DATA.scuderie.slice().sort(()=>rnd()-0.5).slice(0,9);
  const aiTeams = buildAIGrid(aiTeamsRaw, usedIds, difficulty); // riserva anche i 18 id piloti IA in usedIds
  const diffParams = DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.medio;

  state = {
    phase:'title',
    difficulty,
    seasonLength,               // V0.7.5: 10 (Veloce) o 20 (Completa)
    midSeasonSwapDone: false,   // V0.7.5: la finestra di cambio pilota a meta' stagione completa e' unica
    rerollsLeft: DIFFICULTY_REROLLS[difficulty],
    rerollsTotal: DIFFICULTY_REROLLS[difficulty],
    budget: Math.round(START_BUDGET * diffParams.budgetMult * 10)/10,
    raceIndex: 0,
    calendar: shuffledCircuits,
    aiTeams: aiTeams,
    team: { pilotMain:null, pilotSecond:null, motore:null, telaio:null, aero:null, gomme:null, stratega:null, customName:null, nation:'Italia' },
    // V0.9.4.2.2: draft riscritto — ogni turno mostra un'offerta per ciascuna categoria ancora libera
    // (il Pilota resta aperto finche' non se ne scelgono 2), il giocatore ne prende UNA sola per turno.
    draftOpenCategories: ['motore','telaio','aero','gomme','stratega'],
    draftPilotsChosen: [],
    draftTurnOffers: {},
    draftPicksDone: 0,
    usedIds,
    grid: [],                 // V0.3: 20 slot di gara (2 per scuderia)
    driverStandings: {},      // V0.3: classifica piloti, chiave = slotKey (V0.6.1: puo' contenere anche record EX)
    exCounter: 0,              // V0.6.1: contatore per generare chiavi uniche ai piloti sostituiti
    constructorStandings: {}, // V0.3: classifica costruttori, chiave = teamId
    resultsByRace: [], // history
    log: [],
    lastRaceResult: null,
    pendingPitlane: null,
    storyEvents: [],  // V0.9: storia della stagione
    rivals: [], rivalHistory: [], pendingRivalNotice: null,   // V0.9.2.1: scuderie rivali
    recentlyDroppedRivals: [], rivalCooldownUntilRace: 0,        // V0.9.3.1: evita rimbalzi e notifiche a raffica
    playerInvestedLastRace: false,                                // V0.9.3.2: crescita rivale al tuo ritmo
    seasonTrophiesWon: [], lastTrophyUnlock: null,                 // V0.9.4: sala trofei
    // V0.9.7: tracciamento per gli obiettivi legati al comportamento durante la stagione
    playerRaceWinsCount: 0, initialTeamRatingAtDraft: null,
    everUsedMaxRiskOnly: true, everSwappedPilot: false, everUsedScouting: false, upgradesPurchasedCount: 0,
    sponsor: null, sponsorOffers: null, pendingPostSponsorPhase: null, // V0.9.7.8.8: sistema sponsor
    // V0.9.7.9: tracciamento esteso per i 50 obiettivi
    everUsedScoutingOnComponent: false,       // scouting SOLO sui componenti (fedele-alla-linea-di-partenza)
    everUsedEpicOrHigher: false,               // con-quello-che-c-e: mai Epic/Legendary/Immortal in squadra
    everLedDriverStandingsP1: false,           // lavoro-di-squadra: mai stato P1 in classifica Piloti
    midSeasonSwappedCats: new Set(),           // rivoluzione-a-meta-stagione: quali sedili sono stati cambiati
    everFinishedOffPodium: false,              // costanza-chirurgica: sempre a podio in stagione Hardcore
    everLostLeadInFinalPhase: false,           // terrore-della-griglia: mai ripreso nell'ultima fase di gara
    goatMalusTriggeredThisSeason: false,       // infallibile: mai subito il malus di THE GOAT in stagione
  };

  // Le due classifiche permanenti nascono con le 9 scuderie IA e i loro 18 piloti;
  // gli slot del giocatore vengono aggiunti da buildGrid() al termine del draft.
  aiTeams.forEach(t=>{
    state.constructorStandings[t.id] = { teamId:t.id, nome:t.nome, isPlayerTeam:false, points:0 };
    t.drivers.forEach((d,slot)=>{
      const slotKey = t.id+'-'+slot;
      state.driverStandings[slotKey] = {
        slotKey, teamId:t.id, teamNome:t.nome, driverId:d.id, nome:d.nome, naz:d.naz, carNumber:null,
        isPlayerTeam:false, isFormer:false, points:0, wins:0, podiums:0, dnfs:0
      };
    });
  });

  render();
}

/* ---------------- draft flow ---------------- */
// V0.9.4.2.2: definizioni delle 5 categorie "componente" (il Pilota e' gestito a parte, resta aperto
// finche' non se ne scelgono 2 in totale, indipendentemente da quando capitano nei vari turni).
const DRAFT_CATEGORY_DEFS = {
  motore:   { pool:DATA.motori, role:'Power Unit' },
  telaio:   { pool:DATA.telai, role:'Chassis' },
  aero:     { pool:DATA.aero, role:'Aero' },
  gomme:    { pool:DATA.gomme, role:'Tyres' },
  stratega: { pool:DATA.strategi, role:'Team Principal' }
};
Object.defineProperty(DRAFT_CATEGORY_DEFS.motore, 'label', { get: ()=> t('comp_engine') });
Object.defineProperty(DRAFT_CATEGORY_DEFS.telaio, 'label', { get: ()=> t('comp_chassis') });
Object.defineProperty(DRAFT_CATEGORY_DEFS.aero, 'label', { get: ()=> t('cat_aero_pack') });
Object.defineProperty(DRAFT_CATEGORY_DEFS.gomme, 'label', { get: ()=> t('cat_tire_supplier') });
Object.defineProperty(DRAFT_CATEGORY_DEFS.stratega, 'label', { get: ()=> t('comp_strategist') });
const DRAFT_TOTAL_PICKS = 7; // 2 piloti + 5 componenti

// ============================================================
// V0.9.7.9.1 — CARRIERA PILOTA (punto 1/8): tiering scuderie + prestigio simulato
// Modalita' parallela a Carriera Scuderia, salvataggio e stato completamente separati.
// ============================================================

// 3 Serie da 10 scuderie ciascuna, divise per ratingbase (forza strutturale, non cambia in game).
// Il Kart e' una fascia FISSA: le scuderie li' non salgono mai come organizzazione, solo il
// pilota (il giocatore) puo' uscirne individualmente con un'offerta migliore.
function computeDriverCareerTiers(){
  const sorted = [...DATA.scuderie].sort((a,b)=> b.ratingbase - a.ratingbase);
  const tiers = {};
  sorted.forEach((s,i)=>{
    tiers[s.id] = i<10 ? 'elite' : (i<20 ? 'minore' : 'kart');
  });
  return tiers;
}

// Una "stagione finta": un punteggio per scuderia (forza base + variazione casuale, rappresenta
// un'annata piu' o meno fortunata), usato SOLO per costruire prestigio storico — non e' la
// simulazione gara-per-gara completa (troppo lenta e inutile per uno sfondo che il giocatore
// non guarda direttamente).
function simulateFakeSeasonStandings(teamIds){
  return teamIds.map(id=>{
    const s = DATA.scuderie.find(x=>x.id===id);
    const score = s.ratingbase + (rnd()-0.5)*30;
    return { id, score };
  }).sort((a,b)=> b.score-a.score);
}

// Prestigio iniziale: 3 stagioni finte simulate su TUTTE e 30 le scuderie insieme (indipendente
// dalla Serie attuale — anche una scuderia oggi in Kart puo' aver avuto un passato migliore).
// Punti prestigio per piazzamento: 1a posizione vale 30, ultima vale 1.
const DRIVER_CAREER_FAKE_SEASONS = 3;
function initTeamPrestige(){
  const prestige = {};
  DATA.scuderie.forEach(s=> prestige[s.id] = 0);
  for(let i=0;i<DRIVER_CAREER_FAKE_SEASONS;i++){
    const standings = simulateFakeSeasonStandings(DATA.scuderie.map(s=>s.id));
    standings.forEach((entry, pos)=>{ prestige[entry.id] += (30 - pos); });
  }
  return prestige;
}

// Punto d'ingresso: costruisce tiers + prestigio insieme, pronto per essere salvato nello stato
// di una nuova Carriera Pilota.
function initDriverCareerWorld(){
  return { tiers: computeDriverCareerTiers(), prestige: initTeamPrestige() };
}

function startDraftTurn(){
  state.draftTurnOffers = {};
  if(state.draftPilotsChosen.length < 2){
    // V0.9.4.2.3: la rarita' ridotta viene dai pesi (RATING_BANDS), non dal togliere il "meglio di N" al giocatore
    // (altrimenti l'IA, che lo mantiene, risulterebbe ingiustamente piu' forte di un giocatore che pesca a caso)
    state.draftTurnOffers.pilota = pickBestOfNDistinct(DATA.piloti, 3, state.usedIds);
  }
  state.draftOpenCategories.forEach(catKey=>{
    state.draftTurnOffers[catKey] = pickBestOfNDistinct(DRAFT_CATEGORY_DEFS[catKey].pool, 3, state.usedIds);
  });
  state.phase = 'draft';
  // V0.9.7.8.2: SFX #16 — reveal scalato sulla rarita' migliore tra le offerte di questo turno
  const allOffers = Object.values(state.draftTurnOffers);
  const rarityScore = { 'Common':0, 'Rare':0.15, 'Epic':0.45, 'Legendary':0.75, 'Immortal':0.9, 'TheGoat':1 };
  const bestScore = Math.max(0, ...allOffers.map(o=> rarityScore[displayRarity(o)] ?? 0));
  if(bestScore >= 0.45) playSfx('draft_reveal', bestScore);
  render();
}

function rerollDraftTurn(){
  if(state.rerollsLeft<=0){ playSfx('error_disabled'); return; } // V0.9.7.8.2
  state.rerollsLeft--;
  unlockAchievement('seconda-occasione'); // V0.9.7.9
  playRealSfx('audio/sfx_reroll.mp3'); // V0.9.7.8.14
  startDraftTurn();
}

// V0.9.4.2.2: Primo/Secondo Pilota assegnati per rating (non per ordine di scelta), a parita' per nome
// V0.9.4.6: sinergie riscritte — ogni pilota/componente ha un campo "sinergia" (una tra 7 mentalita'/
// tipologie, assegnata nel database), indipendente dal suo archetipo di ruolo. Due pezzi con la STESSA
// sinergia in squadra si accoppiano e danno +3 rating a entrambi. Il bonus viene sempre rimosso e
// ricalcolato da zero ad ogni cambio squadra, per non accumulare per errore.
const MENTALITA_DEFS = {
  imperturbabile: { label:'Imperturbabile', label_en:'Unshakeable', label_es:'Imperturbable', color:'#3AAFA9' },
  paziente:       { label:'Paziente',       label_en:'Patient',     label_es:'Paciente',      color:'#E67E22' },
  perfezionista:  { label:'Perfezionista',  label_en:'Perfectionist', label_es:'Perfeccionista', color:'#6C5CE7' },
  metodico:       { label:'Metodico',       label_en:'Methodical',  label_es:'Metódico',      color:'#95A5A6' },
  istintivo:      { label:'Istintivo',      label_en:'Instinctive', label_es:'Instintivo',    color:'#A3D63C' },
  audace:         { label:'Audace',         label_en:'Bold',        label_es:'Audaz',         color:'#E63946' },
  spietato:       { label:'Spietato',       label_en:'Ruthless',    label_es:'Despiadado',    color:'#C2185B' },
  calcolatore:    { label:'Calcolatore',    label_en:'Calculating', label_es:'Calculador',    color:'#2ECC71' },
  ribelle:        { label:'Ribelle',        label_en:'Rebel',       label_es:'Rebelde',       color:'#FF6B9D' },
  instancabile:   { label:'Instancabile',   label_en:'Tireless',    label_es:'Incansable',    color:'#16A085' },
  visionario:     { label:'Visionario',     label_en:'Visionary',   label_es:'Visionario',    color:'#F39C12' },
  risoluto:       { label:'Risoluto',       label_en:'Resolute',    label_es:'Resuelto',      color:'#34495E' },
  elastico:       { label:'Elastico',       label_en:'Adaptable',   label_es:'Elástico',      color:'#1ABC9C' },
  impulsivo:      { label:'Impulsivo',      label_en:'Impulsive',   label_es:'Impulsivo',     color:'#D35400' },
  silenzioso:     { label:'Silenzioso',     label_en:'Silent',      label_es:'Silencioso',    color:'#5D6D7E' },
};
// V0.9.7.8.29: restituisce l'etichetta della mentalita' nella lingua corrente — usata dalla Guida
// e riusabile ovunque altro nel gioco si mostri una mentalita', in futuro.
function mentaLabel(id){
  const m = MENTALITA_DEFS[id];
  if(!m) return '';
  if(currentLang==='en') return m.label_en || m.label;
  if(currentLang==='es') return m.label_es || m.label;
  return m.label;
}
const SYNERGY_BONUS = 3;
const TEAM_ROLE_ORDER = [
  ['pilotMain','Pilota #1'], ['pilotSecond','Pilota #2'], ['motore','Motore'],
  ['telaio','Telaio'], ['aero','Aero'], ['gomme','Gomme'], ['stratega','Team Principal']
];

// tutti i pezzi della squadra che hanno una sinergia assegnata, con ruolo/ ètichetta leggibile
function teamSynergySlots(excludeCatKey, overrideTeam){
  const t = overrideTeam || state.team;
  if(!t) return [];
  return TEAM_ROLE_ORDER
    .filter(([catKey])=> catKey!==excludeCatKey)
    .map(([catKey,roleLabel])=>{
      const item = catKey==='pilotMain' ? t.pilotMain : catKey==='pilotSecond' ? t.pilotSecond : t[catKey];
      return item && item.sinergia ? { catKey, roleLabel, item, mentId:item.sinergia } : null;
    })
    .filter(Boolean);
}

// coppie realmente accoppiate (stessa sinergia), usate per applicare il bonus
function activeSynergyPairs(excludeCatKey){
  const slots = teamSynergySlots(excludeCatKey);
  const groups = {};
  slots.forEach(s=>{ (groups[s.mentId]=groups[s.mentId]||[]).push(s); });
  const pairs = [];
  Object.keys(groups).forEach(mentId=>{
    const items = groups[mentId].slice();
    while(items.length>=2) pairs.push([items.pop(), items.pop()]);
  });
  return pairs;
}

// mentalita' rimaste "spaiate" nella squadra attuale (utile per capire se un candidato completerebbe una coppia)
function unpairedMentalities(excludeCatKey){
  const slots = teamSynergySlots(excludeCatKey);
  const groups = {};
  slots.forEach(s=>{ (groups[s.mentId]=groups[s.mentId]||[]).push(s); });
  const unpaired = new Set();
  Object.keys(groups).forEach(mentId=>{ if(groups[mentId].length % 2 === 1) unpaired.add(mentId); });
  return unpaired;
}

// V0.9.4.6.1: bonus ristrutturato — una coppia isolata (qualsiasi colore) da +3 flat ai suoi 2 pezzi,
// come prima. Ma se hai PIU' coppie DELLO STESSO colore (accumulo mirato), il bonus diventa una
// percentuale sull'INTERA squadra: 2 coppie stesso colore = +45%, 3 coppie stesso colore = +90%.
// Cosi' anche una squadra di pezzi scarsissimi puo' arrivare a competere per il titolo se il giocatore
// punta tutto su un solo colore. Il bonus precedente viene sempre rimosso e ricalcolato da zero.
const SYNERGY_STACK_PCT = { 2:0.45, 3:0.90 };
const SYNERGY_DIVERSE_BONUS_PCT = 0.05; // V0.9.4.6.2: 3+ sinergie diverse attive (nessuno stack) -> +5% a tutta la squadra

function applySynergyBonuses(){
  const t = state.team;
  if(!t || !t.pilotMain) return;
  if(t._synergyBonus){
    for(const catKey in t._synergyBonus){
      const item = catKey==='pilotMain' ? t.pilotMain : catKey==='pilotSecond' ? t.pilotSecond : t[catKey];
      if(item) item.rating = clamp(item.rating - t._synergyBonus[catKey], 1, 100);
    }
  }
  t._synergyBonus = {};

  const slots = teamSynergySlots();
  const groups = {};
  slots.forEach(s=>{ (groups[s.mentId]=groups[s.mentId]||[]).push(s); });

  let stackPct = 0;
  const flatPairs = [];
  Object.keys(groups).forEach(mentId=>{
    const items = groups[mentId];
    const pairCount = Math.floor(items.length/2);
    if(pairCount === 1){
      flatPairs.push([items[0], items[1]]);
    } else if(pairCount >= 2){
      const pct = SYNERGY_STACK_PCT[Math.min(pairCount,3)] || SYNERGY_STACK_PCT[3];
      if(pct > stackPct) stackPct = pct;
    }
  });

  flatPairs.forEach(([a,b])=>{
    [a,b].forEach(s=>{
      const item = s.catKey==='pilotMain' ? t.pilotMain : s.catKey==='pilotSecond' ? t.pilotSecond : t[s.catKey];
      if(item){
        item.rating = clamp(item.rating + SYNERGY_BONUS, 1, 100);
        t._synergyBonus[s.catKey] = (t._synergyBonus[s.catKey]||0) + SYNERGY_BONUS;
      }
    });
  });

  if(stackPct > 0){
    TEAM_ROLE_ORDER.forEach(([catKey])=>{
      const item = catKey==='pilotMain' ? t.pilotMain : catKey==='pilotSecond' ? t.pilotSecond : t[catKey];
      if(item){
        const before = item.rating;
        const boosted = clamp(Math.round(before*(1+stackPct)), 1, 100);
        const delta = boosted - before;
        item.rating = boosted;
        t._synergyBonus[catKey] = (t._synergyBonus[catKey]||0) + delta;
      }
    });
    t._synergyDiverseFire = false;
    t._synergyStackPct = stackPct; // V0.9.7.9: esposto per gli obiettivi di sinergia impilata
  } else if(flatPairs.length >= 3){
    // V0.9.4.6.2: 3+ sinergie DIVERSE attive contemporaneamente (nessuno stack di stesso colore) —
    // bonus extra del 5% a tutta la squadra, sopra ai +3 flat gia' applicati alle coppie coinvolte.
    TEAM_ROLE_ORDER.forEach(([catKey])=>{
      const item = catKey==='pilotMain' ? t.pilotMain : catKey==='pilotSecond' ? t.pilotSecond : t[catKey];
      if(item){
        const before = item.rating;
        const boosted = clamp(Math.round(before*(1+SYNERGY_DIVERSE_BONUS_PCT)), 1, 100);
        const delta = boosted - before;
        item.rating = boosted;
        t._synergyBonus[catKey] = (t._synergyBonus[catKey]||0) + delta;
      }
    });
    t._synergyDiverseFire = true;
    t._synergyStackPct = 0;
  } else {
    t._synergyDiverseFire = false;
    t._synergyStackPct = 0;
  }
}

function finalizeDraftPilots(){
  const sorted = state.draftPilotsChosen.slice().sort((a,b)=>{
    if(b.rating !== a.rating) return b.rating - a.rating;
    return a.nome.localeCompare(b.nome, 'it');
  });
  state.team.pilotMain = sorted[0];
  state.team.pilotSecond = sorted[1];
}

function pickDraftTurnOption(id){
  let catKey = null;
  for(const k in state.draftTurnOffers){
    if(state.draftTurnOffers[k] && state.draftTurnOffers[k].id === id){ catKey = k; break; }
  }
  if(!catKey) return;
  const chosen = state.draftTurnOffers[catKey];
  state.usedIds.add(chosen.id);
  if(catKey==='pilota'){
    playSfx('ui_confirm'); // V0.9.7.8.18: niente suono reale per i piloti, ripristinato il placeholder
    state.draftPilotsChosen.push(JSON.parse(JSON.stringify(chosen)));
    if(chosen.nome==='THE GOAT'){
      state.pendingGoatReveal = true; // V0.9.7.6
      achievementData.goatObtainedViaDraft = true; // V0.9.7.9: fortuna-sfacciata
      if(achievementData.goatObtainedViaScouting) unlockAchievement('fortuna-sfacciata');
      saveAchievementData();
    }
  } else {
    state.team[catKey] = JSON.parse(JSON.stringify(chosen));
    state.draftOpenCategories = state.draftOpenCategories.filter(c=>c!==catKey);
    // V0.9.7.8.14: suono dedicato solo per i pezzi auto (motore/telaio/aero/gomme) — non per team principal
    if(catKey!=='stratega') playRealSfx('audio/sfx_component_pick.mp3');
    else playSfx('ui_confirm'); // V0.9.7.8.18: team principal non ha un suono reale, placeholder ripristinato
  }
  state.draftPicksDone++;

  const needPilot = state.draftPilotsChosen.length < 2;
  const needComponents = state.draftOpenCategories.length > 0;
  if(needPilot || needComponents){
    startDraftTurn();
  } else {
    finalizeDraftPilots();
    applySynergyBonuses();
  checkSynergyAchievements(); // V0.9.7.9
    buildGrid();
    state.initialTeamRatingAtDraft = computeTeamStrength(state.team); // V0.9.7: snapshot per l'obiettivo "Da Zero a Cento"
    unlockAchievement('primo-giorno'); // V0.9.7.9
    state.pendingPostSponsorPhase = state.pendingRivalNotice ? 'rival-announce' : 'hub';
    state.sponsorOffers = generateSponsorOffers();
    state.phase = 'sponsor-choice';
    render();
  }
}

// --- V0.3: griglia di gara da 20 piloti (2 per scuderia, incluso il giocatore) ---
// V0.9.2.1: forza complessiva di una scuderia (media pesata piloti + componenti), usata per bilanciare i rivali
function teamStrengthScore(pilot1Rating, pilot2Rating, comp){
  return (pilot1Rating + pilot2Rating + comp.motore.rating + comp.telaio.rating + comp.aero.rating + comp.gomme.rating + comp.stratega.rating) / 7;
}
function playerStrength(){
  const t = state.team;
  return teamStrengthScore(t.pilotMain.rating, t.pilotSecond.rating, { motore:t.motore, telaio:t.telaio, aero:t.aero, gomme:t.gomme, stratega:t.stratega });
}
function aiTeamStrength(team){
  return teamStrengthScore(team.drivers[0].rating, team.drivers[1].rating, team.components);
}

// Assegna fino a 3 scuderie rivali: quelle IA piu' vicine in forza al giocatore, entro una soglia
// "vera sfida"; se nessuna e' abbastanza vicina, prende comunque la piu' vicina in assoluto.
function assignRivals(){
  const myStrength = playerStrength();
  const scored = state.aiTeams.map(t=>({ teamId:t.id, nome:t.nome, gap: Math.abs(aiTeamStrength(t)-myStrength) }))
    .sort((a,b)=> a.gap-b.gap);
  const CLOSE_THRESHOLD = 6;   // punti di rating di differenza entro cui si considera "alla pari"
  const TIE_THRESHOLD = 0.3;   // solo un pareggio quasi esatto con la piu' vicina fa aggiungere altre rivali
  let picked = [scored[0]];
  for(let i=1; i<scored.length && picked.length<3; i++){
    if(scored[i].gap - scored[0].gap <= TIE_THRESHOLD && scored[i].gap <= CLOSE_THRESHOLD) picked.push(scored[i]);
    else break;
  }
  state.rivals = picked.map(s=>s.teamId);
  state.rivalHistory = [{ race:1, teamIds:state.rivals.slice(), reason:'assegnazione iniziale' }];
  state.pendingRivalNotice = { initial:true, newTeamIds: state.rivals.slice(), surpassedNames: [] };
}

// V0.9.2.1: rivaluta i rivali dopo ogni gara. Se il giocatore ha superato di brutto un rivale
// (partita ormai chiusa), lo sostituisce con la scuderia IA piu' vicina alla forza ATTUALE del
// giocatore tra quelle non gia' rivali. Se il confronto resta equilibrato, non cambia nulla.
const RIVAL_SURPASS_GAP = 45; // punti in classifica costruttori: oltre questo margine, "non c'e' piu' partita"
function reevaluateRivals(){
  if(!state.rivals || !state.rivals.length) return;
  if(!state.recentlyDroppedRivals) state.recentlyDroppedRivals = [];
  if(state.rivalCooldownUntilRace===undefined) state.rivalCooldownUntilRace = 0;
  if(state.raceIndex < state.rivalCooldownUntilRace) return; // niente rivalutazioni a raffica

  const myPoints = state.constructorStandings['PLAYER'].points;
  const surpassed = state.rivals.filter(teamId=>{
    const cs = state.constructorStandings[teamId];
    return cs && (myPoints - cs.points) > RIVAL_SURPASS_GAP;
  });
  if(!surpassed.length) return;

  // scarta i rivali appena sostituiti (evita il rimbalzo tra due squadre) per un po' di gare
  const cooldownIds = new Set(state.recentlyDroppedRivals.map(d=>d.teamId));
  const notReplaced = state.rivals.filter(id=>!surpassed.includes(id));
  const candidates = state.aiTeams
    .filter(t=> !state.rivals.includes(t.id) && !cooldownIds.has(t.id))
    .map(t=>({ teamId:t.id, nome:t.nome, gap: Math.abs(myPoints - (state.constructorStandings[t.id]?state.constructorStandings[t.id].points:0)) }))
    .sort((a,b)=> a.gap-b.gap);

  if(!candidates.length) return; // nessuno disponibile (tutti gia' rivali o in cooldown): non cambiare nulla

  const replacements = candidates.slice(0, surpassed.length).map(c=>c.teamId);
  const bestGap = candidates[0].gap;
  const newRivals = [...notReplaced, ...replacements];
  state.rivals = newRivals;
  state.rivalHistory.push({ race: state.raceIndex+2, teamIds:newRivals.slice(), reason:'rivalità superata' });

  // memorizza i rivali appena scartati (tenuti in "quarantena" per qualche gara)
  state.recentlyDroppedRivals.push(...surpassed.map(id=>({ teamId:id, sinceRace:state.raceIndex })));
  state.recentlyDroppedRivals = state.recentlyDroppedRivals.filter(d=> state.raceIndex - d.sinceRace < 3);

  // se anche il candidato migliore resta molto lontano (sei avanti a tutta la griglia), non ha senso
  // ricontrollare ogni singola gara: si accetta il piu' vicino disponibile e ci si ferma per un po'.
  state.rivalCooldownUntilRace = bestGap > RIVAL_SURPASS_GAP*1.5 ? state.raceIndex + 3 : state.raceIndex + 1;

  state.pendingRivalNotice = { surpassedNames: surpassed.map(id=>{
      const t = state.aiTeams.find(x=>x.id===id); return t?t.nome:id;
    }), newTeamIds: newRivals };
  if(surpassed.length>0) playSfx('rival_beaten'); // V0.9.7.8.2
}

function buildGrid(){
  const grid = [
    { slotKey:'PLAYER-1', teamId:'PLAYER', role:'pilotMain' },
    { slotKey:'PLAYER-2', teamId:'PLAYER', role:'pilotSecond' }
  ];
  state.aiTeams.forEach(t=>{
    grid.push({ slotKey:t.id+'-0', teamId:t.id, role:0 });
    grid.push({ slotKey:t.id+'-1', teamId:t.id, role:1 });
  });

  // numeri di gara unici 1-99 su tutti e 20 i piloti
  const usedNumbers = new Set();
  grid.forEach(g=>{
    let n;
    do{ n = 1 + Math.floor(rnd()*99); } while(usedNumbers.has(n));
    usedNumbers.add(n);
    g.carNumber = n;
  });
  state.grid = grid;

  state.driverStandings['PLAYER-1'] = {
    slotKey:'PLAYER-1', teamId:'PLAYER', teamNome:teamDisplayName(), driverId:state.team.pilotMain.id,
    nome:state.team.pilotMain.nome, naz:state.team.pilotMain.naz, carNumber:grid[0].carNumber, isPlayerTeam:true, isFormer:false, points:0, wins:0, podiums:0, dnfs:0
  };
  state.driverStandings['PLAYER-2'] = {
    slotKey:'PLAYER-2', teamId:'PLAYER', teamNome:teamDisplayName(), driverId:state.team.pilotSecond.id,
    nome:state.team.pilotSecond.nome, naz:state.team.pilotSecond.naz, carNumber:grid[1].carNumber, isPlayerTeam:true, isFormer:false, points:0, wins:0, podiums:0, dnfs:0
  };
  state.constructorStandings['PLAYER'] = { teamId:'PLAYER', nome:teamDisplayName(), isPlayerTeam:true, points:0 };

  // sincronizza il numero di gara sugli slot IA (creati in newRun senza carNumber)
  grid.forEach(g=>{ if(state.driverStandings[g.slotKey]) state.driverStandings[g.slotKey].carNumber = g.carNumber; });

  assignRivals();
}

// --- V0.3: dati "vivi" dello slot (segue eventuali upgrade/scouting successivi) ---
function getLiveEntry(slot){
  if(slot.teamId==='PLAYER'){
    return {
      pilot: state.team[slot.role],
      components: { motore:state.team.motore, telaio:state.team.telaio, aero:state.team.aero, gomme:state.team.gomme, stratega:state.team.stratega },
      teamId:'PLAYER', teamName: teamDisplayName(), isPlayerTeam:true, carNumber: slot.carNumber, slotKey: slot.slotKey
    };
  }
  const team = state.aiTeams.find(t=>t.id===slot.teamId);
  return {
    pilot: team.drivers[slot.role],
    components: team.components,
    teamId: team.id, teamName: team.nome, isPlayerTeam:false, carNumber: slot.carNumber, slotKey: slot.slotKey
  };
}

/* ---------------- rating engine (indicatori statici, es. hub) ---------------- */
const WEIGHTS = { pilota:0.33, motore:0.17, telaio:0.15, aero:0.15, gomme:0.10, stratega:0.10 };
const DOM_KEY_MAP = { 'Pilota':'pilota','Motore':'motore','Telaio':'telaio','Aerodinamica':'aero','Gomme':'gomme','Strategia':'stratega' };

function weightedBase(components){
  let s = 0;
  for(const k in WEIGHTS) s += components[k]*WEIGHTS[k];
  return s;
}

/* ============================================================
   V0.5 — NUOVO MOTORE DI SIMULAZIONE
   La gara viene calcolata per fasi e per pilota (qualifica,
   partenza, 12 fasi di passo gara), con statistiche contestuali,
   compatibilità circuito, eventi per fase, ritiri dipendenti da
   più fattori e trait che modificano realmente i calcoli.
   L'ultima fase della simulazione E' il risultato finale: non
   c'è un secondo calcolo "vero" nascosto dietro la rivelazione.
   ============================================================ */

const TRAIT_TABLE = {
  'Rain Master':     { qualiDryMalus:-5, wetPaceBonus:18, mixedPaceBonus:8, wetErrorMult:0.55 },
  'Pole Specialist': { qualiBonus:20, poleBonusChance:0.12, poleBonusAmount:8 },
  'The Hunter':      { overtakeBonus:18, restartBonus:10, incidentRiskAdd:0.10 },
  'The Machine':     { varianceMult:0.5, dnfMult:0.5, overtakeMalus:-8, floorFrac:0.92 },
  'Comeback King':   { qualiMalus:-9, comebackBonus:20, comebackGridThreshold:10, scAmplify:1.6 },
  'Tire Whisperer':  { partenzaMalus:-6, wearMult:0.78, skipPitChance:0.15 },
  'Last Lap Killer': { lastPhasesBonus:25, earlyErrorAdd:0.04 },
  'Street King':     { streetBonus:16, highSpeedMalus:-7, trafficMalusMult:0.5 },
  'Ice Man':         { pressureBonus:20, finalPhaseBonus:10, aggressivitaMalus:-5 },
  'Wild Card':       { aggressivitaBonus:22, incidentRiskAdd:0.16, varianceMult:2.4 },
  'Strategic Mind':  { qualiMalus:-4, altStrategyBonus:15 },
  'Rookie Wonder':   { pressureMalus:-10, growthPerPodium:1 }
};

function circuitCompatScore(comp, pilot, circuit){
  const domKey = DOM_KEY_MAP[circuit.componentedominante];
  let score = 50;
  if(domKey){
    const val = domKey==='pilota' ? pilot.rating : comp[domKey].rating;
    score += (val-70)*0.6;
  }
  if(circuit.tipo==='Cittadino' || circuit.tipo==='Stop-and-go'){
    if(pilot.arch==='Street King') score += TRAIT_TABLE['Street King'].streetBonus;
  }
  if(circuit.tipo==='Alta velocità' && pilot.arch==='Street King'){
    score += TRAIT_TABLE['Street King'].highSpeedMalus;
  }
  return clamp(score, 0, 100);
}

function computeQualifying(entries, circuit, weatherBefore){
  return entries.map(e=>{
    const pilot = e.pilot, comp = e.comp;
    const trait = TRAIT_TABLE[pilot.arch] || {};
    let pilotQ = pilot.qualifica;
    if(trait.qualiBonus) pilotQ += trait.qualiBonus;
    if(trait.qualiMalus) pilotQ += trait.qualiMalus;
    if(pilot.arch==='Rain Master' && weatherBefore==='Asciutto') pilotQ += trait.qualiDryMalus;
    pilotQ = clamp(pilotQ, 1, 100);
    const compat = circuitCompatScore(comp, pilot, circuit);
    let score = 0.35*pilotQ + 0.20*comp.aero.rating + 0.15*comp.motore.rating + 0.10*comp.telaio.rating
      + 0.05*comp.gomme.rating + 0.05*comp.stratega.rating + 0.05*compat + 0.05*((rnd()-0.5)*20);
    if(pilot.arch==='Pole Specialist' && rnd()<trait.poleBonusChance) score += trait.poleBonusAmount;
    return { slotKey:e.slotKey, score };
  });
}

function computeStart(entries, gridPos, circuit){
  return entries.map(e=>{
    const pilot = e.pilot, comp = e.comp;
    const trait = TRAIT_TABLE[pilot.arch] || {};
    let partenza = pilot.partenza;
    if(trait.partenzaMalus) partenza += trait.partenzaMalus;
    partenza = clamp(partenza, 1, 100);
    const qualiNormalized = 100 - (gridPos[e.slotKey]-1)*(100/19);
    const score = 0.35*partenza + 0.20*pilot.aggressivita + 0.15*pilot.pressione + 0.10*qualiNormalized
      + 0.10*comp.telaio.rating + 0.05*comp.gomme.rating + 0.05*((rnd()-0.5)*20);
    return { slotKey:e.slotKey, score };
  });
}

// V0.9.3.1: oltre una certa soglia, il rating del pilota conta sempre meno (rendimenti decrescenti) —
// cosi' una pescata fortunata su un solo pilota fortissimo non basta piu' da sola a dominare la stagione.
function compressPilotRating(rating){
  return rating > 74 ? 74 + (rating-74)*0.62 : rating;
}

function effectivePilotPaceScore(pilot, ctx){
  const trait = TRAIT_TABLE[pilot.arch] || {};
  let score = compressPilotRating(pilot.rating);

  if(ctx.isWet) score += (pilot.pioggia-50)*0.35;
  if(pilot.arch==='Rain Master' && ctx.isWet) score += trait.wetPaceBonus;

  if(ctx.isLastTwoPhases) score += (pilot.ultimigiri-50)*0.30;
  if(pilot.arch==='Last Lap Killer' && ctx.isLastTwoPhases) score += trait.lastPhasesBonus;
  if(pilot.arch==='Last Lap Killer' && ctx.phaseIndex<=5) score -= trait.earlyErrorAdd*100*0.2;

  score += (pilot.gestionegomme-50)*0.12*(1-ctx.tireWear);

  if(ctx.isFightingForPodium) score += (pilot.pressione-50)*0.18;
  if(pilot.arch==='Ice Man'){
    score += trait.pressureBonus*0.5;
    if(ctx.phaseIndex===11) score += trait.finalPhaseBonus;
  }
  if(pilot.arch==='Rookie Wonder' && ctx.isDecisiveRace) score += trait.pressureMalus*0.4;

  score += (pilot.aggressivita-50)*0.05;
  if(pilot.arch==='Wild Card') score += trait.aggressivitaBonus*0.3;

  if(pilot.arch==='Comeback King' && ctx.gridPos>trait.comebackGridThreshold){
    score += trait.comebackBonus * (ctx.afterSafetyCar? trait.scAmplify : 1) * 0.5;
  }

  if(pilot.arch==='Rookie Wonder'){
    score += Math.min(ctx.seasonPodiums||0, 5) * trait.growthPerPodium;
  }

  if(pilot.arch==='The Machine'){
    score = Math.max(score, compressPilotRating(pilot.rating)*trait.floorFrac);
  }

  return score;
}

function effectiveGommeScore(gomme, tireWear){
  return clamp(gomme.rating - tireWear*30, 0, 100);
}

function driverVarianceScale(pilot){
  const trait = TRAIT_TABLE[pilot.arch] || {};
  let scale = 1 - (pilot.costanza-50)/150;
  if(trait.varianceMult) scale *= trait.varianceMult;
  return clamp(scale, 0.25, 3);
}

function paceScore(entry, comp, circuit, ctx){
  const pilotScore = effectivePilotPaceScore(entry.pilot, ctx);
  const compat = circuitCompatScore(comp, entry.pilot, circuit);
  const base = 0.25*pilotScore + 0.15*comp.motore.rating + 0.15*comp.telaio.rating + 0.15*comp.aero.rating
    + 0.10*effectiveGommeScore(comp.gomme, ctx.tireWear) + 0.08*comp.stratega.rating + 0.07*compat;
  const varScale = driverVarianceScale(entry.pilot);
  const randomComponent = (rnd()-0.5)*8*varScale; // "il casuale deve rimanere contenuto"
  return base + randomComponent;
}

function baseDnfChance(entry, comp, circuit){
  const reliability = comp.motore.affidabilita*0.4 + comp.telaio.affidabilita*0.3 + entry.pilot.affidabilita*0.3;
  let chance = (100-reliability)*0.0004;
  chance *= (1 + circuit.stressmotore/500);
  chance *= (1 + (entry.pilot.aggressivita-50)/500);
  const trait = TRAIT_TABLE[entry.pilot.arch] || {};
  if(trait.dnfMult) chance *= trait.dnfMult;
  if(trait.incidentRiskAdd) chance += trait.incidentRiskAdd*0.01;
  return clamp(chance, 0.0008, 0.05);
}

function decidePit(t, pilot, plan){
  if(plan){
    if(t!==plan.first && t!==plan.second) return false;
  } else if(t!==3 && t!==7){
    return false;
  }
  const trait = TRAIT_TABLE[pilot.arch] || {};
  if(trait.skipPitChance && rnd()<trait.skipPitChance) return false;
  return true;
}

function maybeRollEventForDriver(entry, comp, circuit, ctx){
  let chance = 0.032;
  if(ctx.isWet) chance += 0.018;
  chance += (100-comp.motore.affidabilita)*0.00028;
  chance += (100-comp.telaio.affidabilita)*0.00018;
  chance += (100-entry.pilot.affidabilita)*0.00018;
  if(rnd()>chance) return null;

  const pool = DATA.eventigara.filter(ev=>{
    if(ev.meteo==='Bagnato' && !ctx.isWet) return false;
    if(ev.meteo==='Asciutto' && ctx.isWet) return false;
    return true;
  });
  if(pool.length===0) return null;
  const total = pool.reduce((s,e)=>s+e.prob,0);
  let r = rnd()*total;
  for(const ev of pool){ r -= ev.prob; if(r<=0) return ev; }
  return pool[pool.length-1];
}

function applyOvertakeContest(provisional, prevOrder, byKey, circuit){
  const prevRank = {}; prevOrder.forEach((k,i)=>{ prevRank[k]=i; });
  for(let i=1;i<provisional.length;i++){
    const cur = provisional[i], ahead = provisional[i-1];
    if(prevRank[cur.slotKey]===undefined || prevRank[ahead.slotKey]===undefined) continue;
    if(prevRank[cur.slotKey] < prevRank[ahead.slotKey]) continue; // non e' un sorpasso in atto
    const attacker = byKey[cur.slotKey].pilot, defender = byKey[ahead.slotKey].pilot;
    const attackerTrait = TRAIT_TABLE[attacker.arch] || {};
    let chance = 0.5 + (attacker.sorpassi-50)*0.006 + (circuit.sorpassabilita-50)*0.004 + (attacker.aggressivita-50)*0.002;
    if(attacker.arch==='The Hunter' && defender.rating>attacker.rating) chance += attackerTrait.overtakeBonus*0.01;
    if(attacker.arch==='The Machine') chance += attackerTrait.overtakeMalus*0.01;
    chance = clamp(chance, 0.15, 0.9);
    if(rnd()>chance){
      let stuckPenalty = 0.35 + rnd()*0.3;
      if(attacker.arch==='Street King') stuckPenalty *= attackerTrait.trafficMalusMult;
      cur.cumTime += stuckPenalty;
    }
  }
  provisional.sort((a,b)=> a.cumTime-b.cumTime);
}

// --- V0.7: qualifica calcolabile a parte, per la schermata pre-gara con le monoposto ---
function runQualifying(){
  const circuit = state.calendar[state.raceIndex];
  const entries = state.grid.map(slot=>{
    const live = getLiveEntry(slot);
    return { slotKey: live.slotKey, teamId: live.teamId, teamName: live.teamName, isPlayerTeam: live.isPlayerTeam,
      carNumber: live.carNumber, pilot: live.pilot, comp: live.components };
  });
  const weatherBefore = circuit.clima==='Piovoso' ? 'Bagnato' : 'Asciutto';
  const qScored = computeQualifying(entries, circuit, weatherBefore);
  qScored.sort((a,b)=> b.score-a.score);
  const gridPos = {}; qScored.forEach((q,i)=> gridPos[q.slotKey]=i+1);
  const gridOrder = qScored.map(q=>q.slotKey);
  state.pendingQualifying = { raceIndex: state.raceIndex, gridPos, gridOrder };
  return state.pendingQualifying;
}

// V0.9: individua momenti significativi della gara appena conclusa e li aggiunge alla storia stagione
function recordStoryEvents(finalEntries, gridPos, circuit, weatherBefore, weatherAfter){
  const raceN = state.raceIndex+1;
  const push = (text)=> state.storyEvents.push({ race: raceN, text });
  const playerEntries = finalEntries.filter(e=>e.isPlayerTeam);

  const pole = ['PLAYER-1','PLAYER-2'].find(k=> gridPos[k]===1);
  if(pole) push(`Pole position di ${state.driverStandings[pole].nome}!`);

  playerEntries.forEach(e=>{
    if(!e.dnf && e.pos===1){
      const wet = weatherAfter==='Bagnato' || weatherBefore==='Bagnato';
      push(wet ? `Vittoria sotto la pioggia di ${e.driverName}!` : `Vittoria di ${e.driverName}!`);
    } else if(!e.dnf && e.pos<=3 && state.driverStandings[e.slotKey].podiums===1){
      push(`Primo podio di ${e.driverName} (P${e.pos})`);
    }
  });

  if(playerEntries.length===2 && playerEntries.every(e=>e.dnf)){
    push('Doppio ritiro della scuderia');
  }

  if(state.raceIndex===state.calendar.length-1){
    const standings = Object.values(state.driverStandings).filter(d=>!d.isFormer).sort((a,b)=>b.points-a.points);
    const playerBest = standings.filter(d=>d.isPlayerTeam).sort((a,b)=>b.points-a.points)[0];
    if(playerBest){
      const rank = standings.indexOf(playerBest);
      if(rank===0){
        const nextRival = standings.slice(1).find(d=>!d.isPlayerTeam);
        push(nextRival ? `Titolo piloti vinto per ${playerBest.points-nextRival.points} punti!` : 'Titolo piloti vinto!');
      } else {
        const aheadRival = standings.slice(0, rank).reverse().find(d=>!d.isPlayerTeam);
        if(aheadRival) push(`Titolo piloti perso per ${aheadRival.points-playerBest.points} punti`);
      }
    }
  }
}

// V0.9: registra un cambio componente rilevante (upgrade riuscito o scouting) nella storia stagione
function recordComponentStoryEvent(label, item, isReplacement){
  if(!state.storyEvents) return;
  const bigTiers = ['Legendary','Immortal','Epic'];
  if(bigTiers.includes(item.rarita) || isReplacement){
    state.storyEvents.push({ race: state.raceIndex+1, text: `${isReplacement?'Nuovo':'Upgrade'} ${label}: ${item.nome} (${item.rarita})` });
  }
}

function simulateFullRace(){
  const circuit = state.calendar[state.raceIndex];

  const entries = state.grid.map(slot=>{
    const live = getLiveEntry(slot);
    return { slotKey: live.slotKey, teamId: live.teamId, teamName: live.teamName, isPlayerTeam: live.isPlayerTeam,
      carNumber: live.carNumber, pilot: live.pilot, comp: live.components, driverName: live.pilot.nome };
  });
  const byKey = {}; entries.forEach(e=> byKey[e.slotKey]=e);

  // V0.9.3.2: finestre di sosta scaglionate per pilota, non piu' un'unica fase fissa per tutti —
  // cosi' l'ordine cambia davvero durante la gara invece di restare quasi fisso fino alla fine.
  const pitPlan = {};
  entries.forEach(e=>{
    pitPlan[e.slotKey] = { first: 2+Math.floor(rnd()*3), second: 6+Math.floor(rnd()*3) }; // 2-4 e 6-8
  });

  // meteo e safety car (eventi globali di pista)
  const RAIN_DAMPENING = 0.5; // V0.9.3.4: piove troppo spesso lamentato dal giocatore — smorzamento globale
  const weatherBefore = circuit.clima==='Piovoso' ? 'Bagnato' : 'Asciutto';
  let weatherAfter = null, weatherChangePhase = null;
  if(weatherBefore==='Asciutto' && circuit.clima!=='Variabile' && rnd()<(circuit.probpioggia/100)*RAIN_DAMPENING){
    weatherAfter='Bagnato'; weatherChangePhase=4;
  } else if(weatherBefore==='Bagnato' && rnd()<0.35){
    // V0.9.3.1: prima mancava del tutto — una gara che inizia piovosa ora puo' davvero rasserenarsi
    weatherAfter='Asciutto'; weatherChangePhase=4;
  } else if(circuit.clima==='Variabile' && rnd()<0.5*RAIN_DAMPENING){
    // il clima variabile puo' cambiare in entrambe le direzioni, non solo verso la pioggia
    weatherAfter = weatherBefore==='Asciutto' ? 'Bagnato' : 'Asciutto';
    weatherChangePhase=4;
  }
  const safetyCarPhase = rnd()<(circuit.probsc/100) ? (3+Math.floor(rnd()*4)) : null;

  // contesto di campionato prima di questa gara
  const seasonPodiumsBySlot = {}, seasonPosBySlot = {};
  entries.forEach(e=> seasonPodiumsBySlot[e.slotKey] = (state.driverStandings[e.slotKey] ? state.driverStandings[e.slotKey].podiums : 0));
  Object.values(state.driverStandings).slice().sort((a,b)=>b.points-a.points).forEach((d,i)=> seasonPosBySlot[d.slotKey]=i+1);
  const isDecisiveRace = state.raceIndex >= state.calendar.length - 2;

  // qualifica -> griglia di partenza (riusa quella gia' mostrata nella schermata pre-gara, se presente)
  let gridPos, gridOrder;
  if(state.pendingQualifying && state.pendingQualifying.raceIndex===state.raceIndex){
    gridPos = state.pendingQualifying.gridPos; gridOrder = state.pendingQualifying.gridOrder;
  } else {
    const q = runQualifying();
    gridPos = q.gridPos; gridOrder = q.gridOrder;
  }
  state.pendingQualifying = null;

  // partenza -> ordine di fase 0
  const sScored = computeStart(entries, gridPos, circuit);
  sScored.sort((a,b)=> b.score-a.score);
  const phase0Order = sScored.map(s=>s.slotKey);

  const cumTime = {}, tireWear = {}, retiredAtPhase = {};
  entries.forEach(e=>{ cumTime[e.slotKey]=0; tireWear[e.slotKey]=0; retiredAtPhase[e.slotKey]=null; });
  phase0Order.forEach((k,i)=>{ cumTime[k] = i*0.28; });

  const phaseOrders = [ phase0Order.slice() ];
  const eventsByPhase = [ [] ];
  const pitByPhase = [ new Set() ];
  const penaltyByPhase = [ new Set() ];
  let weather = weatherBefore;

  for(let t=1;t<PHASES.length;t++){
    if(t===weatherChangePhase) weather = weatherAfter;
    const isWet = weather==='Bagnato';
    const isLastTwo = t>=10;
    const afterSafetyCar = safetyCarPhase!==null && t>safetyCarPhase;

    const evThis = [], pitThis = new Set(), penaltyThis = new Set();
    const provisional = [];

    entries.forEach(e=>{
      if(retiredAtPhase[e.slotKey]!==null){
        provisional.push({ slotKey:e.slotKey, cumTime: cumTime[e.slotKey] });
        return;
      }
      const pilot = e.pilot, comp = e.comp;

      let pitPenalty = 0;
      if(decidePit(t, pilot, pitPlan[e.slotKey])){
        pitThis.add(e.slotKey);
        pitPenalty = clamp(3.0 - (comp.stratega.pitstop-50)*0.02, 1.2, 4.2);
        tireWear[e.slotKey] = 0.05;
      }

      const wearInc = (circuit.stressgomme/100)*0.085 * (1-(comp.gomme.durata-50)/320) * (1-(pilot.gestionegomme-50)/420)
        * (TRAIT_TABLE[pilot.arch] && TRAIT_TABLE[pilot.arch].wearMult ? TRAIT_TABLE[pilot.arch].wearMult : 1);
      tireWear[e.slotKey] = clamp(tireWear[e.slotKey] + Math.max(wearInc,0.01), 0, 1);

      const ctx = {
        isWet, isLastTwoPhases: isLastTwo, tireWear: tireWear[e.slotKey],
        isFightingForPodium: (seasonPosBySlot[e.slotKey]<=3) || (phaseOrders[t-1].indexOf(e.slotKey) < 4),
        gridPos: gridPos[e.slotKey], phaseIndex:t, afterSafetyCar, isDecisiveRace,
        seasonPodiums: seasonPodiumsBySlot[e.slotKey]
      };

      const pace = paceScore(e, comp, circuit, ctx);
      let phaseTime = (100-pace)*0.11 + pitPenalty;

      const ev = maybeRollEventForDriver(e, comp, circuit, ctx);
      let forcedDnf = false;
      if(ev){
        phaseTime += -(ev.impatto)*0.09;
        if((ev.categoria==='Tecnico'||ev.categoria==='Incidente') && ev.severita==='Maggiore' && ev.impatto<=-20) forcedDnf = true;
        if(ev.categoria==='Direzione gara' && ev.esito==='Negativo') penaltyThis.add(e.slotKey);
        evThis.push({ slotKey:e.slotKey, event:ev, causedDnf:forcedDnf });
      }

      let dnfNow = forcedDnf;
      if(!dnfNow){
        let dnfChance = baseDnfChance(e, comp, circuit);
        if(pilot.arch==='Rain Master' && isWet) dnfChance *= TRAIT_TABLE['Rain Master'].wetErrorMult;
        dnfNow = rnd() < dnfChance;
      }

      if(dnfNow){
        retiredAtPhase[e.slotKey] = t;
        provisional.push({ slotKey:e.slotKey, cumTime: cumTime[e.slotKey] });
      } else {
        provisional.push({ slotKey:e.slotKey, cumTime: cumTime[e.slotKey] + phaseTime });
      }
    });

    const stillRacing = provisional.filter(p=> retiredAtPhase[p.slotKey]===null);
    stillRacing.sort((a,b)=> a.cumTime-b.cumTime);
    applyOvertakeContest(stillRacing, phaseOrders[t-1], byKey, circuit);

    if(t===safetyCarPhase && stillRacing.length>0){
      const avg = stillRacing.reduce((s,p)=>s+p.cumTime,0)/stillRacing.length;
      stillRacing.forEach(p=>{ p.cumTime = p.cumTime*0.45 + avg*0.55; });
      stillRacing.sort((a,b)=> a.cumTime-b.cumTime);
    }
    stillRacing.forEach(p=>{ cumTime[p.slotKey] = p.cumTime; });

    const retiredList = entries.filter(e=> retiredAtPhase[e.slotKey]!==null)
      .sort((a,b)=> (retiredAtPhase[b.slotKey]||0) - (retiredAtPhase[a.slotKey]||0));
    const order = [ ...stillRacing.map(p=>p.slotKey), ...retiredList.map(e=>e.slotKey) ];

    phaseOrders.push(order);
    eventsByPhase.push(evThis);
    pitByPhase.push(pitThis);
    penaltyByPhase.push(penaltyThis);
  }

  const lastOrder = phaseOrders[PHASES.length-1];

  // V0.9.7.7: THE GOAT — probabilita' ESPLICITA di vittoria in base alla qualita' dell'auto (media dei
  // 5 componenti condivisi, pilota escluso), non lasciata all'esito della simulazione fisica pura.
  // Auto con rating medio >=85: 97%+ (cresce ancora con auto migliori). Sotto 85: scende linearmente
  // fino a un pavimento fisso dell'80%, mai piu' in basso qualunque sia lo stato della macchina.
  // ECCEZIONE: se si ritira per guasto meccanico (DNF), la sconfitta resta valida — anche il pilota
  // piu' forte della storia puo' avere sfortuna con un'auto inaffidabile, non e' immune ai ritiri.
  const goatEntry = entries.find(e=> e.pilot && e.pilot.nome==='THE GOAT' && retiredAtPhase[e.slotKey]===null);
  let goatMalusTriggered = false; // V0.9.7.9: per l'obiettivo "Infallibile"
  if(goatEntry){
    const gc = goatEntry.comp;
    const carRating = (gc.motore.rating+gc.telaio.rating+gc.aero.rating+gc.gomme.rating+gc.stratega.rating)/5;
    let winProb;
    if(carRating >= 85){
      winProb = Math.min(0.995, 0.97 + (carRating-85)*0.001);
    } else {
      const t = Math.max(0, Math.min(1, (carRating-30)/(85-30)));
      winProb = 0.80 + t*(0.97-0.80);
    }
    if(rnd() < winProb){
      const idx = lastOrder.indexOf(goatEntry.slotKey);
      if(idx>0){ lastOrder.splice(idx,1); lastOrder.unshift(goatEntry.slotKey); }
    } else if(goatEntry.isPlayerTeam){
      goatMalusTriggered = true;
    }
  }

  const timeline = {
    entries, circuit, gridPos, gridOrder, phaseOrders,
    retiredAtPhase, eventsByPhase, pitByPhase, penaltyByPhase,
    safetyCarPhase, weatherBefore, weatherAfter, weatherChangePhase,
    lapNumbers: buildPhaseLapNumbers(circuit.giri), totalGiri: circuit.giri,
    goatMalusTriggered
  };

  return { timeline };
}

// V0.9.4.2.4: il punteggio vero (punti, classifiche, budget, trofei) viene calcolato QUI, dopo che tutte
// le decisioni in gara sono state prese — prima veniva fissato dentro simulateFullRace, PRIMA che il
// giocatore vedesse anche solo la prima decisione, quindi le scelte in gara non contavano mai davvero
// e la schermata finale poteva non corrispondere a quanto mostrato nell'ultimo fotogramma della gara live.
function finalizeRaceScoring(timeline){
  const { circuit, gridPos, weatherBefore, weatherAfter } = timeline;
  const lastOrder = timeline.phaseOrders[PHASES.length-1];
  const byKey = {}; timeline.entries.forEach(e=> byKey[e.slotKey]=e);

  const finalEntries = lastOrder.map((slotKey,i)=>{
    const e = byKey[slotKey];
    const dnf = timeline.retiredAtPhase[slotKey]!==null;
    return {
      slotKey, teamId:e.teamId, teamName:e.teamName, isPlayerTeam:e.isPlayerTeam, carNumber:e.carNumber,
      driverName:e.pilot.nome, pos:i+1, dnf,
      points: dnf?0:(POINTS_TABLE[i]||0), prize: dnf?0.1:(PRIZE_TABLE[i]||0.1)
    };
  });
  timeline.entries = finalEntries; // da qui in poi anche i dettagli live (se riconsultati) riflettono il risultato vero

  // V0.9.7.9: obiettivo "Debutto" — prima gara completata in assoluto, a prescindere dal risultato
  unlockAchievement('debutto');

  finalEntries.forEach(e=>{
    const ds = state.driverStandings[e.slotKey];
    ds.points += e.points;
    if(!e.dnf && e.pos===1) ds.wins++;
    if(!e.dnf && e.pos<=3) ds.podiums++;
    if(e.dnf) ds.dnfs++;
    ds.nome = e.driverName;
    ds.carNumber = e.carNumber;
    const cs = state.constructorStandings[e.teamId];
    cs.points += e.points;
  });
  // V0.9.7.8.8: Title Sponsor — +15% sui premi gara, ma solo mentre resti in Top 8 Costruttori
  // (calcolato SUBITO DOPO aver aggiornato i punti di questa gara, quindi riflette la classifica
  // vera e propria in questo preciso momento della stagione).
  let sponsorTitleActive = false;
  if(state.sponsor && state.sponsor.tier==='title'){
    const cstdNow = constructorStandingsSorted();
    const idx = cstdNow.findIndex(c=>c.teamId==='PLAYER');
    sponsorTitleActive = idx>=0 && idx<8;
    state.sponsor.active = sponsorTitleActive;
  }
  const sponsorTitleMult = sponsorTitleActive ? 1.15 : 1;
  const prize = finalEntries.filter(e=>e.isPlayerTeam).reduce((s,e)=> s+e.prize, 0) * difficultyParams().prizeMult * sponsorTitleMult;
  state.budget += prize;
  // V0.9.7.8.8: Sponsor Secondario — piccolo bonus fisso, sempre, senza condizioni
  if(state.sponsor && state.sponsor.tier==='secondario') state.budget += 0.3;

  // V0.9.7.9: "Sul Podio" — la prima volta che un'auto del giocatore chiude nei primi 3, ritiro escluso
  if(finalEntries.some(e=>e.isPlayerTeam && !e.dnf && e.pos<=3)) unlockAchievement('sul-podio');
  // V0.9.7.9: "Lavoro di Squadra" — teniamo traccia se il giocatore e' MAI stato P1 in classifica Piloti
  const dstdNow = driverStandingsSorted();
  if(dstdNow[0] && dstdNow[0].isPlayerTeam) state.everLedDriverStandingsP1 = true;
  // V0.9.7.9: "Costanza Chirurgica" — almeno un'auto del giocatore deve restare a podio OGNI gara
  if(!finalEntries.some(e=>e.isPlayerTeam && !e.dnf && e.pos<=3)) state.everFinishedOffPodium = true;
  // V0.9.7.9: malus di THE GOAT — se e' scattato in una gara con lui in squadra, la stagione non e' piu' "infallibile"
  if(timeline.goatMalusTriggered) state.goatMalusTriggeredThisSeason = true;

  // V0.9.4.2.9: "storia della stagione" rimossa (conteneva errori) — non registriamo piu' questi eventi

  // V0.9.4: sala trofei — registra sempre la partecipazione, e la vittoria se capita
  const playerWonThisRace = finalEntries.some(e=>e.isPlayerTeam && !e.dnf && e.pos===1);
  const hadTrophyBefore = !!(trophyData[circuit.nome] && trophyData[circuit.nome].won > 0);
  recordCircuitResult(circuit.nome, playerWonThisRace);
  // V0.9.7: tracciamento obiettivi — circuiti percorsi (persistente tra carriere) e vittorie in stagione
  recordCircuitRaced(circuit.nome);
  if(playerWonThisRace){
    state.playerRaceWinsCount = (state.playerRaceWinsCount||0) + 1;
    checkCenerentolaAchievement();
    unlockAchievement('prima-vittoria'); // V0.9.7.9
    const winnerEntry = finalEntries.find(e=>e.isPlayerTeam && !e.dnf && e.pos===1);
    const winnerFull = byKey[winnerEntry.slotKey]; // ha ancora accesso a .pilot con rarita'/arch completi
    const winnerPilot = winnerFull.pilot;
    // V0.9.7.9: obiettivi legati a come si vince, non solo al fatto di vincere
    if(winnerPilot.rarita==='Common') unlockAchievement('underdog');
    if(winnerPilot.nome==='THE GOAT') unlockAchievement('leggenda-al-volante');
    const wasWetAtFinish = weatherAfter==='Bagnato' || (weatherAfter===null && weatherBefore==='Bagnato');
    if(wasWetAtFinish && winnerPilot.arch==='Rain Master') unlockAchievement('domatore-di-pioggia');
    if((gridPos[winnerEntry.slotKey]||1) >= 10) unlockAchievement('la-grande-rimonta');
    if((gridPos[winnerEntry.slotKey]||1) >= 10 && winnerPilot.arch==='Comeback King') unlockAchievement('nato-per-soffrire');
    if(winnerPilot.arch==='Wild Card') unlockAchievement('domatore-del-caos');
    if(timeline.safetyCarPhase!==null && timeline.safetyCarPhase!==undefined && timeline.safetyCarPhase!==false) unlockAchievement('ripartenza-perfetta');
    const teammateKey = winnerEntry.slotKey==='PLAYER-1' ? 'PLAYER-2' : (winnerEntry.slotKey==='PLAYER-2' ? 'PLAYER-1' : null);
    if(teammateKey){
      const teammateEntry = finalEntries.find(e=>e.slotKey===teammateKey);
      if(teammateEntry && teammateEntry.dnf) unlockAchievement('vittoria-agrodolce');
    }
    // V0.9.7.9: "Padrone di Ogni Asfalto" — tipi di circuito vinti, persistente tra carriere
    if(!achievementData.circuitTypesWon.includes(circuit.tipo)){
      achievementData.circuitTypesWon.push(circuit.tipo);
      saveAchievementData();
    }
    // V0.9.7.9: "Terrore della Griglia" — nessun cambio di leadership tra la penultima e l'ultima fase
    const secondLastOrder = timeline.phaseOrders[PHASES.length-2];
    if(secondLastOrder && secondLastOrder[0]!==winnerEntry.slotKey) state.everLostLeadInFinalPhase = true;
    if(!state.seasonTrophiesWon) state.seasonTrophiesWon = [];
    if(!state.seasonTrophiesWon.includes(circuit.nome)) state.seasonTrophiesWon.push(circuit.nome);
    state.lastTrophyUnlock = { circuitName: circuit.nome, isFirstTime: !hadTrophyBefore, totalWins: trophyData[circuit.nome].won };
    state.trophyUnlockDismissed = false;
  } else {
    state.lastTrophyUnlock = null;
    state.trophyUnlockDismissed = false;
  }
  checkMasteryAchievements();

  // V0.9.1: log completo della gara (riusa la stessa logica del log live, fase per fase)
  // cosi' il risultato riflette sempre davvero cosa e' successo (ritiri con causa inclusi).
  const fullLog = [];
  for(let t=0; t<PHASES.length; t++) fullLog.push(...buildPhaseLog(t, timeline));

  const raceRecord = { circuit, entries: finalEntries, fullLog, gridPos, weatherBefore, weatherAfter, safetyCarPhase: timeline.safetyCarPhase };
  state.resultsByRace.push(raceRecord);
  state.lastRaceResult = raceRecord;
}

function teamDisplayName(){
  if(state.team && state.team.customName) return state.team.customName;
  return (state.team && state.team.pilotMain? state.team.pilotMain.nome.split(' ').pop() : 'Player') + ' Racing';
}

/* ============================================================
   V0.4 — RIVELAZIONE LIVE DELLA GARA (12 fasi, 25-30s)
   Dalla V0.5 in poi il timeline sopra E' gia' il vero motore di
   simulazione: qui ci limitiamo a mostrarlo un passo alla volta.
   ============================================================ */
const PHASES = [
  { name:'Partenza',              pct:0.00 },
  { name:'Prima fase',            pct:0.10 },
  { name:'Primo stint',           pct:0.20 },
  { name:'Prima finestra box',    pct:0.30 },
  { name:'Evoluzione meteo',      pct:0.40 },
  { name:'Metà gara',             pct:0.50 },
  { name:'Evento centrale',       pct:0.60 },
  { name:'Seconda finestra box',  pct:0.70 },
  { name:'Ultimo stint',          pct:0.80 },
  { name:'Attacchi finali',       pct:0.90 },
  { name:'Penultimo giro',        pct:null }, // = penultimo giro reale
  { name:'Ultimo giro',           pct:null }  // = ultimo giro reale
];

// Le 12 fasi rappresentano percentuali della gara (V0.5.1): si adattano proporzionalmente
// al numero di giri REALE del circuito, non piu' a una tabella fissa da 30 giri.
// Le ultime due fasi sono sempre, letteralmente, il penultimo e l'ultimo giro della gara.
function buildPhaseLapNumbers(totalGiri){
  const laps = PHASES.map(p => p.pct===null ? null : clamp(Math.round(p.pct*totalGiri), 1, totalGiri));
  laps[0] = 1; // "Partenza" e' sempre il giro 1
  laps[laps.length-2] = Math.max(1, totalGiri-1); // penultimo giro reale
  laps[laps.length-1] = totalGiri;                 // ultimo giro reale
  for(let i=1;i<laps.length;i++){
    if(laps[i] <= laps[i-1]) laps[i] = Math.min(totalGiri, laps[i-1]+1);
  }
  laps[laps.length-1] = totalGiri;
  return laps;
}

// --- V0.5.1: calcolo dei giri reali dalla lunghezza del circuito ---
// Distanza totale = lunghezza circuito x numero di giri, mantenuta indicativamente
// tra 280 e 320 km (240-280 km per i circuiti cittadini), mai oltre 330 km.
function computeRaceLaps(circuit){
  const targetKm = (circuit.tipo === 'Cittadino') ? 260 : 300;
  let laps = Math.max(1, Math.round(targetKm / circuit.lunghezza));
  let distance = laps * circuit.lunghezza;
  while(distance > 330 && laps > 1){ laps--; distance = laps * circuit.lunghezza; }
  return laps;
}

function shortName(nome){
  const parts = nome.split(' ');
  return parts.length>1 ? parts[0][0]+'. '+parts.slice(1).join(' ') : nome;
}

function statusFor(slotKey, t, timeline){
  if(timeline.retiredAtPhase[slotKey]!==null && t>=timeline.retiredAtPhase[slotKey]) return 'RITIRATO';
  if(timeline.pitByPhase[t] && timeline.pitByPhase[t].has(slotKey)) return 'BOX';
  if(timeline.penaltyByPhase[t] && timeline.penaltyByPhase[t].has(slotKey)) return 'PENALITÀ';
  return 'In pista';
}
// V0.9.7.8.31: statusFor() resta sempre in italiano internamente (usato per confronti diretti
// altrove nel codice) — questa funzione traduce SOLO per la visualizzazione a schermo.
function statusLabel(raw){
  const map = { 'RITIRATO':window.t('status_retired'), 'BOX':window.t('status_box'), 'PENALITÀ':window.t('status_penalty'), 'In pista':window.t('status_on_track') };
  return map[raw] || raw;
}

function buildPhaseLog(t, timeline){
  const lines = [];
  const giro = timeline.lapNumbers[t];
  const L = window.t('race_lap'); // V0.9.7.8.28: 'GIRO'/'LAP'/'VUELTA' a seconda della lingua
  const entries = timeline.entries;
  const byKey = {}; entries.forEach(e=> byKey[e.slotKey]=e);
  const prevOrder = t===0 ? timeline.gridOrder : timeline.phaseOrders[t-1];
  const currOrder = timeline.phaseOrders[t];

  const dnfCausingEvents = new Set();
  (timeline.eventsByPhase[t]||[]).forEach(({slotKey,event,causedDnf})=>{
    const e = byKey[slotKey];
    const emo = EVENT_EMOJI[event.categoria] || '⚠️';
    const evNameLoc = evName(event.nome);
    if(causedDnf){
      dnfCausingEvents.add(slotKey);
      lines.push({ tone:'neg', imp:true, sfx: e.isPlayerTeam?'dnf_crash':undefined, text:`${emo} ${L} ${giro} — ${window.t('race_retirement', shortName(e.driverName), e.teamName)}: ${evNameLoc}${e.isPlayerTeam?window.t('race_your_driver_bang'):''}` });
    } else {
      const tone = event.esito==='Positivo' ? 'pos' : (event.esito==='Negativo' ? 'neg' : 'neu');
      // V0.9.7.8.14: suono reale per le azioni di gara del giocatore (eventi tecnici/narrativi
      // generici che non hanno gia' un suono dedicato come sorpasso/pit/safety car/pioggia)
      lines.push({ tone, realSfx: e.isPlayerTeam?'audio/sfx_race_action.mp3':undefined, text:`${emo} ${L} ${giro} — ${shortName(e.driverName)}: ${evNameLoc}${e.isPlayerTeam?window.t('race_your_driver_paren'):''}` });
    }
  });

  entries.forEach(e=>{
    if(timeline.retiredAtPhase[e.slotKey]===t && !dnfCausingEvents.has(e.slotKey)){
      lines.push({ tone:'neg', imp:true, sfx: e.isPlayerTeam?'dnf_crash':undefined, text:`🔧 ${L} ${giro} — ${window.t('race_retirement', shortName(e.driverName), e.teamName)}${e.isPlayerTeam?window.t('race_your_driver_bang'):''}` });
    }
  });

  if(t===timeline.safetyCarPhase) lines.push({ tone:'neu', imp:true, sfx:'safety_car', text:`${EMOJI_SAFETYCAR} ${L} ${giro} — ${window.t('race_safety_car_track')}` });
  if(timeline.safetyCarPhase!==null && t===timeline.safetyCarPhase+1) lines.push({ tone:'neu', text:`🟢 ${L} ${giro} — ${window.t('race_restart')}` });
  if(t===timeline.weatherChangePhase) lines.push({ tone:'neu', imp:true, sfx: timeline.weatherAfter==='Bagnato'?'rain_start':undefined, text:`${timeline.weatherAfter==='Bagnato'?EMOJI_RAIN:'☀️'} ${L} ${giro} — ${window.t('race_weather_change', timeline.weatherAfter==='Bagnato'?window.t('weather_wet'):window.t('weather_dry'))}` });
  if(timeline.pitByPhase[t] && timeline.pitByPhase[t].size>0){
    const playerPitting = (timeline.pitByPhase[t].has('PLAYER-1') || timeline.pitByPhase[t].has('PLAYER-2'));
    lines.push({ tone:'neu', sfx: playerPitting?'pit_stop':undefined, text:`${EMOJI_TIRE} ${L} ${giro} — ${window.t('race_pit_wave')}` });
  }

  const deltas = currOrder.map((key,i)=>{
    const from = prevOrder.indexOf(key)+1;
    const to = i+1;
    return { key, from, to, delta: from-to };
  }).filter(d=> d.delta!==0);

  deltas.sort((a,b)=>{
    const aP = byKey[a.key].isPlayerTeam, bP = byKey[b.key].isPlayerTeam;
    if(aP!==bP) return aP?-1:1;
    return Math.abs(b.delta)-Math.abs(a.delta);
  });

  let shown = 0;
  for(const d of deltas){
    const e = byKey[d.key];
    if(timeline.retiredAtPhase[e.slotKey]===t) continue;
    if(!e.isPlayerTeam && Math.abs(d.delta)<2) continue;
    if(shown>=4) break;
    const verb = d.delta>0 ? window.t('race_gains') : window.t('race_loses');
    const posWord = Math.abs(d.delta)===1 ? window.t('race_position') : window.t('race_positions');
    lines.push({ tone: d.delta>0?'pos':'neg', sfx: e.isPlayerTeam ? (d.delta>0?'overtake':'overtaken') : undefined, text:`${EMOJI_OVERTAKE} ${L} ${giro} — ${shortName(e.driverName)} ${verb} ${Math.abs(d.delta)} ${posWord}: P${d.from} → P${d.to}` });
    shown++;
  }

  if(t===0) lines.unshift({ tone:'neu', text:`🟢 ${L} ${giro} — ${window.t('race_lights_out')}` });
  if(t===PHASES.length-1) lines.push({ tone:'neu', sfx:'checkered_flag', text:`${EMOJI_FLAG_CHECKERED} ${window.t('race_checkered')}` });

  return lines;
}

function randomPhaseDuration(){ return 1900 + Math.floor(rnd()*400); } // 1.9-2.3s per fase

/* ---------------- V0.7.5: semaforo di partenza F1 (pixel art) ---------------- */
function beginRaceWithLights(){
  state.phase = 'start_lights';
  state.startLights = { lit:0, off:false };
  render();
  // V0.9.7.8.39: tempi ricalibrati sui delay REALI misurati nell'audio F1 fornito da Gio — non
  // piu' 480ms fissi (che risultavano quasi il doppio piu' veloci del vero e "immangiabili").
  // Delay tra un'accensione e la successiva: luce1->2, 2->3, 3->4, 4->5, 5->via.
  const LIGHT_DELAYS = [640, 750, 755, 750, 750]; // ~25% più veloce dell'audio esatto, resta comunque naturale
  let i = 0;
  function tick(){
    if(state.phase!=='start_lights') return;
    if(i<5){
      i++;
      state.startLights.lit = i;
      render();
      playRealSfx('audio/sfx_lights_ignite.mp3'); // un "clic" ad ogni luce che si accende
      window._lightsTimer = setTimeout(tick, LIGHT_DELAYS[i-1]);
    } else {
      state.startLights.off = true;
      render();
      playRealSfx('audio/sfx_lights_go.mp3'); // il "via!" vero, allo spegnimento
      window._lightsTimer = setTimeout(()=>{
        const { timeline } = simulateFullRace();
        startLiveRace(timeline);
      }, 500);
    }
  }
  tick();
}
function skipStartLights(){
  if(window._lightsTimer) clearTimeout(window._lightsTimer);
  const { timeline } = simulateFullRace();
  startLiveRace(timeline);
}
function renderStartLights(){
  const sl = state.startLights;
  const dots = [];
  for(let i=0;i<5;i++){
    dots.push(`<div class="f1-light ${(!sl.off && i<sl.lit)?'lit':''}"></div>`);
  }
  const msg = sl.off ? t('sl_go_msg') : (sl.lit>=5 ? t('sl_ready_msg') : t('sl_lighting_msg'));
  app.innerHTML = `
  ${topbarHTML()}
  <div class="suspense-screen pickable" data-action="skip-start-lights">
    <div class="f1-lights-rig">${dots.join('')}</div>
    <div class="suspense-title ${sl.off?'lights-go':''}">${msg}</div>
    <div class="dim" style="font-size:11px;margin-top:18px;">Tocca per saltare</div>
  </div>
  `;
  bindActions();
}

// V0.9.3.1: decisioni strategiche in gara — al massimo 2 per gara, scelte tra le occasioni disponibili
// (cambio meteo, safety car, finestra sosta, aggressivita' a meta gara). La gara resta pre-calcolata,
// ma la scelta del giocatore sposta davvero le posizioni dei suoi piloti per le fasi restanti.
// V0.9.3.2: 5 occasioni "scriptate" pescate a caso (mai lo stesso set), piu' meteo/safety car quando capitano
// per davvero. Circa 1 gara su 5 non propone nessuna occasione scriptata: se va liscia, va liscia.
const SCRIPTED_DECISION_TYPES = ['pit','aggression','teamorders','defend','enginemode','mechanical'];

// V0.9.3.4: alcune decisioni fanno un'affermazione precisa sulla situazione in pista (piloti vicini,
// rivale alle spalle) — devono scattare solo quando e' davvero vero, altrimenti perdono credibilita'.
function driversAreClose(timeline, phase){
  const order = timeline.phaseOrders[phase];
  const i1 = order.indexOf('PLAYER-1'), i2 = order.indexOf('PLAYER-2');
  if(i1<0 || i2<0) return false; // uno dei due gia' ritirato
  return Math.abs(i1-i2) <= 2;
}
function hasRivalCloseBehind(timeline, phase){
  const order = timeline.phaseOrders[phase];
  return ['PLAYER-1','PLAYER-2'].some(key=>{
    const i = order.indexOf(key);
    if(i<0 || i>=order.length-1) return false;
    const behind = order[i+1];
    return behind!=='PLAYER-1' && behind!=='PLAYER-2'; // qualcuno di davvero avversario, non il compagno
  });
}
const DECISION_CONTEXT_CHECK = { teamorders: driversAreClose, defend: hasRivalCloseBehind };

function computeLiveDecisions(timeline){
  const candidates = [];
  if(timeline.weatherChangePhase!==null && timeline.weatherChangePhase>0) candidates.push({phase:timeline.weatherChangePhase, type:'weather'});
  if(timeline.safetyCarPhase!==null && timeline.safetyCarPhase>0) candidates.push({phase:timeline.safetyCarPhase, type:'safetycar'});

  if(rnd() > 0.2){ // ~80% delle gare propone anche occasioni scriptate
    const usedPhases = new Set(candidates.map(c=>c.phase));
    const shuffledTypes = SCRIPTED_DECISION_TYPES.slice().sort(()=>rnd()-0.5);
    let availablePhases = [2,3,4,5,6,8,9].filter(p=>!usedPhases.has(p));
    let toAdd = candidates.length>=2 ? 0 : Math.min(2-candidates.length, rnd()<0.5?1:2);
    for(let i=0; i<shuffledTypes.length && toAdd>0; i++){
      const type = shuffledTypes[i];
      const check = DECISION_CONTEXT_CHECK[type];
      // per le occasioni "vincolate" (ordini di scuderia, difendi) si cerca una fase dove la situazione e' vera davvero;
      // per le altre (pit, aggressivita', motore, meccanica) qualunque fase disponibile va bene.
      const validPhases = check ? availablePhases.filter(p=>check(timeline,p)) : availablePhases;
      if(!validPhases.length) continue;
      const phase = validPhases[Math.floor(rnd()*validPhases.length)];
      availablePhases = availablePhases.filter(p=>p!==phase);
      candidates.push({phase, type});
      toAdd--;
    }
  }

  const seen = new Set();
  const unique = candidates.filter(c=>{ if(seen.has(c.phase)) return false; seen.add(c.phase); return true; });
  unique.sort((a,b)=>a.phase-b.phase);
  return unique.slice(0,2);
}

const LIVE_DECISION_INFO_EN = {
  weather: { title:'The weather is changing', question:"Track conditions are changing right now. What do you do?",
    choices:[
      { key:'box', label:'🛞 Change tires now', desc:'Safe, but you lose a few positions in the pits.' },
      { key:'stay', label:'⏳ Stay out one more lap', desc:'Risky, but you gain if the weather helps you.' },
      { key:'splitstrategy', label:'🔀 Split strategies', desc:'One driver pits, the other stays out: cover both options.' },
    ]},
  safetycar: { title:'Safety Car on track', question:'The field bunches up. Do you take advantage?',
    choices:[
      { key:'box', label:'🔧 Pit now', desc:'Nearly free stop, but you lose a few positions in traffic.' },
      { key:'stay', label:'🚦 Stay out', desc:"Keep your position, but you'll have to stop later under normal conditions." },
      { key:'restart', label:'⚡ Aggressive restart', desc:'Risk it all at the restart to gain positions immediately.' },
    ]},
  pit: { title:'Pit window', question:'When do you want to stop?',
    choices:[
      { key:'early', label:'⏪ Pit early', desc:"Fresh tires right away, but you'll have to manage them longer." },
      { key:'late',  label:'⏩ Delay the stop', desc:'Stay out longer, risking wear.' },
    ]},
  aggression: { title:'Mid-race', question:'How do you want to approach this phase?',
    choices:[
      { key:'aggressive', label:'🔥 Push', desc:'More chances to overtake, but more risk and wear.' },
      { key:'safe',       label:'🛡️ Manage', desc:'Safer, but you stay where you are.' },
    ]},
  teamorders: { title:'Team orders', question:'Your two drivers are close in the standings. What do you do?',
    choices:[
      { key:'hold', label:'🤝 Hold position', desc:'No internal fight: safe, but no gain.' },
      { key:'free', label:'⚔️ Let them race', desc:'Guaranteed show, but risk they damage each other.' },
    ]},
  defend: { title:'A rival attacks you', question:"You've got an opponent behind you. How do you respond?",
    choices:[
      { key:'defend',  label:'🛑 Defend firmly', desc:'Hold your position, but risk contact.' },
      { key:'letpass', label:'🟢 Let them by cleanly', desc:'Lose a position, but the race stays clean.' },
    ]},
  enginemode: { title:'Engine mode', question:'Do you want to push the engine beyond normal limits?',
    choices:[
      { key:'push', label:'⚙️ Push mode', desc:'More pace, but more risk of failure.' },
      { key:'save', label:'🔋 Conservative mode', desc:'Engine stays safe, but less performance.' },
    ]},
  mechanical: { title:'Mechanical alarm', question:'A component is showing signs of failure. What do you do?',
    choices:[
      { key:'nurse', label:'🩹 Nurse it carefully', desc:'Lose pace, but reduce retirement risk.' },
      { key:'push',  label:'🔥 Keep pushing', desc:'No compromise, but you risk retiring.' },
    ]},
};
const LIVE_DECISION_INFO_ES = {
  weather: { title:'El clima está cambiando', question:'Las condiciones de pista cambian justo ahora. ¿Qué haces?',
    choices:[
      { key:'box', label:'🛞 Cambia neumáticos ya', desc:'Seguro, pero pierdes algunas posiciones en boxes.' },
      { key:'stay', label:'⏳ Sigue una vuelta más', desc:'Arriesgas, pero ganas si el clima te ayuda.' },
      { key:'splitstrategy', label:'🔀 Divide las estrategias', desc:'Un piloto entra, el otro sigue fuera: cubres ambas opciones.' },
    ]},
  safetycar: { title:'Safety Car en pista', question:'El pelotón se compacta. ¿Lo aprovechas?',
    choices:[
      { key:'box', label:'🔧 Entra a boxes', desc:'Parada casi gratis, pero pierdes algunas posiciones en el tráfico.' },
      { key:'stay', label:'🚦 Sigue en pista', desc:'Mantienes la posición, pero tendrás que parar después en condiciones normales.' },
      { key:'restart', label:'⚡ Reinicio agresivo', desc:'Arriesgas todo en la reanudación para ganar posiciones de inmediato.' },
    ]},
  pit: { title:'Ventana de parada', question:'¿Cuándo quieres parar en boxes?',
    choices:[
      { key:'early', label:'⏪ Adelanta la parada', desc:'Neumáticos frescos ya, pero tendrás que gestionarlos más tiempo.' },
      { key:'late',  label:'⏩ Retrasa la parada', desc:'Sigues más tiempo en pista, arriesgando el desgaste.' },
    ]},
  aggression: { title:'Mitad de carrera', question:'¿Cómo quieres afrontar esta fase?',
    choices:[
      { key:'aggressive', label:'🔥 Aprieta', desc:'Más posibilidades de adelantar, pero más riesgo y desgaste.' },
      { key:'safe',       label:'🛡️ Gestiona', desc:'Más seguro, pero te quedas donde estás.' },
    ]},
  teamorders: { title:'Órdenes de equipo', question:'Tus dos pilotos están cerca en la clasificación. ¿Qué haces?',
    choices:[
      { key:'hold', label:'🤝 Mantén la posición', desc:'Sin lucha interna: seguro, pero sin ganancia.' },
      { key:'free', label:'⚔️ Déjalos luchar libremente', desc:'Espectáculo garantizado, pero riesgo de que se dañen entre ellos.' },
    ]},
  defend: { title:'Un rival te ataca', question:'Tienes un adversario detrás. ¿Cómo respondes?',
    choices:[
      { key:'defend',  label:'🛑 Defiende con decisión', desc:'Mantienes la posición, pero arriesgas un contacto.' },
      { key:'letpass', label:'🟢 Déjalo pasar limpio', desc:'Pierdes una posición, pero la carrera sigue limpia.' },
    ]},
  enginemode: { title:'Modo motor', question:'¿Quieres exprimir el motor más de lo normal?',
    choices:[
      { key:'push', label:'⚙️ Modo empuje', desc:'Más ritmo, pero más riesgo de avería.' },
      { key:'save', label:'🔋 Modo conservador', desc:'Motor a salvo, pero menos rendimiento.' },
    ]},
  mechanical: { title:'Alarma mecánica', question:'Un componente muestra señales de fallo. ¿Qué haces?',
    choices:[
      { key:'nurse', label:'🩹 Gestiona con cautela', desc:'Pierdes ritmo, pero reduces el riesgo de retirada.' },
      { key:'push',  label:'🔥 Sigue apretando', desc:'Sin concesiones, pero arriesgas la retirada.' },
    ]},
};
const LIVE_DECISION_INFO_IT_BASE = {
  weather: { title:'Il meteo sta cambiando', question:'Le condizioni di pista cambiano proprio ora. Che fai?',
    choices:[
      { key:'box', label:'🛞 Cambia gomme subito', desc:'Sicuro, ma perdi qualche posizione ai box.' },
      { key:'stay', label:'⏳ Resta fuori un altro giro', desc:'Rischi, ma guadagni se il meteo ti aiuta.' },
      { key:'splitstrategy', label:'🔀 Dividi le strategie', desc:'Un pilota entra, l\'altro resta fuori: copri entrambe le opzioni.' },
    ]},
  safetycar: { title:'Safety Car in pista', question:'Il gruppo si compatta. Ne approfitti?',
    choices:[
      { key:'box', label:'🔧 Entra ai box', desc:'Sosta quasi gratis, ma perdi qualche posizione nel traffico.' },
      { key:'stay', label:'🚦 Resta in pista', desc:'Mantieni la posizione, ma dovrai fermarti dopo in condizioni normali.' },
      { key:'restart', label:'⚡ Ripartenza aggressiva', desc:'Rischi tutto al riavvio per guadagnare subito posizioni.' },
    ]},
  pit: { title:'Finestra di sosta', question:'Quando vuoi fermarti ai box?',
    choices:[
      { key:'early', label:'⏪ Anticipa la sosta', desc:'Gomme fresche subito, ma dovrai gestirle più a lungo.' },
      { key:'late',  label:'⏩ Ritarda la sosta', desc:'Resti in pista più a lungo, rischiando l\'usura.' },
    ]},
  aggression: { title:'A metà gara', question:'Come vuoi affrontare questa fase?',
    choices:[
      { key:'aggressive', label:'🔥 Spingi', desc:'Più possibilità di sorpasso, ma più rischio e usura.' },
      { key:'safe',       label:'🛡️ Gestisci', desc:'Più sicuro, ma resti dove sei.' },
    ]},
  teamorders: { title:'Ordini di scuderia', question:'I tuoi due piloti sono vicini in classifica. Che fai?',
    choices:[
      { key:'hold', label:'🤝 Tieni la posizione', desc:'Nessuna lotta interna: sicuro, ma nessun guadagno.' },
      { key:'free', label:'⚔️ Lasciali liberi di lottare', desc:'Spettacolo garantito, ma rischio che si danneggino a vicenda.' },
    ]},
  defend: { title:'Un rivale ti attacca', question:'Hai un avversario alle spalle. Come rispondi?',
    choices:[
      { key:'defend',  label:'🛑 Difendi con decisione', desc:'Tieni la posizione, ma rischi un contatto.' },
      { key:'letpass', label:'🟢 Lascialo passare pulito', desc:'Perdi una posizione, ma la gara resta pulita.' },
    ]},
  enginemode: { title:'Modalità motore', question:'Vuoi spingere il motore oltre il normale?',
    choices:[
      { key:'push', label:'⚙️ Modalità spinta', desc:'Più passo, ma più rischio di guasto.' },
      { key:'save', label:'🔋 Modalità conservativa', desc:'Motore al sicuro, ma meno prestazioni.' },
    ]},
  mechanical: { title:'Allarme meccanico', question:'Un componente dà segnali di cedimento. Che fai?',
    choices:[
      { key:'nurse', label:'🩹 Gestisci con cautela', desc:'Perdi ritmo, ma riduci il rischio di ritiro.' },
      { key:'push',  label:'🔥 Continua a spingere', desc:'Nessun compromesso, ma rischi il ritiro.' },
    ]},
};
const LIVE_DECISION_INFO = new Proxy({}, { get:(t,k)=> {
  const src = currentLang==='en' ? LIVE_DECISION_INFO_EN : (currentLang==='es' ? LIVE_DECISION_INFO_ES : LIVE_DECISION_INFO_IT_BASE);
  return src[k];
}});

function decisionShiftFn(choiceKey){
  switch(choiceKey){
    case 'box': return ()=> 1+Math.floor(rnd()*2);
    case 'stay': return ()=> (rnd()<0.5 ? -1 : 1);
    case 'restart': return ()=> (rnd()<0.45 ? -(1+Math.floor(rnd()*2)) : 2);
    case 'splitstrategy': return ()=> (rnd()<0.5 ? -1 : 1);
    case 'early': return ()=> (rnd()<0.6 ? -1 : 1);
    case 'late': return ()=> (rnd()<0.45 ? -1 : (rnd()<0.7?0:2));
    case 'aggressive': return ()=> (rnd()<0.55 ? -(1+Math.floor(rnd()*2)) : 1);
    case 'safe': return ()=> 0;
    case 'hold': return ()=> 0;
    case 'free': return ()=> (rnd()<0.5 ? -1 : (rnd()<0.75?0:2));
    case 'defend': return ()=> (rnd()<0.6 ? 0 : 2);
    case 'letpass': return ()=> 1;
    case 'push': return ()=> (rnd()<0.5 ? -1 : (rnd()<0.75?0:2));
    case 'nurse': return ()=> (rnd()<0.3 ? 1 : 0);
    default: return ()=> 0;
  }
}

function applyLiveDecision(type, choiceKey){
  const timeline = state.live.timeline;
  const t = state.live.phaseIndex;
  if(choiceKey==='splitstrategy'){
    const fns = { 'PLAYER-1': decisionShiftFn('box'), 'PLAYER-2': decisionShiftFn('stay') };
    ['PLAYER-1','PLAYER-2'].forEach(slotKey=>{
      if(timeline.retiredAtPhase[slotKey]!==null) return;
      for(let phase=t+1; phase<PHASES.length; phase++){
        const order = timeline.phaseOrders[phase];
        const idx = order.indexOf(slotKey);
        if(idx<0) continue;
        const shift = fns[slotKey]();
        if(shift===0) continue;
        const newIdx = Math.max(0, Math.min(order.length-1, idx+shift));
        order.splice(idx,1); order.splice(newIdx,0,slotKey);
      }
    });
    return;
  }
  const shiftFn = decisionShiftFn(choiceKey);
  ['PLAYER-1','PLAYER-2'].forEach(slotKey=>{
    if(timeline.retiredAtPhase[slotKey]!==null) return; // gia' ritirato: la scelta non ha piu' effetto
    for(let phase=t+1; phase<PHASES.length; phase++){
      const order = timeline.phaseOrders[phase];
      const idx = order.indexOf(slotKey);
      if(idx<0) continue;
      const shift = shiftFn();
      if(shift===0) continue;
      const newIdx = Math.max(0, Math.min(order.length-1, idx+shift));
      order.splice(idx,1);
      order.splice(newIdx,0,slotKey);
    }
  });
}

function resolveLiveDecision(choiceKey){
  const dec = state.live.activeDecision;
  if(!dec) return;
  applyLiveDecision(dec.type, choiceKey);
  state.live.resolvedDecisions.push(dec.phase);
  state.live.activeDecision = null;
  state.live.decisionDeadline = null;
  state.live.paused = false;
  render();
}

function startLiveRace(timeline){
  state.live = {
    timeline, phaseIndex: -1, elapsedInPhase: 0, phaseDuration: randomPhaseDuration(),
    paused:false, speed: (typeof defaultRaceSpeed!=='undefined' ? defaultRaceSpeed : 1), domReady:false, visibleLog:[],
    weather: timeline.weatherBefore, trackStatus:'Regolare', sunFlashPlayed:false,
    pendingDecisions: computeLiveDecisions(timeline), resolvedDecisions: [], activeDecision: null
  };
  state.phase = 'race_live';
  advanceLivePhase();
  render();
  startLiveTicker();
}

function advanceLivePhase(){
  state.live.phaseIndex++;
  state.live.elapsedInPhase = 0;
  state.live.phaseDuration = randomPhaseDuration();
  const t = state.live.phaseIndex;
  const timeline = state.live.timeline;
  const newLines = buildPhaseLog(t, timeline);
  newLines.forEach(l=>{ if(l.sfx) playSfx(l.sfx); if(l.realSfx) playRealSfx(l.realSfx); }); // V0.9.7.8.2 / V0.9.7.8.14
  state.live.visibleLog = [...newLines.slice().reverse(), ...state.live.visibleLog].slice(0,40);
  if(timeline.weatherChangePhase===t) state.live.weather = timeline.weatherAfter;
  if(timeline.safetyCarPhase===t) state.live.trackStatus = 'Safety Car';
  if(timeline.safetyCarPhase!==null && t===timeline.safetyCarPhase+1) state.live.trackStatus = 'Regolare';

  const dec = state.live.pendingDecisions.find(d=>d.phase===t && !state.live.resolvedDecisions.includes(d.phase));
  if(dec){
    state.live.activeDecision = dec;
    state.live.paused = true;
    state.live.decisionDeadline = decisionTimerEnabled ? (Date.now()+DECISION_TIME_MS) : null;
    triggerTensionHaptic(); // V0.9.7.8.10
    playRealSfx('audio/sfx_race_action.mp3'); // V0.9.7.8.19: suono all'apparire della scheda decisione, non al click
  }
}

const DECISION_TIME_MS = 12000; // V0.9.3.2: durata del countdown per le decisioni in gara, se attivo

function liveTick(){
  if(!state.live || state.phase!=='race_live'){ if(window._liveTimer) clearInterval(window._liveTimer); return; }
  if(state.live.activeDecision){
    if(state.live.decisionDeadline!=null && Date.now() >= state.live.decisionDeadline){
      const info = LIVE_DECISION_INFO[state.live.activeDecision.type];
      resolveLiveDecision(info.choices[0].key); // tempo scaduto: si applica la prima opzione, la piu' prudente
    }
    return;
  }
  if(state.live.paused) return;
  state.live.elapsedInPhase += 200*state.live.speed;
  if(state.live.elapsedInPhase >= state.live.phaseDuration){
    if(state.live.phaseIndex >= PHASES.length-1){
      clearInterval(window._liveTimer);
      finishLiveRace();
      return;
    }
    advanceLivePhase();
    render();
  }
}

function startLiveTicker(){
  if(window._liveTimer) clearInterval(window._liveTimer);
  window._liveTimer = setInterval(liveTick, 200);
}

function pauseLive(){
  if(!state.live) return;
  state.live.paused = !state.live.paused;
  render();
}
function toggleSpeedLive(){
  if(!state.live) return;
  state.live.speed = state.live.speed===1 ? 2 : 1;
  render();
}
function skipLiveRace(){
  if(window._liveTimer) clearInterval(window._liveTimer);
  const timeline = state.live.timeline;
  __suppressSfx = true; // V0.9.7.8.2: evita una raffica di suoni sovrapposti quando si salta l'animazione
  while(state.live.phaseIndex < PHASES.length-1){
    advanceLivePhase();
    if(state.live.activeDecision){
      // in modalita' salta-alla-fine si sceglie sempre l'opzione piu' prudente, senza rischi
      const safeChoice = { weather:'box', safetycar:'box', pit:'early', aggression:'safe' }[state.live.activeDecision.type] || 'box';
      resolveLiveDecisionSilent(safeChoice);
    }
  }
  __suppressSfx = false;
  finishLiveRace();
}
function resolveLiveDecisionSilent(choiceKey){
  const dec = state.live.activeDecision;
  if(!dec) return;
  applyLiveDecision(dec.type, choiceKey);
  state.live.resolvedDecisions.push(dec.phase);
  state.live.activeDecision = null;
  state.live.paused = false;
}
function finishLiveRace(){
  finalizeRaceScoring(state.live.timeline);
  // V0.9.7.8.2: SFX #12/#13 — in base al miglior risultato del giocatore in questa gara
  const playerEntries = state.live.timeline.entries.filter(e=>e.isPlayerTeam && !e.dnf);
  const bestPos = playerEntries.length ? Math.min(...playerEntries.map(e=>e.pos)) : null;
  if(bestPos===1) playSfx('victory_fanfare');
  else if(bestPos!==null && bestPos<=3) playSfx('podium');
  state.phase = 'race_result';
  render();
}

/* ---------------- V0.4 rendering: board live con righe animate ---------------- */
const ROW_H = 34;

function computeLiveRows(){
  const t = state.live.phaseIndex;
  const timeline = state.live.timeline;
  const order = timeline.phaseOrders[t];
  const prevOrder = t>0 ? timeline.phaseOrders[t-1] : timeline.gridOrder;
  const byKey = {}; timeline.entries.forEach(e=> byKey[e.slotKey]=e);
  const isFinalPhase = t === PHASES.length-1;
  return order.map((key,i)=>{
    const e = byKey[key];
    const prevIdx = prevOrder.indexOf(key);
    const delta = prevIdx>=0 ? (prevIdx - i) : 0;
    const statusRaw = statusFor(key, t, timeline); // V0.9.7.8.31: valore interno, mai tradotto, usato solo per confronti
    let status = statusLabel(statusRaw);
    if(isFinalPhase){
      status = statusRaw==='RITIRATO' ? window.t('status_retired_short') : '🏁';
    }
    const gap = i===0 ? window.t('status_leader') : ((statusRaw==='RITIRATO') ? '—' : '+'+(i*0.55 + (i%3)*0.2).toFixed(1)+'s');
    return { key, index:i, pos:i+1, carNumber:e.carNumber, driverName:e.driverName, teamName:e.teamName, teamId:e.teamId, isPlayerTeam:e.isPlayerTeam, status, statusRaw, gap, delta };
  });
}

function liveDecisionHTML(){
  const dec = state.live.activeDecision;
  if(!dec) return '';
  const info = LIVE_DECISION_INFO[dec.type];
  const choicesHTML = info.choices.map(c=>`
        <button class="ghost decision-btn" data-action="resolve-live-decision" data-choice="${c.key}">
          <div class="decision-btn-label">${c.label}</div>
          <div class="decision-btn-desc">${c.desc}</div>
        </button>`).join('');
  const timerEnabled = state.live.decisionDeadline!==null && state.live.decisionDeadline!==undefined;
  const timerHTML = timerEnabled ? `<div class="decision-timer-track"><div class="decision-timer-fill" id="decisionTimerFill"></div></div>` : '';
  return `
  <div class="decision-modal">
    <div class="decision-card">
      <div class="eyebrow">${info.title}</div>
      <h3 class="hdr" style="font-size:20px;margin-top:6px;">${info.question}</h3>
      ${timerHTML}
      <div class="decision-choices">${choicesHTML}</div>
    </div>
  </div>`;
}

function renderRaceLiveInit(){
  const t = state.live.phaseIndex;
  const phase = PHASES[t];
  const timeline = state.live.timeline;
  const rows = computeLiveRows();
  const leader = rows[0];

  const rowsHTML = rows.map(r=>`
    <div class="live-row ${r.isPlayerTeam?'player':''} ${r.statusRaw==='RITIRATO'?'dnf':''} ${!r.isPlayerTeam && state.rivals && state.rivals.includes(r.teamId)?'rival':''}" id="row-${r.key}" style="top:${r.index*ROW_H}px;">
      <span class="lr-pos">P${r.pos}</span>
      <span class="lr-num mono">#${r.carNumber}</span>
      <span class="lr-name">${shortName(r.driverName)}${r.isPlayerTeam?' <b class="lr-tu">TU</b>':''}</span>
      <span class="lr-team dim">${r.teamName}</span>
      <span class="lr-gap mono">${r.gap}</span>
      <span class="lr-status">${r.status}</span>
      <span class="lr-delta" id="delta-${r.key}"></span>
    </div>`).join('');

  const logHTML = state.live.visibleLog.map(l=>`<div class="logline ${l.tone}"><span class="icon">${l.tone==='pos'?'▲':l.tone==='neg'?'▼':'–'}</span><span>${l.text}</span></div>`).join('');

  const rainActive = state.live.weather==='Bagnato';
  const raindropsHTML = Array.from({length:40}).map((_,i)=>
    `<div class="raindrop" style="left:${(i*2.6)%100}%; animation-delay:${(i%20)*0.09}s; animation-duration:${0.55+(i%5)*0.09}s;"></div>`
  ).join('');

  app.innerHTML = `
  <div id="liveRainFx" class="live-rain-fx ${rainActive?'active':''}">${raindropsHTML}</div>
  <div id="liveSunFx" class="live-sun-fx"></div>
  <div id="liveDecisionFx">${liveDecisionHTML()}</div>
  <div class="topbar">
    <div class="brand hdr">${flag(timeline.circuit.paese)} ${timeline.circuit.nome}<small id="livePhaseName">${phase.name}</small></div>
    <div class="hud">
      <div class="hud-item"><div class="hud-label">Leader</div><div class="hud-value cyan" id="liveLeader">${shortName(leader.driverName)}</div></div>
      <div class="hud-item"><div class="hud-label">Meteo</div><div class="hud-value" id="liveWeather">${state.live.weather}</div></div>
      <div class="hud-item"><div class="hud-label">Pista</div><div class="hud-value ${state.live.trackStatus==='Safety Car'?'amber':''}" id="liveTrack">${state.live.trackStatus}</div></div>
      <div class="hud-item"><div class="hud-label">Giro</div><div class="hud-value" id="livePhaseNum">${timeline.lapNumbers[t]}/${timeline.totalGiri}</div></div>
    </div>
  </div>
  <div class="live-progress"><div class="live-progress-fill" id="liveProgressFill" style="width:${(t/(PHASES.length-1))*100}%;"></div></div>
  <div class="btnrow">
    <button class="ghost" data-action="pause-live" id="btnPause">${state.live.paused?'▶ Riprendi':'⏸ Pausa'}</button>
    <button class="ghost${state.live.speed===2?' speed-active':''}" data-action="speed-live" id="btnSpeed">Velocità ${state.live.speed}×</button>
    <button class="primary" data-action="skip-live">Salta al risultato →</button>
  </div>
  <div class="live-layout">
    <div class="panel live-board-panel">
      <div class="panel-title"><h3 class="hdr">Classifica Live</h3><span class="dim mono" style="font-size:11px;">20 PILOTI</span></div>
      <div class="live-head"><span>Pos</span><span>#</span><span>Pilota</span><span>Scuderia</span><span>Distacco</span><span>Stato</span><span></span></div>
      <div class="live-board" id="liveBoard" style="height:${rows.length*ROW_H}px;">${rowsHTML}</div>
    </div>
    <div class="panel live-log-panel">
      <div class="panel-title"><h3 class="hdr">Log Gara</h3></div>
      <div class="dim" style="font-size:12px;margin-bottom:8px;">${nationLabel(timeline.circuit.paese)} · ${timeline.circuit.tipo} · Componente dominante: ${displayArea(timeline.circuit.componentedominante)}</div>
      <div class="live-log" id="liveLog">${logHTML}</div>
    </div>
  </div>
  `;
  state.live.domReady = true;
  bindActions();
}

function updateLiveBoard(){
  const t = state.live.phaseIndex;
  const phase = PHASES[t];
  const timeline = state.live.timeline;
  const rows = computeLiveRows();
  const leader = rows[0];
  const board = document.getElementById('liveBoard');
  if(!board){ return renderRaceLiveInit(); } // fallback di sicurezza se il DOM live non esiste piu'

  // V0.9.3.1: aggiorna la sovrapposizione di decisione strategica se presente
  const decisionEl = document.getElementById('liveDecisionFx');
  if(decisionEl){
    decisionEl.innerHTML = liveDecisionHTML();
    bindActions();
  }

  // V0.9.3: pioggia su schermo se sta piovendo; lampo di sole (una sola volta) se torna il sereno a gara in corso
  const rainEl = document.getElementById('liveRainFx');
  if(rainEl) rainEl.classList.toggle('active', state.live.weather==='Bagnato');
  if(timeline.weatherChangePhase===t && timeline.weatherAfter==='Asciutto' && !state.live.sunFlashPlayed){
    state.live.sunFlashPlayed = true;
    const sunEl = document.getElementById('liveSunFx');
    if(sunEl) sunEl.classList.add('flash');
  }

  rows.forEach(r=>{
    let row = document.getElementById('row-'+r.key);
    if(!row) return;
    row.style.top = (r.index*ROW_H)+'px';
    row.className = `live-row ${r.isPlayerTeam?'player':''} ${r.statusRaw==='RITIRATO'?'dnf':''} ${!r.isPlayerTeam && state.rivals && state.rivals.includes(r.teamId)?'rival':''}`;
    row.querySelector('.lr-pos').textContent = 'P'+r.pos;
    row.querySelector('.lr-gap').textContent = r.gap;
    row.querySelector('.lr-status').textContent = r.status;
    const deltaEl = row.querySelector('.lr-delta');
    if(r.delta!==0){
      deltaEl.textContent = (r.delta>0? '+':'') + r.delta;
      deltaEl.className = 'lr-delta show ' + (r.delta>0?'pos':'neg');
      void deltaEl.offsetWidth; // restart CSS animation
    } else {
      deltaEl.textContent='';
      deltaEl.className = 'lr-delta';
    }
  });

  document.getElementById('livePhaseName').textContent = phase.name;
  document.getElementById('livePhaseNum').textContent = timeline.lapNumbers[t]+'/'+timeline.totalGiri;
  document.getElementById('liveLeader').textContent = shortName(leader.driverName);
  document.getElementById('liveWeather').textContent = state.live.weather;
  const trackEl = document.getElementById('liveTrack');
  trackEl.textContent = state.live.trackStatus;
  trackEl.className = 'hud-value ' + (state.live.trackStatus==='Safety Car' ? 'amber':'');
  document.getElementById('liveProgressFill').style.width = ((t/(PHASES.length-1))*100)+'%';

  const logEl = document.getElementById('liveLog');
  logEl.innerHTML = state.live.visibleLog.map(l=>`<div class="logline ${l.tone}"><span class="icon">${l.tone==='pos'?'▲':l.tone==='neg'?'▼':'–'}</span><span>${l.text}</span></div>`).join('');

  const btnPause = document.getElementById('btnPause');
  if(btnPause) btnPause.textContent = state.live.paused? '▶ Riprendi':'⏸ Pausa';
  const btnSpeed = document.getElementById('btnSpeed');
  if(btnSpeed){
    btnSpeed.textContent = 'Velocità '+state.live.speed+'×';
    btnSpeed.classList.toggle('speed-active', state.live.speed===2);
  }
}

/* ---------------- pit lane (roguelike node) ---------------- */
/* ---------------- V0.6: classificazione e stima dell'effetto ---------------- */
// Nomenclatura (spec 0.6 punto 6): non tutto e' "upgrade". Confronta le statistiche
// rilevanti per la categoria e classifica la proposta in base al risultato reale.
function classifyReplacement(catKey, current, candidate){
  const statsDef = COMPARE_STATS[catKey] || [['rating','Rating']];
  const sit = SITUATIONAL_STAT[catKey];
  let better=0, worse=0;
  const betterKeys = [];
  statsDef.forEach(([k])=>{
    if(current[k]===undefined || candidate[k]===undefined) return;
    const invert = INVERT_STATS.has(k);
    const diff = candidate[k]-current[k];
    const goodness = invert ? -diff : diff;
    if(goodness>0.001){ better++; betterKeys.push(k); }
    else if(goodness<-0.001) worse++;
  });

  if(worse===0 && better>0) return t('classify_upgrade');

  // OPPORTUNITÀ: il vantaggio e' concentrato (solo) sulla statistica situazionale, con un
  // salto netto, mentre il resto della scheda non migliora — va riconosciuta PRIMA dello
  // SCAMBIO generico, che altrimenti la intercetterebbe sempre.
  if(sit && current[sit]!==undefined && candidate[sit]!==undefined){
    const sitJump = candidate[sit]-current[sit];
    const onlySituationalBetter = betterKeys.length>0 && betterKeys.every(k=>k===sit);
    if(sitJump>=12 && onlySituationalBetter && candidate.rating<=current.rating) return t('classify_opportunity');
  }

  if(better>0 && worse>0) return t('classify_trade');
  return t('classify_replacement');
}

// Stima dell'effetto sulla scuderia (spec 0.6 punto 2), calcolata sostituendo davvero
// il componente/pilota nella squadra e rieseguendo le stesse formule del motore V0.5
// (qualifica, passo gara asciutto/bagnato, affidabilita', circuiti veloci/cittadini),
// mediando su piu' campioni per neutralizzare la sola componente casuale delle formule.
function estimateSquadEffect(catKey, candidate){
  const t = state.team;
  const pilotBefore = (catKey==='pilotSecond') ? t.pilotSecond : t.pilotMain;
  const pilotAfter  = (catKey==='pilotSecond') ? candidate     : t.pilotMain;
  const compBefore = { motore:t.motore, telaio:t.telaio, aero:t.aero, gomme:t.gomme, stratega:t.stratega };
  const compAfter = {
    motore: catKey==='motore' ? candidate : t.motore,
    telaio: catKey==='telaio' ? candidate : t.telaio,
    aero: catKey==='aero' ? candidate : t.aero,
    gomme: catKey==='gomme' ? candidate : t.gomme,
    stratega: catKey==='stratega' ? candidate : t.stratega
  };

  const N = 12;
  const allCircuits = DATA.circuiti;
  const fastCircuits = DATA.circuiti.filter(c=>c.tipo==='Alta velocità');
  const cityCircuits = DATA.circuiti.filter(c=>c.tipo==='Cittadino');

  function avgQuali(pilot, comp){
    let s=0,c=0;
    allCircuits.forEach(circuit=>{
      for(let i=0;i<N;i++){ s += computeQualifying([{slotKey:'X',pilot,comp}], circuit, 'Asciutto')[0].score; c++; }
    });
    return s/c;
  }
  function avgPace(pilot, comp, circuits, isWet){
    let s=0,c=0;
    circuits.forEach(circuit=>{
      for(let i=0;i<N;i++){
        s += paceScore({pilot}, comp, circuit, { isWet, isLastTwoPhases:false, tireWear:0.3, isFightingForPodium:false,
          gridPos:10, phaseIndex:5, afterSafetyCar:false, isDecisiveRace:false, seasonPodiums:0 });
        c++;
      }
    });
    return s/c;
  }
  function reliability(pilot, comp){
    return comp.motore.affidabilita*0.4 + comp.telaio.affidabilita*0.3 + pilot.affidabilita*0.3;
  }
  function pct(before, after){ return before===0 ? 0 : ((after-before)/Math.abs(before))*100; }

  const qBefore = avgQuali(pilotBefore, compBefore), qAfter = avgQuali(pilotAfter, compAfter);
  const dryBefore = avgPace(pilotBefore, compBefore, allCircuits, false), dryAfter = avgPace(pilotAfter, compAfter, allCircuits, false);
  const wetBefore = avgPace(pilotBefore, compBefore, allCircuits, true), wetAfter = avgPace(pilotAfter, compAfter, allCircuits, true);
  const relBefore = reliability(pilotBefore, compBefore), relAfter = reliability(pilotAfter, compAfter);
  const fastBefore = fastCircuits.length? avgPace(pilotBefore, compBefore, fastCircuits, false) : dryBefore;
  const fastAfter  = fastCircuits.length? avgPace(pilotAfter, compAfter, fastCircuits, false) : dryAfter;
  const cityBefore = cityCircuits.length? avgPace(pilotBefore, compBefore, cityCircuits, false) : dryBefore;
  const cityAfter  = cityCircuits.length? avgPace(pilotAfter, compAfter, cityCircuits, false) : dryAfter;

  return {
    qualifica: pct(qBefore,qAfter),
    asciutta: pct(dryBefore,dryAfter),
    bagnata: pct(wetBefore,wetAfter),
    affidabilita: pct(relBefore,relAfter),
    veloci: pct(fastBefore,fastAfter),
    cittadini: pct(cityBefore,cityAfter)
  };
}

// V0.9.3.1: mai proporre un upgrade che non potrebbe dare alcun guadagno reale (componente gia' a 100)
function isUpgradeUseful(u){
  const areaMap = {'Piloti':'pilotMain','Motore':'motore','Telaio':'telaio','Aerodinamica':'aero','Gomme':'gomme','Strategia':'stratega'};
  // V0.9.7.8.8: gli upgrade "Richiede Sponsor" sono disponibili solo con uno Sponsor Tecnico
  // attivo sulla stessa area — altrimenti restano bloccati per l'intera stagione.
  if(u.requisito==='Richiede Sponsor'){
    if(!(state.sponsor && state.sponsor.tier==='tecnico' && state.sponsor.category===u.area)) return false;
  }
  if(u.area==='Globale'){
    return ['motore','telaio','aero','gomme','stratega'].some(k=> state.team[k].rating < 100);
  }
  const key = areaMap[u.area];
  if(!key) return true;
  return state.team[key].rating < 100;
}

/* ============================================================
   V0.9.7.8.8 — SPONSOR & BUDGET
   3 livelli, scelta forzata tra le 3 opzioni a inizio stagione (dopo il Draft, prima del Hub).
   Numeri deliberatamente contenuti — vedi commenti sui singoli effetti — perche' l'economia del
   gioco e' gia' abbastanza generosa: la vera posta in gioco e' quale RISCHIO accetti, non quanto
   guadagni in piu' in assoluto.
   ============================================================ */
const SPONSOR_NAMES = [
  'Zenith Finance','Skyline Telecom','Apex Energy','Nova Fuels','Meridian Bank',
  'Volt Dynamics','Solaris Insurance','Titan Logistics','Quantum Watches','Northpoint Airlines',
];
const SPONSOR_TECNICO_CATEGORIES = ['Aerodinamica','Telaio','Strategia']; // uniche aree con upgrade "Richiede Sponsor" in data.json
function generateSponsorOffers(){
  const names = weightedSampleDistinct(SPONSOR_NAMES.map(n=>({id:n,nome:n,costo:1})), 3, 'costo', new Set()).map(o=>o.nome);
  const tecnicoCategory = SPONSOR_TECNICO_CATEGORIES[Math.floor(rnd()*SPONSOR_TECNICO_CATEGORIES.length)];
  const labels = { title:'Title Sponsor', tecnico:t('sponsor_technical'), secondario:t('sponsor_secondary') };
  return [
    { tier:'title', nome:names[0], label:labels.title },
    { tier:'tecnico', nome:names[1], label:labels.tecnico, category:tecnicoCategory },
    { tier:'secondario', nome:names[2], label:labels.secondario },
  ];
}
function sponsorCardHTML(offer){
  const descByTier = {
    title: `<b>+15% ${t('sponsor_desc_title_prizes')}</b> ${t('sponsor_desc_title_condition')}`,
    tecnico: t('sponsor_desc_tecnico', offer.category),
    secondario: `<b>${t('sponsor_desc_secondario_amount')}</b> ${t('sponsor_desc_secondario_rest')}`,
  };
  const iconByTier = { title:'👑', tecnico:'🔧', secondario:'🤝' };
  return `<div class="card pickable sponsor-card" data-action="choose-sponsor" data-tier="${offer.tier}">
    <span class="rarity-tag" data-rarity="Rare">${iconByTier[offer.tier]} ${offer.label.toUpperCase()}</span>
    <div class="sponsor-card-name">${offer.nome}</div>
    <div class="sponsor-card-desc">${descByTier[offer.tier]}</div>
  </div>`;
}
function renderSponsorChoice(){
  const offers = state.sponsorOffers || generateSponsorOffers();
  state.sponsorOffers = offers;
  app.innerHTML = `
  <div class="topbar">
    <div class="brand hdr">RACING DYNASTY<small>${t('sponsor_choose_subtitle')}</small></div>
  </div>
  <div class="panel">
    <div class="eyebrow">${t('sponsor_choose_one')}</div>
    <h2 class="hdr" style="font-size:22px;">${t('sponsor_headline')}</h2>
    <div class="dim" style="font-size:12px;margin-top:6px;">${t('sponsor_subtitle')}</div>
  </div>
  <div class="draft-turn-grid">${offers.map(sponsorCardHTML).join('')}</div>
  `;
  bindActions();
}

// V0.9.3.1: lo scouting deve offrire sempre almeno un'opzione potenzialmente valida
// (rating piu' alto, bonus diverso, o specializzazione diversa), non solo pesca casuale
function ensureUsefulScoutOptions(pool, current){
  const hasUpside = o => o.rating > current.rating || (o.bonus && o.bonus !== current.bonus) || (o.arch && o.arch !== current.arch);
  // V0.9.4.6.1: il pezzo attuale va SEMPRE escluso dalle alternative offerte, anche come rete di
  // sicurezza indipendente da usedIds — altrimenti puo' ricomparire come "sostituzione" di se stesso.
  const exclude = new Set(state.usedIds); exclude.add(current.id);
  let options = drawBandedDistinct(pool, 3, exclude);
  let attempts = 0;
  while(!options.some(hasUpside) && attempts < 6){
    options = drawBandedDistinct(pool, 3, exclude);
    attempts++;
  }
  return options;
}

function buildPitlaneOptions(){
  const usedUpg = new Set();
  const usefulUpgrades = DATA.upgrade.filter(isUpgradeUseful);
  const seasonCostMult = state.seasonLength===20 ? 2 : 1; // V0.9.7: run da 20 gare, upgrade piu' cari
  const upgrades = weightedSampleDistinct(usefulUpgrades.length?usefulUpgrades:DATA.upgrade, 2, 'costo', usedUpg).map(u=>{
    const clone = seasonCostMult!==1 ? { ...u, costo: u.costo*seasonCostMult } : u;
    return {type:'upgrade', data:clone};
  });
  const scoutCategories = [
    {key:'motore', pool:DATA.motori, label:'Motore'},
    {key:'telaio', pool:DATA.telai, label:'Telaio'},
    {key:'aero', pool:DATA.aero, label:'Aerodinamica'},
    {key:'gomme', pool:DATA.gomme, label:'Gomme'},
    {key:'stratega', pool:DATA.strategi, label:'Team Principal'},
  ];
  if(state.seasonLength !== 20){
    scoutCategories.push({key:'pilotSecond', pool:DATA.piloti, label:'Secondo Pilota'});
  }
  const cat = pick(scoutCategories);
  const currentItem = state.team[cat.key];
  const scoutOptions = ensureUsefulScoutOptions(cat.pool, currentItem);
  const scoutNode = {type:'scout', catKey:cat.key, catLabel:cat.label, options:scoutOptions};
  return [...upgrades, scoutNode];
}

// V0.9.2.1: nuovo sistema di investimento. Il rischio va sempre da un fisso 50% (minimo
// investimento) a un fisso 5% (massimo investimento), uguale per tutti gli upgrade — cosi'
// il giocatore puo' davvero "giocarsela" quando vuole. Il punto "ragionevole" (dove costo e
// rischio coincidono con i valori originali del database) e' segnato sulla barra come partenza
// di default. Rischiare grosso da' uno sconto vero, non solo un rischio piu' alto senza contropartita.
const RISK_MAX = 50, RISK_MIN = 5;         // range fisso di rischio, mai oltre questi estremi
const INVEST_DISCOUNT = 0.45;              // al rischio massimo: 55% di sconto sul costo base
const INVEST_PREMIUM = 2.2;                // al rischio minimo: costo 2.2x il base

function investedRisk(t){
  const offset = difficultyParams().riskOffset || 0;
  const maxR = Math.min(95, RISK_MAX+offset), minR = Math.max(1, RISK_MIN+offset);
  return Math.round(maxR - (maxR-minR)*Math.max(0,Math.min(1,t)));
}

// t0 = il punto sulla barra dove il rischio coincide col probfallimento originale del database
function reasonablePointT(baseFail){
  const clamped = Math.max(RISK_MIN, Math.min(RISK_MAX, baseFail));
  return (RISK_MAX - clamped) / (RISK_MAX - RISK_MIN);
}
function investedCost(baseCost, t, t0){
  t = Math.max(0, Math.min(1, t));
  if(t0===undefined) t0 = 0.5;
  if(t0<=0) return baseCost * (1 + (INVEST_PREMIUM-1)*t); // il DB era gia' al rischio massimo
  if(t0>=1) return baseCost * (INVEST_DISCOUNT + (1-INVEST_DISCOUNT)*t); // il DB era gia' al rischio minimo
  if(t <= t0) return baseCost * (INVEST_DISCOUNT + (1-INVEST_DISCOUNT)*(t/t0));
  return baseCost * (1 + (INVEST_PREMIUM-1)*((t-t0)/(1-t0)));
}
// il piu' alto t (rischio piu' basso possibile) che il budget attuale puo' coprire, o null se non basta nemmeno il minimo
function maxAffordableT(baseCost, t0, budgetM){
  const cost0M = investedCost(baseCost, 0, t0)/1000000;
  if(budgetM < cost0M) return null;
  const cost1M = investedCost(baseCost, 1, t0)/1000000;
  if(budgetM >= cost1M) return 1;
  // cerca nel segmento giusto (funzione lineare a tratti, quindi risolvibile per interpolazione)
  if(t0>0){
    const costT0M = investedCost(baseCost, t0, t0)/1000000;
    if(budgetM <= costT0M){
      const frac = (budgetM-cost0M)/(costT0M-cost0M || 1);
      return t0*frac;
    }
  }
  const costT0M = investedCost(baseCost, t0, t0)/1000000;
  const frac = (budgetM-costT0M)/(cost1M-costT0M || 1);
  return t0 + (1-t0)*frac;
}

function applyUpgrade(upg, investT){
  investT = Math.max(0, Math.min(1, investT||0));
  const isGuaranteed = upg.probfallimento===0;
  const t0 = reasonablePointT(upg.probfallimento);
  const costoM = isGuaranteed ? upg.costo/1000000 : investedCost(upg.costo, investT, t0)/1000000;
  if(state.budget < costoM){ playSfx('error_disabled'); return; } // V0.9.7.8.2
  state.budget -= costoM;
  state.playerInvestedLastRace = true; // V0.9.3.2: usato per far crescere il rivale al tuo ritmo, a volte si a volte no
  // V0.9.7: tracciamento obiettivo "Tutto o Niente" — investT=0 e' il rischio massimo (50%);
  // qualsiasi investimento non-guaranteed con investT diverso da 0 rompe la striscia.
  if(!isGuaranteed){
    state.upgradesPurchasedCount = (state.upgradesPurchasedCount||0) + 1;
    if(investT !== 0) state.everUsedMaxRiskOnly = false;
  }
  const riskPct = isGuaranteed ? 0 : investedRisk(investT);
  const failed = isGuaranteed ? false : (rnd()*100 < riskPct);
  if(failed) unlockAchievement('si-impara-perdendo'); // V0.9.7.9
  const areaMap = {'Piloti':'pilotMain','Motore':'motore','Telaio':'telaio','Aerodinamica':'aero','Gomme':'gomme','Strategia':'stratega'};
  let areaLabel = upg.area;
  if(upg.area==='Globale'){
    if(!failed){
      ['motore','telaio','aero','gomme','stratega'].forEach(k=>{
        state.team[k].rating = clamp(state.team[k].rating + Math.round(upg.guadagno/3), 1, 100);
      });
      state.log.unshift({type:'pos', text:`Sviluppo riuscito: ${upg.nome} — bonus diffuso a tutta la vettura.`});
    } else {
      state.log.unshift({type:'neg', text:`Sviluppo fallito: ${upg.nome}. ${upg.malus}`});
    }
  } else {
    const key = areaMap[upg.area];
    if(key && !failed){
      state.team[key].rating = clamp(state.team[key].rating + upg.guadagno, 1, 100);
      state.log.unshift({type:'pos', text:`Upgrade applicato: ${upg.nome} su ${upg.area} (+${upg.guadagno}).`});
    } else if(key){
      state.log.unshift({type:'neg', text:`Sviluppo fallito: ${upg.nome}. ${upg.malus}`});
    }
  }

  // V0.7.5: il rischio non si risolve piu' in silenzio - c'e' un momento di suspense visibile,
  // poi l'esito riuscito/fallito viene mostrato esplicitamente prima di proseguire.
  state.pendingUpgradeReveal = { nome: upg.nome, area: areaLabel, guadagno: upg.guadagno, failed, malus: upg.malus||'', riskPct };
  state.phase = 'upgrade_suspense';
  render();
  if(window._upgradeSuspenseTimer) clearTimeout(window._upgradeSuspenseTimer);
  window._upgradeSuspenseTimer = setTimeout(()=>{
    if(state.phase!=='upgrade_suspense') return;
    state.phase = 'upgrade_result';
    playSfx(state.pendingUpgradeReveal.failed ? 'upgrade_fail' : 'upgrade_success'); // V0.9.7.8.38: spostato qui, al momento della vera rivelazione
    render();
  }, 1900);
}

function skipUpgradeSuspense(){
  if(window._upgradeSuspenseTimer) clearTimeout(window._upgradeSuspenseTimer);
  state.phase = 'upgrade_result';
  playSfx(state.pendingUpgradeReveal.failed ? 'upgrade_fail' : 'upgrade_success'); // V0.9.7.8.38
  render();
}

function continueAfterUpgradeResult(){
  state.pendingUpgradeReveal = null;
  advanceAfterPitlane();
}

function applyScout(catKey, chosenId, options){
  const chosen = options.find(o=>o.id===chosenId);
  const old = state.team[catKey];
  // V0.9.4.5: il prezzo/guadagno e' proporzionale alla differenza di rating, non al rating assoluto —
  // scambiare verso un pezzo piu' debole del tuo FA guadagnare (non ha senso pagare per peggiorare),
  // e non chiude il turno: puoi vendere piu' di un pezzo di fila nella stessa finestra di pit-lane.
  const price = scoutSwapPrice(old, chosen);
  const isDowngrade = price < 0;
  if(!isDowngrade && state.budget < price){ playSfx('error_disabled'); return; } // V0.9.7.8.2 — budget insufficiente per un rialzo: non va a buon fine
  state.budget -= price; // se price e' negativo (downgrade), questo AGGIUNGE budget
  // V0.9.7: tracciamento obiettivi "Sopravvissuto" (mai scouting) e "Fedelissimo" (mai cambio pilota)
  state.everUsedScouting = true;
  const isPilotCat = (catKey==='pilotMain' || catKey==='pilotSecond');
  if(isPilotCat){
    playSfx('ui_confirm'); // V0.9.7.8.18: niente suono reale per i piloti, ripristinato il placeholder
    const alreadySwappedPilot = state.everSwappedPilot;
    state.everSwappedPilot = true;
    if(!alreadySwappedPilot) unlockAchievement('nuovo-volto'); // V0.9.7.9: primo cambio pilota in assoluto
    if(chosen.nome==='THE GOAT'){
      state.pendingGoatReveal = true; // V0.9.7.6
      achievementData.goatObtainedViaScouting = true; // V0.9.7.9: fortuna-sfacciata
      if(achievementData.goatObtainedViaDraft) unlockAchievement('fortuna-sfacciata');
      saveAchievementData();
    }
    // V0.9.7.9: se siamo nella finestra del Mid Season Draft, registriamo quale sedile e' stato cambiato
    if(state.phase==='midseason-swap'){
      state.midSeasonSwappedCats.add(catKey);
    }
  } else {
    state.everUsedScoutingOnComponent = true; // V0.9.7.9: fedele-alla-linea-di-partenza si riferisce SOLO ai componenti
    // V0.9.7.8.14: suono dedicato solo per i pezzi auto (motore/telaio/aero/gomme) — non per team principal
    if(catKey!=='stratega') playRealSfx('audio/sfx_component_pick.mp3');
    else playSfx('ui_confirm'); // V0.9.7.8.18: team principal non ha un suono reale, placeholder ripristinato
  }
  if(RARITY_ORDER && RARITY_ORDER.indexOf(chosen.rarita) >= RARITY_ORDER.indexOf('Epic')){
    state.everUsedEpicOrHigher = true; // V0.9.7.9: con-quello-che-c-e
  }
  if(old) { unlockMuseumItem(catKey, old); /* replaced component returns to the paddock, no refund by design */ }
  state.team[catKey] = JSON.parse(JSON.stringify(chosen));
  state.usedIds.add(chosen.id);
  applySynergyBonuses();
  checkSynergyAchievements(); // V0.9.7.9
  state.playerInvestedLastRace = true; // V0.9.3.2: usato per far crescere il rivale al tuo ritmo
  // V0.9.4.2.9: "storia della stagione" rimossa (conteneva errori) — non registriamo piu' questo evento

  // V0.6.1: se sostituiamo un pilota del giocatore, il vecchio pilota resta in classifica
  // con i punti accumulati fino ad ora (etichettato EX), il nuovo riparte da 0 nello stesso sedile.
  if(catKey==='pilotMain' || catKey==='pilotSecond'){
    const seatKey = catKey==='pilotMain' ? 'PLAYER-1' : 'PLAYER-2';
    const oldRecord = state.driverStandings[seatKey];
    if(oldRecord){
      state.exCounter = (state.exCounter||0) + 1;
      const exKey = seatKey + '-EX-' + state.exCounter;
      state.driverStandings[exKey] = { ...oldRecord, isFormer:true };
    }
    state.driverStandings[seatKey] = {
      slotKey: seatKey, teamId:'PLAYER', teamNome: teamDisplayName(), driverId: chosen.id,
      nome: chosen.nome, naz: chosen.naz, carNumber: oldRecord ? oldRecord.carNumber : null,
      isPlayerTeam:true, isFormer:false, points:0, wins:0, podiums:0, dnfs:0
    };
  }

  state.log.unshift({type: isDowngrade?'pos':'neu', text:isDowngrade
    ? `Scambio: ${chosen.nome} sostituisce il precedente componente (${COMPONENT_LABEL[catKey]||catKey}) — incassati ${fmtM(-price)}.`
    : `Scouting: ${chosen.nome} sostituisce il precedente componente (${COMPONENT_LABEL[catKey]||catKey}).`});

  if(isDowngrade){
    // il turno NON si chiude: torniamo alla pit-lane con le stesse offerte, il giocatore puo' continuare
    render();
  } else {
    advanceAfterPitlane();
  }
}

function skipPitlane(){
  state.log.unshift({type:'neu', text:'Budget conservato per la prossima finestra di sviluppo.'});
  advanceAfterPitlane();
}

// V0.9.2.1: le scuderie IA fanno upgrade in stagione come il giocatore — solo componenti,
// i piloti IA restano fissi per tutta la stagione (crea una progressione leggibile in classifica).
function applyAIUpgrades(){
  const playerInvested = !!state.playerInvestedLastRace;
  const myPoints = state.constructorStandings['PLAYER'] ? state.constructorStandings['PLAYER'].points : 0;
  state.aiTeams.forEach(t=>{
    const isRival = state.rivals && state.rivals.includes(t.id);
    // V0.9.4.2.5: il tasso titoli restava troppo alto — crescita IA alzata ancora, per dimezzare circa
    // le possibilita' di vittoria rispetto alla V0.9.4.2.4.
    let chance = isRival && playerInvested ? 0.85 : 0.72;
    const rivalPoints = isRival ? (state.constructorStandings[t.id] ? state.constructorStandings[t.id].points : 0) : 0;
    const rivalGapBehind = isRival ? Math.max(0, myPoints - rivalPoints) : 0;
    if(isRival && rivalGapBehind > 40) chance = Math.min(0.95, chance + 0.1);
    if(rnd() < chance){
      const keys = ['motore','telaio','aero','gomme','stratega'];
      const key = keys[Math.floor(rnd()*keys.length)];
      const gain = 3 + Math.floor(rnd()*4);
      t.components[key].rating = clamp(t.components[key].rating + gain, 1, 100);
    }
  });
  state.playerInvestedLastRace = false;
}

function advanceAfterPitlane(){
  state.raceIndex++;
  if(state.raceIndex >= state.calendar.length){
    state.phase = 'season_end';
  } else {
    applyAIUpgrades();
    reevaluateRivals();
    state.phase = state.pendingRivalNotice ? 'rival-announce' : 'hub';
  }
  render();
}

function goToPitlaneOrEnd(){
  if(state.raceIndex+1 >= state.calendar.length){
    advanceAfterPitlane();
  } else if(state.seasonLength===20 && state.raceIndex+1===10 && !state.midSeasonSwapDone){
    // V0.9.7: Mid Season Draft — entrambi i piloti scambiabili nella stessa finestra, 2 candidati
    // ciascuno (pool ridotto rispetto ai 3 dello scouting normale, occasione rara e mirata).
    state.midSeasonSwapOptions = {
      pilotMain: ensureUsefulScoutOptions(DATA.piloti, state.team.pilotMain).slice(0,2),
      pilotSecond: ensureUsefulScoutOptions(DATA.piloti, state.team.pilotSecond).slice(0,2),
    };
    state.phase = 'midseason-swap';
    render();
  } else {
    state.pendingPitlane = buildPitlaneOptions();
    state.phase = 'pitlane';
    render();
  }
}

function skipMidseasonSwap(){
  state.midSeasonSwapDone = true;
  if(state.midSeasonSwappedCats && state.midSeasonSwappedCats.size>=2) unlockAchievement('rivoluzione-a-meta-stagione'); // V0.9.7.9
  state.log.unshift({type:'neu', text:'Mid Season Draft concluso: la formazione piloti è confermata per il resto della stagione.'});
  advanceAfterPitlane();
}

function renderMidseasonSwap(){
  function pilotGroupHTML(catKey, label){
    const current = state.team[catKey];
    const currentHTML = currentItemCardHTML(current);
    const opts = (state.midSeasonSwapOptions[catKey]||[]).map(o=>{
      const cls = classifyReplacement(catKey, current, o);
      return `
      <div class="card pickable" data-rarity="${displayRarity(o)}" data-action="open-midseason-confirm" data-catkey="${catKey}" data-id="${o.id}">
        <div class="tag-line dim" style="text-transform:uppercase;letter-spacing:0.06em;font-size:9.5px;">${cls}</div>
        <span class="rarity-tag" data-rarity="${displayRarity(o)}">${displayRarityLabel(o)}</span>
        <div class="card-name">${flag(o.naz)} ${o.nome}</div>
        <div class="card-arch">${o.arch||''}</div>
        <div class="card-rating">${o.rating}</div>
      </div>`;
    }).join('');
    return `
    <div class="panel-title" style="margin-top:16px;"><h3 class="hdr" style="font-size:15px;">${label}</h3></div>
    <div class="grid grid-3">${currentHTML}${opts}</div>`;
  }

  app.innerHTML = `
  ${topbarHTML()}
  <div class="panel">
    <div class="eyebrow">${t('mss_eyebrow', state.raceIndex+1, state.calendar.length)}</div>
    <h2 class="hdr" style="font-size:24px;">${t('mss_title')}</h2>
    <div class="dim" style="font-size:12px;margin-top:6px;">${t('mss_subtitle')}</div>
  </div>
  ${pilotGroupHTML('pilotMain', t('mss_pilot_main'))}
  ${pilotGroupHTML('pilotSecond', t('mss_pilot_second'))}
  <div class="btnrow" style="margin-top:16px;"><button class="primary" data-action="skip-midseason-swap">${t('mss_confirm')}</button></div>
  `;
  bindActions();
}

/* ============================================================
   V0.7 — VISUALIZZAZIONE PIXEL ART DELLA SCUDERIA
   ============================================================ */
/* ---------------- V0.7.1 (rifatta in V0.9.7): bandiere SVG al posto delle emoji — resa identica
   su ogni desktop/OS, invece delle sigle testuali (IT, DE...) che comparivano sui controlli nativi ---------------- */
const COUNTRY_FLAG = {
  'Argentina':'🇦🇷','Australia':'🇦🇺','Austria':'🇦🇹','Belgio':'🇧🇪','Brasile':'🇧🇷','Canada':'🇨🇦',
  'Cile':'🇨🇱','Cina':'🇨🇳','Colombia':'🇨🇴','Corea del Sud':'🇰🇷','Croazia':'🇭🇷','Danimarca':'🇩🇰',
  'Emirati Arabi Uniti':'🇦🇪','Finlandia':'🇫🇮','Francia':'🇫🇷','Germania':'🇩🇪','Giappone':'🇯🇵',
  'Grecia':'🇬🇷','India':'🇮🇳','Italia':'🇮🇹','Marocco':'🇲🇦','Messico':'🇲🇽','Norvegia':'🇳🇴',
  'Nuova Zelanda':'🇳🇿','Paesi Bassi':'🇳🇱','Polonia':'🇵🇱','Portogallo':'🇵🇹','Regno Unito':'🇬🇧',
  'Romania':'🇷🇴','Serbia':'🇷🇸','Spagna':'🇪🇸','Stati Uniti':'🇺🇸','Sudafrica':'🇿🇦','Svezia':'🇸🇪',
  'Svizzera':'🇨🇭','Thailandia':'🇹🇭','Turchia':'🇹🇷','Ungheria':'🇭🇺',
  'Singapore':'🇸🇬','Repubblica Ceca':'🇨🇿','Irlanda':'🇮🇪','Sconosciuta':'🏳️'
};
// V0.9.7.8.11 — PWA: tutti gli asset sono ora file separati in assets/, non piu' base64 incorporato.
// slugify riproduce ESATTAMENTE la stessa normalizzazione usata per generare i nomi file su disco.
function slugify(s){ return s.toLowerCase().replace(/'/g,'').replace(/\s+/g,'-'); }
const GOAT_GUIDE_IMG_SRC = 'assets/goat/goat-guide.webp'; // V0.9.7.1: un solo ritratto di THE GOAT, riusato per il capitolo dedicato nella Guida
const GOAT_HELMET_FERRARI_SRC = 'assets/goat/goat-helmet-ferrari.png'; // V0.9.7.6: casco rosso Ferrari, layer dedicato SOLO per THE GOAT nell'auto in gara
// restituisce un <img> con la bandiera SVG; usare SOLO in contesti HTML (mai dentro un <option>,
// che non puo' contenere immagini - per quel caso specifico vedi flagEmoji() sotto).
function flag(country){
  if(!country) return '<span class="flag-ico flag-ico-unknown" aria-hidden="true">🏳️</span>';
  return `<img class="flag-ico" src="assets/flags/${slugify(country)}.svg" alt="" title="${nationLabel(country)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'flag-ico flag-ico-unknown',textContent:'🏳️'}))">`;
}
// versione testuale (emoji), da usare SOLO dove l'HTML non e' permesso: <option>, attributi title/alt, ecc.
function flagEmoji(country){ return COUNTRY_FLAG[country] || '🏳️'; }
function displayArea(area){
  const map = { 'Motore':t('comp_engine'), 'Telaio':t('comp_chassis'), 'Aerodinamica':t('comp_aero'), 'Gomme':t('comp_tires'), 'Strategia':t('comp_strategist'), 'Piloti':t('comp_driver1') };
  return map[area] || area;
}
function teamFlag(teamId){
  if(teamId==='PLAYER') return state.team && state.team.nation ? flag(state.team.nation) : (state.team && state.team.pilotMain ? flag(state.team.pilotMain.naz) : '');
  const ai = state.aiTeams.find(t=>t.id===teamId);
  return ai ? flag(ai.paese) : '';
}

// Emoji per categoria di evento (pioggia, degrado gomme, sorpassi, safety car, ecc.)
const EVENT_EMOJI = {
  'Meteo':'🌧️', 'Incidente':'💥', 'Tecnico':'🔧', 'Strategia':'🧠',
  'Prestazione':'⚡', 'Direzione gara':'🚩', 'Narrativo':'✨'
};
const EMOJI_RAIN = '🌧️', EMOJI_TIRE = '🛞', EMOJI_OVERTAKE = '🔀', EMOJI_SAFETYCAR = '🚨', EMOJI_FLAG_CHECKERED = '🏁';

const CAR_RARITY_COLOR = {
  debole:'#6FD62F', discreto:'#22DCDC', intermedio:'#1892F5', ottimo:'#1D67EB',
  eccellente:'#EB3488', legendary:'#F7B800', immortal:'#B143F3'
};
const CAR_RARITY_LABEL = {
  debole:'DEBOLE', discreto:'DISCRETO', intermedio:'INTERMEDIO', ottimo:'OTTIMO',
  eccellente:'ECCELLENTE', legendary:'LEGENDARY', immortal:'IMMORTAL'
};
function ratingBandKey(rating){
  if(rating>=100) return 'immortal';
  if(rating>=95) return 'legendary';
  if(rating>=90) return 'eccellente';
  if(rating>=80) return 'ottimo';
  if(rating>=70) return 'intermedio';
  if(rating>=60) return 'discreto';
  return 'debole';
}
function ratingBandColor(rating){ return CAR_RARITY_COLOR[ratingBandKey(rating)]; }
function carLayerSrc(band, layer){ return `assets/cars/${band}_${layer}.png`; }

/* ============================================================
   V0.9.7.8.4 — GARAGE / LIVREE
   10 pattern bianchi disegnati via canvas (mai un colore diverso dal bianco sopra il colore di
   fascia del telaio, come deciso), sbloccati permanentemente completando un obiettivo specifico,
   applicati a tutte le run successive una volta scelti nel Garage.
   ============================================================ */
const RATING_BANDS_ORDER = ['debole','discreto','intermedio','ottimo','eccellente','legendary','immortal'];

// Ogni draw fn riceve un CanvasRenderingContext2D gia' preparato con globalCompositeOperation
// 'source-atop' (quindi tutto cio' che disegniamo appare SOLO dove il telaio e' gia' opaco) e le
// dimensioni W,H del canvas (= dimensioni native dell'asset telaio, niente scaling qui).
const LIVERY_PATTERNS = [
  { id:'scacchiera', nome:'Scacchiera', achievementId:'prima-vittoria', draw:(ctx,W,H)=>{
    const cell = H/6;
    for(let yi=0; yi<7; yi++) for(let xi=0; xi<Math.ceil(W/cell)+2; xi++){
      if((xi+yi)%2===0) ctx.fillRect(xi*cell, yi*cell, cell, cell);
    }
  }},
  { id:'pois', nome:'Pois', achievementId:'underdog', draw:(ctx,W,H)=>{
    const step = H*0.32, r = H*0.11;
    for(let y=step*0.4; y<H+step; y+=step){
      for(let x=step*0.4; x<W+step; x+=step){
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      }
    }
  }},
  { id:'strisce-centrali', nome:'Strisce Centrali', achievementId:'sul-podio', draw:(ctx,W,H)=>{
    const sw = W*0.09, cx = W/2;
    ctx.fillRect(cx-sw*1.6, 0, sw*1.1, H);
    ctx.fillRect(cx+sw*0.5, 0, sw*1.1, H);
  }},
  { id:'meta-e-meta', nome:'Metà e Metà', achievementId:'domatore-del-caos', draw:(ctx,W,H)=>{
    ctx.fillRect(W*0.52, 0, W*0.48, H);
  }},
  { id:'diagonali', nome:'Diagonali Veloci', achievementId:'la-grande-rimonta', draw:(ctx,W,H)=>{
    const step = W*0.11;
    for(let x=-H; x<W; x+=step){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x+step*0.55,0);
      ctx.lineTo(x+step*0.55-H*0.6,H); ctx.lineTo(x-H*0.6,H);
      ctx.closePath(); ctx.fill();
    }
  }},
  { id:'frecce', nome:'Frecce Racing', achievementId:'ripartenza-perfetta', draw:(ctx,W,H)=>{
    const step = W*0.16;
    for(let x=0; x<W+step; x+=step){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x+step*0.4,H*0.5); ctx.lineTo(x,H); ctx.lineTo(x-step*0.35,H*0.5);
      ctx.closePath(); ctx.fill();
    }
  }},
  { id:'fiamma', nome:'Fiamma', achievementId:'leggenda-al-volante', draw:(ctx,W,H)=>{
    ctx.beginPath();
    let first=true;
    for(let t=0;t<=100;t+=4){ const tt=t/100; const x=W*0.15+tt*W*0.75; const y=H*0.5+Math.sin(tt*Math.PI)*H*0.42*(1-tt*0.3);
      if(first){ctx.moveTo(x,y); first=false;} else ctx.lineTo(x,y); }
    for(let t=100;t>=0;t-=4){ const tt=t/100; const x=W*0.15+tt*W*0.75; const y=H*0.5-Math.sin(tt*Math.PI)*H*0.18*(1-tt*0.5);
      ctx.lineTo(x,y); }
    ctx.closePath(); ctx.fill();
  }},
  { id:'contorno-spesso', nome:'Contorno Spesso', achievementId:'collezionista-assoluto', draw:(ctx,W,H,srcCanvas)=>{
    // bordo spesso: disegna il telaio dilatato (piu' volte spostato di 1px in ogni direzione) in bianco,
    // cosi' resta visibile solo il contorno una volta ri-clippato dal source-atop del chiamante
    const off = Math.max(1, Math.round(H*0.05));
    for(let dx=-off; dx<=off; dx++) for(let dy=-off; dy<=off; dy++){
      if(dx===0 && dy===0) continue;
      ctx.drawImage(srcCanvas, dx, dy);
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
  }},
  { id:'striscia-laterale', nome:'Doppia Striscia Laterale', achievementId:'senza-rete-di-sicurezza', draw:(ctx,W,H)=>{
    ctx.fillRect(0, H*0.32, W, H*0.09);
    ctx.fillRect(0, H*0.52, W, H*0.09);
  }},
  { id:'fulmine', nome:'Fulmine', achievementId:'il-mito-assoluto', draw:(ctx,W,H)=>{
    ctx.beginPath();
    ctx.moveTo(W*0.62,0); ctx.lineTo(W*0.42,H*0.45); ctx.lineTo(W*0.55,H*0.45); ctx.lineTo(W*0.35,H);
    ctx.lineTo(W*0.58,H*0.55); ctx.lineTo(W*0.45,H*0.55);
    ctx.closePath(); ctx.fill();
  }},
];
function findLiveryPattern(id){ return LIVERY_PATTERNS.find(p=>p.id===id); }

const LIVERY_SAVE_KEY = 'racingDynastyLiveryV1';
function loadLiveryData(){
  try{
    const raw = localStorage.getItem(LIVERY_SAVE_KEY);
    return raw ? { unlockedPatternIds:[], selectedPatternId:null, selectedColor:'#FF0000', ...JSON.parse(raw) } : { unlockedPatternIds:[], selectedPatternId:null, selectedColor:'#FF0000' };
  }catch(e){ return { unlockedPatternIds:[], selectedPatternId:null, selectedColor:'#FF0000' }; }
}
let liveryData = loadLiveryData();
function saveLiveryData(){
  try{ localStorage.setItem(LIVERY_SAVE_KEY, JSON.stringify(liveryData)); }catch(e){ /* ignorato */ }
}
function isLiveryPatternUnlocked(id){ return liveryData.unlockedPatternIds.includes(id); }

// Cache dei telai "patchati" col pattern+colore attivo, una voce per fascia (7 in tutto per
// combinazione pattern+colore). Generata al volo la prima volta che serve, poi riusata: sono
// operazioni su canvas minuscoli (139x43), costano nulla, non serve pre-generarle tutte all'avvio.
const __liveryCanvasCache = {}; // key: `${patternId}:${band}:${color}` -> dataURL
function getPatternedChassisSrc(band, patternId, color){
  const col = color || liveryData.selectedColor || '#FFFFFF';
  const key = patternId+':'+band+':'+col;
  if(__liveryCanvasCache[key]) return __liveryCanvasCache[key];
  const pattern = findLiveryPattern(patternId);
  if(!pattern) return carLayerSrc(band,'chassis');
  // V0.9.7.8.11: con percorsi file (non piu' data-URI) il caricamento dell'immagine e' VERAMENTE
  // asincrono — non possiamo piu' contare su naturalWidth gia' pronto in sincrono. Ritorniamo subito
  // il telaio semplice (nessun salto visivo grave, e' solo per un istante) e disegniamo il pattern
  // non appena l'immagine e' decodificata, salvando in cache e chiedendo un nuovo render.
  const img = new Image();
  img.onload = ()=>{
    try{
      const W = img.naturalWidth || 139, H = img.naturalHeight || 43;
      const srcCanvas = document.createElement('canvas'); srcCanvas.width=W; srcCanvas.height=H;
      srcCanvas.getContext('2d').drawImage(img,0,0);
      const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(srcCanvas,0,0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = col;
      pattern.draw(ctx, W, H, srcCanvas);
      __liveryCanvasCache[key] = canvas.toDataURL('image/png');
      if(typeof render==='function') render();
    }catch(e){ /* ignorato: restera' il telaio semplice */ }
  };
  img.src = carLayerSrc(band,'chassis');
  return carLayerSrc(band,'chassis');
}

function lightenHex(hex, amt){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  let r = (num>>16)+amt, g=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.min(255,Math.max(0,r)); g=Math.min(255,Math.max(0,g)); b=Math.min(255,Math.max(0,b));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}

// Lampadina dello stratega: pixel-art disegnata a blocchi (nessun asset esterno necessario),
// con un piccolo riflesso piu' chiaro per dare un po' di carattere, colorata secondo la
// rarita' dello stratega. Condivisa da entrambe le vetture (spec 0.7 punto 3 + V0.7.1).
const LIGHTBULB_PIXELS = [
  "..XXXXX..",
  ".XHXXXXX.",
  "XHXXXXXXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  ".XXXXXXX.",
  "..XXXXX..",
  "...XXX...",
  "..XXXXX..",
  "...XXX...",
  "..XXXXX.."
];
function lightbulbSVG(color){
  const rows = LIGHTBULB_PIXELS.length, cols = LIGHTBULB_PIXELS[0].length;
  const hi = lightenHex(color, 90);
  let rects = '';
  LIGHTBULB_PIXELS.forEach((row,y)=>{
    for(let x=0;x<row.length;x++){
      const ch = row[x];
      if(ch==='X') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      else if(ch==='H') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hi}"/>`;
    }
  });
  return `<svg viewBox="0 0 ${cols} ${rows}" width="100%" height="100%" style="image-rendering:pixelated;shape-rendering:crispEdges;display:block;">${rects}</svg>`;
}

// Composizione della monoposto: 4 layer allineati sullo stesso canvas (chassis/aero/tires/helmet,
// ognuno colorato secondo la fascia di rating del componente corrispondente) + numero sovrapposto
// (colore motore) + lampadina stratega separata (spec 0.7 punto 2).
function carVisualHTML(pilot, comp, carNumber, previewPatternId, previewColor){
  const chassisBand = ratingBandKey(comp.telaio.rating);
  const aeroBand = ratingBandKey(comp.aero.rating);
  const tiresBand = ratingBandKey(comp.gomme.rating);
  const helmetBand = ratingBandKey(pilot.rating);
  const isGoat = pilot && pilot.nome==='THE GOAT'; // V0.9.7.6: casco sempre rosso Ferrari, mai il colore di fascia
  const helmetSrc = isGoat ? GOAT_HELMET_FERRARI_SRC : carLayerSrc(helmetBand,'helmet');
  const numberBand = ratingBandKey(comp.motore.rating);
  const digitsHTML = String(carNumber).split('').map(ch=>
    `<img class="car-digit" src="assets/digits/${numberBand}_${/^[a-zA-Z0-9]$/.test(ch)?ch:'char'+ch.charCodeAt(0)}.png" alt="${ch}">`
  ).join('');
  // V0.9.7.8.5: pattern livrea — previewPatternId/previewColor per l'anteprima sandbox del Garage
  // (non ancora salvati), altrimenti il pattern gia' applicato in modo permanente da liveryData.
  const activePatternId = previewPatternId!==undefined ? previewPatternId : liveryData.selectedPatternId;
  const activeColor = previewColor!==undefined ? previewColor : liveryData.selectedColor;
  const chassisSrc = activePatternId ? getPatternedChassisSrc(chassisBand, activePatternId, activeColor) : carLayerSrc(chassisBand,'chassis');

  return `
  <div class="car-canvas">
    <img class="car-layer" src="${chassisSrc}" alt="">
    <img class="car-layer" src="${carLayerSrc(aeroBand,'aero')}" alt="">
    <img class="car-layer" src="${carLayerSrc(tiresBand,'tires')}" alt="">
    <img class="car-layer" src="${helmetSrc}" alt="">
    <div class="car-number-wrap">
      <div class="car-number-plate"></div>
      <div class="car-number-digits">${digitsHTML}</div>
    </div>
  </div>`;
}

function pregaraCarPanelHTML(pilot, carNumber, comp, gridPosNum){
  const band = ratingBandKey(pilot.rating);
  const color = CAR_RARITY_COLOR[band];
  return `
  <div class="pregara-panel">
    ${carVisualHTML(pilot, comp, carNumber)}
    <div class="pregara-info">
      <div class="pregara-name">${flag(pilot.naz)} ${pilot.nome}</div>
      <div class="pregara-meta">
        <span class="rarity-tag" style="border:1px solid ${color};color:${color};background:transparent;">${CAR_RARITY_LABEL[band]}</span>
        <span class="mono" style="color:${color};">${pilot.rating} RATING</span>
        ${gridPosNum!=null ? `<span class="dim">Griglia P${gridPosNum}</span>` : ''}
      </div>
    </div>
  </div>`;
}
function pregaraLegendRow(label, item){
  const color = ratingBandColor(item.rating);
  return `<div class="legend-row"><span class="legend-swatch" style="background:${color};"></span><span class="legend-label">${label}</span><span class="legend-name dim">${item.nome}</span><span class="legend-rating mono" style="color:${color};">${item.rating}</span></div>`;
}
function pregaraSharedComponentsHTML(comp){
  const stratColor = ratingBandColor(comp.stratega.rating);
  return `
  <div class="panel pregara-shared">
    <div class="panel-title"><h3 class="hdr">Componenti di Squadra</h3><span class="dim mono" style="font-size:10px;">CONDIVISI DA ENTRAMBI I PILOTI</span></div>
    <div class="pregara-shared-body">
      <div class="pregara-legend">
        ${pregaraLegendRow('MOTORE', comp.motore)}
        ${pregaraLegendRow('TELAIO', comp.telaio)}
        ${pregaraLegendRow('AERODINAMICA', comp.aero)}
        ${pregaraLegendRow('GOMME', comp.gomme)}
        ${pregaraLegendRow('TEAM PRINCIPAL', comp.stratega)}
      </div>
      <div class="car-bulb" title="Team Principal: ${comp.stratega.nome} — ${comp.stratega.rating} RATING">
        ${lightbulbSVG(stratColor)}
        <div class="bulb-rating mono" style="color:${stratColor};">${comp.stratega.rating}</div>
      </div>
    </div>
    ${semaforoWidgetHTML()}
  </div>`;
}

function startingGridSectionHTML(gridOrder, gridPos){
  const relevantTeamIds = new Set(['PLAYER', ...(state.rivals||[])]);
  const rows = gridOrder.map((slotKey,idx)=>{
    const pos = idx+1;
    let teamId, driverName, naz, carNumber;
    if(slotKey.startsWith('PLAYER')){
      teamId = 'PLAYER';
      const isP1 = slotKey==='PLAYER-1';
      const pilot = isP1 ? state.team.pilotMain : state.team.pilotSecond;
      driverName = pilot.nome; naz = pilot.naz;
      const g = state.grid.find(g=>g.slotKey===slotKey);
      carNumber = g ? g.carNumber : '';
    } else {
      teamId = slotKey.slice(0, slotKey.lastIndexOf('-'));
      const t = state.aiTeams.find(x=>x.id===teamId);
      if(!t) return '';
      const role = slotKey.endsWith('-0') ? 0 : 1;
      const pilot = t.drivers[role];
      driverName = pilot.nome; naz = pilot.naz;
      const g = state.grid.find(g=>g.slotKey===slotKey);
      carNumber = g ? g.carNumber : '';
    }
    if(!relevantTeamIds.has(teamId)) return '';
    const isPlayer = teamId==='PLAYER';
    const isRival = !isPlayer && isRivalTeam(teamId);
    const badge = isPlayer ? ' <span class="qtc-badge">TU</span>' : (isRival ? ' <span class="qtc-badge rival">RIVALE</span>' : '');
    return `<div class="grid-pos-row ${isPlayer?'me':''}">
      <div class="grid-pos-num">P${pos}</div>
      <div class="grid-pos-carnum mono">#${carNumber}</div>
      <div class="grid-pos-name">${flag(naz)} ${driverName}${badge}</div>
      <div class="dim" style="font-size:11px;">${teamFlag(teamId)} ${isPlayer?teamDisplayName():(state.aiTeams.find(x=>x.id===teamId)||{}).nome||''}</div>
    </div>`;
  }).filter(Boolean).join('');
  return `<div class="panel">
    <div class="panel-title"><h3 class="hdr">Griglia di Partenza</h3><span class="dim mono" style="font-size:10px;">TU E LE RIVALI</span></div>
    <div class="grid-pos-list">${rows}</div>
  </div>`;
}

function renderPregara(){
  const t = state.team;
  const circuit = state.calendar[state.raceIndex];
  const q = state.pendingQualifying;
  const gridP1 = q.gridPos['PLAYER-1'];
  const gridP2 = q.gridPos['PLAYER-2'];
  const compShared = { motore:t.motore, telaio:t.telaio, aero:t.aero, gomme:t.gomme, stratega:t.stratega };
  const carNum1 = state.grid.find(g=>g.slotKey==='PLAYER-1').carNumber;
  const carNum2 = state.grid.find(g=>g.slotKey==='PLAYER-2').carNumber;

  // V0.9.7.8.9: le 2-3 metriche davvero decisive per questa schermata, sempre visibili e in grande —
  // il resto (breakdown dettagliato dei 5 componenti, griglia completa) va dietro un accordion
  // collassato di default. Nessuna informazione persa, solo non piu' il default per chi apre la schermata.
  // Rework: righe verticali (icona | etichetta+sottotitolo | valore) invece di 3 colonne strette,
  // cosi' un nome rivale lungo non spinge piu' il numero fuori schermo su telefono.
  const teamRating = Math.round(computeTeamStrength(t));
  const weatherPct = circuit.probpioggia||0;
  const isWetForecast = circuit.clima==='Piovoso';
  const weatherLabel = isWetForecast ? window.t('pg_rain_expected') : (weatherPct>=40 ? window.t('pg_rain_risk', weatherPct) : window.t('pg_dry_track'));
  const weatherIcon = isWetForecast||weatherPct>=40 ? '🌧️' : '☀️';
  const mainRivalId = (state.rivals||[])[0];
  const mainRivalTeam = mainRivalId ? state.aiTeams.find(x=>x.id===mainRivalId) : null;
  const rivalRowHTML = mainRivalTeam
    ? (()=>{ const gap = Math.round(teamRating - aiTeamStrength(mainRivalTeam));
        const gapColor = gap>=0 ? '#4CD97B' : 'var(--danger)';
        return `<div class="pregara-decisive-row">
          <div class="pregara-decisive-icon">⚔️</div>
          <div class="pregara-decisive-text"><div class="pregara-decisive-label">${window.t('pg_rating_gap')}</div><div class="pregara-decisive-sublabel">${mainRivalTeam.nome}</div></div>
          <div class="pregara-decisive-value" style="color:${gapColor};">${gap>=0?'+':''}${gap} <span style="font-size:12px;font-weight:700;">pt</span></div>
        </div>`;
      })()
    : `<div class="pregara-decisive-row">
        <div class="pregara-decisive-icon">⚔️</div>
        <div class="pregara-decisive-text"><div class="pregara-decisive-label">${window.t('pg_main_rival')}</div></div>
        <div class="pregara-decisive-value dim" style="font-size:13px;">${window.t('pg_none_yet')}</div>
      </div>`;

  app.innerHTML = `
  <div class="pregara-screen">
    ${topbarHTML()}
    <div class="panel">
      <div class="eyebrow">${window.t('pg_lineup', teamFlag('PLAYER')+' '+teamDisplayName())}</div>
      <h2 class="hdr" style="font-size:24px;">${flag(circuit.paese)} ${circuit.nome} ${circuitStatusBadgeHTML(circuit.nome)}</h2>
    </div>
    <div class="panel pregara-decisive-panel">
      <div class="pregara-decisive-row">
        <div class="pregara-decisive-icon">📊</div>
        <div class="pregara-decisive-text"><div class="pregara-decisive-label">${window.t('pg_team_rating')}</div></div>
        <div class="pregara-decisive-value">${teamRating}</div>
      </div>
      <div class="pregara-decisive-row">
        <div class="pregara-decisive-icon">${weatherIcon}</div>
        <div class="pregara-decisive-text"><div class="pregara-decisive-label">${window.t('pg_weather_forecast')}</div></div>
        <div class="pregara-decisive-value" style="font-size:16px;">${weatherLabel}</div>
      </div>
      ${rivalRowHTML}
    </div>
    <div class="btnrow"><button class="primary" data-action="start-race-live">${window.t('pg_go_to_race')}</button></div>
    <div class="grid grid-2 pregara-grid">
      ${pregaraCarPanelHTML(t.pilotMain, carNum1, compShared, null)}
      ${pregaraCarPanelHTML(t.pilotSecond, carNum2, compShared, null)}
    </div>
    <div class="panel">
      <button type="button" class="pregara-accordion-toggle" id="pregaraDetailsToggle">
        <span>${window.t('pg_details_toggle')}</span>
        <span id="pregaraDetailsChevron">▾</span>
      </button>
      <div id="pregaraDetailsBody" style="display:none;">
        ${pregaraSharedComponentsHTML(compShared)}
        ${startingGridSectionHTML(q.gridOrder, q.gridPos)}
      </div>
    </div>
  </div>
  `;
  bindActions();
  const toggle = document.getElementById('pregaraDetailsToggle');
  const body = document.getElementById('pregaraDetailsBody');
  const chevron = document.getElementById('pregaraDetailsChevron');
  if(toggle){
    toggle.addEventListener('click', ()=>{
      const open = body.style.display!=='none';
      body.style.display = open ? 'none' : 'block';
      chevron.textContent = open ? '▾' : '▴';
      playSfx('ui_click');
    });
  }
}

/* ============================================================
   RENDERING
   ============================================================ */
function render(){
  // V0.9.7.1: l'overlay di festeggiamento (fuochi/coriandoli di fine stagione) vive fuori dal
  // normale ciclo di render (appeso a document.body, con animazioni CSS infinite) — se il giocatore
  // lascia lo schermo di fine stagione con QUALSIASI navigazione, va rimosso qui, in un unico punto
  // centrale, invece di doverlo ricordare ad ogni singolo percorso di uscita possibile.
  if(state && state.phase!=='season_end'){
    const fx = document.getElementById('celebrationFx');
    if(fx) fx.remove();
  }
  renderInner();
  if(typeof updateSidebarVisibility==='function') updateSidebarVisibility();
  showGoatRevealIfPending();
  updateMusicForCurrentPhase(); // V0.9.7.8.10
  if(state && state.phase!=='title'){ fadeOutIntroCarAudioIfNeeded(); removeIntroOverlayIfPresent(); } // V0.9.7.8.15 + V0.9.7.9.4
  saveGame();
}
// V0.9.7.6: rivelazione speciale quando THE GOAT entra in squadra (draft o scouting) — overlay a
// parte, fuori dal normale innerHTML dello schermo, cosi' resta visibile sopra qualunque schermata
// e si chiude solo quando il giocatore lo conferma esplicitamente.
function showGoatRevealIfPending(){
  const existing = document.getElementById('goatRevealOverlay');
  if(!state || !state.pendingGoatReveal){ if(existing) existing.remove(); return; }
  if(existing) return; // gia' mostrato, non ricrearlo ad ogni render
  const overlay = document.createElement('div');
  overlay.id = 'goatRevealOverlay';
  overlay.className = 'goat-reveal-overlay';
  const streaks = Array.from({length:12}).map((_,i)=>{
    const top = 5 + Math.random()*90;
    const width = 100 + Math.random()*220;
    const dur = (0.7+Math.random()*0.6).toFixed(2);
    const del = (Math.random()*1.2).toFixed(2);
    const angle = (-3+Math.random()*6).toFixed(1);
    return `<div class="goat-reveal-streak" style="top:${top}%;width:${width}px;--dur:${dur}s;--del:${del}s;transform:rotate(${angle}deg);"></div>`;
  }).join('');
  const flames = [18,50,82].map(leftPct=>
    `<div class="goat-reveal-flame" style="left:${leftPct}%; animation-delay:${(leftPct/100).toFixed(2)}s;"></div>`
  ).join('');
  overlay.innerHTML = `
    <div class="goat-reveal-streaks">${streaks}${flames}</div>
    <img class="goat-reveal-portrait" src="${GOAT_GUIDE_IMG_SRC}" alt="THE GOAT">
    <div class="goat-reveal-title">CON THE GOAT È TUTTO PIÙ SEMPLICE</div>
    <div class="goat-reveal-subtitle">Il pilota più forte della storia è appena entrato nella tua scuderia. Rating 100, zero compromessi.</div>
    <div class="goat-reveal-tagline">Non si costruisce un campione così. Nasce una volta ogni mille storie — e questa è la tua.</div>
    <button type="button" class="goat-reveal-btn" id="goatRevealCloseBtn">Andiamo a vincere →</button>
  `;
  document.body.appendChild(overlay);
  document.getElementById('goatRevealCloseBtn').addEventListener('click', ()=>{
    state.pendingGoatReveal = false;
    overlay.remove();
    render();
  });
}
function renderInner(){
  if(state.phase==='race_live' && state.live && state.live.domReady) return updateLiveBoard();
  window.scrollTo(0,0);
  if(state.phase==='race_live') return renderRaceLiveInit();
  if(state.phase==='studio-splash') return renderStudioSplash();
  if(state.phase==='lang-select') return renderLangSelect();
  if(state.phase==='title') return renderTitle();
  if(state.phase==='difficulty') return renderDifficulty();
  if(state.phase==='season-length') return renderSeasonLength();
  if(state.phase==='naming') return renderNaming();
  if(state.phase==='mode-select') return renderModeSelect();
  if(state.phase==='driver-creation') return renderDriverCreation();
  if(state.phase==='driver-creation-done') return renderDriverCreationDone();
  if(state.phase==='draft') return renderDraft();
  if(state.phase==='hub') return renderHub();
  if(state.phase==='pregara') return renderPregara();
  if(state.phase==='race_result') return renderRaceResult();
  if(state.phase==='pitlane') return renderPitlane();
  if(state.phase==='rival-announce') return renderRivalAnnounce();
  if(state.phase==='trophy-room') return renderTrophyRoom();
  if(state.phase==='driver-trophy-room') return renderDriverTrophyRoom();
  if(state.phase==='museum-dynasty') return renderMuseumDynasty();
  if(state.phase==='garage') return renderGarage();
  if(state.phase==='sponsor-choice') return renderSponsorChoice();
  if(state.phase==='midseason-swap') return renderMidseasonSwap();
  if(state.phase==='upgrade_suspense') return renderUpgradeSuspense();
  if(state.phase==='upgrade_result') return renderUpgradeResult();
  if(state.phase==='start_lights') return renderStartLights();
  if(state.phase==='pitlane_confirm') return renderPitlaneConfirm();
  if(state.phase==='season_end') return renderSeasonEnd();
}

function topbarHTML(){
  if(!state.team.pilotMain) return '';
  const dstd = driverStandingsSorted();
  const cstd = constructorStandingsSorted();
  const p1Pos = dstd.findIndex(d=>d.slotKey==='PLAYER-1' && !d.isFormer)+1;
  const p2Pos = dstd.findIndex(d=>d.slotKey==='PLAYER-2' && !d.isFormer)+1;
  const bestDriverPos = Math.min(p1Pos||99, p2Pos||99);
  const constructorPos = cstd.findIndex(c=>c.teamId==='PLAYER')+1;
  const sponsorIcon = { title:'👑', tecnico:'🔧', secondario:'🤝' };
  const sponsorHTML = state.sponsor
    ? `<div class="hud-item"><div class="hud-label">${t('hud_sponsor')}</div><div class="hud-value" style="${state.sponsor.tier==='title' && state.sponsor.active===false ? 'color:var(--danger);' : ''}" title="${state.sponsor.nome}">${sponsorIcon[state.sponsor.tier]}${state.sponsor.tier==='title' && state.sponsor.active===false ? ' ('+t('sponsor_suspended')+')' : ''}</div></div>`
    : '';
  return `
  <div class="topbar">
    <div class="brand hdr">RACING DYNASTY<small>Roguelike GP Manager — ${GAME_VERSION} · ${DIFFICULTY_LABEL[state.difficulty]}</small></div>
    <div class="hud">
      <div class="hud-item"><div class="hud-label">${t('hud_reroll')}</div><div class="hud-value">${state.rerollsLeft}/${state.rerollsTotal}</div></div>
      <div class="hud-item"><div class="hud-label">${t('hud_budget')}</div><div class="hud-value amber">${fmtM(state.budget)}</div></div>
      ${sponsorHTML}
      <div class="hud-item"><div class="hud-label">${t('hud_race')}</div><div class="hud-value">${Math.min(state.raceIndex+1,state.calendar.length)}/${state.calendar.length}</div></div>
      <div class="hud-item"><div class="hud-label">${t('hud_best_driver')}</div><div class="hud-value cyan">P${bestDriverPos||'-'}</div></div>
      <div class="hud-item"><div class="hud-label">${t('hud_constructors')}</div><div class="hud-value cyan">P${constructorPos||'-'}</div></div>
    </div>
  </div>`;
}

// V0.9.7.8: lista curata per il pulsante "Ispira la scuderia" nella schermata di naming.
// NOTA: alcuni nomi della lista originale fornita da Gio sono stati sostituiti perche' troppo
// simili (stessa prima parola o forte assonanza) a una delle 30 scuderie avversarie generate in
// data.json (es. "Apex Dynamics", "Vortex Dynamics", "Iron Performance", "Valkyrie GP", ecc.) —
// sostituiti con un nome nuovo nello stesso stile, stessa nazione originale.
const TEAM_INSPIRATION = [
  {nome:'Meridian Dominion Racing', naz:'Regno Unito'},
  {nome:'Wraith Competition', naz:'Francia'},
  {nome:'Lumen Velocity', naz:'Italia'},
  {nome:'Colossus Motorsport', naz:'Germania'},
  {nome:'Blackline Dynamics', naz:'Stati Uniti'},
  {nome:'Helix Grand Prix', naz:'Svizzera'},
  {nome:'Scarlet Arrow Racing', naz:'Giappone'},
  {nome:'Frostpeak Motorsport', naz:'Finlandia'},
  {nome:'Steelcrest Racing', naz:'Germania'},
  {nome:'Equinox Velocity', naz:'Spagna'},
  {nome:'Falcon Edge Motorsport', naz:'Emirati Arabi Uniti'},
  {nome:'Paragon Competition', naz:'Paesi Bassi'},
  {nome:'Thunderforge Racing', naz:'Australia'},
  {nome:'Nightfall Motorsport', naz:'Regno Unito'},
  {nome:'Catalyst Prime', naz:'Giappone'},
  {nome:'Maelstrom Dynamics', naz:'Canada'},
  {nome:'Vanguard Grand Prix', naz:'Francia'},
  {nome:'Onyx Racing', naz:'Italia'},
  {nome:'Hyperion Motorsport', naz:'Grecia'},
  {nome:'Glacierline Competition', naz:'Norvegia'},
  {nome:'Halcyon Velocity', naz:'Svezia'},
  {nome:'Redshift Racing', naz:'Stati Uniti'},
  {nome:'Apogee Grand Prix', naz:'Svizzera'},
  {nome:'Graniteclaw Motorsport', naz:'Polonia'},
  {nome:'Umbra Dynamics', naz:'Corea del Sud'},
  {nome:'Stratos Racing', naz:'Grecia'},
  {nome:'Velocity Forge', naz:'Regno Unito'},
  {nome:'Emberwing Racing', naz:'Messico'},
  {nome:'Bluefire Motorsport', naz:'Francia'},
  {nome:'Radiant Crown', naz:'Singapore'},
  {nome:'Comet Surge Racing', naz:'Canada'},
  {nome:'Centurion Motorsport', naz:'Italia'},
  {nome:'Darkstar Racing', naz:'Stati Uniti'},
  {nome:'Aerion Dynamics', naz:'Belgio'},
  {nome:'Cadence Grand Prix', naz:'Giappone'},
  {nome:'Invictus Racing', naz:'Italia'},
  {nome:'Skyward Motorsport', naz:'Nuova Zelanda'},
  {nome:'Neon Falcon Racing', naz:'Corea del Sud'},
  {nome:'Altair Competition', naz:'Turchia'},
  {nome:'Rogue Velocity', naz:'Stati Uniti'},
  {nome:'Ridgefall Racing', naz:'Australia'},
  {nome:'Northstar Motorsport', naz:'Canada'},
  {nome:'Jade Serpent Racing', naz:'Cina'},
  {nome:'Horizon Dynamics', naz:'Spagna'},
  {nome:'Spectra Racing', naz:'Austria'},
  {nome:'Bastion Grand Prix', naz:'Regno Unito'},
  {nome:'Sabre Motorsport', naz:'Francia'},
  {nome:'Astral Velocity', naz:'Portogallo'},
  {nome:'Nightblade Racing', naz:'Giappone'},
  {nome:'Momentum Works', naz:'Paesi Bassi'},
  {nome:'Emberline Motorsport', naz:'Italia'},
  {nome:'Paramount Racing', naz:'Stati Uniti'},
  {nome:'Valiant Dynamics', naz:'Regno Unito'},
  {nome:'Cyclone Grand Prix', naz:'Australia'},
  {nome:'Glimmercrest Motorsport', naz:'Svizzera'},
  {nome:'Prime Velocity', naz:'Germania'},
  {nome:'Freyja Racing', naz:'Norvegia'},
  {nome:'Apollo Competition', naz:'Grecia'},
  {nome:'Dominion Works', naz:'Regno Unito'},
  {nome:'Falconspire Motorsport', naz:'Emirati Arabi Uniti'},
  {nome:'Arcadia Racing', naz:'Spagna'},
  {nome:'Cyclonic Crown', naz:'Danimarca'},
  {nome:'Blackwing Dynamics', naz:'Stati Uniti'},
  {nome:'Ignition Grand Prix', naz:'Brasile'},
  {nome:'Stellar Motorsport', naz:'Giappone'},
  {nome:'Imperion Racing', naz:'Italia'},
  {nome:'Thunderpeak Dynamics', naz:'Austria'},
  {nome:'Velocity Union', naz:'Belgio'},
  {nome:'Vermillion Horizon', naz:'Cina'},
  {nome:'Anvil Forge', naz:'Germania'},
  {nome:'Firecrest Motorsport', naz:'Messico'},
  {nome:'Cardinal Grand Prix', naz:'Portogallo'},
  {nome:'Shadowline Racing', naz:'Regno Unito'},
  {nome:'Polaris Dynamics', naz:'Finlandia'},
  {nome:'Nimbus Circuit', naz:'Corea del Sud'},
  {nome:'Crest Vanguard', naz:'Francia'},
  {nome:'Skybreaker Motorsport', naz:'Nuova Zelanda'},
  {nome:'Nightwave Racing', naz:'Singapore'},
  {nome:'Coalfire Dynamics', naz:'Polonia'},
  {nome:'Prismcrest Grand Prix', naz:'Svizzera'},
  {nome:'Radiant Wolf Racing', naz:'Svezia'},
  {nome:'Hyperdrift Motorsport', naz:'Giappone'},
  {nome:'Trident Prime Racing', naz:'Stati Uniti'},
  {nome:'Talonstrike Motorsport', naz:'Australia'},
  {nome:'Duskforge', naz:'Germania'},
  {nome:'Crown Velocity', naz:'Regno Unito'},
  {nome:'Stratosphere Grand Prix', naz:'Sudafrica'},
  {nome:'Argent Dynamics', naz:'Argentina'},
  {nome:'Solstice Racing', naz:'Brasile'},
  {nome:'Thunderline Motorsport', naz:'Canada'},
  {nome:'Dark Horizon Racing', naz:'Spagna'},
  {nome:'Boreal Forge', naz:'Finlandia'},
  {nome:'Whirlwind Crown', naz:'Paesi Bassi'},
  {nome:'Starforge Competition', naz:'Repubblica Ceca'},
  {nome:'Prism Horizon', naz:'Singapore'},
  {nome:'Falcon Dominion', naz:'Emirati Arabi Uniti'},
  {nome:'Stellar Vanguard', naz:'Francia'},
  {nome:'Squall Arrow', naz:'Irlanda'},
  {nome:'Basalt Velocity', naz:'Italia'},
  {nome:'Summit Works', naz:'Germania'},
];
function renderModeSelect(){
  const circuits = DATA.circuiti;
  const total = circuits.length;
  const racedCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].raced>0).length;
  const wonCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].won>0).length;
  const driverRacedCount = circuits.filter(c=> driverTrophyData[c.nome] && driverTrophyData[c.nome].raced>0).length;
  const driverWonCount = circuits.filter(c=> driverTrophyData[c.nome] && driverTrophyData[c.nome].won>0).length;
  const totalPiloti = DATA.piloti.length;
  const totalComponenti = DATA.motori.length + DATA.telai.length + DATA.aero.length + DATA.gomme.length + DATA.strategi.length;
  const unlockedAll = Object.keys(museumData.piloti).length + Object.keys(museumData.componenti).length;
  const totalAll = totalPiloti + totalComponenti;
  const museumPct = totalAll>0 ? Math.round(unlockedAll/totalAll*100) : 0;

  app.innerHTML = `
  <div class="panel">
    <div class="eyebrow">${t('diff_new_career')}</div>
    <h2 class="hdr" style="font-size:26px;">${t('mode_select_title')}</h2>
    <div class="dim" style="font-size:13px;margin-top:6px;">${t('mode_select_subtitle')}</div>
  </div>
  <div class="grid grid-2">
    <div class="card pickable" data-rarity="Rare" data-action="go-to-season-length">
      <span class="rarity-tag" data-rarity="Rare">🏎️ ${t('mode_select_team')}</span>
      <div class="ability" style="font-size:14px;margin-top:8px;">${t('mode_select_team_desc')}</div>
      <div class="card-tap-hint">${t('mode_select_team_hint')}</div>
    </div>
    <div class="card pickable" data-rarity="Legendary" data-action="go-to-driver-creation">
      <span class="rarity-tag" data-rarity="Legendary">🏁 ${t('mode_select_driver')}</span>
      <div class="ability" style="font-size:14px;margin-top:8px;">${t('mode_select_driver_desc')}</div>
      <div class="card-tap-hint">${t('mode_select_driver_hint')}</div>
    </div>
  </div>
  <div class="card pickable trophy-room-card" data-rarity="Legendary" data-action="open-trophy-room">
    <span class="rarity-tag" data-rarity="Legendary">🏆 ${t('sl_trophy_room')} — ${t('mode_select_team')}</span>
    <div class="trophy-room-card-body">
      <div class="trophy-room-card-stats">
        <div class="trophy-stat"><div class="trophy-stat-value">${racedCount}/${total}</div><div class="trophy-stat-label">${t('sl_raced')}</div></div>
        <div class="trophy-stat"><div class="trophy-stat-value" style="color:var(--legendary);">${wonCount}/${total}</div><div class="trophy-stat-label">${t('sl_won')}</div></div>
      </div>
    </div>
    <div class="card-tap-hint">${t('sl_trophy_hint')}</div>
  </div>
  <div class="card pickable trophy-room-card" data-rarity="Legendary" data-action="open-driver-trophy-room">
    <span class="rarity-tag" data-rarity="Legendary">🏆 ${t('sl_trophy_room')} — ${t('mode_select_driver')}</span>
    <div class="trophy-room-card-body">
      <div class="trophy-room-card-stats">
        <div class="trophy-stat"><div class="trophy-stat-value">${driverRacedCount}/${total}</div><div class="trophy-stat-label">${t('sl_raced')}</div></div>
        <div class="trophy-stat"><div class="trophy-stat-value" style="color:var(--legendary);">${driverWonCount}/${total}</div><div class="trophy-stat-label">${t('sl_won')}</div></div>
      </div>
    </div>
    <div class="card-tap-hint">${t('sl_trophy_hint')}</div>
  </div>
  <div class="card pickable trophy-room-card" data-rarity="Epic" data-action="open-museum">
    <span class="rarity-tag" data-rarity="Epic">🏛️ ${t('sl_museum')} <span class="dim" style="font-size:9.5px;font-weight:700;">· ${t('museum_shared_tag')}</span></span>
    <div class="trophy-room-card-body">
      <div class="trophy-room-card-stats">
        <div class="trophy-stat"><div class="trophy-stat-value">${unlockedAll}/${totalAll}</div><div class="trophy-stat-label">${t('sl_completion')} · ${museumPct}%</div></div>
      </div>
      <div class="ability">${t('sl_museum_desc')}</div>
    </div>
    <div class="card-tap-hint">${t('sl_museum_hint')}</div>
  </div>
  `;
  bindActions();
}

// ============================================================
// V0.9.7.9.2 — CARRIERA PILOTA (punto 2/8): creazione pilota
// ============================================================

// 3 proposte casuali (archetipo + mentalita' abbinati), il giocatore ne sceglie una intera.
// Parte "acerba": in gara avra' l'effetto pieno dell'archetipo solo dopo essersi rafforzato
// giocando in modo coerente (vedi punto 7 del progetto — non ancora implementato qui).
function rollDriverStarterProfiles(){
  const archKeys = Object.keys(TRAIT_TABLE);
  const mentaKeys = Object.keys(MENTALITA_DEFS);
  const usedArch = new Set();
  const profiles = [];
  while(profiles.length<3){
    const arch = archKeys[Math.floor(rnd()*archKeys.length)];
    if(usedArch.has(arch)) continue;
    usedArch.add(arch);
    const menta = mentaKeys[Math.floor(rnd()*mentaKeys.length)];
    profiles.push({ arch, menta });
  }
  return profiles;
}

function renderDriverCreation(){
  if(!window.__driverProfiles) window.__driverProfiles = rollDriverStarterProfiles();
  const profiles = window.__driverProfiles;
  const nationOptions = Object.keys(COUNTRY_FLAG).filter(c=>c!=='Sconosciuta').sort((a,b)=>nationLabel(a).localeCompare(nationLabel(b)))
    .map(c=> `<option value="${c}" ${c==='Italia'?'selected':''}>${nationLabel(c)}</option>`).join('');

  const profileCards = profiles.map((p,i)=>{
    const m = MENTALITA_DEFS[p.menta];
    return `
    <div class="card pickable driver-profile-card ${window.__driverProfileChoice===i?'selected':''}" data-action="pick-driver-profile" data-idx="${i}" data-rarity="Rare">
      <span class="rarity-tag" data-rarity="Rare">${p.arch}</span>
      <div class="tag-line" style="margin-top:6px;"><span class="syn-half-badge" style="display:inline-flex;vertical-align:middle;"><span class="sem-half" style="background:${m.color};width:9px;height:18px;display:inline-block;border-radius:9px 0 0 9px;"></span><span class="sem-half" style="background:${m.color};width:9px;height:18px;display:inline-block;border-radius:0 9px 9px 0;"></span></span> ${mentaLabel(p.menta)}</div>
      <div class="card-tap-hint">${t('dc_pick_profile')}</div>
    </div>`;
  }).join('');

  app.innerHTML = `
  <div class="hero" style="padding:28px 20px 20px;">
    <div class="hero-inner">
      <div class="pill">${GAME_VERSION} · ${t('mode_select_driver')}</div>
      <h1 class="hdr" style="margin-top:10px;font-size:28px;">${t('dc_title')}</h1>
      <div class="tagline" style="margin:8px auto 0;">${t('dc_subtitle')}</div>
    </div>
  </div>
  <div class="panel">
    <input id="driverNameInput" type="text" maxlength="28" placeholder="${t('dc_name_placeholder')}"
      style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;background:var(--panel2);
      border:1px solid var(--line);border-radius:4px;color:var(--text);font-family:var(--font-ui);">
    <label class="dim" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:16px;margin-bottom:6px;">${t('naming_nation')}</label>
    <div class="nation-select-row">
      <span class="nation-flag-preview" id="driverNationFlagPreview">${flag('Italia')}</span>
      <select id="driverNationSelect"
        style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;background:var(--panel2);
        border:1px solid var(--line);border-radius:4px;color:var(--text);font-family:var(--font-ui);">
        ${nationOptions}
      </select>
    </div>
  </div>
  <div class="panel">
    <div class="eyebrow">${t('dc_profile_eyebrow')}</div>
    <div class="dim" style="font-size:12px;margin:4px 0 12px;">${t('dc_profile_subtitle')}</div>
    <div class="grid grid-3">${profileCards}</div>
  </div>
  <div class="btnrow"><button class="primary" data-action="confirm-driver-creation" ${window.__driverProfileChoice===undefined?'disabled':''}>${t('dc_confirm')}</button></div>
  <div class="btnrow"><button class="ghost" data-action="go-to-mode-select">${t('back_to_mode_select')}</button></div>
  `;
  bindActions();
  const nationSel = document.getElementById('driverNationSelect');
  nationSel.addEventListener('change', ()=>{
    document.getElementById('driverNationFlagPreview').innerHTML = flag(nationSel.value);
  });
}

// V0.9.7.9.2: schermata di conferma minimale — prova che il punto 2 funziona, l'Hub vero
// (dove si gioca davvero) e' il punto 3, non ancora costruito.
function renderDriverCreationDone(){
  const d = driverCareerState.driver;
  const teamsInKart = Object.entries(driverCareerState.world.tiers).filter(([id,tier])=>tier==='kart').length;
  app.innerHTML = `
  <div class="hero" style="padding:28px 20px 20px;">
    <div class="hero-inner">
      <div class="pill">${GAME_VERSION} · ${t('mode_select_driver')}</div>
      <h1 class="hdr" style="margin-top:10px;font-size:26px;">${t('dc_done_title')}</h1>
      <div class="tagline" style="margin:8px auto 0;">${t('dc_done_subtitle')}</div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${flag(d.naz)} ${d.nome}</h3><span class="dim mono" style="font-size:11px;">${d.eta} · ${d.rating} RATING</span></div>
    <div class="tag-line dim" style="margin-top:6px;">${d.arch} · ${mentaLabel(d.sinergia)}</div>
    <div class="dim" style="font-size:12px;margin-top:10px;">${t('dc_done_world_info', teamsInKart)}</div>
  </div>
  <div class="footer-note">${t('dc_done_footer')}</div>
  `;
  bindActions();
}

function renderNaming(){
  const nationOptions = Object.keys(COUNTRY_FLAG).filter(c=>c!=='Sconosciuta').sort((a,b)=>nationLabel(a).localeCompare(nationLabel(b)))
    .map(c=> `<option value="${c}" ${c==='Italia'?'selected':''}>${nationLabel(c)}</option>`).join('');
  app.innerHTML = `
  <div class="hero" style="padding:28px 20px 20px;">
    <div class="hero-inner">
      <div class="pill">${GAME_VERSION} · ${DIFFICULTY_LABEL[state.difficulty]}</div>
      <h1 class="hdr" style="margin-top:10px;font-size:30px;">${t('naming_title')}</h1>
      <div class="tagline" style="margin:8px auto 0;">${t('naming_optional')}</div>
    </div>
  </div>
  <div class="panel">
    <input id="teamNameInput" type="text" maxlength="28" placeholder="${t('naming_placeholder')}"
      style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;background:var(--panel2);
      border:1px solid var(--line);border-radius:4px;color:var(--text);font-family:var(--font-ui);"
      onkeydown="if(event.key==='Enter'){document.querySelector('[data-action=confirm-team-name]').click();}">
    <button class="ghost" data-action="inspire-team-name" style="width:100%;margin-top:10px;">${t('naming_inspire')}</button>
    <label class="dim" style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:16px;margin-bottom:6px;">${t('naming_nation')}</label>
    <div class="nation-select-row">
      <span class="nation-flag-preview" id="teamNationFlagPreview">${flag('Italia')}</span>
      <select id="teamNationSelect"
        style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:15px;background:var(--panel2);
        border:1px solid var(--line);border-radius:4px;color:var(--text);font-family:var(--font-ui);">
        ${nationOptions}
      </select>
    </div>
  </div>
  <div class="btnrow"><button class="primary" data-action="confirm-team-name">${t('naming_confirm')}</button></div>
  `;
  bindActions();
  const inp = document.getElementById('teamNameInput');
  // V0.9.7.8.3: rimosso il focus automatico — la tastiera nativa dello smartphone si apriva subito
  // all'ingresso nella schermata, prima che l'utente toccasse il campo. Ora si apre solo al tocco.
  // V0.9.7: la tastiera nativa dello smartphone puo' far uscire dalla modalita' schermo intero
  // mentre l'utente digita (comportamento del sistema operativo, non controllabile del tutto).
  // Best effort: quando il campo perde il focus (tastiera che si chiude), riproviamo a rientrare
  // in schermo intero se eravamo gia' in quella modalita' prima di aprire la tastiera.
  if(inp){
    let wasFullscreenBeforeFocus = false;
    inp.addEventListener('focus', ()=>{ wasFullscreenBeforeFocus = !!document.fullscreenElement; });
    inp.addEventListener('blur', ()=>{
      if(wasFullscreenBeforeFocus && !document.fullscreenElement && document.documentElement.requestFullscreen){
        setTimeout(()=>{
          document.documentElement.requestFullscreen().catch(()=>{ /* negato/non disponibile: ignorato in silenzio */ });
        }, 150);
      }
    });
  }
  const nationSelect = document.getElementById('teamNationSelect');
  const flagPreview = document.getElementById('teamNationFlagPreview');
  if(nationSelect && flagPreview){
    nationSelect.addEventListener('change', ()=>{ flagPreview.innerHTML = flag(nationSelect.value); });
  }
}

function decorativeRacerHTML(band, delaySec, topPct){
  return `
  <div class="title-racer" aria-hidden="true" style="animation-delay:${delaySec}s;">
    <img class="car-layer" src="${carLayerSrc(band,'chassis')}" alt="">
    <img class="car-layer" src="${carLayerSrc(band,'aero')}" alt="">
    <img class="car-layer" src="${carLayerSrc(band,'tires')}" alt="">
    <img class="car-layer" src="${carLayerSrc(band,'helmet')}" alt="">
  </div>`;
}
function titleTrackHTML(){
  const racers = [
    decorativeRacerHTML('legendary', 0),
    decorativeRacerHTML('eccellente', 0.7),
    decorativeRacerHTML('intermedio', 1.4),
    decorativeRacerHTML('immortal', 2.1)
  ].join('');
  return `<div class="title-track" aria-hidden="true">${racers}</div>`;
}

/* ---------------- V0.8: salvataggio automatico (localStorage) ---------------- */
// V0.9.4: sala trofei — dati persistenti PER SEMPRE, sopravvivono a "Nuova Carriera" (chiave separata)
// V0.9.4.1: Museo Dynasty — collezione piloti/componenti, persistente per sempre come i trofei
const MUSEUM_SAVE_KEY = 'racingDynastyMuseumV1';
function loadMuseumData(){
  try{
    const raw = localStorage.getItem(MUSEUM_SAVE_KEY);
    return raw ? JSON.parse(raw) : { piloti:{}, componenti:{} };
  }catch(e){ return { piloti:{}, componenti:{} }; }
}
function saveMuseumData(){
  try{ localStorage.setItem(MUSEUM_SAVE_KEY, JSON.stringify(museumData)); }catch(e){ /* ignorato */ }
}
function unlockMuseumItem(catKey, item){
  if(!item || !item.id) return;
  const isPilot = (catKey==='pilotMain' || catKey==='pilotSecond');
  const bucket = isPilot ? museumData.piloti : museumData.componenti;
  if(!bucket[item.id]){
    bucket[item.id] = { nome:item.nome, arch:item.arch, rating:item.rating, naz:item.naz||null, catKey: isPilot?catKey:catKey };
    saveMuseumData();
    unlockAchievement('primo-cimelio'); // V0.9.7.9
  }
}
function unlockMuseumForCurrentTeam(){
  // V0.9.4.1: a fine stagione, tutto cio' che hai in squadra in quel momento si sblocca nel Museo
  const t = state.team;
  unlockMuseumItem('pilotMain', t.pilotMain);
  unlockMuseumItem('pilotSecond', t.pilotSecond);
  unlockMuseumItem('motore', t.motore);
  unlockMuseumItem('telaio', t.telaio);
  unlockMuseumItem('aero', t.aero);
  unlockMuseumItem('gomme', t.gomme);
  unlockMuseumItem('stratega', t.stratega);
}
let museumData = loadMuseumData();

const TROPHY_SAVE_KEY = 'racingDynastyTrophiesV1';
function loadTrophyData(){
  try{
    const raw = localStorage.getItem(TROPHY_SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveTrophyData(){
  try{ localStorage.setItem(TROPHY_SAVE_KEY, JSON.stringify(trophyData)); }catch(e){ /* ignorato */ }
}
function recordCircuitResult(circuitName, won){
  if(!trophyData[circuitName]) trophyData[circuitName] = { raced:0, won:0 };
  trophyData[circuitName].raced++;
  if(won) trophyData[circuitName].won++;
  saveTrophyData();
}
let trophyData = loadTrophyData(); // caricato una sola volta all'avvio, prima di qualunque carriera

// V0.9.7.9.3: Sala Trofei della Carriera Pilota — separata da quella di Carriera Scuderia (dati
// diversi, chiave di salvataggio diversa), come richiesto esplicitamente. Il Museo Dynasty invece
// resta condiviso tra le due modalita' (usa museumData, gia' esistente, senza modifiche).
const DRIVER_TROPHY_SAVE_KEY = 'racingDynastyDriverTrophiesV1';
function loadDriverTrophyData(){
  try{
    const raw = localStorage.getItem(DRIVER_TROPHY_SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveDriverTrophyData(){
  try{ localStorage.setItem(DRIVER_TROPHY_SAVE_KEY, JSON.stringify(driverTrophyData)); }catch(e){ /* ignorato */ }
}
function recordDriverCircuitResult(circuitName, won){
  if(!driverTrophyData[circuitName]) driverTrophyData[circuitName] = { raced:0, won:0 };
  driverTrophyData[circuitName].raced++;
  if(won) driverTrophyData[circuitName].won++;
  saveDriverTrophyData();
}
let driverTrophyData = loadDriverTrophyData();

/* ---------------- V0.9.7: obiettivi/achievement ----------------
   15 obiettivi in 4 categorie, persistenti tra carriere (stesso pattern di museo/trofei).
   Il progresso e' pensato per essere estendibile: nuovi obiettivi si aggiungono all'array
   ACHIEVEMENTS senza dover toccare lo storage o la UI. */
const ACHIEVEMENTS = [
  // Facile
  { id:'primo-giorno', cat:'Facile', title:'Primo Giorno', desc:'Completa il tuo primo Draft e schiera la scuderia.', en:{title:'First Day', desc:'Complete your first Draft and field your team.'}, es:{title:'Primer Día', desc:'Completa tu primer Draft y alinea tu escudería.'} },
  { id:'debutto', cat:'Facile', title:'Debutto', desc:'Taglia il traguardo nella tua prima gara, in qualsiasi posizione.', en:{title:'Debut', desc:'Cross the finish line in your first race, in any position.'}, es:{title:'Debut', desc:'Cruza la meta en tu primera carrera, en cualquier posición.'} },
  { id:'sul-podio', cat:'Facile', title:'Sul Podio', desc:'Sali per la prima volta su un podio.', en:{title:'On the Podium', desc:'Reach the podium for the first time.'}, es:{title:'En el Podio', desc:'Sube al podio por primera vez.'} },
  { id:'prima-vittoria', cat:'Facile', title:'Prima Vittoria', desc:'Vinci il tuo primo Gran Premio.', en:{title:'First Victory', desc:'Win your first Grand Prix.'}, es:{title:'Primera Victoria', desc:'Gana tu primer Gran Premio.'} },
  { id:'traguardo-raggiunto', cat:'Facile', title:'Traguardo Raggiunto', desc:'Porta a termine una Stagione Veloce (10 gare) dall\'inizio alla fine.', en:{title:'Finish Line Reached', desc:'Complete a Quick Season (10 races) from start to finish.'}, es:{title:'Meta Alcanzada', desc:'Completa una Temporada Rápida (10 carreras) de principio a fin.'} },
  { id:'seconda-occasione', cat:'Facile', title:'Seconda Occasione', desc:'Usa un reroll durante il Draft.', en:{title:'Second Chance', desc:'Use a reroll during the Draft.'}, es:{title:'Segunda Oportunidad', desc:'Usa un reroll durante el Draft.'} },
  { id:'si-impara-perdendo', cat:'Facile', title:'Si Impara Perdendo', desc:'Fai fallire almeno uno sviluppo in Pit Lane.', en:{title:'You Learn by Losing', desc:'Have at least one Pit Lane development fail.'}, es:{title:'Se Aprende Perdiendo', desc:'Haz que falle al menos un desarrollo en Pit Lane.'} },
  { id:'nuovo-volto', cat:'Facile', title:'Nuovo Volto', desc:'Sostituisci un pilota tramite lo scouting per la prima volta.', en:{title:'New Face', desc:'Replace a driver via scouting for the first time.'}, es:{title:'Cara Nueva', desc:'Sustituye a un piloto mediante scouting por primera vez.'} },
  { id:'prima-scintilla', cat:'Facile', title:'Prima Scintilla', desc:'Ottieni la tua prima coppia sinergica (semaforo acceso).', en:{title:'First Spark', desc:'Get your first synergy pair (lit-up semaphore).'}, es:{title:'Primera Chispa', desc:'Consigue tu primera pareja con sinergia (semáforo encendido).'} },
  { id:'primo-cimelio', cat:'Facile', title:'Primo Cimelio', desc:'Colleziona il primo pezzo nel Museo Dynasty.', en:{title:'First Keepsake', desc:'Collect the first piece in the Dynasty Museum.'}, es:{title:'Primera Reliquia', desc:'Consigue la primera pieza del Museo Dynasty.'} },
  { id:'underdog', cat:'Facile', title:'Underdog', desc:'Vinci una gara con un pilota di rarità Common.', en:{title:'Underdog', desc:'Win a race with a Common rarity driver.'}, es:{title:'Underdog', desc:'Gana una carrera con un piloto de rareza Common.'} },
  { id:'partecipazione-onesta', cat:'Facile', title:'Partecipazione Onesta', desc:'Completa una carriera intera senza vincere alcun titolo.', en:{title:'Honest Participation', desc:'Complete a full career without winning any title.'}, es:{title:'Participación Honesta', desc:'Completa una carrera entera sin ganar ningún título.'} },
  // Medio
  { id:'cenerentola', cat:'Medio', title:'Cenerentola', desc:'Vinci una gara avendo overall scuderia massimo 60.', en:{title:'Cinderella Story', desc:'Win a race with a team overall of 60 or less.'}, es:{title:'Historia de Cenicienta', desc:'Gana una carrera con un overall de escudería de 60 o menos.'} },
  { id:'lavoro-di-squadra', cat:'Medio', title:'Lavoro di Squadra', desc:'Vinci il titolo Costruttori senza mai essere primo in classifica Piloti.', en:{title:'Team Effort', desc:'Win the Constructors\' title without ever leading the Drivers\' standings.'}, es:{title:'Trabajo en Equipo', desc:'Gana el título de Constructores sin liderar nunca el campeonato de Pilotos.'} },
  { id:'domatore-di-pioggia', cat:'Medio', title:'Domatore di Pioggia', desc:'Vinci sotto la pioggia con un Rain Master.', en:{title:'Rain Tamer', desc:'Win in the rain with a Rain Master.'}, es:{title:'Domador de Lluvia', desc:'Gana bajo la lluvia con un Rain Master.'} },
  { id:'la-grande-rimonta', cat:'Medio', title:'La Grande Rimonta', desc:'Vinci rimontando dalla P10 o peggio.', en:{title:'The Great Comeback', desc:'Win after starting P10 or worse.'}, es:{title:'La Gran Remontada', desc:'Gana remontando desde la P10 o peor.'} },
  { id:'scintilla-collettiva', cat:'Medio', title:'Scintilla Collettiva', desc:'Attiva il semaforo "in fiamme" in una gara.', en:{title:'Collective Spark', desc:'Trigger the "on fire" semaphore in a race.'}, es:{title:'Chispa Colectiva', desc:'Activa el semáforo "en llamas" en una carrera.'} },
  { id:'ripartenza-perfetta', cat:'Medio', title:'Ripartenza Perfetta', desc:'Vinci un Gran Premio dopo una Safety Car.', en:{title:'Perfect Restart', desc:'Win a Grand Prix after a Safety Car.'}, es:{title:'Reinicio Perfecto', desc:'Gana un Gran Premio después de un Safety Car.'} },
  { id:'rivoluzione-a-meta-stagione', cat:'Medio', title:'Rivoluzione a Metà Stagione', desc:'Sostituisci entrambi i piloti al Mid Season Draft.', en:{title:'Midseason Revolution', desc:'Replace both drivers at the Mid Season Draft.'}, es:{title:'Revolución de Mitad de Temporada', desc:'Sustituye a ambos pilotos en el Draft de Mitad de Temporada.'} },
  { id:'maratoneta', cat:'Medio', title:'Maratoneta', desc:'Vinci il titolo Piloti in una Stagione Completa (20 gare).', en:{title:'Marathon Runner', desc:'Win the Drivers\' title in a Full Season (20 races).'}, es:{title:'Maratonista', desc:'Gana el título de Pilotos en una Temporada Completa (20 carreras).'} },
  { id:'turista-instancabile', cat:'Medio', title:'Turista Instancabile', desc:'Corri su dieci circuiti diversi.', en:{title:'Tireless Tourist', desc:'Race on ten different circuits.'}, es:{title:'Turista Incansable', desc:'Corre en diez circuitos diferentes.'} },
  { id:'domatore-del-caos', cat:'Medio', title:'Domatore del Caos', desc:'Vinci con un Wild Card senza mai ritirarti.', en:{title:'Chaos Tamer', desc:'Win with a Wild Card without ever retiring.'}, es:{title:'Domador del Caos', desc:'Gana con un Wild Card sin retirarte nunca.'} },
  { id:'fedele-alla-linea-di-partenza', cat:'Medio', title:'Fedele alla Linea di Partenza', desc:'Completa una stagione senza mai fare scouting sui componenti.', en:{title:'Loyal to the Starting Line', desc:'Complete a season without ever scouting components.'}, es:{title:'Fiel a la Línea de Salida', desc:'Completa una temporada sin hacer nunca scouting de componentes.'} },
  { id:'ultimo-centesimo', cat:'Medio', title:'Ultimo Centesimo', desc:'Vinci il titolo Costruttori con meno di 5M di budget residuo.', en:{title:'Down to the Last Cent', desc:'Win the Constructors\' title with less than 5M budget remaining.'}, es:{title:'Hasta el Último Céntimo', desc:'Gana el título de Constructores con menos de 5M de presupuesto restante.'} },
  { id:'meta-sala-trofei', cat:'Medio', title:'Metà Sala Trofei', desc:'Vinci su cinque circuiti diversi.', en:{title:'Halfway Trophy Room', desc:'Win on five different circuits.'}, es:{title:'Sala de Trofeos a Mitad', desc:'Gana en cinco circuitos diferentes.'} },
  { id:'nato-per-soffrire', cat:'Medio', title:'Nato per Soffrire', desc:'Vinci con un Comeback King partito oltre la P10.', en:{title:'Born to Suffer', desc:'Win with a Comeback King starting beyond P10.'}, es:{title:'Nacido para Sufrir', desc:'Gana con un Comeback King partiendo más allá de la P10.'} },
  { id:'coro-a-due-voci', cat:'Medio', title:'Coro a Due Voci', desc:'Ottieni due coppie sinergiche della stessa mentalità.', en:{title:'Two-Voice Choir', desc:'Get two synergy pairs of the same mentality.'}, es:{title:'Coro a Dos Voces', desc:'Consigue dos parejas con sinergia de la misma mentalidad.'} },
  // Difficile
  { id:'dominio-assoluto', cat:'Difficile', title:'Dominio Assoluto', desc:'Vinci una stagione intera senza perdere un solo Gran Premio.', en:{title:'Absolute Dominance', desc:'Win an entire season without losing a single Grand Prix.'}, es:{title:'Dominio Absoluto', desc:'Gana una temporada entera sin perder un solo Gran Premio.'} },
  { id:'doppietta-perfetta', cat:'Difficile', title:'Doppietta Perfetta', desc:'Vinci Piloti e Costruttori nella stessa stagione.', en:{title:'Perfect Double', desc:'Win both Drivers\' and Constructors\' in the same season.'}, es:{title:'Doblete Perfecto', desc:'Gana Pilotos y Constructores en la misma temporada.'} },
  { id:'senza-rete-di-sicurezza', cat:'Difficile', title:'Senza Rete di Sicurezza', desc:'Vinci una stagione a difficoltà Hardcore.', en:{title:'No Safety Net', desc:'Win a season on Hardcore difficulty.'}, es:{title:'Sin Red de Seguridad', desc:'Gana una temporada en dificultad Hardcore.'} },
  { id:'risonanza-totale', cat:'Difficile', title:'Risonanza Totale', desc:'Attiva 3 o più coppie della stessa mentalità (+90%).', en:{title:'Total Resonance', desc:'Activate 3 or more pairs of the same mentality (+90%).'}, es:{title:'Resonancia Total', desc:'Activa 3 o más parejas de la misma mentalidad (+90%).'} },
  { id:'dal-nulla-all-olimpo', cat:'Difficile', title:'Dal Nulla all\'Olimpo', desc:'Vinci il titolo Costruttori partendo da rating scuderia sotto 55 al Draft.', en:{title:'From Nothing to Olympus', desc:'Win the Constructors\' title starting from a team rating below 55 at the Draft.'}, es:{title:'De la Nada al Olimpo', desc:'Gana el título de Constructores partiendo de un rating de escudería inferior a 55 en el Draft.'} },
  { id:'collezionista-assoluto', cat:'Difficile', title:'Collezionista Assoluto', desc:'Completa la Sala Trofei al 100%.', en:{title:'Ultimate Collector', desc:'Complete the Trophy Room 100%.'}, es:{title:'Coleccionista Absoluto', desc:'Completa la Sala de Trofeos al 100%.'} },
  { id:'anima-della-scuderia', cat:'Difficile', title:'Anima della Scuderia', desc:'Completa il Museo Dynasty con ogni pilota e componente del gioco.', en:{title:'Soul of the Team', desc:'Complete the Dynasty Museum with every driver and component in the game.'}, es:{title:'Alma de la Escudería', desc:'Completa el Museo Dynasty con todos los pilotos y componentes del juego.'} },
  { id:'leggenda-al-volante', cat:'Difficile', title:'Leggenda al Volante', desc:'Vinci una gara con THE GOAT al volante.', en:{title:'Legend at the Wheel', desc:'Win a race with THE GOAT behind the wheel.'}, es:{title:'Leyenda al Volante', desc:'Gana una carrera con THE GOAT al volante.'} },
  { id:'osso-duro', cat:'Difficile', title:'Osso Duro', desc:'Completa una stagione Hardcore senza sostituire mai nulla.', en:{title:'Tough Nut', desc:'Complete a Hardcore season without ever replacing anything.'}, es:{title:'Hueso Duro de Roer', desc:'Completa una temporada Hardcore sin sustituir nunca nada.'} },
  { id:'il-migliore-che-ci-sia', cat:'Difficile', title:'Il Migliore Che Ci Sia', desc:'Grande Slam a difficoltà Hardcore.', en:{title:'The Best There Is', desc:'Grand Slam on Hardcore difficulty.'}, es:{title:'El Mejor Que Existe', desc:'Grande Slam en dificultad Hardcore.'} },
  { id:'vittoria-agrodolce', cat:'Difficile', title:'Vittoria Agrodolce', desc:'Vinci mentre il tuo secondo pilota si ritira nella stessa corsa.', en:{title:'Bittersweet Victory', desc:'Win while your second driver retires in the same race.'}, es:{title:'Victoria Agridulce', desc:'Gana mientras tu segundo piloto se retira en la misma carrera.'} },
  { id:'tutto-o-niente', cat:'Difficile', title:'Tutto o Niente', desc:'Completa una stagione investendo sempre al rischio massimo.', en:{title:'All or Nothing', desc:'Complete a season always investing at maximum risk.'}, es:{title:'Todo o Nada', desc:'Completa una temporada invirtiendo siempre al riesgo máximo.'} },
  { id:'padrone-di-ogni-asfalto', cat:'Difficile', title:'Padrone di Ogni Asfalto', desc:'Vinci su ogni tipo di circuito del gioco.', en:{title:'Master of Every Surface', desc:'Win on every circuit type in the game.'}, es:{title:'Amo de Todo el Asfalto', desc:'Gana en todos los tipos de circuito del juego.'} },
  // Estremo
  { id:'infallibile', cat:'Estremo', title:'Infallibile', desc:'Vinci il titolo Piloti con THE GOAT senza mai subire il suo malus in tutta la stagione.', en:{title:'Infallible', desc:'Win the Drivers\' title with THE GOAT without ever suffering its malus all season.'}, es:{title:'Infalible', desc:'Gana el título de Pilotos con THE GOAT sin sufrir nunca su penalización en toda la temporada.'} },
  { id:'costanza-chirurgica', cat:'Estremo', title:'Costanza Chirurgica', desc:'Vinci una stagione Hardcore completa restando sempre sul podio.', en:{title:'Surgical Consistency', desc:'Win a full Hardcore season always finishing on the podium.'}, es:{title:'Constancia Quirúrgica', desc:'Gana una temporada Hardcore completa quedando siempre en el podio.'} },
  { id:'l-impossibile-fatto-possibile', cat:'Estremo', title:'L\'Impossibile Fatto Possibile', desc:'Grande Slam Hardcore, stagione completa, partendo da rating scuderia sotto 60.', en:{title:'The Impossible Made Possible', desc:'Hardcore Grand Slam, full season, starting from a team rating below 60.'}, es:{title:'Lo Imposible Hecho Posible', desc:'Grande Slam Hardcore, temporada completa, partiendo de un rating de escudería inferior a 60.'} },
  { id:'fortuna-sfacciata', cat:'Estremo', title:'Fortuna Sfacciata', desc:'Ottieni THE GOAT sia al Draft sia allo scouting, in due carriere diverse.', en:{title:'Shameless Luck', desc:'Get THE GOAT both at the Draft and via scouting, in two different careers.'}, es:{title:'Suerte Descarada', desc:'Consigue a THE GOAT tanto en el Draft como en el scouting, en dos carreras diferentes.'} },
  { id:'dinastia', cat:'Estremo', title:'Dinastia', desc:'Vinci cinque stagioni Hardcore consecutive.', en:{title:'Dynasty', desc:'Win five consecutive Hardcore seasons.'}, es:{title:'Dinastía', desc:'Gana cinco temporadas Hardcore consecutivas.'} },
  { id:'terrore-della-griglia', cat:'Estremo', title:'Terrore della Griglia', desc:'Vinci ogni gara di una stagione Hardcore senza mai essere ripreso nel finale.', en:{title:'Terror of the Grid', desc:'Win every race of a Hardcore season without ever being caught at the end.'}, es:{title:'Terror de la Parrilla', desc:'Gana todas las carreras de una temporada Hardcore sin ser alcanzado nunca en el tramo final.'} },
  { id:'rivincita', cat:'Estremo', title:'Rivincita', desc:'Batti il titolo Costruttori contro una rivale che ti aveva già sconfitto in una carriera precedente.', en:{title:'Rematch', desc:'Beat the Constructors\' title against a rival who had already beaten you in a previous career.'}, es:{title:'Revancha', desc:'Gana el título de Constructores contra una rival que ya te había derrotado en una carrera anterior.'} },
  { id:'enciclopedia-vivente', cat:'Estremo', title:'Enciclopedia Vivente', desc:'Sblocca tutti gli altri 49 obiettivi di questa lista.', en:{title:'Living Encyclopedia', desc:'Unlock all the other 49 achievements on this list.'}, es:{title:'Enciclopedia Viviente', desc:'Desbloquea los otros 49 logros de esta lista.'} },
  { id:'con-quello-che-c-e', cat:'Estremo', title:'Con Quello Che C\'è', desc:'Vinci una stagione Hardcore usando solo pezzi Common o Rare.', en:{title:'With What You\'ve Got', desc:'Win a Hardcore season using only Common or Rare pieces.'}, es:{title:'Con Lo Que Hay', desc:'Gana una temporada Hardcore usando solo piezas Common o Rare.'} },
  { id:'il-mito-assoluto', cat:'Estremo', title:'Il Mito Assoluto', desc:'Grande Slam Hardcore, stagione completa, con THE GOAT, senza sostituire nulla, sempre primi in entrambe le classifiche.', en:{title:'The Absolute Legend', desc:'Hardcore Grand Slam, full season, with THE GOAT, without replacing anything, always first in both standings.'}, es:{title:'El Mito Absoluto', desc:'Grande Slam Hardcore, temporada completa, con THE GOAT, sin sustituir nada, siempre primero en ambas clasificaciones.'} },
];
// V0.9.7.8.27: seleziona titolo/descrizione dell'obiettivo nella lingua corrente — fallback
// automatico all'italiano se manca la traduzione per quella lingua (non dovrebbe succedere, tutti
// e 50 sono tradotti, ma e' una sicurezza).
function achText(ach){
  if(!ach) return { title:'', desc:'' };
  if(currentLang!=='it' && ach[currentLang]) return ach[currentLang];
  return { title:ach.title, desc:ach.desc };
}
const ACHIEVEMENT_SAVE_KEY = 'racingDynastyAchievementsV1';
const ACHIEVEMENT_DATA_DEFAULTS = {
  unlockedIds:[], circuitsRaced:[],
  goatObtainedViaDraft:false, goatObtainedViaScouting:false, // V0.9.7.9: fortuna-sfacciata
  hardcoreWinStreak:0,                                        // V0.9.7.9: dinastia (stagioni Hardcore vinte di fila)
  rivalsThatBeatMe:[],                                        // V0.9.7.9: rivincita (nomi scuderie rivali che ci hanno battuto)
  circuitTypesWon:[],                                         // V0.9.7.9: padrone-di-ogni-asfalto
  synergyHighlightShown:false,                                 // V0.9.7.8.6: highlight semaforo alla prima sinergia
};
function loadAchievementData(){
  try{
    const raw = localStorage.getItem(ACHIEVEMENT_SAVE_KEY);
    return raw ? { ...ACHIEVEMENT_DATA_DEFAULTS, ...JSON.parse(raw) } : { ...ACHIEVEMENT_DATA_DEFAULTS };
  }catch(e){ return { ...ACHIEVEMENT_DATA_DEFAULTS }; }
}
function saveAchievementData(){
  try{ localStorage.setItem(ACHIEVEMENT_SAVE_KEY, JSON.stringify(achievementData)); }catch(e){ /* ignorato */ }
}
let achievementData = loadAchievementData();
// V0.9.7.8.7: FIX — un obiettivo gia' sbloccato PRIMA che esistesse questo aggancio (partite
// precedenti, o semplicemente ottenuto prima di aprire il Garage nella stessa sessione) non faceva
// mai scattare lo sblocco della livrea, perche' il codice sotto (in unlockAchievement) reagisce solo
// al MOMENTO in cui un obiettivo diventa nuovo. Qui invece riconciliamo sempre tutto lo stato
// gia' esistente, cosi' non conta quando l'obiettivo e' stato ottenuto.
function syncLiveryUnlocksFromAchievements(){
  let changed = false;
  LIVERY_PATTERNS.forEach(p=>{
    if(achievementData.unlockedIds.includes(p.achievementId) && !liveryData.unlockedPatternIds.includes(p.id)){
      liveryData.unlockedPatternIds.push(p.id);
      changed = true;
    }
  });
  if(changed) saveLiveryData();
}
syncLiveryUnlocksFromAchievements();
let __lastUnlockedAchievements = []; // per mostrare un piccolo avviso dopo l'ultimo sblocco
function unlockAchievement(id){
  if(!achievementData.unlockedIds.includes(id)){
    achievementData.unlockedIds.push(id);
    __lastUnlockedAchievements.push(id);
    saveAchievementData();
    showAchievementToast(id);
    // V0.9.7.8.5: se questo obiettivo sblocca anche un pattern livrea nel Garage, lo sblocchiamo
    // permanentemente qui, un colpo solo, cosi' resta valido qualsiasi punto del codice lo scateni.
    const liveryPattern = LIVERY_PATTERNS.find(p=>p.achievementId===id);
    if(liveryPattern && !liveryData.unlockedPatternIds.includes(liveryPattern.id)){
      liveryData.unlockedPatternIds.push(liveryPattern.id);
      saveLiveryData();
    }
    // V0.9.7.9: enciclopedia-vivente si sblocca da sola quando tutti gli altri 49 sono stati ottenuti
    if(id!=='enciclopedia-vivente'){
      const others = ACHIEVEMENTS.filter(a=>a.id!=='enciclopedia-vivente');
      if(others.every(a=> achievementData.unlockedIds.includes(a.id))) unlockAchievement('enciclopedia-vivente');
    }
  }
}
// V0.9.7.2: notifica "Obiettivo Sbloccato" in basso a destra — funziona indipendentemente dalla
// schermata su cui ci si trova (appesa a document.body, fuori dal normale ciclo di render, si
// rimuove da sola dopo qualche secondo con la sua animazione CSS: non serve alcuna pulizia manuale).
function showAchievementToast(id){
  const ach = ACHIEVEMENTS.find(a=>a.id===id);
  if(!ach) return;
  const achLoc = achText(ach);
  playSfx('notify_generic'); // V0.9.7.8.2
  let container = document.getElementById('achievementToastContainer');
  if(!container){
    container = document.createElement('div');
    container.id = 'achievementToastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  const iconSrc = `<img src="assets/achievements/${id}.webp" alt="">`;
  toast.innerHTML = `
    <div class="achievement-toast-icon">${iconSrc}</div>
    <div class="achievement-toast-body">
      <div class="achievement-toast-eyebrow">Obiettivo Sbloccato</div>
      <div class="achievement-toast-title">${achLoc.title}</div>
    </div>`;
  container.appendChild(toast);
  // V0.9.7.9: click sul banner -> apre la schermata Obiettivi scrollata sulla card appena sbloccata
  toast.addEventListener('click', ()=>{
    if(toast.parentNode) toast.parentNode.removeChild(toast);
    openAchievements(id);
  });
  setTimeout(()=>{ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 5100);
}
function isAchievementUnlocked(id){ return achievementData.unlockedIds.includes(id); }
function recordCircuitRaced(circuitName){
  if(!achievementData.circuitsRaced.includes(circuitName)){
    achievementData.circuitsRaced.push(circuitName);
    saveAchievementData();
  }
}

// V0.9.7.9: obiettivi legati alle sinergie — controllati ogni volta che la squadra cambia composizione
function checkSynergyAchievements(){
  const t = state.team;
  if(!t) return;
  const pairs = activeSynergyPairs();
  if(pairs.length>0){
    unlockAchievement('prima-scintilla');
    // V0.9.7.8.6: la primissima volta in assoluto che una sinergia si attiva, il semaforo si
    // evidenzia per qualche secondo — dopo va tolto per non richiamare l'attenzione ogni volta.
    if(!achievementData.synergyHighlightShown){
      achievementData.synergyHighlightShown = true;
      saveAchievementData();
      state._synergyJustUnlocked = true;
    }
  }
  const groups = {};
  pairs.forEach(([a,b])=>{ groups[a.mentId] = (groups[a.mentId]||0)+1; });
  if(Object.values(groups).some(n=>n>=2)) unlockAchievement('coro-a-due-voci');
  if(t._synergyDiverseFire) unlockAchievement('scintilla-collettiva');
  if((t._synergyStackPct||0) >= 0.90) unlockAchievement('risonanza-totale');
}

// V0.9.7: obiettivo "Cenerentola" — controllato subito al momento della vittoria, non a fine stagione
function checkCenerentolaAchievement(){
  if(isAchievementUnlocked('cenerentola')) return;
  if(computeTeamStrength(state.team) <= 60) unlockAchievement('cenerentola');
}

// V0.9.7: obiettivi di Maestria — controllati ogni volta che museo/trofei/circuiti cambiano,
// cosi' si sbloccano nel momento esatto in cui la condizione diventa vera, non solo a fine stagione
function checkMasteryAchievements(){
  if(!isAchievementUnlocked('turista-instancabile')){
    if(achievementData.circuitsRaced.length >= 10) unlockAchievement('turista-instancabile');
  }
  if(!isAchievementUnlocked('meta-sala-trofei')){
    const wonCount = Object.values(trophyData).filter(t=>t.won>0).length;
    if(wonCount >= 5) unlockAchievement('meta-sala-trofei');
  }
  if(!isAchievementUnlocked('collezionista-assoluto')){
    const allGold = DATA.circuiti.every(c=> trophyData[c.nome] && trophyData[c.nome].won>0);
    if(allGold) unlockAchievement('collezionista-assoluto');
  }
  if(!isAchievementUnlocked('anima-della-scuderia')){
    const totalPiloti = DATA.piloti.length;
    const totalComponenti = DATA.motori.length + DATA.telai.length + DATA.aero.length + DATA.gomme.length + DATA.strategi.length;
    const havePiloti = Object.keys(museumData.piloti||{}).length;
    const haveComponenti = Object.keys(museumData.componenti||{}).length;
    if(havePiloti>=totalPiloti && haveComponenti>=totalComponenti) unlockAchievement('anima-della-scuderia');
  }
  if(!isAchievementUnlocked('padrone-di-ogni-asfalto')){
    const allTypes = Array.from(new Set(DATA.circuiti.map(c=>c.tipo)));
    if(allTypes.every(t=> achievementData.circuitTypesWon.includes(t))) unlockAchievement('padrone-di-ogni-asfalto');
  }
}

// V0.9.7: obiettivi legati alla fine di una stagione — un solo controllo, alla transizione verso 'season_end'
function checkSeasonEndAchievements(){
  const dstd = driverStandingsSorted();
  const cstd = constructorStandingsSorted();
  const isDriverChamp = dstd[0] && dstd[0].isPlayerTeam;
  const isConstructorChamp = cstd[0] && cstd[0].teamId==='PLAYER';
  const isHardcore = state.difficulty==='hardcore';
  const isFullSeason = state.seasonLength===20;
  const wonEveryRace = (state.playerRaceWinsCount||0) >= state.calendar.length;
  const startRating = state.initialTeamRatingAtDraft;

  // completamento carriera / traguardi base
  if(state.seasonLength===10) unlockAchievement('traguardo-raggiunto');
  if(isFullSeason && isDriverChamp) unlockAchievement('maratoneta');
  if(!isDriverChamp && !isConstructorChamp) unlockAchievement('partecipazione-onesta');

  // stagione / dominio
  if(isDriverChamp && isConstructorChamp) unlockAchievement('doppietta-perfetta');
  if(wonEveryRace) unlockAchievement('dominio-assoluto');
  if(isConstructorChamp && typeof startRating==='number' && startRating<55) unlockAchievement('dal-nulla-all-olimpo');
  if(isConstructorChamp && state.budget < 5) unlockAchievement('ultimo-centesimo');
  if(isConstructorChamp && !state.everLedDriverStandingsP1) unlockAchievement('lavoro-di-squadra');

  // Hardcore
  if(isDriverChamp && isHardcore) unlockAchievement('senza-rete-di-sicurezza');
  if(isDriverChamp && isConstructorChamp && isHardcore) unlockAchievement('il-migliore-che-ci-sia');
  if(isHardcore && !state.everUsedScouting && !state.everSwappedPilot) unlockAchievement('osso-duro');
  if(isHardcore && isFullSeason && !state.everFinishedOffPodium) unlockAchievement('costanza-chirurgica');
  if(isHardcore && isFullSeason && isDriverChamp && isConstructorChamp && typeof startRating==='number' && startRating<60) unlockAchievement('l-impossibile-fatto-possibile');
  if(isHardcore && wonEveryRace && !state.everLostLeadInFinalPhase) unlockAchievement('terrore-della-griglia');
  if(isHardcore && isConstructorChamp && !state.everUsedEpicOrHigher) unlockAchievement('con-quello-che-c-e');

  // stile
  if(!state.everUsedScoutingOnComponent) unlockAchievement('fedele-alla-linea-di-partenza');
  if(state.everUsedMaxRiskOnly && (state.upgradesPurchasedCount||0)>0) unlockAchievement('tutto-o-niente');

  // THE GOAT
  const goatIsChampDriver = isDriverChamp && dstd[0].nome==='THE GOAT';
  if(goatIsChampDriver && !state.goatMalusTriggeredThisSeason) unlockAchievement('infallibile');

  // il mito assoluto: tutto insieme, nella stessa stagione — "sempre primi in entrambe le classifiche"
  // e' approssimato con "non ha mai perso una gara" (wonEveryRace), la condizione piu' vicina e verificabile
  // con i dati che teniamo davvero: se vinci ogni gara, sei stato in testa a entrambe le classifiche per l'intera stagione.
  const hasGoatInTeam = (state.team.pilotMain && state.team.pilotMain.nome==='THE GOAT') || (state.team.pilotSecond && state.team.pilotSecond.nome==='THE GOAT');
  if(isHardcore && isFullSeason && isDriverChamp && isConstructorChamp && hasGoatInTeam && !state.everSwappedPilot && wonEveryRace){
    unlockAchievement('il-mito-assoluto');
  }

  // dinastia: streak di stagioni Hardcore vinte consecutivamente (persistente tra carriere)
  if(isHardcore){
    if(isDriverChamp || isConstructorChamp) achievementData.hardcoreWinStreak = (achievementData.hardcoreWinStreak||0) + 1;
    else achievementData.hardcoreWinStreak = 0;
    if(achievementData.hardcoreWinStreak >= 5) unlockAchievement('dinastia');
  }

  // rivincita: una rivale che in una carriera precedente ci aveva battuto, ora viene battuta
  const playerConstructorPoints = (cstd.find(c=>c.teamId==='PLAYER')||{points:0}).points;
  (state.rivals||[]).forEach(rid=>{
    const rt = state.constructorStandings[rid];
    if(!rt) return;
    if(rt.points > playerConstructorPoints){
      if(!achievementData.rivalsThatBeatMe.includes(rt.nome)) achievementData.rivalsThatBeatMe.push(rt.nome);
    } else if(isConstructorChamp && achievementData.rivalsThatBeatMe.includes(rt.nome)){
      unlockAchievement('rivincita');
      achievementData.rivalsThatBeatMe = achievementData.rivalsThatBeatMe.filter(n=>n!==rt.nome);
    }
  });
  saveAchievementData();
}



const SAVE_KEY = 'racingDynastySaveV09';
const NO_SAVE_PHASES = new Set(['studio-splash','lang-select','title','difficulty','season-length','naming','race_live','start_lights','upgrade_suspense','trophy-room','museum-dynasty','garage','mode-select','driver-creation','driver-creation-done','driver-trophy-room']);
function saveGame(){
  try{
    if(!state || NO_SAVE_PHASES.has(state.phase)) return;
    if(state.phase==='season_end'){ deleteSave(); return; }
    const snapshot = { ...state, live: null, usedIds: Array.from(state.usedIds||[]) };
    localStorage.setItem(SAVE_KEY, JSON.stringify({ saveVersion:'0.9', savedAt: Date.now(), state: snapshot }));
  }catch(e){ /* storage non disponibile: ignorato silenziosamente */ }
}
function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.state) return null;
    parsed.state.usedIds = new Set(parsed.state.usedIds||[]);
    return parsed;
  }catch(e){ return null; }
}
function deleteSave(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){ /* ignorato */ }
}

// V0.9.7.8.6: export/import della run corrente come file .json — stesso oggetto gia' salvato in
// localStorage, nessuna trasformazione. Serve a chi vuole condividere una run particolare con
// qualcun altro (o a chi vuole semplicemente un backup fuori dal browser).
function exportRunSave(){
  const raw = localStorage.getItem(SAVE_KEY);
  if(!raw){ alert('Nessuna stagione in corso da esportare.'); return; }
  const blob = new Blob([raw], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const teamName = (state && state.team && state.team.nome) ? state.team.nome.replace(/[^a-z0-9]+/gi,'-') : 'run';
  a.href = url; a.download = `racing-dynasty-${teamName}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  playSfx('ui_confirm');
}
function importRunSaveFromText(text){
  let parsed;
  try{ parsed = JSON.parse(text); }
  catch(e){ alert('Il file non è un salvataggio valido (JSON non leggibile).'); return false; }
  // validazione minima: deve avere la stessa forma di cio' che saveGame() scrive davvero
  if(!parsed || typeof parsed!=='object' || !parsed.state || typeof parsed.saveVersion==='undefined'){
    alert('Il file non ha il formato di un salvataggio di Racing Dynasty. Import annullato.');
    return false;
  }
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
    playSfx('ui_confirm');
    state = { phase:'title', selectedDifficulty: (state&&state.difficulty) || 'medio' };
    render();
    return true;
  }catch(e){
    alert('Import fallito: impossibile scrivere il salvataggio.');
    return false;
  }
}

// V0.9.5: ripristino completo — cancella TUTTO (carriera, museo, trofei, obiettivi), per riportare
// il gioco esattamente allo stato di una primissima apertura. Utile soprattutto in fase di test.
function fullResetAll(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  try{ localStorage.removeItem(MUSEUM_SAVE_KEY); }catch(e){}
  try{ localStorage.removeItem(TROPHY_SAVE_KEY); }catch(e){}
  try{ localStorage.removeItem(ACHIEVEMENT_SAVE_KEY); }catch(e){}
  // pulizia chiavi legacy del vecchio tutorial (v0.9.5), ora rimosso
  ['Completed','Skipped','Version','CurrentStep','Started'].forEach(k=>{
    try{ localStorage.removeItem('racingDynastyTutorial'+k); }catch(e){}
  });
  museumData = { piloti:{}, componenti:{} };
  trophyData = {};
  achievementData = { ...ACHIEVEMENT_DATA_DEFAULTS };
}

// V0.9.7.8.15: lo splash NON avanza piu' da solo — resta finche' non si tocca, come richiesto.
// L'unica eccezione temporale e' un piccolo aiuto per chi non capisce di dover toccare: dopo 5s
// di inattivita' compare una scritta lampeggiante "premi per continuare".
function renderStudioSplash(){
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  app.innerHTML = `
  <div class="studio-splash ${reduced?'reduced':''}" id="studioSplashRoot">
    <div class="studio-splash-stage">
      <div class="studio-splash-scale-label" id="splashScaleLabel">SCALE 1:1</div>
      <img class="studio-splash-logo" id="splashLogoImg" src="assets/fuoriscala/fuoriscala_primary_white.svg" alt="FUORISCALA">
    </div>
    <div class="studio-splash-tagline" id="splashTagline">${t('splash_presents')}</div>
    <div class="studio-splash-skip" id="splashSkipHint">${t('splash_tap_continue')}</div>
  </div>
  `;
  const root = document.getElementById('studioSplashRoot');
  const advance = ()=>{
    if(state.phase!=='studio-splash') return;
    if(root) root.classList.add('leaving');
    setTimeout(()=>{
      if(!hasLangBeenChosen()){
        state.phase = 'lang-select';
      } else {
        state.phase = 'title';
        playIntroOnce();
      }
      render();
    }, 280);
  };
  if(root) root.addEventListener('click', advance, { once:true });

  if(!reduced){
    // readout tecnico sincronizzato con la crescita del logo (echi del mockup "1:1 / 2:1 / 4:1")
    const label = document.getElementById('splashScaleLabel');
    if(label){
      setTimeout(()=>{ label.textContent = 'SCALE 2:1'; }, 260);
      setTimeout(()=>{ label.textContent = 'SCALE 4:1'; }, 520);
      setTimeout(()=>{ label.style.opacity = '0'; }, 900);
    }
  }
  // "premi per continuare" lampeggiante dopo 5s, se ancora sullo splash — per chi non capisce da solo
  setTimeout(()=>{
    const hint = document.getElementById('splashSkipHint');
    if(hint && state.phase==='studio-splash') hint.classList.add('splash-hint-blink');
  }, 5000);
}

function renderLangSelect(){
  app.innerHTML = `
  <div class="lang-select-screen">
    <div class="lang-select-title">Choose your language<br><span class="dim" style="font-size:13px;font-weight:400;">Scegli la lingua · Elige tu idioma</span></div>
    <div class="lang-select-options">
      <button class="lang-select-card" data-action="pick-first-lang" data-lang-choice="it">
        <span class="lang-select-flag">🇮🇹</span><span class="lang-select-name">Italiano</span>
      </button>
      <button class="lang-select-card" data-action="pick-first-lang" data-lang-choice="en">
        <span class="lang-select-flag">🇬🇧</span><span class="lang-select-name">English</span>
      </button>
      <button class="lang-select-card" data-action="pick-first-lang" data-lang-choice="es">
        <span class="lang-select-flag">🇪🇸</span><span class="lang-select-name">Español</span>
      </button>
    </div>
    <div class="dim" style="font-size:11px;margin-top:18px;">You can change this anytime in Settings · Puoi cambiarla quando vuoi dalle Impostazioni</div>
  </div>
  `;
  bindActions();
}

function renderTitle(){
  const existingSave = loadGame();
  if(existingSave){
    const s = existingSave.state;
    app.innerHTML = `
    <div class="hero" style="padding:26px 20px 22px;">
      <div class="hero-inner">
        <div class="title-logo-wrap"><img src="${LOGO_DATA_URI}" alt="Racing Dynasty" class="title-logo"></div>
        <div class="tagline title-cta">${t('title_tagline_return', Math.min(s.raceIndex+1, s.calendar.length), s.calendar.length)}</div>
      </div>
    </div>
    <div class="btnrow" style="flex-direction:column;align-items:stretch;">
      <button class="primary" data-action="continue-save" style="width:100%;">${t('title_continue')}</button>
      <button class="ghost" data-action="new-season-confirm" style="width:100%;">${t('title_new')}</button>
      <button class="ghost" data-action="delete-save" style="width:100%;">${t('title_delete')}</button>
    </div>
    `;
    bindActions();
    return;
  }
  app.innerHTML = `
  <div class="hero title-hero pickable" data-action="go-to-mode-select" style="padding:26px 20px 22px;">
    <div class="hero-inner">
      <div class="title-logo-wrap">
        <img src="${LOGO_DATA_URI}" alt="Racing Dynasty" class="title-logo">
      </div>
      <div class="tagline title-cta">${t('title_cta')}<b class="heartbeat">${t('title_cta_bold')}</b></div>
      <div class="pill" style="margin-top:12px;">${GAME_VERSION} · DATABASE V1 · 250 PILOTI · 830+ COMPONENTI</div>
    </div>
  </div>
  `;
  bindActions();
}

function renderDifficulty(){
  const lastUsed = state.selectedDifficulty;
  const diffCards = DIFFICULTY_ORDER.map(d=>{
    const rarityLike = d==='facile'?'Common':d==='medio'?'Rare':d==='difficile'?'Epic':'Immortal';
    const rerolls = DIFFICULTY_REROLLS[d];
    return `
    <div class="card pickable" data-rarity="${rarityLike}" data-action="start-run" data-diff="${d}">
      <span class="rarity-tag" data-rarity="${rarityLike}">${DIFFICULTY_LABEL[d]}${d===lastUsed?t('diff_last_used'):''}</span>
      <div class="card-rating">${rerolls}<span style="font-size:12px;color:var(--dim);"> REROLL</span></div>
      <div class="ability">${DIFFICULTY_DESC[d]}</div>
      <div class="card-tap-hint">${t('diff_tap_hint', DIFFICULTY_LABEL[d])}</div>
    </div>`;
  }).join('');

  app.innerHTML = `
  <div class="panel">
    <div class="eyebrow">${t('diff_new_career')}</div>
    <h2 class="hdr" style="font-size:24px;">${t('diff_choose')}</h2>
    <div class="dim" style="font-size:12px;margin-top:6px;">${t('diff_subtitle')}</div>
  </div>
  <div class="grid grid-2">${diffCards}</div>
  `;
  bindActions();
}

function renderSeasonLength(){
  app.innerHTML = `
  <div class="panel">
    <div class="eyebrow">${t('diff_new_career')}</div>
    <h2 class="hdr" style="font-size:24px;">${t('sl_choose')}</h2>
    <div class="dim" style="font-size:12px;margin-top:6px;">${t('sl_subtitle')}</div>
  </div>
  <div class="grid grid-2">
    <div class="card pickable" data-rarity="Rare" data-action="choose-season-length" data-length="10">
      <span class="rarity-tag" data-rarity="Rare">${t('sl_quick')}</span>
      <div class="card-rating">10<span style="font-size:12px;color:var(--dim);"> ${t('sl_races_word')}</span></div>
      <div class="ability">${t('sl_quick_desc')}</div>
      <div class="card-tap-hint">${t('sl_quick_hint')}</div>
    </div>
    <div class="card pickable" data-rarity="Legendary" data-action="choose-season-length" data-length="20">
      <span class="rarity-tag" data-rarity="Legendary">${t('sl_full')}</span>
      <div class="card-rating">20<span style="font-size:12px;color:var(--dim);"> ${t('sl_races_word')}</span></div>
      <div class="ability">${t('sl_full_desc')}</div>
      <div class="card-tap-hint">${t('sl_full_hint')}</div>
    </div>
  </div>
  <div class="card trophy-room-card garage-coming-soon">
    <span class="rarity-tag" data-rarity="Rare">🎨 ${t('sl_garage')}</span>
    <div class="trophy-room-card-body">
      <div class="ability">${t('sl_garage_desc')}</div>
    </div>
    <div class="card-tap-hint" style="color:var(--legendary);font-weight:800;">${t('sl_garage_soon')}</div>
  </div>
  <div class="btnrow"><button class="ghost" data-action="go-to-mode-select">${t('back_to_mode_select')}</button></div>
  `;
  bindActions();
}

function statBar(label, val){
  return `<div class="stat-row"><span class="label">${label}</span><div class="bar"><span style="width:${val}%"></span></div><span class="val">${val}</span></div>`;
}

function shortenText(text, maxLen){
  if(!text) return '';
  const cut = text.split(';')[0].trim();
  if(cut.length<=maxLen) return cut;
  return cut.slice(0,maxLen-1).trim()+'…';
}

function draftCardHTML(item, statKeys, extraLine, synergyCatKey){
  const stats = statKeys.map(([k,l])=> item[k]!==undefined ? statBar(l, item[k]) : '').join('');
  let synBadge = '', rowCls = '';
  if(synergyCatKey && item.sinergia && state.team){
    const m = MENTALITA_DEFS[item.sinergia];
    const isPilotRole = synergyCatKey==='pilotMain' || synergyCatKey==='pilotSecond';
    const kl = isPilotRole ? 'Mentalità' : 'Tipologia';
    const unpaired = unpairedMentalities(synergyCatKey);
    const wouldGain = unpaired.has(item.sinergia);
    synBadge = `<div class="syn-half-badge" title="${kl}: ${m.label}" style="margin-bottom:6px;"><div class="sem-half" style="background:${m.color};"></div><div class="sem-half" style="background:rgba(255,255,255,0.05);"></div></div>`;
    if(wouldGain) rowCls = ' card-synergy-gain';
  }
  return `
  <div class="card pickable${rowCls}" data-rarity="${displayRarity(item)}" data-action="pick-draft" data-id="${item.id}" ${rowCls?`style="--syn-glow:${MENTALITA_DEFS[item.sinergia].color};"`:''}>
    ${synBadge}
    <span class="rarity-tag" data-rarity="${displayRarity(item)}">${displayRarityLabel(item)}</span>
    <div class="card-head-row">
      <div class="card-head-left">
        <div class="card-name">${item.naz? flag(item.naz)+' ':''}${item.nome}</div>
        ${item.arch? `<div class="card-arch-badge">${item.arch}</div>`:''}
        <div class="card-rating-secondary">${item.naz||''}</div>
      </div>
      <div class="card-rating-big">${item.rating}<span class="card-rating-big-label">RATING</span></div>
    </div>
    ${item.bonus? `<div class="tag-line bonus">▲ ${shortenText(item.bonus,48)}</div>`:''}
    ${item.malus? `<div class="tag-line malus">▼ ${shortenText(item.malus,48)}</div>`:''}
    <details class="card-details">
      <summary onclick="event.stopPropagation()">Dettagli</summary>
      <div class="stat-bars">${stats}</div>
      ${item.bonus? `<div class="tag-line bonus">▲ ${item.bonus}</div>`:''}
      ${item.malus? `<div class="tag-line malus">▼ ${item.malus}</div>`:''}
      ${item.abilita? `<div class="ability">${item.abilita}</div>`:''}
    </details>
    <div class="card-tap-hint">Tocca il riquadro per scegliere</div>
    ${extraLine||''}
  </div>`;
}

const STAT_KEYS = {
  pilotMain: [['qualifica','QUALIFICA'],['sorpassi','SORPASSI'],['costanza','COSTANZA'],['affidabilita','AFFIDAB.']],
  pilotSecond: [['qualifica','QUALIFICA'],['sorpassi','SORPASSI'],['costanza','COSTANZA'],['affidabilita','AFFIDAB.']],
  motore: [['potenza','POTENZA'],['affidabilita','AFFIDAB.'],['accelerazione','ACCEL.'],['consumo','CONSUMO']],
  telaio: [['leggerezza','LEGGEREZZA'],['bilanciamento','BILANC.'],['sicurezza','SICUREZZA'],['affidabilita','AFFIDAB.']],
  aero: [['velmax','VEL. MAX'],['curveveloci','CURVE V.'],['curvelente','CURVE L.'],['stabilita','STABILITA\'']],
  gomme: [['grip','GRIP'],['durata','DURATA'],['bagnato','BAGNATO'],['degrado','DEGRADO']],
  stratega: [['pitstop','PIT STOP'],['letturagara','LETTURA'],['safetycar','SAFETY CAR'],['pressione','PRESSIONE']]
};

// V0.9.4.2.2: card di un'offerta di turno, con l'etichetta di categoria sopra (non modifica draftCardHTML)
// V0.9.4.2.3: card di una categoria gia' scelta — visibile ma non piu' selezionabile (nessun data-action)
function draftLockedCardHTML(categoryLabel, item){
  return `<div class="draft-turn-card draft-turn-card-locked">
    <div class="draft-cat-label">${categoryLabel}</div>
    <div class="card" data-rarity="${displayRarity(item)}">
      <span class="rarity-tag" data-rarity="${displayRarity(item)}">${displayRarityLabel(item)}</span>
      <div class="card-head-row">
        <div class="card-head-left">
          <div class="card-name">${item.naz? flag(item.naz)+' ':''}${item.nome}</div>
        </div>
        <div class="card-rating-big">${item.rating}<span class="card-rating-big-label">RATING</span></div>
      </div>
    </div>
  </div>`;
}

function draftTurnCardHTML(categoryLabel, item, statKeys, synergyCatKey){
  return `<div class="draft-turn-card">
    <div class="draft-cat-label">${categoryLabel}</div>
    ${draftCardHTML(item, statKeys||[], '', synergyCatKey)}
  </div>`;
}

function renderDraft(){
  const showReroll = state.difficulty !== 'hardcore';
  const canReroll = state.rerollsLeft > 0;
  const rerollBtn = showReroll
    ? `<button class="ghost" data-action="reroll-draft" ${canReroll?'':'disabled'}>${t('draft_reroll', state.rerollsLeft)}</button>`
    : `<span class="dim mono" style="font-size:11px;">${t('draft_hardcore_no_reroll')}</span>`;

  const doneDots = Array.from({length: state.draftPicksDone}, ()=>`<div class="dot done">✓</div>`).join('');
  const nowDot = `<div class="dot now">${state.draftPicksDone+1}</div>`;
  const restCount = Math.max(0, DRAFT_TOTAL_PICKS - state.draftPicksDone - 1);
  const restDots = Array.from({length: restCount}, ()=>`<div class="dot">·</div>`).join('');

  const offerCards = [];
  if(state.draftTurnOffers.pilota){
    const nth = state.draftPilotsChosen.length===0 ? '1º' : '2º';
    const pilotSynKey = state.draftPilotsChosen.length===0 ? 'pilotMain' : 'pilotSecond';
    offerCards.push(draftTurnCardHTML(t('draft_pilot_nth', nth), state.draftTurnOffers.pilota, STAT_KEYS.pilotMain, pilotSynKey));
  }
  state.draftOpenCategories.forEach(catKey=>{
    const def = DRAFT_CATEGORY_DEFS[catKey];
    offerCards.push(draftTurnCardHTML(def.label, state.draftTurnOffers[catKey], STAT_KEYS[catKey], catKey));
  });

  // V0.9.4.2.3: le categorie gia' scelte restano visibili (bloccate), per il confronto con le nuove proposte
  const lockedCards = [];
  if(state.draftPilotsChosen.length===1){
    lockedCards.push(draftLockedCardHTML(t('draft_pilot_first_taken'), state.draftPilotsChosen[0]));
  }
  Object.keys(DRAFT_CATEGORY_DEFS).forEach(catKey=>{
    if(!state.draftOpenCategories.includes(catKey) && state.team[catKey]){
      lockedCards.push(draftLockedCardHTML(`${DRAFT_CATEGORY_DEFS[catKey].label}${t('draft_taken')}`, state.team[catKey]));
    }
  });

  app.innerHTML = `
  <div class="topbar">
    <div class="brand hdr">RACING DYNASTY<small>${t('draft_founding')} — Draft ${state.draftPicksDone+1}/${DRAFT_TOTAL_PICKS} · ${DIFFICULTY_LABEL[state.difficulty]}</small></div>
  </div>
  <div class="panel">
    <div class="eyebrow">${t('draft_choose_one')}</div>
    <h2 class="hdr" style="font-size:22px;">${t('draft_headline')}</h2>
    <div class="dim" style="font-size:12px;margin-top:6px;">${t('draft_subtitle')}</div>
    <div class="calendar">${doneDots}${nowDot}${restDots}</div>
    <div class="btnrow" style="margin-top:12px;margin-bottom:0;">${rerollBtn}</div>
  </div>
  <div class="draft-turn-grid">${offerCards.join('')}</div>
  ${lockedCards.length ? `<div class="dim mono" style="font-size:11px;margin-top:16px;">${t('draft_already_chosen')}</div><div class="draft-turn-grid draft-locked-grid">${lockedCards.join('')}</div>` : ''}
  ${semaforoWidgetHTML()}
  `;
  bindActions();
}

function componentRow(label, item, rating){
  const nm = item.naz? flag(item.naz)+' '+item.nome : item.nome;
  return `<div class="mini" data-rarity="${displayRarity(item)}"><div class="role">${label}</div><div class="nm">${nm}</div><div class="rt">RATING ${rating!==undefined?rating:item.rating}</div></div>`;
}

// V0.9.2.1: banner "Nuova Rivalità" mostrato una sola volta, quando una rivalità e' stata superata
// V0.9.3: schermata dedicata "Nuova Rivalità" — sia per l'assegnazione iniziale che per i cambi in stagione
function renderRivalAnnounce(){
  const notice = state.pendingRivalNotice;
  const t = state.team;
  const carNum1 = (state.grid.find(g=>g.teamId==='PLAYER' && g.role==='pilotMain')||{}).carNumber || 1;
  const carNum2 = (state.grid.find(g=>g.teamId==='PLAYER' && g.role==='pilotSecond')||{}).carNumber || 2;
  const myCircles = semaforoCirclesData();
  const myTeamHTML = `
    <div class="panel rival-team-card my-team-card">
      <div class="eyebrow" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <span>${teamFlag('PLAYER')} ${teamDisplayName()} <span class="qtc-badge" style="margin-left:6px;">${window.t('rival_you_badge')}</span></span>
        <span class="qtc-mini-sem" style="flex:none;">${miniSemaforoHTML(myCircles)}</span>
      </div>
      <div class="grid grid-2" style="margin-top:8px;">
        <div class="rival-mini">
          ${carVisualHTML(t.pilotMain, {motore:t.motore,telaio:t.telaio,aero:t.aero,gomme:t.gomme,stratega:t.stratega}, carNum1)}
          <div class="rival-mini-name">${flag(t.pilotMain.naz)} ${t.pilotMain.nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.pilotMain.rating} RATING</div>
        </div>
        <div class="rival-mini">
          ${carVisualHTML(t.pilotSecond, {motore:t.motore,telaio:t.telaio,aero:t.aero,gomme:t.gomme,stratega:t.stratega}, carNum2)}
          <div class="rival-mini-name">${flag(t.pilotSecond.naz)} ${t.pilotSecond.nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.pilotSecond.rating} RATING</div>
        </div>
      </div>
      <div class="dim mono" style="font-size:11px;margin-top:8px;">${state.constructorStandings['PLAYER'].points} ${window.t('rival_constructor_points')} <b style="color:var(--amber);font-size:13px;">${Math.round(aiTeamWeightedStrength({drivers:[t.pilotMain,t.pilotSecond], components:{motore:t.motore,telaio:t.telaio,aero:t.aero,gomme:t.gomme,stratega:t.stratega}}))}</b></div>
    </div>`;
  const teamsHTML = notice.newTeamIds.map(id=>{
    const t = state.aiTeams.find(x=>x.id===id);
    if(!t) return '';
    const slot1 = state.grid.find(g=>g.teamId===id && g.role===0);
    const slot2 = state.grid.find(g=>g.teamId===id && g.role===1);
    const rCircles = aiTeamSynergyCircles(t);
    return `
    <div class="panel rival-team-card">
      <div class="eyebrow" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <span>${teamFlag(id)} ${t.nome}</span>
        <span class="qtc-mini-sem" style="flex:none;">${miniSemaforoHTML(rCircles)}</span>
      </div>
      <div class="grid grid-2" style="margin-top:8px;">
        <div class="rival-mini">
          ${carVisualHTML(t.drivers[0], t.components, slot1?slot1.carNumber:1)}
          <div class="rival-mini-name">${flag(t.drivers[0].naz)} ${t.drivers[0].nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.drivers[0].rating} RATING</div>
        </div>
        <div class="rival-mini">
          ${carVisualHTML(t.drivers[1], t.components, slot2?slot2.carNumber:2)}
          <div class="rival-mini-name">${flag(t.drivers[1].naz)} ${t.drivers[1].nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.drivers[1].rating} RATING</div>
        </div>
      </div>
      <div class="dim mono" style="font-size:11px;margin-top:8px;">${state.constructorStandings[id].points} ${window.t('rival_constructor_points')} <b style="color:var(--cyan);font-size:13px;">${Math.round(aiTeamWeightedStrength(t))}</b></div>
    </div>`;
  }).join('');

  const title = notice.initial ? window.t('rival_title_initial') : window.t('rival_title_new');
  const subtitle = notice.initial
    ? (notice.newTeamIds.length>1 ? window.t('rival_subtitle_initial_plural') : window.t('rival_subtitle_initial_single'))
    : window.t('rival_subtitle_new', notice.surpassedNames.join(', ')) + (notice.newTeamIds.length>1 ? window.t('rival_new_goal_plural') : window.t('rival_new_goal_single'));

  app.innerHTML = `
  ${topbarHTML()}
  <div class="hero" style="padding:24px 20px;">
    <div class="hero-inner">
      <h1 class="hdr" style="font-size:28px;">${title}</h1>
      <div class="tagline">${subtitle}</div>
    </div>
  </div>
  <div class="btnrow"><button class="primary" data-action="continue-from-rival-announce">${window.t('rival_continue')}</button></div>
  <div class="grid grid-2">${myTeamHTML}${teamsHTML}</div>
  `;
  bindActions();
}
// Pannello permanente con le scuderie rivali attuali e il confronto punti
function rivalPanelHTML(){
  if(!state.rivals || !state.rivals.length) return '';
  const rows = state.rivals.map(id=>{
    const cs = state.constructorStandings[id];
    const t = state.aiTeams.find(x=>x.id===id);
    if(!cs || !t) return '';
    const myPoints = state.constructorStandings['PLAYER'].points;
    const diff = myPoints - cs.points;
    const diffLabel = diff>0 ? window.t('rival_ahead', diff) : diff<0 ? window.t('rival_behind', Math.abs(diff)) : window.t('rival_tied');
    const rStrength = aiTeamWeightedStrength(t);
    const rCircles = aiTeamSynergyCircles(t);
    const slot1 = state.grid.find(g=>g.teamId===id && g.role===0);
    const slot2 = state.grid.find(g=>g.teamId===id && g.role===1);
    return `<div class="rival-card-full">
      <div class="upcoming-row">
        <span class="upcoming-name">${teamFlag(id)} ${cs.nome}</span>
        <span class="mono dim">${cs.points} pt</span>
        <span class="dim" style="font-size:11px;">${diffLabel}</span>
      </div>
      <div class="rival-full-row">
        <div class="rival-full-rating" style="color:${teamStrengthColor(rStrength)};">${rStrength}</div>
        <div class="rival-full-sem">${miniSemaforoHTML(rCircles)}</div>
      </div>
      <div class="grid grid-2" style="margin-top:8px;">
        <div class="rival-mini">
          ${carVisualHTML(t.drivers[0], t.components, slot1?slot1.carNumber:1)}
          <div class="rival-mini-name">${flag(t.drivers[0].naz)} ${t.drivers[0].nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.drivers[0].rating} RATING</div>
        </div>
        <div class="rival-mini">
          ${carVisualHTML(t.drivers[1], t.components, slot2?slot2.carNumber:2)}
          <div class="rival-mini-name">${flag(t.drivers[1].naz)} ${t.drivers[1].nome}</div>
          <div class="dim mono" style="font-size:11px;">${t.drivers[1].rating} RATING</div>
        </div>
      </div>
    </div>`;
  }).join('');
  return `
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${state.rivals.length>1?'Le Tue Rivali':'La Tua Rivale'}</h3><span class="dim mono" style="font-size:10px;">OBIETTIVO PRIMARIO</span></div>
    ${rows}
  </div>`;
}

function isRivalTeam(teamId){ return !!(state.rivals && state.rivals.includes(teamId)); }

// V0.9.4.4: colore della forza scuderia (media P1/P2), soglie calibrate sul meccanismo di draft reale
// (best-of-3): solo le combinazioni davvero estreme raggiungono il colore piu' alto (viola).
// Stessa palette usata per piloti/componenti (CAR_RARITY_COLOR), non i colori delle rarita' delle card.
function teamStrengthColor(v){
  if(v>=91) return '#B143F3';  // immortal
  if(v>=87) return '#F7B800';  // legendary
  if(v>=84) return '#EB3488';  // eccellente
  if(v>=80) return '#1D67EB';  // ottimo
  if(v>=76) return '#1892F5';  // intermedio
  if(v>=72) return '#22DCDC';  // discreto
  return '#6FD62F';            // debole
}

// V0.9.4.5: banner sinergie — visibile ed evidente quando attive, assente (non solo vuoto) quando non lo sono
// V0.9.4.6: semaforo sinergie — widget riusabile in hub/pit-lane/pregara, sempre visibile e pulsante.
// I pezzi spaiati si accoppiano in ordine di ruolo (non random ad ogni render, per restare stabili
// da una schermata all'altra) in cerchi "spenti" — nessun bonus, solo per completare la fila.
// V0.9.7: forza scuderia per una composizione qualsiasi (attuale o ipotetica) — stessa formula
// gia' usata altrove per il confronto rapido, ora riutilizzabile per anteprima prima/dopo.
function computeTeamStrength(t){
  const r1 = weightedBase({pilota:t.pilotMain.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating});
  const r2 = weightedBase({pilota:t.pilotSecond.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating});
  return Math.round((r1+r2)/2);
}

function semaforoCirclesData(overrideTeam){
  const slots = teamSynergySlots(undefined, overrideTeam);
  const groups = {};
  slots.forEach(s=>{ (groups[s.mentId]=groups[s.mentId]||[]).push(s); });
  const lit = [];
  let leftovers = [];
  Object.keys(groups).forEach(mentId=>{
    const items = groups[mentId].slice();
    while(items.length>=2) lit.push({ lit:true, a:items.shift(), b:items.shift(), mentId });
    if(items.length===1) leftovers.push(items[0]);
  });
  const dead = [];
  while(leftovers.length>=2) dead.push({ lit:false, a:leftovers.shift(), b:leftovers.shift() });
  if(leftovers.length===1) dead.push({ lit:false, a:leftovers.shift(), b:null });
  return [...lit, ...dead];
}

function semaforoHalfHTML(slot){
  if(!slot) return `<div class="sem-half" style="background:rgba(255,255,255,0.06);"></div>`;
  const m = MENTALITA_DEFS[slot.mentId];
  const isPilot = slot.catKey==='pilotMain' || slot.catKey==='pilotSecond';
  const kindLabel = isPilot ? 'Mentalità' : 'Tipologia';
  return `<div class="sem-half" style="background:${m.color};" title="${slot.roleLabel} (${slot.item.nome}) · ${kindLabel}: ${m.label}"></div>`;
}

// V0.9.4.6.1: forza scuderia prima/dopo il bonus sinergie, per mostrare la freccia "senza -> con".
// Richiede una squadra completa (fuori dal draft in corso, dove alcuni slot sono ancora vuoti).
function teamStrengthBeforeAfterSynergy(){
  const t = state.team;
  if(!t || !t.pilotMain || !t.pilotSecond || !t.motore || !t.telaio || !t.aero || !t.gomme || !t.stratega) return null;
  const r1 = Math.round(weightedBase({pilota:t.pilotMain.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating}));
  const r2 = Math.round(weightedBase({pilota:t.pilotSecond.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating}));
  const withSynergy = Math.round((r1+r2)/2);

  const bonus = t._synergyBonus || {};
  const base = k => (k==='pilotMain'?t.pilotMain.rating : k==='pilotSecond'?t.pilotSecond.rating : t[k].rating) - (bonus[k]||0);
  const b = { pilotMain:base('pilotMain'), pilotSecond:base('pilotSecond'), motore:base('motore'), telaio:base('telaio'), aero:base('aero'), gomme:base('gomme'), stratega:base('stratega') };
  const r1b = Math.round(weightedBase({pilota:b.pilotMain, motore:b.motore, telaio:b.telaio, aero:b.aero, gomme:b.gomme, stratega:b.stratega}));
  const r2b = Math.round(weightedBase({pilota:b.pilotSecond, motore:b.motore, telaio:b.telaio, aero:b.aero, gomme:b.gomme, stratega:b.stratega}));
  const withoutSynergy = Math.round((r1b+r2b)/2);

  return { withoutSynergy, withSynergy };
}

function semaforoWidgetHTML(){
  const circles = semaforoCirclesData();
  if(!circles.length) return '';
  const onFire = !!(state.team && state.team._synergyDiverseFire);
  const circlesHTML = circles.map(c=>{
    const glow = c.lit ? `style="--glow:${MENTALITA_DEFS[c.mentId].color};"` : '';
    return `<div class="sem-circle${c.lit?' full':''}${onFire?' on-fire':''}" ${glow}>${semaforoHalfHTML(c.a)}${semaforoHalfHTML(c.b)}</div>`;
  }).join('');
  const litCount = circles.filter(c=>c.lit).length;
  const strength = teamStrengthBeforeAfterSynergy();
  const strengthHTML = (strength && strength.withSynergy !== strength.withoutSynergy)
    ? `<div class="semaforo-strength">${strength.withoutSynergy} <span class="semaforo-arrow">→</span> <b style="color:${teamStrengthColor(strength.withSynergy)};">${strength.withSynergy}</b></div>`
    : (strength ? `<div class="semaforo-strength dim">${strength.withSynergy}</div>` : '');
  // V0.9.7.8.6: evidenziazione una tantum, consumata subito dopo per non ripetersi ai prossimi render
  const firstHighlight = !!state._synergyJustUnlocked;
  state._synergyJustUnlocked = false;
  return `<div class="semaforo-widget${onFire?' semaforo-on-fire':''}${firstHighlight?' semaforo-first-highlight':''}">
    <div class="semaforo-title-row">
      <div class="semaforo-title">${onFire?'🔥':'✨'} SEMAFORO SINERGIE${litCount?` · ${litCount} ${litCount>1?'ATTIVE':'ATTIVA'}`:''}${onFire?' · ON FIRE!':''}</div>
      ${strengthHTML}
    </div>
    <div class="semaforo-row">${circlesHTML}</div>
    ${firstHighlight ? '<div class="semaforo-first-tip">✨ Prima sinergia attivata! I pezzi con la stessa mentalità danno un bonus di rating quando sono insieme in squadra.</div>' : ''}
  </div>`;
}

function synergyBannerHTML(){ return semaforoWidgetHTML(); }

function renderHub(){
  const t = state.team;
  const circuit = state.calendar[state.raceIndex];

  const driverRows = driverStandingsSorted().map((d,i)=>{
    const cls = (d.isPlayerTeam ? (d.isFormer?'me former':'me') : '') + (isRivalTeam(d.teamId)?' rival':'');
    const posCls = i===0?'p1':i===1?'p2':i===2?'p3':'';
    const badge = d.isPlayerTeam ? ` <span class="badge-event ${d.isFormer?'ex':''}">${d.isFormer?'EX':'TU'}</span>` : (isRivalTeam(d.teamId)?' <span class="badge-event rival-badge">RIVALE</span>':'');
    return `<tr class="${cls}"><td><span class="pos ${posCls}">P${i+1}</span></td><td class="mono dim">#${d.carNumber}</td><td>${d.naz?flag(d.naz)+' ':''}${d.nome}${badge}</td><td class="dim">${d.teamNome}</td><td class="mono">${d.points}</td></tr>`;
  }).join('');

  const constructorRows = constructorStandingsSorted().map((c,i)=>{
    const cls = (c.isPlayerTeam ? 'me' : '') + (isRivalTeam(c.teamId)?' rival':'');
    const posCls = i===0?'p1':i===1?'p2':i===2?'p3':'';
    const rivalBadge = !c.isPlayerTeam && isRivalTeam(c.teamId) ? ' <span class="badge-event rival-badge">RIVALE</span>' : '';
    return `<tr class="${cls}"><td><span class="pos ${posCls}">P${i+1}</span></td><td>${teamFlag(c.teamId)} ${c.nome}${c.isPlayerTeam?' <span class="badge-event">TU</span>':rivalBadge}</td><td class="mono">${c.points}</td></tr>`;
  }).join('');

  const dots = state.calendar.map((c,i)=>{
    const cls = i<state.raceIndex ? 'done' : (i===state.raceIndex? 'now':'');
    return `<div class="dot ${cls}" title="${c.nome}">${i+1}</div>`;
  }).join('');

  const r1 = Math.round(weightedBase({pilota:t.pilotMain.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating}));
  const r2 = Math.round(weightedBase({pilota:t.pilotSecond.rating, motore:t.motore.rating, telaio:t.telaio.rating, aero:t.aero.rating, gomme:t.gomme.rating, stratega:t.stratega.rating}));

  // V0.9.4.2.9: hub alleggerito — solo l'essenziale sempre visibile (circuito, forza, posizione),
  // il resto (calendario, scuderia completa, classifiche, rivalita') dietro sezioni pieghevoli.
  const dstd = driverStandingsSorted();
  const cstd = constructorStandingsSorted();
  const p1PosIdx = dstd.findIndex(d=>d.slotKey==='PLAYER-1' && !d.isFormer);
  const cPosIdx = cstd.findIndex(c=>c.isPlayerTeam);
  const p1Pos = p1PosIdx>=0 ? p1PosIdx+1 : '—';
  const cPos = cPosIdx>=0 ? cPosIdx+1 : '—';

  const teamStrength = Math.round((r1+r2)/2);
  app.innerHTML = `
  ${topbarHTML()}
  <div class="circuit-banner">
    <div>
      <div class="eyebrow">${window.t('hub_next_gp')}</div>
      <h2 class="hdr" style="font-size:26px;">${flag(circuit.paese)} ${circuit.nome} ${circuitStatusBadgeHTML(circuit.nome)}</h2>
      <div class="dim" style="font-size:13px;margin-top:4px;">${nationLabel(circuit.paese)} · ${circuit.tipo} · ${circuit.lunghezza}km/giro · ${circuit.giri} giri · ${(circuit.lunghezza*circuit.giri).toFixed(0)}km totali · ${window.t('hub_weather')} ${circuit.clima}</div>
      <div style="margin-top:8px;font-size:12px;" class="dim">${window.t('hub_dominant_component')}: <b style="color:var(--cyan);">${displayArea(circuit.componentedominante)}</b> · ${window.t('hub_special_event')}: ${circuit.eventospeciale}</div>
    </div>
    <div class="circuit-stats">
      <div class="cstat"><div class="n">${EMOJI_RAIN} ${circuit.probpioggia}%</div><div class="l">${window.t('hub_rain')}</div></div>
      <div class="cstat"><div class="n">${EMOJI_SAFETYCAR} ${circuit.probsc}%</div><div class="l">${window.t('hub_safety_car')}</div></div>
      <div class="cstat"><div class="n">${EMOJI_OVERTAKE} ${circuit.sorpassabilita}</div><div class="l">${window.t('hub_overtake')}</div></div>
      <div class="cstat"><div class="n">${EMOJI_TIRE} ${circuit.degrado}</div><div class="l">${window.t('hub_degradation')}</div></div>
    </div>
  </div>
  <div class="hub-quick-stats">
    <div class="hub-quick-stat"><div class="hub-quick-val" style="color:${teamStrengthColor(teamStrength)};">${teamStrength}</div><div class="hub-quick-label">${window.t('hub_team_strength')}</div></div>
    <div class="hub-quick-stat"><div class="hub-quick-val">P${p1Pos}</div><div class="hub-quick-label">${window.t('hub_pos_drivers')}</div></div>
    <div class="hub-quick-stat"><div class="hub-quick-val">P${cPos}</div><div class="hub-quick-label">${window.t('hub_pos_constructors')}</div></div>
  </div>
  ${synergyBannerHTML()}
  <div class="btnrow"><button class="primary" data-action="run-race">${window.t('hub_go_to_gp')}</button></div>

  <details class="hub-expand">
    <summary>${window.t('hub_rivalry')}</summary>
    ${rivalPanelHTML()}
  </details>

  <details class="hub-expand">
    <summary>${window.t('hub_calendar')} <span class="dim mono" style="font-size:11px;">${window.t('hub_race_word')} ${state.raceIndex+1}/${state.calendar.length}</span></summary>
    <div class="panel">
      <div class="calendar">${dots}</div>
    </div>
  </details>

  <details class="hub-expand">
    <summary>${window.t('hub_your_team')}</summary>
    <div class="panel">
      <div class="roster">
        ${componentRow(window.t('comp_driver1'), t.pilotMain)}
        ${componentRow(window.t('comp_driver2'), t.pilotSecond)}
        ${componentRow(window.t('comp_engine'), t.motore)}
        ${componentRow(window.t('comp_chassis'), t.telaio)}
        ${componentRow('Aero', t.aero)}
        ${componentRow('Gomme', t.gomme)}
        ${componentRow('Team Principal', t.stratega)}
      </div>
    </div>
  </details>

  <details class="hub-expand">
    <summary>📊 Classifiche Complete</summary>
    <div class="grid grid-2">
      <div class="panel">
        <div class="panel-title"><h3 class="hdr">Classifica Piloti</h3><span class="dim mono" style="font-size:11px;">20 PILOTI</span></div>
        <table><thead><tr><th>Pos</th><th>#</th><th>Pilota</th><th>Scuderia</th><th>Punti</th></tr></thead><tbody>${driverRows}</tbody></table>
      </div>
      <div class="panel">
        <div class="panel-title"><h3 class="hdr">Classifica Costruttori</h3><span class="dim mono" style="font-size:11px;">10 SCUDERIE</span></div>
        <table><thead><tr><th>Pos</th><th>Scuderia</th><th>Punti</th></tr></thead><tbody>${constructorRows}</tbody></table>
      </div>
    </div>
  </details>
  `;
  bindActions();
}

function driverStandingsSorted(){
  return Object.values(state.driverStandings).sort((a,b)=> b.points-a.points || b.wins-a.wins || b.podiums-a.podiums);
}
// Bug fix (segnalato da Gio): i totali di stagione (fine stagione + card di condivisione) sommavano
// solo i record CORRENTI dei due sedili (PLAYER-1/PLAYER-2), perdendo le statistiche di ogni pilota
// sostituito durante la stagione (scouting in pit lane o Mid Season Draft), che restano archiviate
// in record separati "-EX-N" con isPlayerTeam:true. Questa funzione somma TUTTI i record del
// giocatore (correnti + EX), cosi' nulla va perso quando cambi pilota a stagione in corso.
function playerSeasonTotals(){
  return Object.values(state.driverStandings)
    .filter(d=>d.isPlayerTeam)
    .reduce((acc,d)=>{
      acc.points += d.points; acc.wins += d.wins; acc.podiums += d.podiums; acc.dnfs += d.dnfs;
      return acc;
    }, {points:0, wins:0, podiums:0, dnfs:0});
}
function constructorStandingsSorted(){
  return Object.values(state.constructorStandings).sort((a,b)=> b.points-a.points);
}

// V0.9.7: banner vittoria — "VITTORIA!" come messaggio primario, etichetta trofeo come sottotitolo.
// Due varianti di festeggiamento: raggi+trofeo per il primo trofeo su un circuito (evento raro,
// merita piu' peso), streak di velocita' per le vittorie successive sullo stesso circuito.
function trophyUnlockBannerHTML(){
  const t = state.lastTrophyUnlock;
  if(!t) return '';
  const img = `assets/circuit-trophies/${slugify(t.circuitName)}_oro.webp`;
  const subLabel = t.isFirstTime ? 'TROFEO SBLOCCATO!' : `${t.totalWins}ª VITTORIA SU QUESTO CIRCUITO`;

  if(t.isFirstTime){
    // V0.9.7.8: chiusa esplicitamente dall'utente (pulsante Continua) — finche' non la chiude, resta
    // in primo piano sopra la schermata risultato/classifica/log, che intanto e' gia' pronta sotto.
    if(state.trophyUnlockDismissed) return '';
    return `
    <div class="trophy-unlock-fullscreen" data-action="dismiss-trophy-unlock">
      <div class="trophy-unlock-fullscreen-card">
        <div class="victory-vignette"></div>
        <div class="victory-rays"></div>
        <img src="${img}" alt="" class="victory-trophy-pop victory-trophy-pop-lg">
        <div class="victory-title">VITTORIA!</div>
        <div class="victory-sub">
          <div class="trophy-unlock-label">${subLabel}</div>
          <div class="dim">${t.circuitName}</div>
        </div>
        <div class="btnrow" style="justify-content:center;margin-top:22px;position:relative;z-index:5;">
          <button class="primary" data-action="dismiss-trophy-unlock">Continua →</button>
        </div>
      </div>
    </div>`;
  }

  // colori scuderia (arancione principale + ciano accento), stesse tonalita' usate nel resto della UI
  const streakColors = ['#FF6A1A','#FF6A1A','#35E1C1','#FF6A1A','#35E1C1'];
  const streaks = Array.from({length:10}).map((_,i)=>{
    const top = 8 + Math.random()*84;
    const width = 90 + Math.random()*160;
    const dur = (0.55 + Math.random()*0.5).toFixed(2);
    const del = (Math.random()*0.35).toFixed(2);
    const angle = (-3 + Math.random()*6).toFixed(1);
    const c = streakColors[i % streakColors.length];
    return `<div class="victory-streak" style="top:${top}%;width:${width}px;--c:${c};--dur:${dur}s;--del:${del}s;transform:rotate(${angle}deg);"></div>`;
  }).join('');

  // V0.9.7.8: mancava l'immagine del trofeo in questa variante (c'era solo nella prima vittoria) — aggiunta.
  return `
  <div class="panel trophy-unlock-banner">
    <div class="victory-streaks">${streaks}</div>
    <img src="${img}" alt="" class="victory-trophy-pop">
    <div class="victory-title">VITTORIA!</div>
    <div class="victory-sub">
      <div class="trophy-unlock-label">${subLabel}</div>
      <div class="dim">${t.circuitName}</div>
    </div>
  </div>`;
}

// V0.9.4.4: spiegazione del risultato — fattori concreti che hanno inciso, senza inventare causalita' che non possiamo calcolare
function raceExplanationHTML(r, slotKey){
  const e = r.entries.find(x=>x.slotKey===slotKey);
  const grid = r.gridPos[slotKey];
  const lines = [];

  if(e.dnf){
    lines.push({ sign:'neg', text:t('expl_retired') });
  } else {
    const delta = grid - e.pos; // positivo = posizioni guadagnate
    if(delta > 0) lines.push({ sign:'pos', text:t('expl_gained', grid, e.pos, delta) });
    else if(delta < 0) lines.push({ sign:'neg', text:t('expl_lost', grid, e.pos, delta) });
    else lines.push({ sign:'neu', text:t('expl_same', grid) });
  }

  // componente dominante del circuito, confrontata con la fascia di rating (qualitativa, non un numero a caso)
  const domKey = DOM_KEY_MAP[r.circuit.componentedominante];
  if(domKey){
    const isPilotDom = domKey==='pilota';
    const compRating = isPilotDom
      ? (slotKey==='PLAYER-1' ? state.team.pilotMain.rating : state.team.pilotSecond.rating)
      : state.team[domKey].rating;
    const band = compRating>=90?t('expl_band_excellent'):compRating>=80?t('expl_band_good'):compRating>=70?t('expl_band_average'):compRating>=60?t('expl_band_below'):t('expl_band_weak');
    const sign = compRating>=80?'pos':compRating>=70?'neu':'neg';
    lines.push({ sign, text:t('expl_dominant', displayArea(r.circuit.componentedominante), compRating, band) });
  }

  // meteo: se ha piovuto, la gestione pioggia del pilota conta
  if(r.weatherAfter==='Pioggia' || r.weatherBefore==='Pioggia'){
    const pilot = slotKey==='PLAYER-1' ? state.team.pilotMain : state.team.pilotSecond;
    const rainStat = pilot.pioggia;
    const sign = rainStat>=75?'pos':rainStat>=55?'neu':'neg';
    const changed = r.weatherBefore!==r.weatherAfter;
    lines.push({ sign, text:`${changed?t('expl_rain_changed'):t('expl_rain_wet')} ${t('expl_rain_handling', pilot.nome.split(' ').pop(), rainStat)}` });
  }

  // safety car: evento neutro, segnaliamo solo che c'e' stato (senza inventare quanto abbia inciso)
  if(r.safetyCarPhase!=null){
    lines.push({ sign:'neu', text:t('expl_safety_car') });
  }

  return lines.map(l=>`<div class="logline ${l.sign}"><span class="icon">${l.sign==='pos'?'▲':l.sign==='neg'?'▼':'–'}</span><span>${l.text}</span></div>`).join('');
}

function renderRaceResult(){
  const r = state.lastRaceResult;
  const rows = r.entries.map(e=>{
    const cls = (e.isPlayerTeam ? 'me' : '') + (isRivalTeam(e.teamId)?' rival':'');
    const posCls = e.pos===1?'p1':e.pos===2?'p2':e.pos===3?'p3':'';
    const evBadge = e.event ? `<span class="badge-event">${evName(e.event.nome)}</span>` : '';
    const rivalBadge = !e.isPlayerTeam && isRivalTeam(e.teamId) ? ` <span class="badge-event rival-badge">${t('race_result_rival_badge')}</span>` : '';
    return `<tr class="${cls}"><td><span class="pos ${posCls}">${e.dnf?t('race_result_retired'):'P'+e.pos}</span></td><td class="mono dim">#${e.carNumber}</td><td>${e.driverName}${e.isPlayerTeam?` <span class="badge-event">${t('race_result_you_badge')}</span>`:rivalBadge}${evBadge}</td><td class="dim">${e.teamName}</td><td class="mono">${e.points}</td></tr>`;
  }).join('');

  // V0.9.7.8.30 fix: il filtro usava regex su parole italiane ("Ritiro","meteo cambia") che in
  // EN/ES non esistono piu' nel testo gia' tradotto — ora usa il marcatore imp:true messo alla
  // fonte in buildPhaseLog, indipendente dalla lingua.
  const fullNm1 = state.team.pilotMain.nome, fullNm2 = state.team.pilotSecond.nome;
  const importantLines = r.fullLog.filter(l =>
    l.imp || l.text.includes(fullNm1) || l.text.includes(fullNm2)
  );
  const highlightLines = importantLines.slice(0, 8);
  const highlightLog = highlightLines.length
    ? highlightLines.map(l=>`<div class="logline ${l.tone}"><span class="icon">${l.tone==='pos'?'▲':l.tone==='neg'?'▼':'–'}</span><span>${l.text}</span></div>`).join('')
    : `<div class="logline neu"><span class="icon">–</span>${t('race_result_no_events')}</div>`;
  const fullLogHTML = r.fullLog.map(l=>`<div class="logline ${l.tone}"><span class="icon">${l.tone==='pos'?'▲':l.tone==='neg'?'▼':'–'}</span><span>${l.text}</span></div>`).join('');

  const p1 = r.entries.find(e=>e.slotKey==='PLAYER-1');
  const p2 = r.entries.find(e=>e.slotKey==='PLAYER-2');
  const nm1 = state.team.pilotMain.nome.split(' ').pop();
  const nm2 = state.team.pilotSecond.nome.split(' ').pop();
  const headline = `${nm1}: ${p1.dnf?t('race_result_retired_full'):'P'+p1.pos} · ${nm2}: ${p2.dnf?t('race_result_retired_full'):'P'+p2.pos}`;

  app.innerHTML = `
  ${topbarHTML()}
  <div class="panel">
    <div class="eyebrow">${t('race_result_title', state.raceIndex+1, state.calendar.length)} — ${flag(r.circuit.paese)} ${r.circuit.nome}</div>
    <h2 class="hdr" style="font-size:26px;">${headline}</h2>
  </div>
  ${trophyUnlockBannerHTML()}
  <div class="btnrow"><button class="primary" data-action="continue-to-pitlane">${t('race_result_continue')}</button></div>
  <details class="hub-expand">
    <summary>${t('race_result_why')}</summary>
    <div class="panel">
      <div class="panel-title"><h3 class="hdr" style="font-size:15px;">${nm1} — ${p1.dnf?t('race_result_retired_full'):'P'+p1.pos}</h3></div>
      ${raceExplanationHTML(r,'PLAYER-1')}
      <div class="panel-title" style="margin-top:14px;"><h3 class="hdr" style="font-size:15px;">${nm2} — ${p2.dnf?t('race_result_retired_full'):'P'+p2.pos}</h3></div>
      ${raceExplanationHTML(r,'PLAYER-2')}
    </div>
  </details>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('race_result_finish_order')}</h3><span class="dim mono" style="font-size:11px;">${t('race_result_20_drivers')}</span></div>
    <table><thead><tr><th>${t('race_result_th_pos')}</th><th>${t('race_result_th_num')}</th><th>${t('race_result_th_driver')}</th><th>${t('race_result_th_team')}</th><th>${t('race_result_th_points')}</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('race_result_event_log')}</h3></div>
    ${highlightLog}
    <details class="card-details" style="margin-top:10px;">
      <summary onclick="event.stopPropagation()">${t('race_result_show_full_log', r.fullLog.length)}</summary>
      <div style="margin-top:8px;max-height:340px;overflow-y:auto;">${fullLogHTML}</div>
    </details>
  </div>
  `;
  bindActions();
}

function currentItemCardHTML(item){
  if(!item) return '';
  return `
  <div class="card current-item" data-rarity="${displayRarity(item)}">
    <span class="rarity-tag" data-rarity="${displayRarity(item)}">IN USO ORA</span>
    <div class="card-name">${item.nome}</div>
    <div class="card-arch">${item.arch||''}</div>
    <div class="card-rating">${item.rating}<span style="font-size:12px;color:var(--dim);"> RATING</span></div>
    <div class="tag-line dim">Componente attuale — resta in squadra se non scegli un\u2019alternativa</div>
  </div>`;
}

function upgradeTargetInfo(u){
  const areaMap = {'Piloti':'pilotMain','Motore':'motore','Telaio':'telaio','Aerodinamica':'aero','Gomme':'gomme','Strategia':'stratega'};
  if(u.area==='Globale'){
    const perComponent = Math.round(u.guadagno/3);
    return { label:'Tutta la vettura', change:`+${perComponent} RATING su motore, telaio, aero, gomme e stratega` };
  }
  const key = areaMap[u.area];
  const current = key ? state.team[key] : null;
  if(!current) return { label:displayArea(u.area), change:'' };
  const after = clamp(current.rating+u.guadagno, 1, 100);
  return { label:displayArea(u.area), change:`${current.rating} → ${after} RATING`, before:current.rating, after };
}

function riskLevel(prob){
  if(prob===0) return { label:'Nessun rischio', cls:'risk-none' };
  if(prob<=15) return { label:'Rischio fallimento basso', cls:'risk-low' };
  if(prob<=35) return { label:'Rischio fallimento medio', cls:'risk-mid' };
  return { label:'Rischio fallimento alto', cls:'risk-high' };
}

// V0.9.4.5: prezzo dello scambio scouting — proporzionale alla DIFFERENZA di rating tra quello che
// hai e quello che prendi. Positivo = paghi (rating piu' alto), negativo = incassi (rating piu' basso).
function scoutSwapPrice(current, candidate){
  const delta = candidate.rating - (current ? current.rating : candidate.rating);
  return Math.round(delta * 0.35 * 10) / 10;
}

function pitlaneCardHTML(node, idx){
  if(node.type==='upgrade'){
    const u = node.data;
    const isGuaranteed = u.probfallimento===0;
    const rarityLike = u.tier==='Legendary'?'Legendary':u.tier==='Elite'?'Epic':u.tier==='Avanzato'?'Rare':'Common';
    const typeLabel = isGuaranteed ? t('pcard_guaranteed') : t('pcard_development');
    const info = upgradeTargetInfo(u);

    if(isGuaranteed){
      // nessun rischio da negoziare: acquisto diretto al costo fisso, come prima
      const costoM = u.costo/1000000;
      const afford = state.budget >= costoM;
      return `
      <div class="card ${afford?'pickable':'card-frozen'}" data-rarity="${rarityLike}" ${afford?`data-action="confirm-upgrade-invest" data-idx="${idx}" data-fixed="1"`:''}>
        <div class="tag-line dim" style="text-transform:uppercase;letter-spacing:0.06em;font-size:9.5px;">${typeLabel}</div>
        <span class="rarity-tag" data-rarity="${rarityLike}">${u.tier}</span>
        <div class="card-name">${u.nome}</div>
        <div class="dev-target"><span class="dev-area">${info.label}</span><span class="dev-change mono">${info.change}</span></div>
        <div class="dev-meta"><span class="dev-cost">${t('pcard_cost')} <b class="mono">${fmtM(costoM)}</b></span><span class="dev-risk risk-none">${t('pcard_no_risk')}</span></div>
        ${!afford? `<div class="tag-line malus">${t('pcard_insufficient_budget')}</div>`:''}
        <div class="card-tap-hint">${afford?t('pcard_tap_buy'):''}</div>
      </div>`;
    }

    const t0 = reasonablePointT(u.probfallimento);
    const budgetM = state.budget;
    const maxT = maxAffordableT(u.costo, t0, budgetM);
    const frozen = maxT===null;
    const defaultT = frozen ? 0 : Math.floor(Math.min(t0, maxT)*100)/100;
    const defaultCostM = frozen ? 0 : investedCost(u.costo, defaultT, t0)/1000000;
    const defaultRisk = investedRisk(defaultT);
    const risk = riskLevel(defaultRisk);
    return `
    <div class="card ${frozen?'card-frozen':''}" data-rarity="${rarityLike}">
      <div class="tag-line dim" style="text-transform:uppercase;letter-spacing:0.06em;font-size:9.5px;">${typeLabel}</div>
      <span class="rarity-tag" data-rarity="${rarityLike}">${u.tier}</span>
      <div class="card-name">${u.nome}</div>
      <div class="dev-target">
        <span class="dev-area">${info.label}</span>
        <span class="dev-change mono">${info.change}</span>
      </div>
      ${frozen ? `
      <div class="tag-line malus">${t('pcard_frozen', RISK_MAX)}</div>
      ` : `
      <div class="invest-row">
        <input type="range" class="invest-slider" min="0" max="100" value="${Math.floor(defaultT*100)}" step="1"
          data-idx="${idx}" data-base-cost="${u.costo}" data-t0="${t0}" data-max-t="${maxT}">
        <div class="invest-readout">
          <span>${t('pcard_invest_cost')} <b class="mono" id="investCost-${idx}">${fmtM(defaultCostM)}</b></span>
          <span class="dev-risk ${risk.cls}" id="investRisk-${idx}">${risk.label} · ${defaultRisk}%</span>
        </div>
        <div class="dim" style="font-size:10px;margin-top:2px;">${t('pcard_slider_hint')}</div>
      </div>
      `}
      ${u.malus? `<div class="tag-line malus">${t('pcard_if_fails', u.malus)}</div>`:''}
      <details class="card-details">
        <summary onclick="event.stopPropagation()">${t('pcard_more_info')}</summary>
        <div class="tag-line dim">${t('pcard_dev_area', displayArea(u.area))}</div>
        ${u.durata? `<div class="tag-line dim">${t('pcard_duration', u.durata)}</div>`:''}
        <div class="tag-line dim">${t('pcard_risk_range', RISK_MIN, RISK_MAX, !!u.malus)}</div>
      </details>
      ${!frozen ? `<button class="primary" style="width:100%;margin-top:10px;" data-action="confirm-upgrade-invest" data-idx="${idx}">${t('pcard_confirm_invest')}</button>` : ''}
    </div>`;
  } else {
    const current = state.team[node.catKey];
    const isPilotCat = node.catKey==='pilotMain' || node.catKey==='pilotSecond';
    const kindLabel = isPilotCat ? t('pcard_mentality') : t('pcard_type');

    // la sinergia attuale (se il pezzo che stiamo per sostituire fa gia' parte di una coppia attiva)
    const currentPairs = activeSynergyPairs();
    const currentIsPaired = current && current.sinergia && currentPairs.some(([a,b])=> a.catKey===node.catKey || b.catKey===node.catKey);
    const unpaired = unpairedMentalities(node.catKey);

    function synHalfBadge(item, roleLabel){
      if(!item || !item.sinergia) return `<div class="syn-half-badge"><div class="sem-half" style="background:rgba(255,255,255,0.06);"></div><div class="sem-half" style="background:rgba(255,255,255,0.06);"></div></div>`;
      const m = MENTALITA_DEFS[item.sinergia];
      const kl = isPilotCat ? t('pcard_mentality') : t('pcard_type');
      return `<div class="syn-half-badge" title="${roleLabel} (${item.nome}) · ${kl}: ${mentaLabel(item.sinergia)}"><div class="sem-half" style="background:${m.color};"></div><div class="sem-half" style="background:rgba(255,255,255,0.05);"></div></div>`;
    }

    const currentRow = `
      <div class="scout-row current">
        ${synHalfBadge(current, node.catLabel)}
        <div class="scout-rating-box">${current.rating}</div>
        <div class="scout-mid">
          <div class="scout-tag">${t('pcard_in_use')}</div>
          <div class="scout-name">${current.nome}</div>
          <div class="scout-arch">${current.arch||''}</div>
        </div>
      </div>`;

    const opts = node.options.map(o=>{
      const cls = classifyReplacement(node.catKey, current, o);
      const price = scoutSwapPrice(current, o);
      const priceCls = price>0 ? 'price-cost' : (price<0 ? 'price-gain' : 'price-neutral');
      const priceText = price===0 ? '±0' : (price>0 ? `-${fmtM(price)}` : `+${fmtM(-price)}`);

      const sameAsCurrent = current && current.sinergia && o.sinergia===current.sinergia;
      const wouldGain = o.sinergia && unpaired.has(o.sinergia) && !sameAsCurrent;
      const wouldLose = currentIsPaired && !sameAsCurrent;
      let rowCls = '', boostLabel = '', rowStyle = '';
      if(wouldGain && !wouldLose){
        rowCls = 'card-synergy-gain';
        rowStyle = `style="--syn-glow:${MENTALITA_DEFS[o.sinergia].color};"`;
        boostLabel = `<div class="scout-boost-label" style="color:${MENTALITA_DEFS[o.sinergia].color};">${t('pcard_synergy_plus', mentaLabel(o.sinergia))}</div>`;
      } else if(wouldGain && wouldLose){
        rowCls = 'card-synergy-mixed';
        rowStyle = `style="--syn-glow:${MENTALITA_DEFS[o.sinergia].color};"`;
        boostLabel = `<div class="scout-boost-label" style="color:${MENTALITA_DEFS[o.sinergia].color};">${t('pcard_synergy_plus_short', mentaLabel(o.sinergia))}</div><div class="scout-boost-label" style="color:var(--danger);">${t('pcard_synergy_minus_short', mentaLabel(current.sinergia))}</div>`;
      } else if(wouldLose){
        boostLabel = `<div class="scout-boost-label" style="color:var(--danger);">${t('pcard_synergy_minus', mentaLabel(current.sinergia))}</div>`;
      }

      return `
      <div class="scout-row pickable ${rowCls}" ${rowStyle} data-action="open-scout-confirm" data-catkey="${node.catKey}" data-id="${o.id}">
        ${synHalfBadge(o, node.catLabel)}
        <div class="scout-rating-box">${o.rating}</div>
        <div class="scout-mid">
          <div class="scout-tag">${cls}</div>
          <div class="scout-name">${o.nome}</div>
          <div class="scout-arch">${o.arch||''}</div>
        </div>
        <div class="scout-right">
          <div class="scout-price ${priceCls}">${priceText}</div>
          ${boostLabel}
        </div>
      </div>`;
    }).join('');
    return `<div class="panel" style="grid-column:1/-1;">
      <div class="eyebrow" style="font-size:14px;">${t('pcard_scouting_title', node.catLabel)}</div>
      <div class="dim" style="font-size:14px;margin:8px 0;line-height:1.5;">${t('pcard_scouting_hint')}</div>
      <div class="dim" style="font-size:14px;margin-bottom:14px;line-height:1.5;">${t('pcard_scouting_note', kindLabel.toLowerCase())}</div>
      ${currentRow}
      ${opts}
    </div>`;
  }
}

function compareStatTable(catKey, current, candidate){
  const statsDef = COMPARE_STATS[catKey] || [['rating','Rating']];
  const rows = statsDef.map(([k,label])=>{
    if(current[k]===undefined || candidate[k]===undefined) return '';
    const invert = INVERT_STATS.has(k);
    const diff = candidate[k]-current[k];
    const goodness = invert ? -diff : diff;
    const cls = goodness>0.001?'cmp-better':(goodness<-0.001?'cmp-worse':'cmp-same');
    const sign = diff>0?'+':'';
    return `<tr class="${cls}"><td>${label}</td><td class="mono">${current[k]}</td><td class="mono">${candidate[k]}</td><td class="mono">${diff===0?'=':sign+diff}</td></tr>`;
  }).join('');
  return `<table class="cmp-table"><thead><tr><th>Statistica</th><th>Attuale</th><th>Proposto</th><th>Diff.</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function effectEstimateHTML(effect){
  const rows = [
    [t('eff_qualifying'), effect.qualifica],
    [t('eff_dry_race'), effect.asciutta],
    [t('eff_wet_race'), effect.bagnata],
    [t('eff_reliability'), effect.affidabilita],
    [t('eff_fast_circuits'), effect.veloci],
    [t('eff_street_circuits'), effect.cittadini]
  ];
  return rows.map(([label,val])=>{
    const cls = val>0.05?'cmp-better':(val<-0.05?'cmp-worse':'cmp-same');
    const sign = val>0?'+':'';
    return `<div class="effect-row ${cls}"><span>${label}</span><span class="mono">${sign}${val.toFixed(1)}%</span></div>`;
  }).join('');
}

function renderPitlaneConfirm(){
  const pr = state.pendingReplacement;
  const current = state.team[pr.catKey];
  const candidate = pr.options.find(o=>o.id===pr.candidateId);
  const classification = classifyReplacement(pr.catKey, current, candidate);
  const effect = state.pendingReplacementEffect;
  const price = scoutSwapPrice(current, candidate);
  const isDowngrade = price < 0;
  const canAfford = isDowngrade || state.budget >= price;

  // V0.9.7: anteprima "prima -> dopo" su semaforo e rating scuderia, calcolata su una squadra
  // ipotetica (clone con il candidato al posto dell'attuale) senza toccare lo stato reale.
  const teamBefore = state.team;
  const teamAfter = { ...state.team, [pr.catKey]: candidate };
  const circlesBefore = semaforoCirclesData(teamBefore);
  const circlesAfter = semaforoCirclesData(teamAfter);
  const strengthBefore = computeTeamStrength(teamBefore);
  const strengthAfter = computeTeamStrength(teamAfter);
  const strengthDelta = strengthAfter - strengthBefore;
  const strengthDeltaLabel = strengthDelta===0 ? '±0' : (strengthDelta>0? `+${strengthDelta}` : `${strengthDelta}`);
  const strengthDeltaColor = strengthDelta>0 ? 'var(--ok)' : strengthDelta<0 ? 'var(--danger)' : 'var(--dim)';

  app.innerHTML = `
  ${topbarHTML()}
  <div class="panel">
    <div class="eyebrow">${t('pc_confirm_title', pr.catLabel)}</div>
    <h2 class="hdr" style="font-size:24px;">${classification}</h2>
    <div class="panel-title" style="margin-top:14px;"><h3 class="hdr" style="font-size:13px;">${t('pc_semaforo_title')}</h3></div>
    <div class="grid grid-2" style="margin-top:8px;gap:10px;">
      <div class="mini" style="padding:10px;">
        <div class="role">${t('pc_before')}</div>
        <div style="margin:6px 0;">${miniSemaforoHTML(circlesBefore)}</div>
        <div class="rt">${strengthBefore} ${t('pc_rating')}</div>
      </div>
      <div class="mini" style="padding:10px;">
        <div class="role">${t('pc_after')}</div>
        <div style="margin:6px 0;">${miniSemaforoHTML(circlesAfter)}</div>
        <div class="rt">${strengthAfter} ${t('pc_rating')} <span style="color:${strengthDeltaColor};font-family:var(--font-mono);">(${strengthDeltaLabel})</span></div>
      </div>
    </div>
    <div class="dim" style="font-size:12px;margin-top:12px;">${t('pc_disclaimer')}</div>
    <div style="margin-top:10px;font-size:14px;">
      <b style="color:${isDowngrade?'var(--ok)':(canAfford?'var(--cyan)':'var(--danger)')};">${isDowngrade?t('pc_gain', fmtM(-price)):t('pc_cost', fmtM(price))}</b>
      · ${t('pc_budget_avail', fmtM(state.budget))}
    </div>
    ${isDowngrade ? `<div class="dim" style="font-size:12px;color:var(--ok);margin-top:4px;">${t('pc_downgrade_note')}</div>` : ''}
    ${!canAfford ? `<div class="dim" style="font-size:12px;color:var(--danger);margin-top:4px;">${t('pc_cant_afford')}</div>` : ''}
  </div>
  <div class="btnrow">
    <button class="primary" data-action="confirm-replacement" ${canAfford?'':'disabled'}>${t('pc_confirm_btn')}</button>
    <button class="ghost" data-action="cancel-replacement">${t('pc_cancel_btn')}</button>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('pc_current_vs_proposed')}</h3></div>
    <div class="grid grid-2" style="margin-bottom:14px;">
      <div class="mini" data-rarity="${displayRarity(current)||'Common'}" style="padding:12px;">
        <div class="role">${t('pc_current')}</div><div class="nm">${current.nome}</div><div class="rt">${current.rating} ${t('pc_rating')}</div>
      </div>
      <div class="mini" data-rarity="${displayRarity(candidate)}" style="padding:12px;">
        <div class="role">${t('pc_proposed')}</div><div class="nm">${candidate.nome}</div><div class="rt">${candidate.rating} ${t('pc_rating')}</div>
      </div>
    </div>
    ${compareStatTable(pr.catKey, current, candidate)}
    <div class="grid grid-2" style="margin-top:14px;">
      <div>
        <div class="tag-line dim" style="margin-bottom:4px;text-transform:uppercase;font-size:10px;">${t('pc_current_traits')}</div>
        ${current.bonus? `<div class="tag-line bonus">▲ ${current.bonus}</div>`:''}
        ${current.malus? `<div class="tag-line malus">▼ ${current.malus}</div>`:''}
        ${current.abilita? `<div class="ability">${current.abilita}</div>`:''}
        ${current.arch? `<div class="tag-line dim">${t('pc_trait')}: ${current.arch}</div>`:''}
      </div>
      <div>
        <div class="tag-line dim" style="margin-bottom:4px;text-transform:uppercase;font-size:10px;">${t('pc_proposed_traits')}</div>
        ${candidate.bonus? `<div class="tag-line bonus">▲ ${candidate.bonus}</div>`:''}
        ${candidate.malus? `<div class="tag-line malus">▼ ${candidate.malus}</div>`:''}
        ${candidate.abilita? `<div class="ability">${candidate.abilita}</div>`:''}
        ${candidate.arch? `<div class="tag-line dim">${t('pc_trait')}: ${candidate.arch}</div>`:''}
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('pc_estimated_effect')}</h3><span class="dim mono" style="font-size:10px;">${t('pc_avg_all_circuits')}</span></div>
    ${effectEstimateHTML(effect)}
  </div>
  `;
  bindActions();
}

function renderUpgradeSuspense(){
  const u = state.pendingUpgradeReveal;
  app.innerHTML = `
  ${topbarHTML()}
  <div class="suspense-screen pickable" data-action="skip-upgrade-suspense">
    <div class="suspense-spinner" aria-hidden="true">
      <div class="suspense-cell"></div><div class="suspense-cell"></div><div class="suspense-cell"></div>
      <div class="suspense-cell"></div><div class="suspense-cell"></div>
    </div>
    <div class="suspense-title">${t('upg_developing')}</div>
    <div class="suspense-sub dim">${u.nome}</div>
    <div class="dim" style="font-size:11px;margin-top:18px;">${t('upg_tap_skip')}</div>
  </div>
  `;
  bindActions();
}

function renderUpgradeResult(){
  const u = state.pendingUpgradeReveal;
  const icon = u.failed ? '❌' : '✅';
  const title = u.failed ? t('upg_failed') : t('upg_success');
  const cls = u.failed ? 'result-fail' : 'result-ok';
  app.innerHTML = `
  ${topbarHTML()}
  <div class="suspense-screen ${cls}">
    <div class="result-icon">${icon}</div>
    <div class="suspense-title">${title}</div>
    <div class="suspense-sub dim">${u.nome}${u.riskPct!==undefined?t('upg_risk_taken', u.riskPct):''}</div>
    ${u.failed
      ? `<div class="tag-line malus" style="margin-top:10px;font-size:13px;">${u.malus || t('upg_no_gain')}</div>`
      : `<div class="tag-line bonus" style="margin-top:10px;font-size:13px;">${u.area==='Globale' ? t('upg_gain_global', Math.round(u.guadagno/3)) : t('upg_gain_area', u.guadagno, displayArea(u.area))}</div>`}
  </div>
  <div class="btnrow" style="justify-content:center;"><button class="primary" data-action="continue-upgrade-result">${t('upg_continue')}</button></div>
  `;
  bindActions();
}

// V0.9.2: panoramica dei prossimi circuiti con il componente piu' utile, per scegliere meglio su cosa investire
function upcomingCircuitsHTML(){
  const upcoming = state.calendar.slice(state.raceIndex, state.raceIndex+4);
  if(!upcoming.length) return '';
  const rows = upcoming.map((c,i)=>{
    const isNext = i===0;
    return `<div class="upcoming-row ${isNext?'next':''}">
      <span class="mono dim" style="min-width:56px;">${isNext?t('upcoming_next'):t('upcoming_race', state.raceIndex+1+i)}</span>
      <span class="upcoming-name">${flag(c.paese)} ${c.nome}</span>
      <span class="dim" style="font-size:11px;">${c.tipo}</span>
      <span class="upcoming-dom" style="color:var(--cyan);">${displayArea(c.componentedominante)}</span>
    </div>`;
  }).join('');
  return `
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('upcoming_title')}</h3><span class="dim mono" style="font-size:10px;">${t('upcoming_most_useful')}</span></div>
    <div class="upcoming-list">${rows}</div>
  </div>`;
}

// V0.9.3: vista leggera delle rivali in pit-lane (solo monoposto + rating, senza dettaglio componenti)
function pitlaneRivalsHTML(){
  if(!state.rivals || !state.rivals.length) return '';
  const cardsHTML = state.rivals.map(id=>{
    const t = state.aiTeams.find(x=>x.id===id);
    if(!t) return '';
    const cs = state.constructorStandings[id];
    const slot1 = state.grid.find(g=>g.teamId===id && g.role===0);
    const slot2 = state.grid.find(g=>g.teamId===id && g.role===1);
    return `
    <div class="rival-mini-small">
      ${carVisualHTML(t.drivers[0], t.components, slot1?slot1.carNumber:1)}
      <div class="rival-mini-name">${teamFlag(id)} ${t.nome}</div>
      <div class="dim mono" style="font-size:10px;">${window.t('pit_strength')} <b style="color:var(--cyan);">${Math.round(aiTeamWeightedStrength(t))}</b> · ${cs.points} pt</div>
    </div>
    <div class="rival-mini-small">
      ${carVisualHTML(t.drivers[1], t.components, slot2?slot2.carNumber:2)}
      <div class="rival-mini-name dim" style="font-size:9.5px;">${t.drivers[1].nome}</div>
      <div class="dim mono" style="font-size:9.5px;">${t.drivers[1].rating} RATING</div>
    </div>`;
  }).join('');
  return `
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${state.rivals.length>1?window.t('pit_rivals_plural'):window.t('pit_rivals_single')}</h3><span class="dim mono" style="font-size:10px;">${window.t('pit_quick_ref')}</span></div>
    <div class="grid grid-4 rival-mini-grid">${cardsHTML}</div>
  </div>`;
}

// V0.9.4.1: indicatore "circuito nuovo" / "mai vinto qui" — mostrato ovunque compare il nome del prossimo circuito
function circuitStatusBadgeHTML(circuitName){
  const td = trophyData[circuitName];
  if(!td || td.raced===0) return '<span class="circuit-badge circuit-badge-new">⭐ NUOVO</span>';
  if(td.won===0) return '<span class="circuit-badge circuit-badge-unwon">Mai vinto qui</span>';
  return '';
}

// V0.9.4: Sala Trofei — accessibile dalla schermata scelta stagione e dal menu, persiste tra le carriere
function trophyCellHTML(circuit, dataSource){
  const src = dataSource || trophyData;
  const td = src[circuit.nome] || { raced:0, won:0 };
  const circuitSlug = slugify(circuit.nome);
  const shortName = circuit.nome.replace(' Grand Prix','');
  if(td.won>0){
    const img = `assets/circuit-trophies/${circuitSlug}_oro.webp`;
    return `<div class="trophy-cell trophy-gold">
      <div class="trophy-img-wrap"><img src="${img}" alt="${shortName}"><div class="trophy-count">${td.won}×</div></div>
      <div class="trophy-name">${flag(circuit.paese)} ${shortName}</div>
    </div>`;
  } else if(td.raced>0){
    const img = `assets/circuit-trophies/${circuitSlug}_bloccato.webp`;
    return `<div class="trophy-cell trophy-gray">
      <div class="trophy-img-wrap"><img src="${img}" alt="${shortName}"></div>
      <div class="trophy-name">${flag(circuit.paese)} ${shortName}</div>
    </div>`;
  }
  return `<div class="trophy-cell trophy-hidden">
    <div class="trophy-img-wrap"><div class="trophy-placeholder">?</div></div>
    <div class="trophy-name dim">${shortName}</div>
  </div>`;
}

// V0.9.4.1: Museo Dynasty — collezione piloti/componenti, accessibile insieme alla Sala Trofei
function museumCardHTML(item, isPilot){
  return `<div class="museum-card">
    <div class="museum-card-name">${isPilot && item.naz? flag(item.naz)+' ':''}${item.nome}</div>
    <div class="museum-card-arch">${item.arch||''}${!isPilot && item.catKey? ' · '+(COMPONENT_LABEL[item.catKey]||item.catKey):''}</div>
    <div class="museum-card-rating">${item.rating}</div>
  </div>`;
}

function renderMuseumDynasty(){
  const totalPiloti = DATA.piloti.length;
  const totalComponenti = DATA.motori.length + DATA.telai.length + DATA.aero.length + DATA.gomme.length + DATA.strategi.length;
  const unlockedPiloti = Object.keys(museumData.piloti).length;
  const unlockedComponenti = Object.keys(museumData.componenti).length;
  const totalAll = totalPiloti + totalComponenti;
  const unlockedAll = unlockedPiloti + unlockedComponenti;
  const pct = totalAll>0 ? Math.round(unlockedAll/totalAll*100) : 0;

  const pilotCards = Object.values(museumData.piloti).map(p=>museumCardHTML(p,true)).join('');
  const compCards = Object.values(museumData.componenti).map(c=>museumCardHTML(c,false)).join('');

  app.innerHTML = `
  <div class="hero" style="padding:26px 20px 20px;">
    <div class="hero-inner">
      <h1 class="hdr" style="font-size:30px;">${t('museum_title')}</h1>
      <div class="tagline">${t('museum_tagline')}</div>
    </div>
  </div>
  <div class="panel">
    <div class="trophy-stats-row">
      <div class="trophy-stat"><div class="trophy-stat-value">${unlockedAll}/${totalAll}</div><div class="trophy-stat-label">${t('museum_completion')} · ${pct}%</div></div>
    </div>
    <div class="btnrow"><button class="primary" data-action="close-museum">${t('museum_back')}</button></div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('museum_drivers')}</h3><span class="dim mono" style="font-size:11px;">${unlockedPiloti}/${totalPiloti}</span></div>
    <div class="museum-grid">${pilotCards || `<div class="dim" style="font-size:13px;">${t('museum_no_drivers')}</div>`}</div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('museum_components')}</h3><span class="dim mono" style="font-size:11px;">${unlockedComponenti}/${totalComponenti}</span></div>
    <div class="museum-grid">${compCards || `<div class="dim" style="font-size:13px;">${t('museum_no_components')}</div>`}</div>
  </div>
  `;
  bindActions();
}

function renderTrophyRoom(){
  const circuits = DATA.circuiti;
  const total = circuits.length;
  const racedCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].raced>0).length;
  const wonCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].won>0).length;
  const racedPct = Math.round(racedCount/total*100);
  const wonPct = Math.round(wonCount/total*100);
  const cardsHTML = circuits.map(c=>trophyCellHTML(c, trophyData)).join('');

  app.innerHTML = `
  <div class="hero" style="padding:26px 20px 20px;">
    <div class="hero-inner">
      <h1 class="hdr" style="font-size:30px;">${t('tr_title')}</h1>
      <div class="tagline">${t('tr_tagline')}</div>
    </div>
  </div>
  <div class="panel">
    <div class="trophy-stats-row">
      <div class="trophy-stat"><div class="trophy-stat-value">${racedCount}/${total}</div><div class="trophy-stat-label">${t('tr_raced')} · ${racedPct}%</div></div>
      <div class="trophy-stat"><div class="trophy-stat-value" style="color:var(--legendary);">${wonCount}/${total}</div><div class="trophy-stat-label">${t('tr_won')} · ${wonPct}%</div></div>
    </div>
    <div class="btnrow">
      <button class="ghost" data-action="share-trophy-room">${t('tr_share')}</button>
      <button class="ghost" data-action="open-museum">${t('tr_museum_btn')}</button>
      <button class="primary" data-action="close-trophy-room">${t('tr_back')}</button>
    </div>
  </div>
  <div class="panel">
    <div class="trophy-grid">${cardsHTML}</div>
  </div>
  `;
  bindActions();
}

// V0.9.7.9.3: Sala Trofei della Carriera Pilota — stesso markup/stile, dati e chiave di ritorno diversi.
function renderDriverTrophyRoom(){
  const circuits = DATA.circuiti;
  const total = circuits.length;
  const racedCount = circuits.filter(c=> driverTrophyData[c.nome] && driverTrophyData[c.nome].raced>0).length;
  const wonCount = circuits.filter(c=> driverTrophyData[c.nome] && driverTrophyData[c.nome].won>0).length;
  const racedPct = Math.round(racedCount/total*100);
  const wonPct = Math.round(wonCount/total*100);
  const cardsHTML = circuits.map(c=>trophyCellHTML(c, driverTrophyData)).join('');

  app.innerHTML = `
  <div class="hero" style="padding:26px 20px 20px;">
    <div class="hero-inner">
      <h1 class="hdr" style="font-size:30px;">🏁 ${t('mode_select_driver')}</h1>
      <div class="tagline">${t('tr_tagline')}</div>
    </div>
  </div>
  <div class="panel">
    <div class="trophy-stats-row">
      <div class="trophy-stat"><div class="trophy-stat-value">${racedCount}/${total}</div><div class="trophy-stat-label">${t('tr_raced')} · ${racedPct}%</div></div>
      <div class="trophy-stat"><div class="trophy-stat-value" style="color:var(--legendary);">${wonCount}/${total}</div><div class="trophy-stat-label">${t('tr_won')} · ${wonPct}%</div></div>
    </div>
    <div class="btnrow">
      <button class="ghost" data-action="open-museum">${t('tr_museum_btn')}</button>
      <button class="primary" data-action="close-driver-trophy-room">${t('tr_back')}</button>
    </div>
  </div>
  <div class="panel">
    <div class="trophy-grid">${cardsHTML}</div>
  </div>
  `;
  bindActions();
}

// V0.9.7.8.5: sandbox di anteprima nel Garage — stato transitorio, MAI salvato: serve solo a
// vedere come apparirebbe un pezzo di una data fascia, indipendentemente da cosa e' davvero
// equipaggiato in una run in corso. Le fasce disponibili sono le stesse 7 che esistono gia' in gioco.
const BAND_SAMPLE_RATING = { debole:50, discreto:65, intermedio:75, ottimo:85, eccellente:92, legendary:97, immortal:100 };
let garageSandbox = { motoreBand:'ottimo', telaioBand:'ottimo', aeroBand:'ottimo', gommeBand:'ottimo', helmetBand:'ottimo' };
let garageRevealedPatternId = null; // quale pattern bloccato ha il testo dell'obiettivo attualmente visibile
let garagePreviewPatternId = undefined; // undefined = usa quello salvato; string = anteprima non ancora applicata; null = "nessun pattern"

function garageSandboxCarHTML(){
  const fakePilot = { rating: BAND_SAMPLE_RATING[garageSandbox.helmetBand], nome:'' };
  const fakeComp = {
    motore:{ rating: BAND_SAMPLE_RATING[garageSandbox.motoreBand] },
    telaio:{ rating: BAND_SAMPLE_RATING[garageSandbox.telaioBand] },
    aero:{ rating: BAND_SAMPLE_RATING[garageSandbox.aeroBand] },
    gomme:{ rating: BAND_SAMPLE_RATING[garageSandbox.gommeBand] },
  };
  const previewPatternId = garagePreviewPatternId!==undefined ? garagePreviewPatternId : liveryData.selectedPatternId;
  return carVisualHTML(fakePilot, fakeComp, 1, previewPatternId, liveryData.selectedColor);
}

function garageBandSelectHTML(label, part){
  const options = RATING_BANDS_ORDER.map(b=> `<option value="${b}" ${garageSandbox[part]===b?'selected':''}>${CAR_RARITY_LABEL[b]}</option>`).join('');
  return `<label class="dim" style="display:flex;flex-direction:column;gap:2px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">
    ${label}
    <select class="garage-band-select" data-part="${part}" style="font-family:var(--font-ui);padding:6px;border-radius:4px;background:var(--panel2);border:1px solid var(--line);color:var(--text);">${options}</select>
  </label>`;
}

function garagePatternCardHTML(pattern){
  const unlocked = isLiveryPatternUnlocked(pattern.id);
  const isSelected = liveryData.selectedPatternId===pattern.id;
  const ach = ACHIEVEMENTS.find(a=>a.id===pattern.achievementId);
  const achLoc = achText(ach);
  const revealed = garageRevealedPatternId===pattern.id;
  if(!unlocked){
    return `<div class="card garage-pattern-card locked" data-action="reveal-garage-pattern" data-pattern="${pattern.id}">
      <div class="garage-pattern-swatch locked">🔒</div>
      <div class="garage-pattern-name dim">${pattern.nome}</div>
      ${revealed
        ? `<div class="garage-pattern-req">Si sblocca con:<br><b style="color:var(--legendary);">${ach?achLoc.title:'?'}</b><br><span class="dim" style="font-size:10.5px;">${ach?achLoc.desc:''}</span></div>`
        : `<div class="dim" style="font-size:10.5px;">Tocca per vedere come si sblocca</div>`}
    </div>`;
  }
  return `<div class="card garage-pattern-card ${isSelected?'selected':''}" data-action="select-garage-pattern" data-pattern="${pattern.id}">
    <div class="garage-pattern-swatch"><img src="${getPatternedChassisSrc('ottimo', pattern.id, liveryData.selectedColor)}" alt=""></div>
    <div class="garage-pattern-name">${pattern.nome}</div>
    ${isSelected ? '<div class="garage-pattern-active">✓ Applicato</div>' : ''}
  </div>`;
}

// V0.9.7.8.6: ruota colore custom — il picker nativo <input type="color"> apre un widget di sistema
// che non controlliamo (su alcuni telefoni i cursori saturazione/luminosita' partono da sinistra,
// cioe' da spento/grigio). Con un picker nostro decidiamo noi i default: saturazione e luminosita'
// partono gia' al massimo (cursore a destra), l'utente parte sempre da un colore pieno e vivo.
function hexToHsl(hex){
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0,s=0,l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if(max===r) h=(g-b)/d+(g<b?6:0);
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  return { h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100) };
}
function hslToHex(h,s,l){
  s/=100; l/=100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r,g,b;
  if(h<60){r=c;g=x;b=0;} else if(h<120){r=x;g=c;b=0;} else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;} else if(h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
  const toHex=v=>Math.round((v+m)*255).toString(16).padStart(2,'0');
  return '#'+toHex(r)+toHex(g)+toHex(b);
}
function garageColorPickerHTML(){
  const cur = hexToHsl(liveryData.selectedColor);
  return `
    <div class="garage-color-picker">
      <div class="garage-color-swatch" style="background:${liveryData.selectedColor};"></div>
      <div class="garage-color-sliders">
        <input type="range" id="hueSlider" class="hue-slider" min="0" max="359" value="${cur.h}">
        <input type="range" id="satSlider" class="sat-slider" min="0" max="100" value="${cur.s}" style="--hue:${cur.h}deg;">
        <input type="range" id="lightSlider" class="light-slider" min="0" max="100" value="${cur.l}" style="--hue:${cur.h}deg;--sat:${cur.s}%;">
      </div>
    </div>`;
}

function renderGarage(){
  syncLiveryUnlocksFromAchievements(); // V0.9.7.8.7: difensivo, non costa nulla e garantisce coerenza
  const patternCards = LIVERY_PATTERNS.map(garagePatternCardHTML).join('');
  app.innerHTML = `
  <div class="hero" style="padding:26px 20px 20px;">
    <div class="hero-inner">
      <h1 class="hdr" style="font-size:30px;">🎨 Garage</h1>
      <div class="tagline">Sblocca pattern per il telaio completando obiettivi, scegli il colore, prova ogni fascia prima di decidere. La scelta resta valida in tutte le prossime carriere.</div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">Anteprima — sandbox</h3></div>
    <div class="dim" style="font-size:11.5px;margin-bottom:10px;">Le fasce qui sotto servono solo a vedere come appare ogni pezzo: non cambiano la tua scuderia reale.</div>
    <div style="max-width:320px;margin:0 auto 14px;">${garageSandboxCarHTML()}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${garageBandSelectHTML('Telaio','telaioBand')}
      ${garageBandSelectHTML('Aerodinamica','aeroBand')}
      ${garageBandSelectHTML('Gomme','gommeBand')}
      ${garageBandSelectHTML('Casco (pilota)','helmetBand')}
    </div>
    <div style="margin-top:14px;">
      <label class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:8px;">Colore pattern</label>
      ${garageColorPickerHTML()}
    </div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">Pattern (${liveryData.unlockedPatternIds.length}/${LIVERY_PATTERNS.length} sbloccati)</h3></div>
    <div class="garage-pattern-grid">
      <div class="card garage-pattern-card ${liveryData.selectedPatternId===null?'selected':''}" data-action="select-garage-pattern" data-pattern="">
        <div class="garage-pattern-swatch" style="display:flex;align-items:center;justify-content:center;font-size:20px;">—</div>
        <div class="garage-pattern-name">Nessun pattern</div>
        ${liveryData.selectedPatternId===null ? '<div class="garage-pattern-active">✓ Applicato</div>' : ''}
      </div>
      ${patternCards}
    </div>
  </div>
  <div class="panel">
    <div class="btnrow"><button class="primary" data-action="close-garage">← Torna Indietro</button></div>
  </div>
  `;
  bindActions();
  const hueSlider = document.getElementById('hueSlider');
  const satSlider = document.getElementById('satSlider');
  const lightSlider = document.getElementById('lightSlider');
  if(hueSlider && satSlider && lightSlider){
    const onColorChange = ()=>{
      liveryData.selectedColor = hslToHex(Number(hueSlider.value), Number(satSlider.value), Number(lightSlider.value));
      saveLiveryData();
      renderGarage();
    };
    hueSlider.addEventListener('input', onColorChange);
    satSlider.addEventListener('input', onColorChange);
    lightSlider.addEventListener('input', onColorChange);
  }
  document.querySelectorAll('.garage-band-select').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      garageSandbox[sel.dataset.part] = sel.value;
      renderGarage();
    });
  });
}


function renderPitlane(){
  const nodes = state.pendingPitlane;
  window._pitOptions = nodes;
  const cards = nodes.map((n,i)=> n.type==='upgrade' ? pitlaneCardHTML(n,i) : '').join('');
  const scoutNode = nodes.find(n=>n.type==='scout');
  const t = state.team;
  const compShared = { motore:t.motore, telaio:t.telaio, aero:t.aero, gomme:t.gomme, stratega:t.stratega };
  const p1Slot = state.grid.find(g=>g.slotKey==='PLAYER-1');
  const p2Slot = state.grid.find(g=>g.slotKey==='PLAYER-2');
  app.innerHTML = `
  ${topbarHTML()}
  <div class="panel">
    <div class="eyebrow" style="font-size:14px;">${window.t('pitlane_window')}</div>
    <h2 class="hdr" style="font-size:26px;">${window.t('pitlane_headline')}</h2>
    <div class="dim" style="font-size:14px;margin-top:8px;line-height:1.5;">${window.t('pitlane_subtitle')}</div>
  </div>
  <div class="btnrow"><button class="ghost" data-action="skip-pitlane">${window.t('pitlane_skip')}</button></div>
  <div class="grid grid-3">${cards}</div>
  ${scoutNode ? pitlaneCardHTML(scoutNode) : ''}
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${window.t('pitlane_team_now')}</h3><span class="strength-badge">${window.t('pitlane_strength')} <b>${Math.round(playerStrength())}</b></span></div>
    <div class="grid grid-2 pitlane-cars">
      <div class="pitlane-car-mini">
        ${carVisualHTML(t.pilotMain, compShared, p1Slot.carNumber)}
        <div class="pregara-name" style="font-size:12px;margin-top:6px;">${flag(t.pilotMain.naz)} ${t.pilotMain.nome} · ${t.pilotMain.rating} RATING</div>
      </div>
      <div class="pitlane-car-mini">
        ${carVisualHTML(t.pilotSecond, compShared, p2Slot.carNumber)}
        <div class="pregara-name" style="font-size:12px;margin-top:6px;">${flag(t.pilotSecond.naz)} ${t.pilotSecond.nome} · ${t.pilotSecond.rating} RATING</div>
      </div>
    </div>
    <div class="pregara-legend" style="margin-top:10px;">
      ${pregaraLegendRow(window.t('comp_engine').toUpperCase(), t.motore)}
      ${pregaraLegendRow(window.t('comp_chassis').toUpperCase(), t.telaio)}
      ${pregaraLegendRow(window.t('comp_aero').toUpperCase(), t.aero)}
      ${pregaraLegendRow(window.t('comp_tires').toUpperCase(), t.gomme)}
      ${pregaraLegendRow(window.t('comp_strategist').toUpperCase(), t.stratega)}
    </div>
    ${semaforoWidgetHTML()}
  </div>
  ${upcomingCircuitsHTML()}
  ${pitlaneRivalsHTML()}
  `;
  bindActions();
}

// V0.9.3.1: colori bandiera (semplificati) per i fuochi d'artificio del titolo costruttori
const NATION_FIREWORK_COLORS = {
  'Italia':['#009246','#ffffff','#ce2b37'], 'Francia':['#0055A4','#ffffff','#EF4135'],
  'Germania':['#000000','#DD0000','#FFCE00'], 'Regno Unito':['#012169','#ffffff','#C8102E'],
  'Spagna':['#AA151B','#F1BF00'], 'Stati Uniti':['#3C3B6E','#ffffff','#B22234'],
  'Giappone':['#ffffff','#BC002D'], 'Brasile':['#009739','#FEDD00','#012169'],
  'Canada':['#FF0000','#ffffff'], 'Australia':['#00008B','#ffffff','#FF0000'],
  'Cina':['#DE2910','#FFDE00'], 'India':['#FF9933','#ffffff','#138808'],
  'Messico':['#006847','#ffffff','#CE1126'], 'Paesi Bassi':['#AE1C28','#ffffff','#21468B'],
  'Belgio':['#000000','#FAE042','#ED2939'], 'Svizzera':['#FF0000','#ffffff'],
  'Austria':['#ED2939','#ffffff'], 'Portogallo':['#046A38','#DA291C'],
  'Sudafrica':['#007A4D','#FFB612','#DE3831'], 'Corea del Sud':['#003478','#C60C30','#ffffff'],
};
function nationFireworkColors(nation){ return NATION_FIREWORK_COLORS[nation] || ['#FFD700','#ffffff','#FF6A1A']; }

// V0.9.3.3: card dei risultati da condividere — stesso principio del mockup approvato:
// altezza calcolata in sequenza (si adatta alla posa), logo grande, niente link scritto nei pixel.
function loadImg(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function buildShareCardCanvas(){
  const dstd = driverStandingsSorted();
  const cstd = constructorStandingsSorted();
  const p1 = state.driverStandings['PLAYER-1'];
  const p2 = state.driverStandings['PLAYER-2'];
  const constructorPos = cstd.findIndex(c=>c.teamId==='PLAYER')+1;
  const driverChamp = dstd[0];
  const constructorChamp = cstd[0];
  const isDriverChamp = driverChamp.isPlayerTeam;

  // V0.9.7.8: fix bug segnalato da Gio — i totali ora includono anche le statistiche di eventuali
  // piloti sostituiti a stagione in corso (record EX), non solo i due sedili correnti.
  const { points: totalPoints, wins: totalWins, podiums: totalPodiums, dnfs: totalDnfs } = playerSeasonTotals();

  const bestDriverRating = Math.max(state.team.pilotMain.rating, state.team.pilotSecond.rating);
  const band = ratingBandKey(bestDriverRating);

  let title, subtitle;
  if(isDriverChamp){ title = t('share_world_champion'); subtitle = t('share_drivers_title', teamDisplayName()); }
  else { title = teamDisplayName().toUpperCase(); subtitle = t('share_season_over', constructorPos); }
  const metaLine = `${state.seasonLength===20?t('share_full_season'):t('share_quick_season')}  ·  ${DIFFICULTY_LABEL[state.difficulty]}`;

  const poseNum = isDriverChamp ? 1 : (2+Math.floor(rnd()*4)); // 2..5, mai la 1 se non hai vinto il titolo
  // V0.9.7.5: THE GOAT ha una posa dedicata (casco/tuta rosso Ferrari) al posto del generico Immortal viola
  const isGoatChamp = isDriverChamp && driverChamp.nome==='THE GOAT';
  const poseBand = isGoatChamp ? 'goat_ferrari' : band;
  const poseSrc = `assets/share-poses/pose${poseNum}_${poseBand}.webp`;
  const accent = isGoatChamp ? '#FF1801' : CAR_RARITY_COLOR[band];

  const statsLines = isDriverChamp
    ? [t('share_wins', totalWins), t('share_podiums', totalPodiums), t('share_points', totalPoints), t('share_champion_line', driverChamp.nome)]
    : [t('share_wins', totalWins), t('share_podiums', totalPodiums), t('share_points', totalPoints), t('share_dnfs', totalDnfs)];

  const [logoImg, poseImg] = await Promise.all([loadImg(LOGO_DATA_URI), loadImg(poseSrc)]);

  const W = 720;
  const cv = document.createElement('canvas');
  let ctx = cv.getContext('2d');

  // --- passo 1: calcolo in sequenza di ogni altezza, prima di disegnare (niente sovrapposizioni) ---
  let cursor = 50;
  const logoW = Math.round(W*0.86), logoH = Math.round(logoImg.height*(logoW/logoImg.width));
  const logoY = cursor; cursor += logoH + 6;
  const subY = cursor; cursor += 40;
  const ty = cursor + 30; cursor = ty + 50 + 40 + 30 + 20;
  const poseW = Math.round(W*0.46), poseH = Math.round(poseImg.height*(poseW/poseImg.width));
  const py = cursor; cursor = py + poseH + 40;
  const sy = cursor; cursor = sy + 56*statsLines.length + 30;
  const boxY0 = cursor, boxY1 = boxY0 + 100; cursor = boxY1 + 50;
  const H = cursor;

  cv.width = W; cv.height = H;
  ctx = cv.getContext('2d');

  // sfondo con bagliore radiale nel colore della fascia
  ctx.fillStyle = '#08090c'; ctx.fillRect(0,0,W,H);
  const grad = ctx.createRadialGradient(W*0.62,H*0.55,0, W*0.62,H*0.55, 620);
  grad.addColorStop(0, accent+'55'); grad.addColorStop(1, '#08090c00');
  ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for(let i=-H;i<W;i+=34){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+H,H); ctx.stroke(); }
  for(let cx=0; cx<W; cx+=16){ ctx.fillStyle = (cx/16)%2===0 ? '#ebebeb' : '#121318'; ctx.fillRect(cx,0,16,9); }

  ctx.drawImage(logoImg, (W-logoW)/2, logoY, logoW, logoH);
  ctx.fillStyle = '#96969e'; ctx.font = '21px -apple-system,sans-serif'; ctx.textAlign='center';
  ctx.fillText(t('share_manager_tag'), W/2, subY+18);
  ctx.textAlign='left';
  ctx.strokeStyle = '#34363a'; ctx.beginPath(); ctx.moveTo(50,subY+38); ctx.lineTo(W-50,subY+38); ctx.stroke();

  ctx.fillStyle = accent; ctx.font = '900 44px -apple-system,sans-serif';
  ctx.fillText(title, 40, ty+40);
  ctx.fillStyle = '#e1e1e6'; ctx.font = '25px -apple-system,sans-serif';
  ctx.fillText(subtitle, 40, ty+80);
  ctx.fillStyle = '#8c8c94'; ctx.font = '21px -apple-system,sans-serif';
  ctx.fillText(metaLine, 40, ty+112);

  // ombra morbida + posa
  ctx.save();
  ctx.filter = 'blur(16px)';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse((W)/2, py+poseH-10, poseW/2+20, 24, 0, 0, 2*Math.PI); ctx.fill();
  ctx.restore();
  // V0.9.7.5: qualita' massima nel ridimensionamento — l'immagine sorgente e' molto piu' grande del
  // riquadro finale (contiene anche il "1" vero scolpito nel podio, dettaglio sottile) e col filtro
  // di default del canvas veniva sfocato fino a diventare quasi invisibile in fase di rimpicciolimento.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(poseImg, (W-poseW)/2, py, poseW, poseH);

  let yy = sy;
  for(const line of statsLines){
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(50,yy+20); ctx.lineTo(62,yy+8); ctx.lineTo(74,yy+20); ctx.lineTo(62,yy+32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 30px -apple-system,sans-serif';
    ctx.fillText(line, 90, yy+26);
    yy += 56;
  }

  ctx.fillStyle = accent+'20'; ctx.fillRect(30, boxY0, W-60, boxY1-boxY0);
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.strokeRect(30, boxY0, W-60, boxY1-boxY0);
  ctx.fillStyle = accent; ctx.font = '900 30px -apple-system,sans-serif'; ctx.textAlign='center';
  ctx.fillText(t('share_beat_me'), W/2, boxY0+58);
  ctx.textAlign='left';

  // coriandoli statici, solo per il titolo piloti
  if(isDriverChamp){
    const seedRnd = (n)=>{ const x = Math.sin(n*999)*10000; return x-Math.floor(x); };
    const confColors = ['#FFD700','#FFEE99','#F7B800','#FFFFFF','#FFAA00'];
    for(let i=0;i<50;i++){
      const cx = seedRnd(i)*W, cyp = seedRnd(i+500)*(H-subY-60)+subY+60;
      const size = 6+seedRnd(i+900)*8;
      const rot = seedRnd(i+50)*360;
      ctx.save();
      ctx.translate(cx,cyp); ctx.rotate(rot*Math.PI/180);
      ctx.fillStyle = confColors[i%confColors.length];
      ctx.fillRect(-size/2,-size*0.9,size,size*1.8);
      ctx.restore();
    }
  }

  return cv;
}

async function buildTrophyRoomCanvas(){
  const circuits = DATA.circuiti;
  const total = circuits.length;
  const racedCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].raced>0).length;
  const wonCount = circuits.filter(c=> trophyData[c.nome] && trophyData[c.nome].won>0).length;

  const logoImg = await loadImg(LOGO_DATA_URI);
  const W = 720;
  const cols = 8, cellSize = 78, gap = 6;
  const gridW = cols*cellSize + (cols-1)*gap;
  const rows = Math.ceil(total/cols);
  const gridH = rows*cellSize + (rows-1)*gap;

  let cursor = 50;
  const logoW = Math.round(W*0.8), logoH = Math.round(logoImg.height*(logoW/logoImg.width));
  const logoY = cursor; cursor += logoH + 30;
  const titleY = cursor; cursor += 60;
  const statsY = cursor; cursor += 50;
  const gridY = cursor; cursor += gridH + 40;
  const H = cursor;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#08090c'; ctx.fillRect(0,0,W,H);
  const grad = ctx.createRadialGradient(W*0.5,H*0.3,0, W*0.5,H*0.3, 500);
  grad.addColorStop(0,'#F7B80044'); grad.addColorStop(1,'#08090c00');
  ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

  ctx.drawImage(logoImg, (W-logoW)/2, logoY, logoW, logoH);
  ctx.fillStyle = '#F7B800'; ctx.font = '900 34px -apple-system,sans-serif'; ctx.textAlign='center';
  ctx.fillText(t('share_trophy_title'), W/2, titleY);
  ctx.fillStyle = '#c8c8ce'; ctx.font = '20px -apple-system,sans-serif';
  ctx.fillText(t('share_trophy_stats', racedCount, total, wonCount), W/2, statsY);
  ctx.textAlign='left';

  const gridX = (W-gridW)/2;
  const imgs = await Promise.all(circuits.map(c=>{
    const td = trophyData[c.nome] || {raced:0,won:0};
    if(td.won>0) return loadImg(`assets/circuit-trophies/${slugify(c.nome)}_oro.webp`);
    if(td.raced>0) return loadImg(`assets/circuit-trophies/${slugify(c.nome)}_bloccato.webp`);
    return Promise.resolve(null);
  }));
  circuits.forEach((c,i)=>{
    const col = i%cols, row = Math.floor(i/cols);
    const x = gridX + col*(cellSize+gap), y = gridY + row*(cellSize+gap);
    const td = trophyData[c.nome] || {raced:0,won:0};
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x,y,cellSize,cellSize);
    if(td.won>0 || td.raced>0){
      const img = imgs[i];
      // V0.9.4.2.2: le icone trofeo sono alte e strette — vanno contenute su ENTRAMBE le dimensioni
      // (come "object-fit:contain"), non solo per larghezza, altrimenti sforano la cella e si sovrappongono.
      const boxSize = cellSize - 20;
      const fitScale = Math.min(boxSize/img.width, boxSize/img.height);
      const iw = img.width*fitScale, ih = img.height*fitScale;
      ctx.drawImage(img, x+(cellSize-iw)/2, y+(cellSize-ih)/2-4, iw, ih);
      if(td.won>0){
        ctx.fillStyle = '#F7B800'; ctx.font = '900 12px -apple-system,sans-serif'; ctx.textAlign='center';
        ctx.fillText(`${td.won}×`, x+cellSize/2, y+cellSize-6);
        ctx.textAlign='left';
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '900 22px -apple-system,sans-serif'; ctx.textAlign='center';
      ctx.fillText('?', x+cellSize/2, y+cellSize/2+8);
      ctx.textAlign='left';
    }
  });
  return cv;
}

async function shareTrophyRoomCard(){
  try{
    const cv = await buildTrophyRoomCanvas();
    const blob = await new Promise(res=>cv.toBlob(res,'image/png'));
    const fileName = 'racing-dynasty-sala-trofei.png';
    const gameUrl = 'https://fuoriscala-dev.github.io/racing-dynasty/';
    const shareText = `La mia Sala Trofei su Racing Dynasty — prova a battermi!\n${gameUrl}`;
    if(navigator.share && navigator.canShare && navigator.canShare({ files:[new File([blob], fileName, {type:'image/png'})] })){
      await navigator.share({ files:[new File([blob], fileName, {type:'image/png'})], text: shareText, url: gameUrl });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      alert('Immagine salvata! Testo da condividere insieme:\n\n'+shareText);
    }
  }catch(e){
    alert('Non sono riuscito a generare la Sala Trofei da condividere. Riprova.');
  }
}

async function shareResultCard(){
  try{
    const cv = await buildShareCardCanvas();
    const blob = await new Promise(res=>cv.toBlob(res,'image/png'));
    const fileName = 'racing-dynasty-risultato.png';
    const gameUrl = 'https://fuoriscala-dev.github.io/racing-dynasty/';
    const shareText = `Ho appena chiuso una stagione su Racing Dynasty — prova a battermi!\n${gameUrl}`;
    if(navigator.share && navigator.canShare && navigator.canShare({ files:[new File([blob], fileName, {type:'image/png'})] })){
      await navigator.share({ files:[new File([blob], fileName, {type:'image/png'})], text: shareText, url: gameUrl });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      alert('Immagine salvata! Testo da condividere insieme:\n\n'+shareText);
    }
  }catch(e){
    alert('Non sono riuscito a generare la card. Riprova.');
  }
}

function renderCelebrationFx(showConfetti, showFireworks, nation){
  const overlay = document.createElement('div');
  overlay.id = 'celebrationFx';
  let html = '';
  if(showConfetti){
    const pieces = [];
    const goldTones = ['#FFD700','#FFEE99','#F7B800','#FFFFFF','#FFAA00'];
    for(let i=0;i<70;i++){
      const left = (i*4.2)%100;
      const delay = ((i*7)%24)*0.3;                // scaglionato ma NON legato alla posizione orizzontale (niente effetto "spara coriandoli")
      const dur = 4.5 + (i%5)*0.5;                // caduta piu' lenta e naturale
      const sway = 12 + (i%4)*6;                  // ondeggiamento contenuto, non un'oscillazione brusca
      const color = goldTones[i%goldTones.length];
      const isRound = i%4===0;
      const size = 6 + (i%3)*2;
      pieces.push(`<div class="confetti-piece${isRound?' round':''}" style="left:${left}%; width:${size}px; height:${isRound?size:size*1.6}px; animation-delay:${delay}s; animation-duration:${dur}s; background:${color}; --sway:${sway}px;"></div>`);
    }
    html += `<div class="confetti-layer">${pieces.join('')}</div>`;
  }
  if(showFireworks){
    const colors = nationFireworkColors(nation);
    const burstCenters = [];
    for(let i=0;i<11;i++){
      burstCenters.push({ left: 12 + (i*11)%76, top: 10 + (i*15)%52, delay: i*0.7 + Math.random()*0.3 });
    }
    const bursts = burstCenters.map((c,bi)=>{
      const color = colors[bi%colors.length];
      const sparkCount = 22;
      const sparks = [];
      for(let s=0;s<sparkCount;s++){
        const angle = (s/sparkCount)*2*Math.PI;
        const dist = 75 + Math.random()*45;
        const dx = Math.cos(angle)*dist, dy = Math.sin(angle)*dist;
        sparks.push(`<div class="spark" style="left:${c.left}%; top:${c.top}%; animation-delay:${c.delay}s; color:${color}; --dx:${dx.toFixed(0)}px; --dy:${dy.toFixed(0)}px;"></div>`);
      }
      const flash = `<div class="firework-flash" style="left:${c.left}%; top:${c.top}%; animation-delay:${c.delay}s; color:${color};"></div>`;
      return flash + sparks.join('');
    }).join('');
    html += `<div class="firework-layer">${bursts}</div>`;
  }
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

// V0.9.4: pannello con tutti i trofei vinti in questa stagione, mostrato a fine stagione
function seasonTrophiesPanelHTML(){
  const won = state.seasonTrophiesWon || [];
  if(!won.length) return '';
  const cardsHTML = won.map(circuitName=>{
    const c = DATA.circuiti.find(x=>x.nome===circuitName);
    if(!c) return '';
    return trophyCellHTML(c);
  }).join('');
  return `
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">🏆 Trofei Vinti Questa Stagione</h3><span class="dim mono" style="font-size:11px;">${won.length}</span></div>
    <div class="trophy-grid">${cardsHTML}</div>
  </div>`;
}

// V0.9.4.4: confronto testuale con la/le scuderia/e rivale/i a fine stagione, gestendo il caso di piu' rivali
function rivalComparisonSentence(){
  if(!state.rivals || !state.rivals.length) return '';
  const myPoints = state.constructorStandings['PLAYER'] ? state.constructorStandings['PLAYER'].points : 0;
  const beaten = [], lost = [];
  state.rivals.forEach(rid=>{
    const rTeam = state.aiTeams.find(t=>t.id===rid);
    if(!rTeam) return;
    const rPoints = state.constructorStandings[rid] ? state.constructorStandings[rid].points : 0;
    if(myPoints > rPoints) beaten.push(rTeam.nome);
    else if(myPoints < rPoints) lost.push(rTeam.nome);
  });
  if(state.rivals.length===1){
    if(beaten.length) return t('rcs_beat_single', beaten[0]);
    if(lost.length) return t('rcs_lost_single', lost[0]);
    return t('rcs_tied');
  }
  if(beaten.length && !lost.length) return t('rcs_beat_all', beaten.join(', '));
  if(lost.length && !beaten.length) return t('rcs_lost_all', lost.join(', '));
  if(beaten.length && lost.length) return t('rcs_mixed', beaten.join(', '), lost.join(', '));
  return '';
}

function renderSeasonEnd(){
  unlockMuseumForCurrentTeam();
  checkMasteryAchievements();
  checkSeasonEndAchievements();
  const dstd = driverStandingsSorted();
  const cstd = constructorStandingsSorted();

  const p1 = state.driverStandings['PLAYER-1'];
  const p2 = state.driverStandings['PLAYER-2'];
  const p1Pos = dstd.findIndex(d=>d.slotKey==='PLAYER-1' && !d.isFormer)+1;
  const p2Pos = dstd.findIndex(d=>d.slotKey==='PLAYER-2' && !d.isFormer)+1;
  const constructorPos = cstd.findIndex(c=>c.teamId==='PLAYER')+1;

  const driverChamp = dstd[0];
  const constructorChamp = cstd[0];
  const isDriverChamp = driverChamp.isPlayerTeam;
  const isConstructorChamp = constructorChamp.isPlayerTeam;

  let pillText, heroTitle;
  if(isDriverChamp && isConstructorChamp){ pillText=t('se_doppietta_pill'); heroTitle=t('se_doppietta_title'); }
  else if(isDriverChamp){ pillText=t('se_driver_champ_pill'); heroTitle=t('se_driver_champ_title'); }
  else if(isConstructorChamp){ pillText=t('se_constr_champ_pill'); heroTitle=t('se_constr_champ_title'); }
  else {
    pillText=t('se_end_pill');
    const bestPos = Math.min(p1Pos,p2Pos);
    const bestPilotName = (p1Pos<=p2Pos ? state.team.pilotMain : state.team.pilotSecond).nome;
    heroTitle = bestPos<=3 ? t('se_end_top3', bestPilotName, bestPos) : t('se_end_other', bestPilotName, bestPos);
  }

  // V0.9.7.8: fix bug segnalato da Gio — i totali ora includono anche le statistiche di eventuali
  // piloti sostituiti a stagione in corso (record EX), non solo i due sedili correnti.
  const { points: totalPoints, wins: totalWins, podiums: totalPodiums, dnfs: totalDnfs } = playerSeasonTotals();

  const driverRows = dstd.map((d,i)=>{
    const cls = (d.isPlayerTeam ? (d.isFormer?'me former':'me') : '') + (isRivalTeam(d.teamId)?' rival':'');
    const posCls = i===0?'p1':i===1?'p2':i===2?'p3':'';
    const badge = d.isPlayerTeam ? ` <span class="badge-event ${d.isFormer?'ex':''}">${d.isFormer?t('se_ex_badge'):t('se_you_badge')}</span>` : (isRivalTeam(d.teamId)?` <span class="badge-event rival-badge">${t('se_rival_badge')}</span>`:'');
    return `<tr class="${cls}"><td><span class="pos ${posCls}">P${i+1}</span></td><td>${d.naz?flag(d.naz)+' ':''}${d.nome}${badge}</td><td class="dim">${d.teamNome}</td><td class="mono">${d.points}</td><td class="mono dim">${d.wins}V</td></tr>`;
  }).join('');

  const constructorRows = cstd.map((c,i)=>{
    const cls = (c.isPlayerTeam ? 'me' : '') + (isRivalTeam(c.teamId)?' rival':'');
    const posCls = i===0?'p1':i===1?'p2':i===2?'p3':'';
    const rivalBadge = !c.isPlayerTeam && isRivalTeam(c.teamId) ? ` <span class="badge-event rival-badge">${t('se_rival_badge')}</span>` : '';
    return `<tr class="${cls}"><td><span class="pos ${posCls}">P${i+1}</span></td><td>${teamFlag(c.teamId)} ${c.nome}${c.isPlayerTeam?` <span class="badge-event">${t('se_you_badge')}</span>`:rivalBadge}</td><td class="mono">${c.points}</td></tr>`;
  }).join('');

  const champPilotRating = isDriverChamp
    ? (driverChamp.slotKey==='PLAYER-1' ? state.team.pilotMain.rating : state.team.pilotSecond.rating)
    : null;
  const trophyBand = champPilotRating!==null ? ratingBandKey(champPilotRating) : null;

  app.innerHTML = `
  <div class="hero season-champ-hero ${isDriverChamp?'has-trophy':''}">
    ${isDriverChamp ? `<img src="assets/trophies/${trophyBand}.png" alt="" class="champ-trophy-img">` : ''}
    <div class="hero-inner">
      <div class="pill">${pillText}</div>
      <h1 class="hdr" style="margin-top:14px;font-size:38px;">${heroTitle}</h1>
      <div class="tagline">${t('se_summary', teamDisplayName(), totalPoints, totalWins, totalPodiums, totalDnfs, state.calendar.length, fmtM(state.budget))}</div>
      <div class="tagline" style="margin-top:6px;">${rivalComparisonSentence()}</div>
      <div class="btnrow" style="justify-content:center;">
        <button class="primary" data-action="back-to-title">${t('se_new_career')}</button>
        <button class="ghost" data-action="share-result-card">${t('se_share')}</button>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-title"><h3 class="hdr">${t('se_your_drivers')}</h3></div>
    <div class="grid grid-2">
      <div class="mini" data-rarity="${displayRarity(state.team.pilotMain)}" style="padding:14px;">
        <div class="role">${t('se_pilot1', state.team.pilotMain.nome)}</div>
        <div class="nm">${t('se_drivers_pos', p1Pos)}</div>
        <div class="rt">${t('se_stats', p1.points, p1.wins, p1.podiums, p1.dnfs)}</div>
      </div>
      <div class="mini" data-rarity="${displayRarity(state.team.pilotSecond)}" style="padding:14px;">
        <div class="role">${t('se_pilot2', state.team.pilotSecond.nome)}</div>
        <div class="nm">${t('se_drivers_pos', p2Pos)}</div>
        <div class="rt">${t('se_stats', p2.points, p2.wins, p2.podiums, p2.dnfs)}</div>
      </div>
    </div>
    <div class="tag-line" style="margin-top:12px;">${t('se_team_constr_pos', teamDisplayName(), constructorPos)}</div>
  </div>
  <div class="grid grid-2">
    <div class="panel">
      <div class="panel-title"><h3 class="hdr">${t('se_final_drivers')}</h3><span class="dim mono" style="font-size:11px;">${t('se_champion')}: ${driverChamp.nome}</span></div>
      <table><thead><tr><th>${t('se_th_pos')}</th><th>${t('se_th_driver')}</th><th>${t('se_th_team')}</th><th>${t('se_th_points')}</th><th></th></tr></thead><tbody>${driverRows}</tbody></table>
    </div>
    <div class="panel">
      <div class="panel-title"><h3 class="hdr">${t('se_final_constr')}</h3><span class="dim mono" style="font-size:11px;">${t('se_champion')}: ${constructorChamp.nome}</span></div>
      <table><thead><tr><th>${t('se_th_pos')}</th><th>${t('se_th_team')}</th><th>${t('se_th_points')}</th></tr></thead><tbody>${constructorRows}</tbody></table>
    </div>
  </div>
  ${seasonTrophiesPanelHTML()}
  <div class="panel season-end-fs-promo">
    <a href="https://fuoriscala-dev.github.io/FUORISCALA.SITOWEB/" target="_blank" rel="noopener" class="season-end-fs-link">
      <img src="assets/fuoriscala/fuoriscala_primary_white.svg" alt="FUORISCALA" class="season-end-fs-logo">
      <div class="season-end-fs-text">
        <div class="season-end-fs-title">${t('se_fs_title')}</div>
        <div class="season-end-fs-body">${t('se_fs_body')}</div>
        <div class="season-end-fs-cta">${t('se_fs_cta')}</div>
      </div>
    </a>
  </div>
  <div class="footer-note">${t('se_footer')}</div>
  `;
  bindActions();
  if(isDriverChamp || isConstructorChamp){
    renderCelebrationFx(isDriverChamp, isConstructorChamp, state.team.nation);
  }
}

/* ---------------- event binding ---------------- */
function bindActions(){
  app.querySelectorAll('[data-action]').forEach(el=>{
    el.addEventListener('click', onAction);
  });
  // V0.9.2.1: aggiornamento live di costo/rischio mentre si trascina la barra di investimento
  app.querySelectorAll('.invest-slider').forEach(sl=>{
    sl.addEventListener('input', ()=>{
      const idx = sl.dataset.idx;
      const baseCost = Number(sl.dataset.baseCost);
      const t0 = Number(sl.dataset.t0);
      const maxT = Number(sl.dataset.maxT);
      let t = Number(sl.value)/100;
      if(t > maxT){ t = maxT; sl.value = String(Math.floor(maxT*100)); t = Number(sl.value)/100; }
      const costoM = investedCost(baseCost, t, t0)/1000000;
      const riskPct = investedRisk(t);
      const costEl = document.getElementById(`investCost-${idx}`);
      const riskEl = document.getElementById(`investRisk-${idx}`);
      if(costEl) costEl.textContent = fmtM(costoM);
      if(riskEl){ const rl = riskLevel(riskPct); riskEl.textContent = `${rl.label} · ${riskPct}%`; riskEl.className = `dev-risk ${rl.cls}`; }
      const btn = app.querySelector(`[data-action="confirm-upgrade-invest"][data-idx="${idx}"]`);
      if(btn) btn.disabled = state.budget < costoM;
    });
  });
}
function onAction(e){
  const el = e.currentTarget;
  const action = el.dataset.action;
  // V0.9.7.8.2: SFX #1/#2 — click generico ovunque, "conferma" per le azioni che chiudono una scelta
  // V0.9.7.8.18 fix: pick-draft/confirm-replacement/reroll-draft/inspire-team-name hanno GIA' un
  // suono reale dedicato gestito dentro le loro funzioni — escluse qui per non farle suonare doppie
  // (il placeholder generico insieme al suono vero, segnalato come "suona male" dall'utente).
  const NO_GENERIC_SFX_ACTIONS = new Set(['reroll-draft','inspire-team-name','pick-draft','confirm-replacement']);
  const CONFIRM_SFX_ACTIONS = new Set(['confirm-upgrade-invest','confirm-team-name','start-run','skip-midseason-swap']);
  if(!NO_GENERIC_SFX_ACTIONS.has(action)) playSfx(CONFIRM_SFX_ACTIONS.has(action) ? 'ui_confirm' : 'ui_click');
  triggerHaptic();
  if(action==='go-to-season-length'){ state.phase='season-length'; render(); }
  else if(action==='go-to-mode-select'){ state.phase='mode-select'; render(); }
  else if(action==='go-to-driver-creation'){
    window.__driverProfiles = rollDriverStarterProfiles();
    window.__driverProfileChoice = undefined;
    state.phase = 'driver-creation';
    render();
  }
  else if(action==='pick-driver-profile'){
    window.__driverProfileChoice = Number(el.dataset.idx);
    document.querySelectorAll('.driver-profile-card').forEach(c=> c.classList.remove('selected'));
    el.classList.add('selected');
    const confirmBtn = document.querySelector('[data-action="confirm-driver-creation"]');
    if(confirmBtn) confirmBtn.disabled = false;
  }
  else if(action==='confirm-driver-creation'){
    if(window.__driverProfileChoice===undefined) return;
    const name = document.getElementById('driverNameInput').value.trim() || t('dc_default_name');
    const nation = document.getElementById('driverNationSelect').value;
    const profile = window.__driverProfiles[window.__driverProfileChoice];
    const newDriver = {
      nome: name, naz: nation, eta: 18,
      qualifica: 38+Math.round(rnd()*10), sorpassi: 38+Math.round(rnd()*10), pioggia: 38+Math.round(rnd()*10),
      costanza: 38+Math.round(rnd()*10), pressione: 38+Math.round(rnd()*10), aggressivita: 38+Math.round(rnd()*10),
      partenza: 38+Math.round(rnd()*10), ultimigiri: 38+Math.round(rnd()*10), gestionegomme: 38+Math.round(rnd()*10),
      affidabilita: 38+Math.round(rnd()*10),
      arch: profile.arch, sinergia: profile.menta, archStrength: 0.2, // V0.9.7.9.2: 20% dell'effetto pieno, si rafforza giocando (punto 7, non ancora fatto)
      prestigio: 0,
    };
    newDriver.rating = Math.round((newDriver.qualifica+newDriver.sorpassi+newDriver.pioggia+newDriver.costanza+newDriver.pressione+newDriver.aggressivita+newDriver.partenza+newDriver.ultimigiri+newDriver.gestionegomme+newDriver.affidabilita)/10);
    driverCareerState = {
      driver: newDriver,
      world: initDriverCareerWorld(),
      currentTeamId: null, // assegnato al punto 3 (Hub + prima stagione)
    };
    // punto 2 termina qui: schermata di conferma minimale, l'Hub vero e proprio e' il punto 3
    state.phase = 'driver-creation-done';
    render();
  }
  else if(action==='choose-season-length'){
    state.selectedSeasonLength = parseInt(el.dataset.length,10)===20 ? 20 : 10;
    state.phase='difficulty';
    render();
  }
  else if(action==='start-run'){
    const diff = el.dataset.diff || state.selectedDifficulty || state.difficulty || 'medio';
    state.selectedDifficulty = diff;
    const len = state.selectedSeasonLength===20 ? 20 : 10;
    newRun(diff, len);
    state.phase='naming';
    render();
  }
  else if(action==='inspire-team-name'){
    const inputEl = document.getElementById('teamNameInput');
    const nationEl = document.getElementById('teamNationSelect');
    const flagPreview = document.getElementById('teamNationFlagPreview');
    playRealSfx('audio/sfx_reroll.mp3'); // V0.9.7.8.16: stesso suono del reroll draft, richiesto anche qui
    // evita, quando possibile, di riproporre di fila lo stesso nome gia' visibile nel campo
    const prevName = inputEl ? inputEl.value.trim() : '';
    let pool = TEAM_INSPIRATION;
    if(pool.length>1) pool = pool.filter(t=>t.nome!==prevName);
    const pick = pool[Math.floor(rnd()*pool.length)];
    if(inputEl) inputEl.value = pick.nome;
    if(nationEl) nationEl.value = pick.naz;
    if(flagPreview) flagPreview.innerHTML = flag(pick.naz);
  }
  else if(action==='confirm-team-name'){
    const inputEl = document.getElementById('teamNameInput');
    const val = inputEl ? inputEl.value.trim() : '';
    state.team.customName = val || 'Dynasty Racing';
    const nationEl = document.getElementById('teamNationSelect');
    state.team.nation = (nationEl && nationEl.value) || 'Italia';
    state.phase='draft'; startDraftTurn();
  }
  else if(action==='pick-draft'){ pickDraftTurnOption(el.dataset.id); }
  else if(action==='pick-first-lang'){
    currentLang = el.dataset.langChoice;
    saveLang();
    markLangChosen();
    applyStaticMenuTranslations();
    state.phase = 'title';
    render();
    playIntroOnce();
  }
  else if(action==='reroll-draft'){ rerollDraftTurn(); }
  else if(action==='choose-sponsor'){
    const tier = el.dataset.tier;
    const offer = (state.sponsorOffers||[]).find(o=>o.tier===tier);
    if(offer){
      state.sponsor = { tier: offer.tier, nome: offer.nome, category: offer.category||null, active:true };
      state.sponsorOffers = null;
      playSfx('ui_confirm');
      state.phase = state.pendingPostSponsorPhase || 'hub';
      state.pendingPostSponsorPhase = null;
      render();
    }
  }
  else if(action==='run-race'){ runQualifying(); state.phase='pregara'; render(); }
  else if(action==='start-race-live'){ beginRaceWithLights(); }
  else if(action==='skip-start-lights'){ skipStartLights(); }
  else if(action==='pause-live'){ pauseLive(); }
  else if(action==='speed-live'){ toggleSpeedLive(); }
  else if(action==='skip-live'){ skipLiveRace(); }
  else if(action==='resolve-live-decision'){ resolveLiveDecision(el.dataset.choice); }
  else if(action==='continue-to-pitlane'){ goToPitlaneOrEnd(); }
  else if(action==='dismiss-trophy-unlock'){ state.trophyUnlockDismissed = true; render(); }
  else if(action==='confirm-upgrade-invest'){
    const idx = el.dataset.idx;
    const n = window._pitOptions[idx];
    if(el.dataset.fixed==='1'){
      applyUpgrade(n.data, 1); // upgrade garantito: nessuno slider, t ininfluente perche' probfallimento=0
    } else {
      const sl = app.querySelector(`.invest-slider[data-idx="${idx}"]`);
      const t = sl ? Number(sl.value)/100 : 0;
      applyUpgrade(n.data, t);
    }
  }
  else if(action==='skip-upgrade-suspense'){ skipUpgradeSuspense(); }
  else if(action==='continue-upgrade-result'){ continueAfterUpgradeResult(); }
  else if(action==='open-scout-confirm'){
    const catKey = el.dataset.catkey;
    const candidateId = el.dataset.id;
    const node = window._pitOptions.find(n=>n.type==='scout');
    const candidate = node.options.find(o=>o.id===candidateId);
    state.pendingReplacement = { catKey, candidateId, catLabel: node.catLabel, options: node.options, returnPhase:'pitlane' };
    state.pendingReplacementEffect = estimateSquadEffect(catKey, candidate);
    state.phase = 'pitlane_confirm';
    render();
  }
  else if(action==='open-midseason-confirm'){
    const catKey = el.dataset.catkey;
    const candidateId = el.dataset.id;
    const options = state.midSeasonSwapOptions[catKey] || [];
    const candidate = options.find(o=>o.id===candidateId);
    const catLabel = catKey==='pilotMain' ? t('mss_pilot_main') : t('mss_pilot_second');
    state.pendingReplacement = { catKey, candidateId, catLabel, options, returnPhase:'midseason-swap' };
    state.pendingReplacementEffect = estimateSquadEffect(catKey, candidate);
    state.phase = 'pitlane_confirm';
    render();
  }
  else if(action==='confirm-replacement'){
    const pr = state.pendingReplacement;
    state.pendingReplacement = null;
    state.pendingReplacementEffect = null;
    state.phase = pr.returnPhase || 'pitlane';
    // V0.9.7: nel Mid Season Draft NON segniamo l'evento come concluso qui — l'utente puo' ancora
    // decidere di cambiare anche l'altro pilota. Si conclude solo con "Conferma Scelte e Prosegui".
    applyScout(pr.catKey, pr.candidateId, pr.options);
  }
  else if(action==='cancel-replacement'){
    const pr = state.pendingReplacement;
    state.pendingReplacement = null;
    state.pendingReplacementEffect = null;
    state.phase = (pr && pr.returnPhase) || 'pitlane';
    render();
  }
  else if(action==='skip-pitlane'){ skipPitlane(); }
  else if(action==='continue-from-rival-announce'){ state.pendingRivalNotice = null; state.phase = 'hub'; render(); }
  else if(action==='skip-midseason-swap'){ skipMidseasonSwap(); }
  else if(action==='continue-save'){
    const saved = loadGame();
    if(saved && saved.state){ state = saved.state; render(); }
  }
  else if(action==='new-season-confirm'){
    gameConfirm('Vuoi davvero cancellare la stagione salvata e iniziarne una nuova?', ()=>{
      deleteSave();
      state = { phase:'title', selectedDifficulty:'medio' };
      render();
    }, 'Nuova Stagione');
  }
  else if(action==='delete-save'){
    gameConfirm('Vuoi davvero cancellare il salvataggio? Non potrai più continuarlo.', ()=>{
      deleteSave();
      render();
    }, 'Cancella Salvataggio');
  }
  else if(action==='share-result-card'){
    shareResultCard().then(()=>{
      if(!isStandaloneApp()) setTimeout(showInstallPitchCard, 600); // V0.9.7.8.20
    });
  }
  else if(action==='open-trophy-room'){
    trophyRoomPreviousPhase = state.phase;
    state.phase = 'trophy-room';
    pushBackGuard();
    render();
  }
  else if(action==='close-trophy-room'){
    state.phase = trophyRoomPreviousPhase || 'title';
    render();
  }
  else if(action==='open-driver-trophy-room'){
    trophyRoomPreviousPhase = state.phase;
    state.phase = 'driver-trophy-room';
    pushBackGuard();
    render();
  }
  else if(action==='close-driver-trophy-room'){
    state.phase = trophyRoomPreviousPhase || 'title';
    render();
  }
  else if(action==='share-trophy-room'){ shareTrophyRoomCard(); }
  else if(action==='open-museum'){
    museumPreviousPhase = state.phase;
    state.phase = 'museum-dynasty';
    pushBackGuard();
    render();
  }
  else if(action==='close-museum'){
    state.phase = museumPreviousPhase || 'title';
    render();
  }
  else if(action==='open-garage'){
    museumPreviousPhase = state.phase;
    garageSandbox = { motoreBand:'ottimo', telaioBand:'ottimo', aeroBand:'ottimo', gommeBand:'ottimo', helmetBand:'ottimo' };
    garagePreviewPatternId = undefined;
    garageRevealedPatternId = null;
    state.phase = 'garage';
    pushBackGuard();
    render();
  }
  else if(action==='close-garage'){
    state.phase = museumPreviousPhase || 'title';
    render();
  }
  else if(action==='select-garage-pattern'){
    const id = el.dataset.pattern || null;
    if(id===null || isLiveryPatternUnlocked(id)){
      liveryData.selectedPatternId = id;
      garagePreviewPatternId = undefined;
      saveLiveryData();
      playSfx('ui_confirm');
      renderGarage();
    }
  }
  else if(action==='reveal-garage-pattern'){
    const id = el.dataset.pattern;
    garageRevealedPatternId = (garageRevealedPatternId===id) ? null : id;
    renderGarage();
  }
  else if(action==='back-to-title'){
    const fx = document.getElementById('celebrationFx'); if(fx) fx.remove();
    deleteSave(); state = { phase:'title', selectedDifficulty: state.difficulty || 'medio' }; render();
  }
}

/* ---------------- V0.9.2: intro d'apertura (muta, una sola volta per avvio) ---------------- */
let __introCarAudioEl = null; // V0.9.7.8.15: tracciato per poterlo sfumare, non solo interromperlo di colpo
function playIntroOnce(){
  __introCarAudioEl = playRealSfx('audio/sfx_intro_car.mp3'); // V0.9.7.8.14 — resta lungo (10s) di suo
  const overlay = document.createElement('div');
  overlay.id = 'introOverlay';
  overlay.innerHTML = `
    <div class="intro-smoke">
      <div class="intro-puff p1"></div><div class="intro-puff p2"></div><div class="intro-puff p3"></div><div class="intro-puff p4"></div>
      <div class="intro-puff p5"></div><div class="intro-puff p6"></div><div class="intro-puff p7"></div><div class="intro-puff p8"></div>
      <div class="intro-puff p9"></div><div class="intro-puff p10"></div><div class="intro-puff p11"></div><div class="intro-puff p12"></div>
    </div>
    <div class="intro-car"><img src="${INTRO_CAR_URI}" alt=""></div>
    <div class="intro-whiteout"></div>
  `;
  document.body.appendChild(overlay);
  setTimeout(()=>{ overlay.remove(); }, 2600);
}
// V0.9.7.8.15: quando si lascia il titolo per un'altra schermata, se il suono dell'auto d'apertura
// sta ancora suonando lo sfumiamo in 0.5s invece di tagliarlo di netto — nessuna interruzione brusca.
function fadeOutIntroCarAudioIfNeeded(){
  const el = __introCarAudioEl;
  if(!el || el.paused) { __introCarAudioEl = null; return; }
  __introCarAudioEl = null; // consumato: non ri-innescare il fade piu' volte
  const startVol = el.volume, steps = 10, stepMs = 50; // 0.5s totali
  let i = 0;
  const timer = setInterval(()=>{
    i++;
    el.volume = Math.max(0, startVol * (1 - i/steps));
    if(i>=steps){ clearInterval(timer); el.pause(); }
  }, stepMs);
}
// V0.9.7.9.4 fix: l'overlay visivo (fumo + auto) viveva fuori dal ciclo di render normale, con un
// suo timer indipendente di 2.6s per auto-rimuoversi. Se si lasciava il titolo troppo in fretta
// (es. bivio Carriera Pilota/Scuderia cliccato subito dopo "premi per iniziare"), la schermata
// nuova si caricava sotto ma l'overlay restava sopra fino alla scadenza del suo timer, coprendo
// tutto e sembrando uno schermo vuoto. Ora lo rimuoviamo subito, non aspettiamo piu' il timer.
function removeIntroOverlayIfPresent(){
  const overlay = document.getElementById('introOverlay');
  if(overlay) overlay.remove();
}

/* ==================== V0.9.4.2.8: icona hamburger + pannello menu — logica ====================
   Un'unica icona sempre visibile (poco invasiva), che apre un pannello con voci comode al tocco.
   Nessuna libreria esterna. */

function closeMenuPanel(){
  document.getElementById('gameMenuPanel').style.display = 'none';
}

// V0.9.4.4: sostituisce window.confirm() — su mobile il dialogo nativo del browser
// faceva uscire dalla modalita' schermo intero. Questa resta interna al gioco.
function gameConfirm(message, onConfirm, title){
  document.getElementById('gameConfirmTitle').textContent = title || 'Conferma';
  document.getElementById('gameConfirmMessage').textContent = message;
  const panel = document.getElementById('gameConfirmPanel');
  const yesBtn = document.getElementById('gameConfirmYesBtn');
  const noBtn = document.getElementById('gameConfirmNoBtn');
  function cleanup(){
    panel.style.display = 'none';
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
  }
  function onYes(){ cleanup(); onConfirm(); }
  function onNo(){ cleanup(); }
  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
  panel.style.display = 'flex';
  pushBackGuard();
}

function openMenuPanel(){
  updateMenuNewCareerVisibility();
  updateMenuFullscreenLabel();
  document.getElementById('gameMenuPanel').style.display = 'flex';
  pushBackGuard();
}

function toggleMenuPanel(){
  const panel = document.getElementById('gameMenuPanel');
  if(panel.style.display === 'flex') closeMenuPanel();
  else openMenuPanel();
}

function goHome(){
  // la carriera in corso resta salvata (autosalvataggio gia' attivo): si puo' riprendere da "Continua"
  closeMenuPanel();
  const fx = document.getElementById('celebrationFx'); if(fx) fx.remove();
  state = { phase:'title', selectedDifficulty: (state && state.difficulty) || 'medio' };
  render();
}

function newCareer(){
  closeMenuPanel();
  gameConfirm('Vuoi davvero abbandonare la carriera attuale e ricominciare da capo? Il progresso non salvato andrà perso.', ()=>{
    const fx = document.getElementById('celebrationFx'); if(fx) fx.remove();
    deleteSave();
    state = { phase:'title', selectedDifficulty: (state && state.difficulty) || 'medio' };
    render();
  }, 'Nuova Carriera');
}

function openTrophies(){
  closeMenuPanel();
  trophyRoomPreviousPhase = state.phase;
  state.phase = 'trophy-room';
  pushBackGuard();
  render();
}

function volumeControlHTML(id, icon, label, enabled, volume01){
  const level = Math.max(0, Math.min(5, Math.round(volume01*5))); // 0-5 tacche
  const notches = [1,2,3,4,5].map(n=>
    `<button type="button" class="vol-notch ${n<=level?'filled':''}" data-vol-id="${id}" data-level="${n}" aria-label="${n*20}%"></button>`
  ).join('');
  return `
  <div class="vol-control">
    <label class="vol-control-header">
      <input type="checkbox" class="vol-checkbox" id="${id}EnabledCheck" ${enabled!==false?'checked':''}>
      <span class="vol-checkbox-box"></span>
      <span class="vol-control-label">${icon} ${label}</span>
    </label>
    <div class="vol-notches" id="${id}Notches">${notches}</div>
  </div>`;
}
function openSettings(){
  closeMenuPanel();
  const body = document.getElementById('sidebarSettingsBody');
  body.innerHTML = `
    ${volumeControlHTML('sfx', '🔊', t('settings_sfx_vol_short'), audioSettings.sfxEnabled, audioSettings.sfxVolume)}
    ${volumeControlHTML('music', '🎵', t('settings_music_vol_short'), audioSettings.musicEnabled, audioSettings.musicVolume)}
    <div style="margin-bottom:14px;">
      <label class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:8px;">${t('menu_language')}</label>
      <div style="display:flex;gap:8px;">
        <button type="button" class="lang-btn ${currentLang==='it'?'active':''}" data-lang-choice="it">Italiano</button>
        <button type="button" class="lang-btn ${currentLang==='en'?'active':''}" data-lang-choice="en">English</button>
        <button type="button" class="lang-btn ${currentLang==='es'?'active':''}" data-lang-choice="es">Español</button>
      </div>
    </div>
    <button type="button" class="menu-item" id="sidebarHapticToggleBtn">📳 <span>${t('settings_haptic')}: ${audioSettings.hapticEnabled!==false?t('on'):t('off')}</span></button>
    <button type="button" class="menu-item" id="sidebarSpeedBtn">🚀 <span>${t('settings_speed')}: ${defaultRaceSpeed}×</span></button>
    <button type="button" class="menu-item" id="sidebarDecisionTimerBtn">⏱️ <span>${t('settings_decision_timer')}: ${decisionTimerEnabled?t('on'):t('off')}</span></button>
    <button type="button" class="menu-item" id="sidebarExportSaveBtn">📤 <span>${t('settings_export')}</span></button>
    <button type="button" class="menu-item" id="sidebarImportSaveBtn">📥 <span>${t('settings_import')}</span></button>
    <input type="file" id="importSaveFileInput" accept="application/json,.json" style="display:none;">
    ${!isStandaloneApp() ? `<button type="button" class="menu-item" id="sidebarInstallBtn" style="color:var(--legendary);">📲 <span>${t('settings_install')}</span></button>` : ''}
    <button type="button" class="menu-item" id="sidebarFullResetBtn" style="color:var(--danger);">🗑️ <span>${t('settings_reset')}</span></button>
  `;
  // V0.9.7.8.32: controllo volume unificato (checkbox on/off + 5 tacche), non piu' toggle separato
  // e slider continuo — piu' semplice da usare, coerente con lo stile "menu fatto bene" richiesto.
  function wireVolumeControl(id, settingsEnabledKey, settingsVolumeKey, onChangeExtra){
    const check = document.getElementById(id+'EnabledCheck');
    check.addEventListener('change', ()=>{
      audioSettings[settingsEnabledKey] = check.checked;
      saveAudioSettings();
      if(onChangeExtra) onChangeExtra();
      if(check.checked) playSfx('ui_confirm');
    });
    document.querySelectorAll(`.vol-notch[data-vol-id="${id}"]`).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const level = Number(btn.dataset.level);
        audioSettings[settingsVolumeKey] = level/5;
        saveAudioSettings();
        document.querySelectorAll(`.vol-notch[data-vol-id="${id}"]`).forEach(b=>{
          b.classList.toggle('filled', Number(b.dataset.level)<=level);
        });
        if(onChangeExtra) onChangeExtra();
        if(id==='sfx') playSfx('ui_confirm');
      });
    });
  }
  wireVolumeControl('sfx', 'sfxEnabled', 'sfxVolume');
  wireVolumeControl('music', 'musicEnabled', 'musicVolume', applyMusicVolumeNow);
  document.querySelectorAll('.lang-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentLang = btn.dataset.langChoice;
      saveLang();
      applyStaticMenuTranslations();
      openSettings(); // ridisegna il pannello impostazioni nella nuova lingua
      if(state && state.phase) render(); // ridisegna anche lo sfondo (titolo, hub, ecc.) nella nuova lingua
    });
  });
  document.getElementById('sidebarHapticToggleBtn').addEventListener('click', ()=>{
    audioSettings.hapticEnabled = audioSettings.hapticEnabled===false ? true : false;
    saveAudioSettings();
    triggerHaptic(); // un assaggio, se appena riattivato
    openSettings();
  });
  document.getElementById('sidebarSpeedBtn').addEventListener('click', ()=>{
    defaultRaceSpeed = defaultRaceSpeed===1 ? 2 : 1;
    document.getElementById('sidebarSpeedBtn').innerHTML = `🚀 <span>Velocità Gara Predefinita: ${defaultRaceSpeed}×</span>`;
  });
  document.getElementById('sidebarDecisionTimerBtn').addEventListener('click', ()=>{
    decisionTimerEnabled = !decisionTimerEnabled;
    document.getElementById('sidebarDecisionTimerBtn').innerHTML = `⏱️ <span>Countdown Decisioni: ${decisionTimerEnabled?'Attivo':'Disattivato'}</span>`;
    if(state && state.live && state.live.activeDecision){
      state.live.decisionDeadline = decisionTimerEnabled ? (Date.now()+DECISION_TIME_MS) : null;
    }
  });
  document.getElementById('sidebarExportSaveBtn').addEventListener('click', exportRunSave);
  const installBtn = document.getElementById('sidebarInstallBtn');
  if(installBtn){
    installBtn.addEventListener('click', async ()=>{
      const worked = await triggerInstallPrompt();
      if(!worked){
        if(isIOSDevice()){
          alert('Per installare Racing Dynasty su iPhone/iPad:\n\n1. Tocca il pulsante Condividi (il quadrato con la freccia verso l\'alto) in basso nel browser\n2. Scorri e scegli "Aggiungi alla schermata Home"\n3. Conferma con "Aggiungi"');
        } else {
          alert('Per installare Racing Dynasty, cerca la voce "Installa app" o "Aggiungi a schermata Home" nel menu del tuo browser (di solito le tre puntine in alto a destra).');
        }
      }
    });
  }
  document.getElementById('sidebarImportSaveBtn').addEventListener('click', ()=>{
    document.getElementById('importSaveFileInput').click();
  });
  document.getElementById('importSaveFileInput').addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const doImport = ()=>{
      const reader = new FileReader();
      reader.onload = ()=> importRunSaveFromText(reader.result);
      reader.readAsText(file);
    };
    if(loadGame()){
      closeSettingsPanel();
      gameConfirm('Importare questo file sovrascriverà la stagione attualmente salvata. Continuare?', doImport, 'Sovrascrivere la Run?');
    } else {
      doImport();
    }
    e.target.value = ''; // permette di reimportare lo stesso file una seconda volta
  });
  document.getElementById('sidebarFullResetBtn').addEventListener('click', ()=>{
    closeSettingsPanel();
    gameConfirm('Cancella TUTTO: carriera in corso, Sala Trofei, Museo Dynasty e Obiettivi sbloccati. Il gioco tornerà esattamente come alla primissima apertura. Non si può annullare.', ()=>{
      fullResetAll();
      state = { phase:'title', selectedDifficulty:'medio' };
      render();
    }, 'Ripristinare Tutto?');
  });
  document.getElementById('sidebarSettingsPanel').style.display = 'flex';
  pushBackGuard();
}

function closeSettingsPanel(){
  document.getElementById('sidebarSettingsPanel').style.display = 'none';
}

// V0.9.6: Guida statica — sostituisce il vecchio tutorial guidato. Stessi contenuti chiave
// (spiegazioni delle meccaniche), presentati come reference consultabile in ogni momento
// invece che come sequenza obbligata di step che blocca lo schermo.
// V0.9.7.1: guida profonda — spiega i meccanismi reali del gioco (non ovvietà), con diagrammi
// visivi generati dinamicamente dalle stesse costanti usate dal motore di gioco, cosi' restano
// sempre coerenti anche se in futuro cambiano i numeri (pesi, rarita', mentalita').
function guideRarityLegendHTML(){
  const mockRatings = { Common:58, Rare:71, Epic:83, Legendary:92, Immortal:100 };
  const mocks = RARITY_ORDER.map(r=> `<div class="guide-rarity-mock${r==='Immortal'?' immortal':''}" style="border-top-color:${rarityColor(r)};">
    <span class="grm-tag" style="color:${rarityColor(r)};background:${rarityColor(r)}22;">${r}</span>
    <div class="grm-rating">${mockRatings[r]}</div>
  </div>`).join('');
  return `<div class="guide-img-wrap"><div class="guide-rarity-mocks">${mocks}</div></div>`;
}
function guideArchetypeTableHTML(){
  const entriesIt = {
    'Rain Master': { bullets:['+18 ritmo sul bagnato','45% di errori in meno','−5 in qualifica sull\'asciutto'], closing:'Quando arriva la pioggia, può cambiare completamente il risultato della gara.' },
    'Pole Specialist': { bullets:['+20 netto in qualifica','12% di possibilità di ottenere un ulteriore bonus'], closing:'Parte spesso più avanti rispetto al suo reale valore sul passo gara.' },
    'The Hunter': { bullets:['+18 nei sorpassi','+10 alle ripartenze dopo Safety Car'], closing:'Il suo stile estremamente aggressivo aumenta però il rischio di incidente.' },
    'The Machine': { bullets:['varianza dimezzata','rischio di ritiro dimezzato','rendimento raramente inferiore alla sua soglia minima'], closing:'È l\'archetipo di THE GOAT.' },
    'Comeback King': { bullets:['−9 in qualifica','+20 se parte oltre la P10','rimonta amplificata del 60% dopo una Safety Car'], closing:'Più parte indietro, più diventa pericoloso.' },
    'Tire Whisperer': { bullets:['consumo gomme ridotto del 22%','15% di possibilità di saltare un pit-stop'], closing:'È particolarmente efficace sui circuiti che sottopongono gli pneumatici a uno stress elevato.' },
    'Last Lap Killer': { bullets:['meno efficace nelle fasi iniziali','enorme +25 negli ultimi giri'], closing:'Aumenta il proprio rendimento con il passare dei giri, proprio quando la gara deve essere decisa.' },
    'Street King': { bullets:['+16 sui tracciati cittadini stretti','−7 sui circuiti dominati dai rettilinei ad alta velocità','fastidio causato dal traffico dimezzato'], closing:'Nel caos delle strade cittadine riesce a trovare spazio dove gli altri vedono soltanto muri.' },
    'Ice Man': { bullets:['+20 sotto pressione','bonus nelle fasi finali della gara'], closing:'È leggermente meno aggressivo rispetto alla norma, ma difficilmente perde lucidità quando il risultato è in bilico.' },
    'Wild Card': { bullets:['aggressività molto più alta','varianza quasi 2,5 volte superiore alla norma'], closing:'Può trasformare una gara in un\'impresa memorabile oppure in un disastro completo.' },
    'Strategic Mind': { bullets:['−4 in qualifica','+15 utilizzando una strategia alternativa'], closing:'Premia chi è disposto a rischiare e a leggere la gara in modo diverso dagli avversari.' },
    'Rookie Wonder': { bullets:['−10 sotto pressione all\'inizio','migliora concretamente dopo ogni podio conquistato'], closing:'È un investimento a lungo termine: più cresce, più il suo potenziale emerge.' },
  };
  const entriesEn = {
    'Rain Master': { bullets:['+18 pace in the wet','45% fewer mistakes','−5 in qualifying on a dry track'], closing:'When the rain comes, it can completely change the race result.' },
    'Pole Specialist': { bullets:['+20 net in qualifying','12% chance of an extra bonus'], closing:'Often starts higher than their real race-pace value.' },
    'The Hunter': { bullets:['+18 on overtakes','+10 at restarts after a Safety Car'], closing:'Their extremely aggressive style raises the risk of a crash, though.' },
    'The Machine': { bullets:['variance halved','retirement risk halved','output rarely dips below its floor'], closing:"It's THE GOAT's archetype." },
    'Comeback King': { bullets:['−9 in qualifying','+20 if starting beyond P10','recovery amplified by 60% after a Safety Car'], closing:'The further back they start, the more dangerous they become.' },
    'Tire Whisperer': { bullets:['tire wear reduced by 22%','15% chance of skipping a pit stop'], closing:'Especially effective on circuits that put heavy stress on tires.' },
    'Last Lap Killer': { bullets:['less effective early on','a massive +25 in the final laps'], closing:'Their performance climbs as the laps go by, right when the race is being decided.' },
    'Street King': { bullets:['+16 on tight street circuits','−7 on circuits dominated by high-speed straights','traffic annoyance halved'], closing:'In the chaos of city streets, they find space where others see only walls.' },
    'Ice Man': { bullets:['+20 under pressure','bonus in the closing stages of the race'], closing:"Slightly less aggressive than average, but rarely loses composure when the result is on a knife's edge." },
    'Wild Card': { bullets:['much higher aggression','variance almost 2.5× the norm'], closing:'Can turn a race into a memorable feat or a complete disaster.' },
    'Strategic Mind': { bullets:['−4 in qualifying','+15 when using an alternative strategy'], closing:'Rewards those willing to take risks and read the race differently from their rivals.' },
    'Rookie Wonder': { bullets:['−10 under pressure early on','improves concretely after every podium earned'], closing:'A long-term investment: the more they grow, the more their potential shows.' },
  };
  const entriesEs = {
    'Rain Master': { bullets:['+18 de ritmo en mojado','45% menos errores','−5 en clasificación en seco'], closing:'Cuando llega la lluvia, puede cambiar por completo el resultado de la carrera.' },
    'Pole Specialist': { bullets:['+20 neto en clasificación','12% de probabilidad de un bonus adicional'], closing:'Suele salir más adelante de lo que su ritmo real de carrera merece.' },
    'The Hunter': { bullets:['+18 en adelantamientos','+10 en las reanudaciones tras Safety Car'], closing:'Su estilo extremadamente agresivo aumenta el riesgo de accidente.' },
    'The Machine': { bullets:['varianza reducida a la mitad','riesgo de retirada reducido a la mitad','rendimiento raramente por debajo de su mínimo'], closing:'Es el arquetipo de THE GOAT.' },
    'Comeback King': { bullets:['−9 en clasificación','+20 si parte más allá de la P10','remontada amplificada un 60% tras un Safety Car'], closing:'Cuanto más atrás sale, más peligroso se vuelve.' },
    'Tire Whisperer': { bullets:['desgaste de neumáticos reducido un 22%','15% de probabilidad de saltarse una parada'], closing:'Especialmente eficaz en circuitos que exigen mucho a los neumáticos.' },
    'Last Lap Killer': { bullets:['menos eficaz en las fases iniciales','enorme +25 en las últimas vueltas'], closing:'Su rendimiento aumenta con el paso de las vueltas, justo cuando se decide la carrera.' },
    'Street King': { bullets:['+16 en trazados urbanos estrechos','−7 en circuitos dominados por rectas de alta velocidad','molestia por tráfico reducida a la mitad'], closing:'En el caos de las calles urbanas encuentra espacio donde otros solo ven muros.' },
    'Ice Man': { bullets:['+20 bajo presión','bonus en las fases finales de la carrera'], closing:'Es ligeramente menos agresivo de lo normal, pero rara vez pierde la cabeza cuando el resultado está en juego.' },
    'Wild Card': { bullets:['agresividad mucho más alta','varianza casi 2,5 veces superior a la norma'], closing:'Puede convertir una carrera en una hazaña memorable o en un desastre completo.' },
    'Strategic Mind': { bullets:['−4 en clasificación','+15 usando una estrategia alternativa'], closing:'Premia a quien está dispuesto a arriesgar y a leer la carrera de forma distinta a sus rivales.' },
    'Rookie Wonder': { bullets:['−10 bajo presión al principio','mejora de forma concreta tras cada podio conseguido'], closing:'Es una inversión a largo plazo: cuanto más crece, más se revela su potencial.' },
  };
  const entries = currentLang==='en' ? entriesEn : (currentLang==='es' ? entriesEs : entriesIt);
  const rows = Object.keys(TRAIT_TABLE).map(name=>{
    const e = entries[name] || {bullets:[], closing:''};
    const bullets = e.bullets.map(b=> `<li>${b}</li>`).join('');
    return `<div class="guide-card-annotated" style="margin-bottom:8px;">
      <div style="font-weight:800;color:var(--amber);margin-bottom:4px;">${name}</div>
      <ul style="margin:2px 0 6px 18px;padding:0;color:var(--text);">${bullets}</ul>
      <div style="color:var(--dim);font-style:italic;">${e.closing}</div>
    </div>`;
  }).join('');
  return `<div class="guide-img-wrap">${rows}</div>`;
}
function guideGoatChapterHTML(){
  const img = `<img class="guide-goat-portrait" src="${GOAT_GUIDE_IMG_SRC}" alt="THE GOAT">`;
  if(currentLang==='en'){
    return `<div class="guide-img-wrap"><div class="guide-goat-chapter">
    ${img}
    <div class="guide-goat-stats">
      <div style="font-weight:900;font-size:15px;color:var(--immortal);">THE GOAT</div>
      <div class="dim" style="font-size:10.5px;margin-bottom:4px;">Italy · Rating 100 · Immortal Rarity · "The Machine" Archetype</div>
      <div>THE GOAT is one of only 3 Immortal drivers in the entire game and holds a rating of 100 in every single stat. Their archetype, The Machine, further amplifies this dominance through:</div>
      <ul style="margin:6px 0 8px 18px;padding:0;">
        <li>extremely low variance</li>
        <li>a very high performance floor</li>
        <li>retirement risk halved</li>
        <li>unmatched reliability</li>
      </ul>
      <div style="margin-top:6px;"><b style="color:var(--text);">Bonus</b><br>+20 to all contextual stats.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Risk variable</b><br>When fighting directly for the win, there's a 15% chance of a devastating mistake — the only variable capable of breaking an otherwise dominant performance in the moments of highest tension.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Odds of finding them</b><br>The chance of getting THE GOAT in a single draw is roughly <b>1 in 6,000</b>. During every driver-dedicated turn, the Draft considers the best of 3 independent draws: the effective chance of seeing them appear among the options gets closer to <b>1 in 2,000 per turn</b> — an exceptionally rare chance.</div>
      <div class="guide-goat-oddsbar"><div class="guide-goat-oddsbar-fill"></div></div>
      <div style="margin-top:8px;font-style:italic;color:var(--dim);">When THE GOAT shows up at the Draft or during scouting, it's not just another offer: it's one of the biggest events that can happen in a career. You might never see them again.</div>
    </div>
  </div></div>`;
  }
  if(currentLang==='es'){
    return `<div class="guide-img-wrap"><div class="guide-goat-chapter">
    ${img}
    <div class="guide-goat-stats">
      <div style="font-weight:900;font-size:15px;color:var(--immortal);">THE GOAT</div>
      <div class="dim" style="font-size:10.5px;margin-bottom:4px;">Italia · Rating 100 · Rareza Immortal · Arquetipo "The Machine"</div>
      <div>THE GOAT es uno de los solo 3 pilotos Immortal de todo el juego y tiene rating 100 en cada estadística. Su arquetipo, The Machine, potencia aún más ese dominio mediante:</div>
      <ul style="margin:6px 0 8px 18px;padding:0;">
        <li>varianza extremadamente baja</li>
        <li>un mínimo de rendimiento altísimo</li>
        <li>riesgo de retirada reducido a la mitad</li>
        <li>fiabilidad sin comparación</li>
      </ul>
      <div style="margin-top:6px;"><b style="color:var(--text);">Bonus</b><br>+20 a todas las estadísticas contextuales.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Variable de riesgo</b><br>Cuando lucha directamente por la victoria, existe un 15% de probabilidad de un error devastador — la única variable capaz de interrumpir una actuación por lo demás dominante en los momentos de máxima tensión.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Probabilidad de encontrarlo</b><br>La probabilidad de obtener a THE GOAT en una sola extracción es de aproximadamente <b>1 entre 6.000</b>. En cada turno dedicado a los pilotos, el Draft considera lo mejor de 3 extracciones independientes: la probabilidad efectiva de verlo aparecer entre las opciones se acerca por tanto a <b>1 entre 2.000 por turno</b> — una posibilidad excepcionalmente rara.</div>
      <div class="guide-goat-oddsbar"><div class="guide-goat-oddsbar-fill"></div></div>
      <div style="margin-top:8px;font-style:italic;color:var(--dim);">Cuando THE GOAT aparece en el Draft o durante el scouting, no es una propuesta cualquiera: es uno de los eventos más importantes que pueden ocurrir en una carrera deportiva. Puede que no vuelvas a encontrarlo nunca más.</div>
    </div>
  </div></div>`;
  }
  return `<div class="guide-img-wrap"><div class="guide-goat-chapter">
    ${img}
    <div class="guide-goat-stats">
      <div style="font-weight:900;font-size:15px;color:var(--immortal);">THE GOAT</div>
      <div class="dim" style="font-size:10.5px;margin-bottom:4px;">Italia · Rating 100 · Rarità Immortal · Archetipo "The Machine"</div>
      <div>THE GOAT è uno dei soli 3 piloti Immortal dell'intero gioco e possiede rating 100 in ogni singola statistica. Il suo archetipo, The Machine, ne esalta ulteriormente il dominio attraverso:</div>
      <ul style="margin:6px 0 8px 18px;padding:0;">
        <li>varianza estremamente bassa</li>
        <li>una soglia minima di rendimento elevatissima</li>
        <li>rischio di ritiro dimezzato</li>
        <li>affidabilità senza paragoni</li>
      </ul>
      <div style="margin-top:6px;"><b style="color:var(--text);">Bonus</b><br>+20 a tutte le statistiche contestuali.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Variabile di rischio</b><br>Quando lotta direttamente per la vittoria, esiste un 15% di possibilità di un errore devastante — l'unica variabile capace di interrompere una prestazione altrimenti dominante nei momenti di massima tensione.</div>
      <div style="margin-top:8px;"><b style="color:var(--text);">Probabilità di trovarlo</b><br>La probabilità di ottenere THE GOAT in una singola estrazione è di circa <b>1 su 6.000</b>. Durante ogni turno dedicato ai piloti, il Draft considera il meglio di 3 estrazioni indipendenti: la probabilità effettiva di vederlo comparire tra le opzioni si avvicina quindi a <b>1 su 2.000 per turno</b> — una possibilità eccezionalmente rara.</div>
      <div class="guide-goat-oddsbar"><div class="guide-goat-oddsbar-fill"></div></div>
      <div style="margin-top:8px;font-style:italic;color:var(--dim);">Quando THE GOAT compare al Draft o durante lo scouting, non è una semplice proposta: è uno degli eventi più importanti che possano verificarsi in una carriera. Potresti non incontrarlo mai più.</div>
    </div>
  </div></div>`;
}
function guideSynergyStackDemoHTML(){
  const ids = Object.keys(MENTALITA_DEFS);
  const m = MENTALITA_DEFS[ids[2]];
  const lbl = mentaLabel(ids[2]);
  const circle = (lit)=> `<div class="sem-circle mini${lit?' full':''}" style="--glow:${m.color};">
    <div class="sem-half" style="background:${m.color};"></div><div class="sem-half" style="background:${m.color};"></div>
  </div>`;
  const fireCircles = Object.keys(MENTALITA_DEFS).slice(0,3).map(id=>{
    const mm = MENTALITA_DEFS[id];
    return `<div class="sem-circle mini full on-fire" style="--glow:${mm.color};"><div class="sem-half" style="background:${mm.color};"></div><div class="sem-half" style="background:${mm.color};"></div></div>`;
  }).join('');
  if(currentLang==='en'){
    return `
    <div class="guide-special-demo">
      <div class="gsd-title" style="color:${m.color};">⚡ Stacked synergies — 2 pairs of the same mentality</div>
      <div class="gsd-circles">${circle(true)}${circle(true)}</div>
      <div class="guide-section-body">If you have <b>2 pairs</b> (4 pieces in total) sharing the same "${lbl}" mentality, each pair's flat bonus is replaced by a <b>+45%</b> multiplier on the whole team's rating. With <b>3 or more pairs</b> of the same mentality, the multiplier rises to <b>+90%</b> — almost double the rating. It's one of the most powerful (and rarest to build) situations in the game: worth planning scouting and development around a single mentality if you already have 2-3 pieces sharing it.</div>
    </div>
    <div class="guide-special-demo semaforo-widget semaforo-on-fire" style="border:1px solid rgba(255,106,26,0.4);">
      <div class="gsd-title" style="color:var(--amber);">🔥 "On fire" semaphore — 3+ different synergies together</div>
      <div class="gsd-circles">${fireCircles}</div>
      <div class="guide-section-body">If instead you have <b>3 or more pairs of DIFFERENT mentalities</b> active at the same time (none repeated), the whole semaphore visually catches fire and the team gets an extra <b>+5%</b> rating, added on top of the flat bonuses each pair already earned. It's the sign your team is well-rounded in depth, not just stacked on a single mentality — keep an eye on it in the Hub and Pit Lane: if you see the semaphore light up like that, you're doing something right.</div>
    </div>`;
  }
  if(currentLang==='es'){
    return `
    <div class="guide-special-demo">
      <div class="gsd-title" style="color:${m.color};">⚡ Sinergias apiladas — 2 parejas de la misma mentalidad</div>
      <div class="gsd-circles">${circle(true)}${circle(true)}</div>
      <div class="guide-section-body">Si tienes <b>2 parejas</b> (4 piezas en total) que comparten la misma mentalidad "${lbl}", el bonus fijo de cada pareja se sustituye por un multiplicador del <b>+45%</b> sobre el rating de toda la escudería. Con <b>3 o más parejas</b> de la misma mentalidad, el multiplicador sube al <b>+90%</b> — casi el doble del rating. Es una de las situaciones más poderosas (y más raras de conseguir) del juego: vale la pena planificar el scouting y el desarrollo en torno a una sola mentalidad si ya tienes 2-3 piezas que la comparten.</div>
    </div>
    <div class="guide-special-demo semaforo-widget semaforo-on-fire" style="border:1px solid rgba(255,106,26,0.4);">
      <div class="gsd-title" style="color:var(--amber);">🔥 Semáforo "en llamas" — 3+ sinergias distintas juntas</div>
      <div class="gsd-circles">${fireCircles}</div>
      <div class="guide-section-body">Si en cambio tienes <b>3 o más parejas de mentalidades DISTINTAS</b> activas al mismo tiempo (ninguna repetida), todo el semáforo se enciende visualmente y la escudería recibe un <b>+5%</b> adicional de rating, sumado a los bonus fijos que cada pareja ya obtuvo. Es la señal de que tu equipo está bien equilibrado en profundidad, no solo apilado en una sola mentalidad — vigílalo en el Hub y en Pit Lane: si ves el semáforo encenderse así, estás haciendo algo bien.</div>
    </div>`;
  }
  return `
  <div class="guide-special-demo">
    <div class="gsd-title" style="color:${m.color};">⚡ Sinergie impilate — 2 coppie della stessa mentalità</div>
    <div class="gsd-circles">${circle(true)}${circle(true)}</div>
    <div class="guide-section-body">Se hai <b>2 coppie</b> (4 pezzi in tutto) che condividono la stessa mentalità "${lbl}", il bonus flat di ogni coppia viene sostituito da un moltiplicatore del <b>+45%</b> sul rating dell'intera scuderia. Con <b>3 o più coppie</b> della stessa mentalità, il moltiplicatore sale al <b>+90%</b> — quasi il doppio del rating. È una delle situazioni più potenti (e più rare da costruire) del gioco: vale la pena pianificare scouting e sviluppo attorno a un'unica mentalità se ti capitano già 2-3 pezzi che la condividono.</div>
  </div>
  <div class="guide-special-demo semaforo-widget semaforo-on-fire" style="border:1px solid rgba(255,106,26,0.4);">
    <div class="gsd-title" style="color:var(--amber);">🔥 Semaforo "in fiamme" — 3+ sinergie diverse insieme</div>
    <div class="gsd-circles">${fireCircles}</div>
    <div class="guide-section-body">Se invece hai <b>3 o più coppie di mentalità DIVERSE</b> attive contemporaneamente (nessuna ripetuta), l'intero semaforo prende fuoco visivamente e la scuderia riceve un ulteriore <b>+5%</b> di rating, sommato ai bonus flat già ottenuti da ciascuna coppia. È il segnale che la tua squadra è ben assortita in profondità, non solo su una singola mentalità — tienilo d'occhio nell'Hub e in Pit Lane: se vedi il semaforo animarsi così, stai facendo qualcosa di giusto.</div>
  </div>`;
}

function guideWeightBarsHTML(){
  const labelsIt = { pilota:'Pilota', motore:'Motore', telaio:'Telaio', aero:'Aero', gomme:'Gomme', stratega:'Team Pr.' };
  const labelsEn = { pilota:'Driver', motore:'Engine', telaio:'Chassis', aero:'Aero', gomme:'Tires', stratega:'Team Pr.' };
  const labelsEs = { pilota:'Piloto', motore:'Motor', telaio:'Chasis', aero:'Aero', gomme:'Neumáticos', stratega:'Team Pr.' };
  const labels = currentLang==='en' ? labelsEn : (currentLang==='es' ? labelsEs : labelsIt);
  const maxW = Math.max(...Object.values(WEIGHTS));
  const rows = Object.keys(WEIGHTS).map(k=>{
    const pct = Math.round(WEIGHTS[k]*100);
    const fillPct = Math.round((WEIGHTS[k]/maxW)*100);
    return `<div class="guide-weight-row">
      <div class="guide-weight-label">${labels[k]}</div>
      <div class="guide-weight-track"><div class="guide-weight-fill" style="width:${fillPct}%;"></div></div>
      <div class="guide-weight-pct">${pct}%</div>
    </div>`;
  }).join('');
  return `<div class="guide-img-wrap"><div class="guide-weight-bars">${rows}</div></div>`;
}
function guideSemaforoDemoHTML(){
  const ids = Object.keys(MENTALITA_DEFS);
  const m1 = MENTALITA_DEFS[ids[0]], m2 = MENTALITA_DEFS[ids[5]];
  const capLit = { it:(l,c)=>`<b style="color:${c};">Coppia accesa</b> — due pezzi diversi condividono la mentalità "${l}": entrambi ricevono +${SYNERGY_BONUS} rating.`,
                    en:(l,c)=>`<b style="color:${c};">Lit-up pair</b> — two different pieces share the "${l}" mentality: both get +${SYNERGY_BONUS} rating.`,
                    es:(l,c)=>`<b style="color:${c};">Pareja encendida</b> — dos piezas distintas comparten la mentalidad "${l}": ambas reciben +${SYNERGY_BONUS} de rating.` };
  const capOff = { it:(l)=>`<b style="color:var(--dim);">Mezzo cerchio spento</b> — "${l}" non ha ancora un secondo pezzo che la condivide: nessun bonus finché non trovi l'abbinamento.`,
                    en:(l)=>`<b style="color:var(--dim);">Half-lit circle</b> — "${l}" doesn't have a second piece sharing it yet: no bonus until you find the match.`,
                    es:(l)=>`<b style="color:var(--dim);">Medio círculo apagado</b> — "${l}" todavía no tiene una segunda pieza que la comparta: sin bonus hasta que encuentres la pareja.` };
  const lang = I18N[currentLang] ? currentLang : 'it';
  return `<div class="guide-img-wrap"><div class="guide-semaforo-demo">
    <div class="guide-sem-circle"><div class="guide-sem-half" style="background:${m1.color};"></div><div class="guide-sem-half" style="background:${m1.color};"></div></div>
    <div class="guide-sem-caption">${capLit[lang](mentaLabel(ids[0]), m1.color)}</div>
  </div></div>
  <div class="guide-img-wrap"><div class="guide-semaforo-demo">
    <div class="guide-sem-circle"><div class="guide-sem-half" style="background:${m2.color};"></div><div class="guide-sem-half" style="background:rgba(255,255,255,0.06);"></div></div>
    <div class="guide-sem-caption">${capOff[lang](mentaLabel(ids[5]))}</div>
  </div></div>`;
}
function guideAnnotatedCardHTML(){
  if(currentLang==='en'){
    return `<div class="guide-img-wrap"><div class="guide-card-annotated">
    <div class="ga-row"><span class="ga-key">Archetype</span><span class="ga-val">"Comeback King" — triggers a package of real in-race effects (see the archetypes chapter)</span></div>
    <div class="ga-row"><span class="ga-key">Rating</span><span class="ga-val">65 — the overall estimate, the one that weighs into the team strength formula</span></div>
    <div class="ga-row"><span class="ga-key">Rarity</span><span class="ga-val">Common — starting tier: typically lower rating, but not always</span></div>
    <div class="ga-row"><span class="ga-key">Bonus</span><span class="ga-val">"+20 if starting beyond P10" — specific condition, only triggers in-race if true</span></div>
    <div class="ga-row"><span class="ga-key">Malus</span><span class="ga-val">"−9 Qualifying" — fixed trade-off, always active</span></div>
    <div class="ga-row"><span class="ga-key">Ability</span><span class="ga-val">"COMEBACK KING: amplified recovery after Safety Car" — unique narrative/situational effect of the piece</span></div>
    <div class="ga-row"><span class="ga-key">Synergy</span><span class="ga-val">"Impulsive" — the mentality that counts for the semaphore, independent from bonus/malus/ability</span></div>
  </div></div>`;
  }
  if(currentLang==='es'){
    return `<div class="guide-img-wrap"><div class="guide-card-annotated">
    <div class="ga-row"><span class="ga-key">Arquetipo</span><span class="ga-val">"Comeback King" — activa un paquete de efectos reales en carrera (ver capítulo dedicado a los arquetipos)</span></div>
    <div class="ga-row"><span class="ga-key">Rating</span><span class="ga-val">65 — la estimación general, la que pesa en la fórmula de fuerza de escudería</span></div>
    <div class="ga-row"><span class="ga-key">Rareza</span><span class="ga-val">Common — franja de partida: rating típicamente más bajo, pero no siempre</span></div>
    <div class="ga-row"><span class="ga-key">Bonus</span><span class="ga-val">"+20 si parte más allá de la P10" — condición específica, se activa solo en carrera si se cumple</span></div>
    <div class="ga-row"><span class="ga-key">Malus</span><span class="ga-val">"−9 Clasificación" — contrapartida fija, siempre activa</span></div>
    <div class="ga-row"><span class="ga-key">Habilidad</span><span class="ga-val">"COMEBACK KING: remontada amplificada tras Safety Car" — efecto narrativo/situacional único de la pieza</span></div>
    <div class="ga-row"><span class="ga-key">Sinergia</span><span class="ga-val">"Impulsivo" — la mentalidad que cuenta para el semáforo, independiente de bonus/malus/habilidad</span></div>
  </div></div>`;
  }
  return `<div class="guide-img-wrap"><div class="guide-card-annotated">
    <div class="ga-row"><span class="ga-key">Archetipo</span><span class="ga-val">"Comeback King" — attiva un pacchetto di effetti reali in gara (vedi capitolo dedicato agli archetipi)</span></div>
    <div class="ga-row"><span class="ga-key">Rating</span><span class="ga-val">65 — la stima complessiva, quella che pesa nella formula della forza scuderia</span></div>
    <div class="ga-row"><span class="ga-key">Rarità</span><span class="ga-val">Common — fascia di partenza: rating tipicamente più basso, ma non sempre</span></div>
    <div class="ga-row"><span class="ga-key">Bonus</span><span class="ga-val">"+20 se parte oltre la P10" — condizione specifica, si attiva solo in gara se vera</span></div>
    <div class="ga-row"><span class="ga-key">Malus</span><span class="ga-val">"−9 Qualifica" — contropartita fissa, sempre attiva</span></div>
    <div class="ga-row"><span class="ga-key">Abilità</span><span class="ga-val">"COMEBACK KING: rimonta amplificata dopo Safety Car" — effetto narrativo/situazionale unico del pezzo</span></div>
    <div class="ga-row"><span class="ga-key">Sinergia</span><span class="ga-val">"Impulsivo" — la mentalità che conta per il semaforo, indipendente da bonus/malus/abilità</span></div>
  </div></div>`;
}
function guideMentalityGridHTML(){
  const chips = Object.keys(MENTALITA_DEFS).map(id=>{
    const m = MENTALITA_DEFS[id];
    return `<span class="guide-mentality-chip" style="background:${m.color};">${mentaLabel(id)}</span>`;
  }).join('');
  return `<div class="guide-img-wrap"><div class="guide-mentality-grid">${chips}</div></div>`;
}
function guidePanelHTML(){
  const sectionsIt = [
    { title:'Obiettivo della Carriera', body:`
      <p>Ogni carriera è una stagione: 10 Gran Premi (Veloce) o 20 (Completa). Vinci punti in ogni gara con entrambi i tuoi piloti, per due classifiche separate e indipendenti: <b>Piloti</b> (il singolo pilota con più punti) e <b>Costruttori</b> (la somma dei punti dei tuoi due piloti contro quella delle scuderie rivali). Puoi vincere l'una senza l'altra, o entrambe nella stessa stagione — un vero "Grande Slam".</p>` },
    { title:'La Scuderia: Rating e Peso di Ciascun Ruolo', body:`
      <p>La tua scuderia è fatta di 7 pezzi: due piloti e cinque componenti condivisi (motore, telaio, aerodinamica, gomme, team principal/strategia). Ogni pezzo ha un <b>rating</b> da 1 a 100, ma NON contano tutti allo stesso modo nella forza complessiva della scuderia: il pilota pesa quasi il doppio di un singolo componente. Ecco i pesi reali usati dal gioco:</p>
      ${guideWeightBarsHTML()}
      <p>Per questo un pilota forte con un'auto mediocre spesso rende più di un'auto perfetta con un pilota scarso — vale la pena tenerlo a mente sia al Draft che quando scegli dove investire in Pit Lane.</p>` },
    { title:'Rarità: cosa cambia davvero', body:`
      <p>Ogni pilota e componente appartiene a una fascia di rarità, dalla più comune alla più eccezionale:</p>
      ${guideRarityLegendHTML()}
      <p>La rarità influenza soprattutto il <b>rating medio atteso</b> di quel pezzo (un Immortal tende ad avere rating molto più alto di un Common) e quanto è raro trovarlo tra le opzioni proposte dal Draft o dallo scouting. Non è però una garanzia assoluta: un Common fortunato può comunque avere un rating rispettabile, e un Legendary può capitarti con un malus scomodo per il tuo stile di corsa.</p>` },
    { title:'Leggere una Card: Archetipo, Bonus, Malus, Abilità, Sinergia', body:`
      <p>Ogni Card contiene diversi campi. Alcuni possono sembrare simili, ma indicano aspetti differenti del pilota o del componente:</p>
      <ul style="margin:2px 0 10px 18px;padding:0;">
        <li><b>Archetipo</b> — per i piloti non è un nome evocativo: identifica un vero pacchetto di effetti applicati durante la simulazione della gara.</li>
        <li><b>Rating</b> — la valutazione complessiva del pezzo, il valore usato nel calcolo della forza della scuderia.</li>
        <li><b>Rarità</b> — la fascia di appartenenza. Un Common parte generalmente da valori inferiori rispetto alle rarità più elevate, ma non necessariamente sarà inutile.</li>
        <li><b>Bonus</b> — un effetto condizionale: si attiva solo quando la condizione indicata viene rispettata durante la gara.</li>
        <li><b>Malus</b> — una penalità fissa, sempre attiva.</li>
        <li><b>Abilità</b> — descrive in linguaggio naturale il comportamento reale dell'archetipo. Non è un effetto separato dall'archetipo.</li>
        <li><b>Sinergia</b> — la mentalità del pezzo, usata dal sistema del Semaforo. È indipendente da bonus, malus e abilità.</li>
      </ul>
      <p>Ecco un esempio reale, annotato campo per campo:</p>
      ${guideAnnotatedCardHTML()}
      <p><b>Attenzione, questo è importante:</b> per i <b>piloti</b>, l'archetipo attiva effetti meccanici reali all'interno della simulazione (vedi il capitolo dedicato subito sotto). Per i <b>componenti</b> invece l'archetipo è puramente narrativo: la loro efficacia dipende dal rating e dalle statistiche dettagliate, già riassunte attraverso bonus e malus.</p>` },
    { title:'Gli Archetipi dei Piloti: l' + String.fromCharCode(39) + 'effetto reale di ciascuno', body:`
      <p>Questi sono i 12 archetipi che un pilota può avere, con l'effetto meccanico esatto che porta in gara — non semplificazioni:</p>
      ${guideArchetypeTableHTML()}` },
    { title:'THE GOAT', body: guideGoatChapterHTML() },
    { title:'Le Sinergie: come funziona davvero il Semaforo', body:`
      <p>Ogni pezzo (pilota o componente) ha anche una <b>mentalità</b> nascosta, una delle 15 disponibili nel gioco:</p>
      ${guideMentalityGridHTML()}
      <p>Quando <b>due pezzi diversi della tua scuderia condividono la stessa mentalità</b>, si forma una coppia: entrambi ricevono +${SYNERGY_BONUS} al rating, in modo permanente finché restano entrambi in squadra. Il "semaforo" che vedi nell'interfaccia è proprio la rappresentazione visiva di queste coppie:</p>
      ${guideSemaforoDemoHTML()}
      <p>Fin qui la base. Ma ci sono due <b>condizioni speciali</b> molto più rare e molto più forti, che vale la pena inseguire attivamente invece di lasciare al caso:</p>
      ${guideSynergyStackDemoHTML()}` },
    { title:'I Circuiti: non sono tutti uguali', body:`
      <p>Ogni Gran Premio si corre su un circuito con caratteristiche proprie: tipo di tracciato (alta velocità, cittadino, misto...), clima, probabilità di pioggia e di Safety Car, quanto stressa gomme e motore, e soprattutto un <b>componente dominante</b> — quello che in quel circuito specifico pesa di più sul risultato. Su un circuito dove le gomme sono il componente dominante, per esempio, un buon reparto gomme conta più del solito, anche a parità di rating generale della scuderia.</p>` },
    { title:'Il Draft: costruisci la scuderia iniziale', body:`
      <p>All'inizio di ogni carriera scegli, turno dopo turno, i due piloti e i cinque componenti. Ad ogni turno ti viene proposto un candidato: puoi accettarlo o, se hai ancora rerolls disponibili, richiederne uno diverso. Il numero di rerolls dipende dalla difficoltà scelta — più è alta la difficoltà, meno margine di scelta hai, e più conta la sinergia tra i pezzi che ti capitano piuttosto che il rating puro di ciascuno.</p>` },
    { title:'La Pit Lane: sviluppo e scouting', body:`
      <p>Dopo ogni gara, il budget guadagnato con i piazzamenti si può investire in due modi, oppure risparmiare per dopo:</p>
      <p><b>Sviluppo (upgrade permanente)</b> — potenzi un componente esistente. Scegli quanto rischiare con un cursore: investimento minimo (rischio più alto, fino al 50%, ma più economico) fino a investimento massimo (rischio minimo, fino al 5%, ma più caro fino al 2.2× del costo base). Se l'investimento fallisce, si applica un malus invece del miglioramento. Il rischio non arriva mai a zero, nemmeno investendo il massimo possibile.</p>
      <p><b>Scouting (sostituzione)</b> — sostituisci un pezzo con un candidato nuovo. A differenza dello sviluppo, qui non c'è rischio di fallimento: se hai il budget, ottieni esattamente il pezzo che vedi. Il pezzo sostituito non si può recuperare in quella carriera, ma va ad arricchire il Museo Dynasty.</p>` },
    { title:'Rivalità: chi devi battere', body:`
      <p>Il gioco ti assegna una o più scuderie rivali in base alla tua forza attuale: sono gli avversari diretti da battere per la classifica Costruttori. Se superi nettamente una rivale, ne ottieni una nuova, più temibile — la sfida si adatta ai tuoi progressi invece di restare fissa per tutta la stagione.</p>` },
    { title:'Difficoltà e Lunghezza Stagione', body:`
      <p>La <b>lunghezza stagione</b> (Veloce = 10 gare, Completa = 20 gare) definisce quante gare corri. Nella Stagione Completa, tra la gara 10 e la gara 11 c'è un evento unico, il <b>Mid Season Draft</b>: puoi rivalutare entrambi i piloti (2 candidati ciascuno, nessun rischio) — è l'unica occasione in tutta la stagione per farlo, perché per il resto della Stagione Completa lo scouting piloti resta bloccato.</p>
      <p>La <b>difficoltà</b> (Facile → Hardcore) agisce soprattutto sui rerolls disponibili al Draft: più è alta, meno scelta hai e più contano le decisioni prese al volo.</p>` },
    { title:'Sala Trofei, Museo Dynasty e Obiettivi', body:`
      <p>La <b>Sala Trofei</b> mostra un trofeo per ogni circuito del gioco: dorato se l'hai già vinto, spento se ancora no — persiste tra tutte le tue carriere. Il <b>Museo Dynasty</b> colleziona ogni pilota e componente che hai posseduto almeno una volta, in qualunque carriera. Gli <b>Obiettivi</b> sono traguardi speciali (stagioni perfette, sfide Hardcore, stili di gioco particolari) che si sbloccano automaticamente mentre giochi: si trovano nella voce dedicata del menu.</p>` },
  ];
  const sectionsEn = [
    { title:'Career Goal', body:`
      <p>Every career is a season: 10 Grands Prix (Quick) or 20 (Full). Score points in every race with both your drivers, for two separate, independent standings: <b>Drivers</b> (the single driver with the most points) and <b>Constructors</b> (the sum of your two drivers' points against rival teams). You can win one without the other, or both in the same season — a true "Grand Slam".</p>` },
    { title:'The Team: Rating and the Weight of Each Role', body:`
      <p>Your team is made up of 7 pieces: two drivers and five shared components (engine, chassis, aerodynamics, tires, team principal/strategy). Each piece has a <b>rating</b> from 1 to 100, but they DON'T all count equally toward the team's overall strength: a driver weighs almost twice as much as a single component. Here are the real weights used by the game:</p>
      ${guideWeightBarsHTML()}
      <p>That's why a strong driver in a mediocre car often outperforms a perfect car with a weak driver — worth keeping in mind both at the Draft and when deciding where to invest in Pit Lane.</p>` },
    { title:'Rarity: what really changes', body:`
      <p>Every driver and component belongs to a rarity tier, from most common to most exceptional:</p>
      ${guideRarityLegendHTML()}
      <p>Rarity mainly affects the <b>expected average rating</b> of that piece (an Immortal tends to have a much higher rating than a Common) and how rare it is to find among the options offered by the Draft or scouting. It's not an absolute guarantee though: a lucky Common can still have a respectable rating, and a Legendary might come with a malus that's awkward for your racing style.</p>` },
    { title:'Reading a Card: Archetype, Bonus, Malus, Ability, Synergy', body:`
      <p>Every Card contains several fields. Some may look similar, but they indicate different aspects of the driver or component:</p>
      <ul style="margin:2px 0 10px 18px;padding:0;">
        <li><b>Archetype</b> — for drivers this isn't just a flavor name: it identifies a real package of effects applied during race simulation.</li>
        <li><b>Rating</b> — the piece's overall evaluation, the value used to calculate team strength.</li>
        <li><b>Rarity</b> — the tier it belongs to. A Common generally starts from lower values than higher rarities, but won't necessarily be useless.</li>
        <li><b>Bonus</b> — a conditional effect: it only triggers when the stated condition is met during the race.</li>
        <li><b>Malus</b> — a fixed penalty, always active.</li>
        <li><b>Ability</b> — describes in plain language the archetype's real behavior. It's not an effect separate from the archetype.</li>
        <li><b>Synergy</b> — the piece's mentality, used by the Semaphore system. It's independent from bonus, malus and ability.</li>
      </ul>
      <p>Here's a real example, annotated field by field:</p>
      ${guideAnnotatedCardHTML()}
      <p><b>Important, pay attention:</b> for <b>drivers</b>, the archetype triggers real mechanical effects within the simulation (see the dedicated chapter right below). For <b>components</b> instead, the archetype is purely narrative: their effectiveness depends on rating and detailed stats, already summarized through bonus and malus.</p>` },
    { title:"Driver Archetypes: what each one really does", body:`
      <p>These are the 12 archetypes a driver can have, with the exact mechanical effect they bring to the race — not simplifications:</p>
      ${guideArchetypeTableHTML()}` },
    { title:'THE GOAT', body: guideGoatChapterHTML() },
    { title:'Synergies: how the Semaphore really works', body:`
      <p>Every piece (driver or component) also has a hidden <b>mentality</b>, one of 15 available in the game:</p>
      ${guideMentalityGridHTML()}
      <p>When <b>two different pieces on your team share the same mentality</b>, they form a pair: both get +${SYNERGY_BONUS} to their rating, permanently, as long as both stay on the team. The "semaphore" you see in the interface is exactly the visual representation of these pairs:</p>
      ${guideSemaforoDemoHTML()}
      <p>That's the basics. But there are two much rarer, much stronger <b>special conditions</b>, worth actively chasing instead of leaving to chance:</p>
      ${guideSynergyStackDemoHTML()}` },
    { title:'Circuits: not all the same', body:`
      <p>Every Grand Prix is run on a circuit with its own characteristics: track type (high-speed, street, mixed...), weather, chance of rain and Safety Car, how much it stresses tires and engine, and above all a <b>dominant component</b> — the one that matters most for the result on that specific circuit. On a circuit where tires are the dominant component, for example, a good tire department counts more than usual, even with the same overall team rating.</p>` },
    { title:'The Draft: build your starting team', body:`
      <p>At the start of every career you choose, turn by turn, your two drivers and five components. Each turn you're offered a candidate: you can accept it or, if you still have rerolls available, request a different one. The number of rerolls depends on the chosen difficulty — the higher the difficulty, the less choice you have, and the more the synergy between the pieces you get matters over their raw rating.</p>` },
    { title:'Pit Lane: development and scouting', body:`
      <p>After every race, the budget earned from your results can be invested in two ways, or saved for later:</p>
      <p><b>Development (permanent upgrade)</b> — you upgrade an existing component. Choose how much to risk with a slider: minimum investment (higher risk, up to 50%, but cheaper) up to maximum investment (lowest risk, down to 5%, but pricier, up to 2.2× the base cost). If the investment fails, a malus is applied instead of the improvement. Risk never reaches zero, even at maximum investment.</p>
      <p><b>Scouting (replacement)</b> — you replace a piece with a new candidate. Unlike development, there's no failure risk here: if you have the budget, you get exactly the piece you see. The replaced piece can't be recovered in that career, but it enriches the Dynasty Museum.</p>` },
    { title:'Rivalry: who you need to beat', body:`
      <p>The game assigns you one or more rival teams based on your current strength: they're the direct opponents to beat for the Constructors' standings. If you clearly overtake a rival, you get a new, tougher one — the challenge adapts to your progress instead of staying fixed all season.</p>` },
    { title:'Difficulty and Season Length', body:`
      <p><b>Season length</b> (Quick = 10 races, Full = 20 races) defines how many races you run. In the Full Season, between race 10 and race 11 there's a unique event, the <b>Mid Season Draft</b>: you can re-evaluate both drivers (2 candidates each, no risk) — it's the only chance in the whole season to do so, since driver scouting stays locked for the rest of the Full Season.</p>
      <p><b>Difficulty</b> (Easy → Hardcore) mainly affects the rerolls available at the Draft — the higher it is, the less choice you have, and the more on-the-spot decisions matter.</p>` },
    { title:'Trophy Room, Dynasty Museum and Achievements', body:`
      <p>The <b>Trophy Room</b> shows a trophy for every circuit in the game: gold if you've already won it, dim if not yet — it persists across all your careers. The <b>Dynasty Museum</b> collects every driver and component you've ever owned, in any career. <b>Achievements</b> are special milestones (perfect seasons, Hardcore challenges, particular playstyles) that unlock automatically as you play: you'll find them in the dedicated menu entry.</p>` },
  ];
  const sectionsEs = [
    { title:'Objetivo de la Carrera Deportiva', body:`
      <p>Cada carrera deportiva es una temporada: 10 Grandes Premios (Rápida) o 20 (Completa). Suma puntos en cada carrera con tus dos pilotos, para dos clasificaciones separadas e independientes: <b>Pilotos</b> (el piloto individual con más puntos) y <b>Constructores</b> (la suma de los puntos de tus dos pilotos frente a las escuderías rivales). Puedes ganar una sin la otra, o ambas en la misma temporada — un verdadero "Grande Slam".</p>` },
    { title:'La Escudería: Rating y Peso de Cada Rol', body:`
      <p>Tu escudería está formada por 7 piezas: dos pilotos y cinco componentes compartidos (motor, chasis, aerodinámica, neumáticos, team principal/estrategia). Cada pieza tiene un <b>rating</b> de 1 a 100, pero NO cuentan todas igual en la fuerza total de la escudería: un piloto pesa casi el doble que un solo componente. Estos son los pesos reales usados por el juego:</p>
      ${guideWeightBarsHTML()}
      <p>Por eso un piloto fuerte con un coche mediocre a menudo rinde más que un coche perfecto con un piloto flojo — vale la pena tenerlo en cuenta tanto en el Draft como al elegir dónde invertir en Pit Lane.</p>` },
    { title:'Rareza: qué cambia realmente', body:`
      <p>Cada piloto y componente pertenece a una franja de rareza, de la más común a la más excepcional:</p>
      ${guideRarityLegendHTML()}
      <p>La rareza influye sobre todo en el <b>rating medio esperado</b> de esa pieza (un Immortal tiende a tener un rating mucho más alto que un Common) y en lo raro que es encontrarlo entre las opciones propuestas por el Draft o el scouting. No es una garantía absoluta: un Common afortunado puede tener igualmente un rating respetable, y un Legendary puede tocarte con un malus incómodo para tu estilo de carrera.</p>` },
    { title:'Leer una Card: Arquetipo, Bonus, Malus, Habilidad, Sinergia', body:`
      <p>Cada Card contiene varios campos. Algunos pueden parecer similares, pero indican aspectos diferentes del piloto o del componente:</p>
      <ul style="margin:2px 0 10px 18px;padding:0;">
        <li><b>Arquetipo</b> — para los pilotos no es solo un nombre evocador: identifica un paquete real de efectos aplicados durante la simulación de la carrera.</li>
        <li><b>Rating</b> — la valoración general de la pieza, el valor usado para calcular la fuerza de la escudería.</li>
        <li><b>Rareza</b> — la franja a la que pertenece. Un Common suele partir de valores más bajos que las rarezas superiores, pero no por eso será inútil.</li>
        <li><b>Bonus</b> — un efecto condicional: se activa solo cuando se cumple la condición indicada durante la carrera.</li>
        <li><b>Malus</b> — una penalización fija, siempre activa.</li>
        <li><b>Habilidad</b> — describe en lenguaje natural el comportamiento real del arquetipo. No es un efecto separado del arquetipo.</li>
        <li><b>Sinergia</b> — la mentalidad de la pieza, usada por el sistema del Semáforo. Es independiente de bonus, malus y habilidad.</li>
      </ul>
      <p>Aquí tienes un ejemplo real, anotado campo por campo:</p>
      ${guideAnnotatedCardHTML()}
      <p><b>Atención, esto es importante:</b> para los <b>pilotos</b>, el arquetipo activa efectos mecánicos reales dentro de la simulación (ver el capítulo dedicado justo abajo). Para los <b>componentes</b> en cambio el arquetipo es puramente narrativo: su eficacia depende del rating y de las estadísticas detalladas, ya resumidas mediante bonus y malus.</p>` },
    { title:'Los Arquetipos de los Pilotos: el efecto real de cada uno', body:`
      <p>Estos son los 12 arquetipos que puede tener un piloto, con el efecto mecánico exacto que aporta a la carrera — no simplificaciones:</p>
      ${guideArchetypeTableHTML()}` },
    { title:'THE GOAT', body: guideGoatChapterHTML() },
    { title:'Las Sinergias: cómo funciona realmente el Semáforo', body:`
      <p>Cada pieza (piloto o componente) tiene también una <b>mentalidad</b> oculta, una de las 15 disponibles en el juego:</p>
      ${guideMentalityGridHTML()}
      <p>Cuando <b>dos piezas distintas de tu escudería comparten la misma mentalidad</b>, se forma una pareja: ambas reciben +${SYNERGY_BONUS} al rating, de forma permanente mientras ambas sigan en el equipo. El "semáforo" que ves en la interfaz es precisamente la representación visual de estas parejas:</p>
      ${guideSemaforoDemoHTML()}
      <p>Hasta aquí lo básico. Pero hay dos <b>condiciones especiales</b> mucho más raras y mucho más fuertes, que vale la pena perseguir activamente en lugar de dejar al azar:</p>
      ${guideSynergyStackDemoHTML()}` },
    { title:'Los Circuitos: no son todos iguales', body:`
      <p>Cada Gran Premio se disputa en un circuito con características propias: tipo de trazado (alta velocidad, urbano, mixto...), clima, probabilidad de lluvia y de Safety Car, cuánto exige a neumáticos y motor, y sobre todo un <b>componente dominante</b> — el que más pesa en el resultado en ese circuito específico. En un circuito donde los neumáticos son el componente dominante, por ejemplo, un buen departamento de neumáticos cuenta más de lo habitual, incluso con el mismo rating general de escudería.</p>` },
    { title:'El Draft: construye tu escudería inicial', body:`
      <p>Al principio de cada carrera deportiva eliges, turno tras turno, a los dos pilotos y los cinco componentes. En cada turno se te propone un candidato: puedes aceptarlo o, si aún tienes rerolls disponibles, pedir uno diferente. El número de rerolls depende de la dificultad elegida — cuanto más alta es la dificultad, menos margen de elección tienes, y más cuenta la sinergia entre las piezas que te tocan en lugar del rating puro de cada una.</p>` },
    { title:'La Pit Lane: desarrollo y scouting', body:`
      <p>Después de cada carrera, el presupuesto ganado con las posiciones se puede invertir de dos formas, o ahorrar para después:</p>
      <p><b>Desarrollo (mejora permanente)</b> — mejoras un componente existente. Eliges cuánto arriesgar con un control deslizante: inversión mínima (riesgo más alto, hasta el 50%, pero más económica) hasta inversión máxima (riesgo mínimo, hasta el 5%, pero más cara, hasta 2.2× el coste base). Si la inversión falla, se aplica un malus en lugar de la mejora. El riesgo nunca llega a cero, ni siquiera invirtiendo el máximo posible.</p>
      <p><b>Scouting (sustitución)</b> — sustituyes una pieza por un candidato nuevo. A diferencia del desarrollo, aquí no hay riesgo de fallo: si tienes el presupuesto, obtienes exactamente la pieza que ves. La pieza sustituida no se puede recuperar en esa carrera, pero pasa a enriquecer el Museo Dynasty.</p>` },
    { title:'Rivalidad: a quién tienes que vencer', body:`
      <p>El juego te asigna una o más escuderías rivales según tu fuerza actual: son los oponentes directos a batir para la clasificación de Constructores. Si superas claramente a una rival, obtienes una nueva, más temible — el desafío se adapta a tu progreso en lugar de permanecer fijo toda la temporada.</p>` },
    { title:'Dificultad y Duración de la Temporada', body:`
      <p>La <b>duración de la temporada</b> (Rápida = 10 carreras, Completa = 20 carreras) define cuántas carreras disputas. En la Temporada Completa, entre la carrera 10 y la 11 hay un evento único, el <b>Mid Season Draft</b>: puedes reevaluar a ambos pilotos (2 candidatos cada uno, sin riesgo) — es la única ocasión en toda la temporada para hacerlo, porque durante el resto de la Temporada Completa el scouting de pilotos permanece bloqueado.</p>
      <p>La <b>dificultad</b> (Fácil → Hardcore) actúa sobre todo en los rerolls disponibles en el Draft — cuanto más alta, menos elección tienes, y más cuentan las decisiones tomadas sobre la marcha.</p>` },
    { title:'Sala de Trofeos, Museo Dynasty y Logros', body:`
      <p>La <b>Sala de Trofeos</b> muestra un trofeo por cada circuito del juego: dorado si ya lo has ganado, apagado si todavía no — persiste entre todas tus carreras deportivas. El <b>Museo Dynasty</b> reúne cada piloto y componente que has poseído alguna vez, en cualquier carrera. Los <b>Logros</b> son hitos especiales (temporadas perfectas, desafíos Hardcore, estilos de juego particulares) que se desbloquean automáticamente mientras juegas: se encuentran en la entrada dedicada del menú.</p>` },
  ];
  const sections = currentLang==='en' ? sectionsEn : (currentLang==='es' ? sectionsEs : sectionsIt);
  return sections.map(s=> `<div class="guide-section">
    <div class="guide-section-title">${s.title}</div>
    <div class="guide-section-body">${s.body}</div>
  </div>`).join('');
}
function openGuide(){
  closeMenuPanel();
  document.getElementById('sidebarGuideBody').innerHTML = guidePanelHTML();
  document.getElementById('sidebarGuidePanel').style.display = 'flex';
  pushBackGuard();
}
function closeGuidePanel(){
  document.getElementById('sidebarGuidePanel').style.display = 'none';
}

// V0.9.7.8.12: pannello Crediti — firme standard dal brand kit FUORISCALA (copy_deck.md), stesso
// identico pattern di apertura/chiusura di Guida e Obiettivi.
function creditsPanelHTML(){
  const siteUrl = 'https://fuoriscala-dev.github.io/FUORISCALA.SITOWEB/';
  return `
  <div style="text-align:center;padding:24px 12px;">
    <a href="${siteUrl}" target="_blank" rel="noopener" title="FUORISCALA">
      <img src="assets/fuoriscala/fuoriscala_primary_white.svg" alt="FUORISCALA" style="width:180px;max-width:70%;margin-bottom:18px;cursor:pointer;">
    </a>
    <div class="dim" style="font-size:12px;letter-spacing:0.04em;margin-bottom:28px;">${t('credits_tagline')}</div>
  </div>
  <div style="font-size:13px;line-height:2;text-align:center;color:var(--text);">
    <div style="text-transform:uppercase;letter-spacing:0.08em;font-size:11px;color:var(--dim);margin-bottom:4px;">Racing Dynasty</div>
    <div style="font-weight:800;margin-bottom:18px;">${t('credits_first_game')}</div>
    <div>${t('credits_dev')} <b>FUORISCALA</b></div>
    <div>${t('credits_created')} <b>Giorgio Gardon</b></div>
  </div>
  <div class="dim" style="text-align:center;font-size:11px;margin-top:28px;">© ${new Date().getFullYear()} FUORISCALA</div>
  `;
}
function openCredits(){
  closeMenuPanel();
  document.getElementById('sidebarCreditsBody').innerHTML = creditsPanelHTML();
  document.getElementById('sidebarCreditsPanel').style.display = 'flex';
  pushBackGuard();
}
function closeCreditsPanel(){
  document.getElementById('sidebarCreditsPanel').style.display = 'none';
}

// V0.9.7: pannello Obiettivi — 15 achievement raggruppati per categoria, stato sbloccato/bloccato
function achievementsPanelHTML(){
  const cats = ['Facile','Medio','Difficile','Estremo'];
  const unlockedCount = achievementData.unlockedIds.length;
  const summary = `<div class="ach-progress-summary">Sbloccati: <b>${unlockedCount}</b> / ${ACHIEVEMENTS.length}</div>`;
  const sections = cats.map(cat=>{
    const items = ACHIEVEMENTS.filter(a=>a.cat===cat);
    if(!items.length) return '';
    const cards = items.map(a=>{
      const unlocked = isAchievementUnlocked(a.id);
      const aLoc = achText(a);
      const iconHTML = `<img src="assets/achievements/${a.id}.webp" alt="">`;
      return `<div class="ach-card ${unlocked?'unlocked':'locked'}" id="ach-item-${a.id}">
        <div class="ach-icon">${iconHTML}</div>
        <div class="ach-body">
          <div class="ach-title">${aLoc.title}</div>
          <div class="ach-desc">${aLoc.desc}</div>
        </div>
      </div>`;
    }).join('');
    return `<div class="ach-cat-title">${cat}</div>${cards}`;
  }).join('');
  return summary + sections;
}
// V0.9.7.9: openAchievements ora accetta un id opzionale — se presente, dopo il render scrolla
// fino a quella card specifica e la evidenzia per un istante (usato dal banner "Obiettivo Sbloccato").
function openAchievements(targetId){
  closeMenuPanel();
  document.getElementById('sidebarAchievementsBody').innerHTML = achievementsPanelHTML();
  document.getElementById('sidebarAchievementsPanel').style.display = 'flex';
  pushBackGuard();
  if(targetId){
    setTimeout(()=>{
      const el = document.getElementById('ach-item-'+targetId);
      if(el){
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.classList.add('ach-card-highlight');
        setTimeout(()=> el.classList.remove('ach-card-highlight'), 2200);
      }
    }, 80);
  }
}
function closeAchievementsPanel(){
  document.getElementById('sidebarAchievementsPanel').style.display = 'none';
}

function toggleFullscreen(){
  try{
    if(!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }catch(err){ /* API non disponibile: ignorato silenziosamente */ }
  closeMenuPanel();
}

function updateMenuFullscreenLabel(){
  const label = document.getElementById('menuFullscreenLabel');
  if(!label) return;
  label.textContent = document.fullscreenElement ? t('menu_exit_fullscreen') : t('menu_fullscreen');
}

document.addEventListener('fullscreenchange', updateMenuFullscreenLabel);

// la voce "Nuova Carriera" compare solo quando si e' davvero dentro una carriera
function updateMenuNewCareerVisibility(){
  const btn = document.getElementById('menuNewCareerBtn');
  if(!btn) return;
  const inCareer = !!(typeof state!=='undefined' && state && state.team && state.team.pilotMain);
  btn.style.display = inCareer ? '' : 'none';
}
// alias per compatibilita' con render() che chiama questo nome ad ogni cambio schermata
function updateSidebarVisibility(){
  updateMenuNewCareerVisibility();
  // V0.9.7.8.12: niente icona menu sopra lo splash FUORISCALA — e' un momento di brand puro
  const toggleBtn = document.getElementById('gameMenuToggleBtn');
  const hideMenuOn = new Set(['studio-splash','lang-select']);
  if(toggleBtn) toggleBtn.style.display = (state && hideMenuOn.has(state.phase)) ? 'none' : '';
  // V0.9.7.8.24: banner promozionale — sempre visibile tranne su splash, scelta lingua e titolo
  const banner = document.getElementById('promoBanner');
  const hideBannerOn = new Set(['studio-splash','lang-select','title']);
  const showBanner = state && !hideBannerOn.has(state.phase);
  if(banner) banner.style.display = showBanner ? 'flex' : 'none';
  document.body.classList.toggle('has-promo-banner', !!showBanner);
}

// V0.9.7.8.26: il menu laterale vive fuori dal normale ciclo render() (e' markup statico in
// index.html), quindi le sue traduzioni vanno applicate a mano qui, non tramite t() dentro un
// template — richiamata all'avvio e ad ogni cambio lingua.
function applyStaticMenuTranslations(){
  const map = {
    menuHomeBtn: 'menu_home', menuNewCareerBtn: 'menu_new_career', menuTrophyBtn: 'menu_trophy_room', menuGuideBtn: 'menu_guide',
    menuAchievementsBtn: 'menu_achievements', menuSettingsBtn: 'menu_settings', menuCreditsBtn: 'menu_credits',
  };
  Object.entries(map).forEach(([id, key])=>{
    const el = document.getElementById(id);
    if(el){ const span = el.querySelector('span'); if(span) span.textContent = t(key); }
  });
  updateMenuFullscreenLabel();
  const sectionLabels = document.querySelectorAll('.menu-section-label');
  const sectionKeys = ['menu_section_game','menu_section_progress','menu_section_info','menu_section_app'];
  sectionLabels.forEach((el,i)=>{ if(sectionKeys[i]) el.textContent = t(sectionKeys[i]); });
  // V0.9.7.8.37 fix: il banner promozionale era markup statico, ignorava sempre la lingua scelta —
  // trovato durante un controllo a campione su piu' schermate in inglese.
  const promoTagline = document.getElementById('promoBannerTagline');
  if(promoTagline) promoTagline.textContent = t('promo_banner_tagline');
  const promoCta = document.getElementById('promoBannerCta');
  if(promoCta) promoCta.textContent = t('promo_banner_cta');
}
function initSidebar(){
  document.getElementById('gameMenuToggleBtn').addEventListener('click', toggleMenuPanel);
  document.querySelector('.game-menu-close').addEventListener('click', closeMenuPanel);
  document.getElementById('gameMenuPanel').addEventListener('click', (e)=>{
    if(e.target.id==='gameMenuPanel') closeMenuPanel();
  });

  document.getElementById('menuHomeBtn').addEventListener('click', goHome);
  document.getElementById('menuNewCareerBtn').addEventListener('click', newCareer);
  document.getElementById('menuTrophyBtn').addEventListener('click', openTrophies);
  const guideBtn = document.getElementById('menuGuideBtn');
  if(guideBtn) guideBtn.addEventListener('click', openGuide);
  const achBtn = document.getElementById('menuAchievementsBtn');
  if(achBtn) achBtn.addEventListener('click', openAchievements);
  document.getElementById('menuSettingsBtn').addEventListener('click', openSettings);
  const creditsBtn = document.getElementById('menuCreditsBtn');
  if(creditsBtn) creditsBtn.addEventListener('click', openCredits);
  document.getElementById('menuFullscreenBtn').addEventListener('click', toggleFullscreen);
  document.querySelectorAll('.sidebar-settings-close').forEach(btn=>{
    if(btn.id==='sidebarGuideCloseBtn') btn.addEventListener('click', closeGuidePanel);
    else if(btn.id==='sidebarAchievementsCloseBtn') btn.addEventListener('click', closeAchievementsPanel);
    else if(btn.id==='sidebarCreditsCloseBtn') btn.addEventListener('click', closeCreditsPanel);
    else btn.addEventListener('click', closeSettingsPanel);
  });

  updateMenuFullscreenLabel();
  updateMenuNewCareerVisibility();
  document.getElementById('sidebarSettingsPanel').addEventListener('click', (e)=>{
    if(e.target.id==='sidebarSettingsPanel') closeSettingsPanel();
  });
  const guidePanel = document.getElementById('sidebarGuidePanel');
  if(guidePanel) guidePanel.addEventListener('click', (e)=>{
    if(e.target.id==='sidebarGuidePanel') closeGuidePanel();
  });
  const achPanel = document.getElementById('sidebarAchievementsPanel');
  if(achPanel) achPanel.addEventListener('click', (e)=>{
    if(e.target.id==='sidebarAchievementsPanel') closeAchievementsPanel();
  });
  const creditsPanel = document.getElementById('sidebarCreditsPanel');
  if(creditsPanel) creditsPanel.addEventListener('click', (e)=>{
    if(e.target.id==='sidebarCreditsPanel') closeCreditsPanel();
  });
}

/* ---------------- V0.9.7: gesture back mobile ----------------
   Ogni volta che si apre un pannello/overlay con un "indietro" logico, spingiamo una voce nella
   cronologia del browser. Se l'utente usa il tasto/gesture back nativo (Android) o lo swipe da
   bordo (iOS PWA), il browser genera un evento 'popstate' — lo intercettiamo e chiudiamo il
   pannello attualmente aperto invece di lasciare che il browser navighi altrove.
   Se NESSUN overlay e' aperto (qualunque schermata di flusso, hub incluso), la gesture mostra la
   conferma di uscita gia' usata altrove nel gioco — l'autosalvataggio e' gia' attivo, quindi
   uscire non fa perdere progresso: la conferma serve solo a evitare uscite accidentali col dito. */
function pushBackGuard(){
  try{ history.pushState({__backGuard:true}, ''); }catch(e){ /* History API non disponibile: ignorato */ }
}
function isPanelOpen(id){
  const el = document.getElementById(id);
  return !!(el && el.style.display === 'flex');
}
function handleBackGesture(){
  if(document.getElementById('goatRevealOverlay')){
    const closeBtn = document.getElementById('goatRevealCloseBtn');
    if(closeBtn) closeBtn.click();
    return;
  }
  if(isPanelOpen('gameConfirmPanel')){
    const noBtn = document.getElementById('gameConfirmNoBtn');
    if(noBtn) noBtn.click(); else document.getElementById('gameConfirmPanel').style.display = 'none';
    return;
  }
  if(isPanelOpen('sidebarGuidePanel')){ closeGuidePanel(); return; }
  if(isPanelOpen('sidebarAchievementsPanel')){ closeAchievementsPanel(); return; }
  if(isPanelOpen('sidebarCreditsPanel')){ closeCreditsPanel(); return; }
  if(isPanelOpen('sidebarSettingsPanel')){ closeSettingsPanel(); return; }
  if(isPanelOpen('gameMenuPanel')){ closeMenuPanel(); return; }
  if(state && state.phase==='trophy-room'){ state.phase = trophyRoomPreviousPhase || 'title'; render(); return; }
  if(state && state.phase==='museum-dynasty'){ state.phase = museumPreviousPhase || 'title'; render(); return; }
  if(state && state.phase==='garage'){ state.phase = museumPreviousPhase || 'title'; render(); return; }
  // nessun overlay riconosciuto aperto: chiediamo conferma prima di uscire, mai un'uscita diretta
  gameConfirm('Vuoi davvero uscire dal gioco? La carriera in corso e\u2019 gia\u2019 salvata automaticamente.', ()=>{
    /* conferma ricevuta: non ripubblichiamo una nuova guardia, cosi' una successiva pressione
       del tasto/gesture back del dispositivo puo' davvero portare fuori dal gioco */
  }, 'Uscire dal Gioco?');
}

/* ---------------- boot ---------------- */
let defaultRaceSpeed = 1; // V0.7.3: velocita' predefinita per l'avvio di ogni gara live, impostabile dal menu
let decisionTimerEnabled = true; // V0.9.3.2: countdown per le decisioni in gara, disattivabile dal menu
let trophyRoomPreviousPhase = 'title'; // V0.9.4: dove tornare chiudendo la sala trofei
let museumPreviousPhase = 'title'; // V0.9.4.1: dove tornare chiudendo il Museo Dynasty
state = { phase:'studio-splash', selectedDifficulty:'medio' };
initSidebar();
applyStaticMenuTranslations();
render();
window.addEventListener('popstate', handleBackGesture);
pushBackGuard(); // prima voce di cronologia, cosi' anche la primissima gesture back viene intercettata

// V0.9.3.4.1: schermo intero automatico al primo tocco, solo su smartphone (mai su PC)
(function autoFullscreenOnFirstTapMobileOnly(){
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mobi/i.test(navigator.userAgent));
  if(!isMobile) return;
  document.addEventListener('touchend', function goFullscreen(){
    document.removeEventListener('touchend', goFullscreen);
    if(!document.fullscreenElement && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().catch(()=>{ /* negato dall'utente/browser: ignorato in silenzio */ });
    }
  }, { once:true });
})();

