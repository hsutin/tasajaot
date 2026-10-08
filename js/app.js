import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { drawTeams, lineTargets, POSITIONS } from './draw.js';
import { renderTeamsImage, shareCanvas, downloadCanvas, formatDate, prepareImageAssets, ROLE_LABELS } from './image.js';
import { readPlayersFile, normalizeName, parseRating } from './excel.js';

const SELECTION_STORAGE_KEY = 'tasajaot.selectedPlayers';
const POSITION_ORDER = [ 'P', 'PH', 'HP', 'H' ];
const POSITION_LABELS = {
	P: 'Puolustajat (P)',
	PH: 'Puolustaja / hyökkääjä (PH)',
	HP: 'Hyökkääjä / puolustaja (HP)',
	H: 'Hyökkääjät (H)',
};

// Positive values mean that the white team was better.
const EVALUATION_LABELS = {
	2: 'Valkoinen selvästi parempi',
	1: 'Valkoinen hieman parempi',
	0: 'Tasainen',
	'-1': 'Musta hieman parempi',
	'-2': 'Musta selvästi parempi',
};

const elements = Object.fromEntries(
	[
		'setup-notice',
		'admin-nav',
		'help-view',
		'faq-view',
		'draw-view',
		'login-toggle',
		'logout-button',
		'user-email',
		'login-view',
		'login-form',
		'login-message',
		'draw-select',
		'draw-empty',
		'draw-result',
		'draw-date',
		'team-white',
		'team-black',
		'draw-evaluation',
		'draw-stats',
		'evaluation-form',
		'evaluation-message',
		'evaluation-slider',
		'evaluation-value',
		'share-button',
		'download-button',
		'share-message',
		'admin-view',
		'tab-draw',
		'tab-players',
		'panel-draw',
		'panel-players',
		'game-date',
		'week-status',
		'selection-summary',
		'select-all',
		'select-none',
		'player-checklist',
		'draw-button',
		'draw-message',
		'import-file',
		'import-message',
		'import-errors',
		'add-player-form',
		'player-message',
		'players-table-body',
	].map( ( id ) => [ id.replace( /-([a-z])/g, ( match, letter ) => letter.toUpperCase() ), document.getElementById( id ) ] )
);

const state = {
	isAdmin: false,
	players: [],
	draws: [],
	// Evaluations by draw id. Only admins can read them.
	evaluations: new Map(),
	currentDraw: null,
	selectedIds: new Set( loadSelection() ),
	weekTaken: false,
};

let supabase = null;

// ---------- Helpers ----------

function createElement( tag, properties = {}, children = [] ) {
	const element = document.createElement( tag );
	for ( const [ key, value ] of Object.entries( properties ) ) {
		if ( key === 'className' ) {
			element.className = value;
		} else if ( key === 'text' ) {
			element.textContent = value;
		} else if ( key in element ) {
			element[ key ] = value;
		} else {
			element.setAttribute( key, value );
		}
	}
	for ( const child of children ) {
		element.append( child );
	}
	return element;
}

function showMessage( element, text, type = 'info' ) {
	element.textContent = text;
	element.dataset.type = type;
}

function loadSelection() {
	try {
		return JSON.parse( localStorage.getItem( SELECTION_STORAGE_KEY ) ?? '[]' );
	} catch {
		return [];
	}
}

function saveSelection() {
	try {
		localStorage.setItem( SELECTION_STORAGE_KEY, JSON.stringify( [ ...state.selectedIds ] ) );
	} catch {
		// The selection is only a convenience. The app works without storage.
	}
}

function todayIsoDate() {
	const now = new Date();
	const month = String( now.getMonth() + 1 ).padStart( 2, '0' );
	const day = String( now.getDate() ).padStart( 2, '0' );
	return `${ now.getFullYear() }-${ month }-${ day }`;
}

// Same calculation as to_char( date, 'IYYY-"W"IW' ) in the database.
function isoWeek( isoDate ) {
	const [ year, month, day ] = isoDate.split( '-' ).map( Number );
	const date = new Date( Date.UTC( year, month - 1, day ) );
	const weekday = date.getUTCDay() || 7;
	date.setUTCDate( date.getUTCDate() + 4 - weekday );
	const yearStart = new Date( Date.UTC( date.getUTCFullYear(), 0, 1 ) );
	const week = Math.ceil( ( ( date - yearStart ) / 86400000 + 1 ) / 7 );
	return `${ date.getUTCFullYear() }-W${ String( week ).padStart( 2, '0' ) }`;
}

function formatRating( value ) {
	return Number( value ).toLocaleString( 'fi-FI', { maximumFractionDigits: 1 } );
}

function formatAdjustment( value ) {
	const text = Number( value ).toLocaleString( 'fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 } );
	return value > 0 ? `+${ text }` : text;
}

// The draw uses the rating with the correction value from the evaluations.
function effectiveRating( player ) {
	return player.rating + player.adjustment;
}

function fileNameForDraw( draw ) {
	return `joukkueet-${ draw.game_date }.png`;
}

// ---------- Draw view (public) ----------

async function loadDraws( selectId = null ) {
	const { data, error } = await supabase
		.from( 'draws' )
		.select( 'id, game_date, week, teams' )
		.order( 'game_date', { ascending: false } )
		.limit( 30 );

	if ( error ) {
		showMessage( elements.shareMessage, `Joukkueiden haku epäonnistui: ${ error.message }`, 'error' );
		return;
	}

	state.draws = data;
	elements.drawSelect.replaceChildren(
		...data.map( ( draw ) =>
			createElement( 'option', {
				value: String( draw.id ),
				text: `Vko ${ Number( draw.week.split( 'W' )[ 1 ] ) } · ${ formatDate( draw.game_date ) }`,
			} )
		)
	);
	elements.drawSelect.hidden = data.length === 0;

	const selected = data.find( ( draw ) => draw.id === selectId ) ?? data[ 0 ] ?? null;
	if ( selected ) {
		elements.drawSelect.value = String( selected.id );
	}
	showDraw( selected );
}

function renderTeamList( container, team ) {
	const sections = [ 'D', 'F' ]
		.map( ( role ) => ( { role, members: team.filter( ( member ) => member.role === role ) } ) )
		.filter( ( section ) => section.members.length > 0 )
		.map( ( section ) =>
			createElement( 'div', { className: 'team__section' }, [
				createElement( 'h4', { text: `${ ROLE_LABELS[ section.role ] } (${ section.members.length })` } ),
				createElement(
					'ul',
					{},
					section.members.map( ( member ) => createElement( 'li', { text: member.name } ) )
				),
			] )
		);
	container.replaceChildren( ...sections );
}

function renderDrawStats( draw ) {
	if ( ! state.isAdmin || ! draw || state.players.length === 0 ) {
		elements.drawStats.hidden = true;
		return;
	}
	const ratings = new Map( state.players.map( ( player ) => [ player.id, effectiveRating( player ) ] ) );
	const total = ( team ) => team.reduce( ( sum, member ) => sum + ( ratings.get( member.id ) ?? 0 ), 0 );
	elements.drawStats.textContent = `Ratingit korjauksineen nyt (näkyy vain adminille): Valkoinen ${ formatRating(
		total( draw.teams.white )
	) }, Musta ${ formatRating( total( draw.teams.black ) ) }.`;
	elements.drawStats.hidden = false;
}

function showDraw( draw ) {
	state.currentDraw = draw;
	elements.drawEmpty.hidden = Boolean( draw );
	elements.drawResult.hidden = ! draw;
	showMessage( elements.shareMessage, '' );
	if ( ! draw ) {
		return;
	}
	elements.drawDate.textContent = `${ formatDate( draw.game_date ) } · viikko ${ Number( draw.week.split( 'W' )[ 1 ] ) }`;
	renderTeamList( elements.teamWhite, draw.teams.white );
	renderTeamList( elements.teamBlack, draw.teams.black );
	renderEvaluation( draw );
	renderDrawStats( draw );
}

async function loadEvaluations() {
	state.evaluations = new Map();
	if ( ! state.isAdmin ) {
		return;
	}
	const { data, error } = await supabase.from( 'draw_evaluations' ).select( 'draw_id, evaluation, white_goals, black_goals' );
	if ( error ) {
		showMessage( elements.shareMessage, `Arvioiden haku epäonnistui: ${ error.message }`, 'error' );
		return;
	}
	state.evaluations = new Map( data.map( ( evaluation ) => [ evaluation.draw_id, evaluation ] ) );
}

function renderEvaluation( draw ) {
	const evaluation = draw && state.isAdmin ? state.evaluations.get( draw.id ) : undefined;
	const evaluated = Boolean( evaluation );
	elements.drawEvaluation.hidden = ! evaluated;
	if ( evaluated ) {
		const score =
			evaluation.white_goals !== null ? `Tulos ${ evaluation.white_goals }–${ evaluation.black_goals } · ` : '';
		elements.drawEvaluation.textContent = `${ score }Arvio: ${ EVALUATION_LABELS[ evaluation.evaluation ] } (näkyy vain adminille)`;
	}

	const canEvaluate = state.isAdmin && draw && ! evaluated && draw.game_date <= todayIsoDate();
	elements.evaluationForm.hidden = ! canEvaluate;
	if ( canEvaluate ) {
		elements.evaluationForm.reset();
		updateEvaluationSlider();
		showMessage( elements.evaluationMessage, '' );
	}
}

// The slider goes from white (left) to black (right), but the saved value is positive when white was better.
function sliderEvaluation() {
	return -Number( elements.evaluationSlider.value );
}

function updateEvaluationSlider() {
	const label = EVALUATION_LABELS[ sliderEvaluation() ];
	elements.evaluationValue.textContent = label;
	elements.evaluationSlider.setAttribute( 'aria-valuetext', label );
	for ( const tick of elements.evaluationForm.querySelectorAll( '.evaluation__tick' ) ) {
		tick.setAttribute( 'aria-pressed', String( tick.dataset.value === elements.evaluationSlider.value ) );
	}
}

function parseGoals( value ) {
	if ( value === '' || value === null ) {
		return null;
	}
	const goals = Number( value );
	return Number.isInteger( goals ) && goals >= 0 && goals <= 99 ? goals : NaN;
}

async function saveEvaluation( event ) {
	event.preventDefault();
	const draw = state.currentDraw;
	if ( ! draw ) {
		return;
	}

	const form = new FormData( elements.evaluationForm );
	const evaluation = sliderEvaluation();
	const whiteGoals = parseGoals( form.get( 'whiteGoals' ) );
	const blackGoals = parseGoals( form.get( 'blackGoals' ) );

	if ( ! Number.isInteger( evaluation ) || evaluation < -2 || evaluation > 2 ) {
		showMessage( elements.evaluationMessage, 'Valitse arvio.', 'error' );
		return;
	}
	if ( Number.isNaN( whiteGoals ) || Number.isNaN( blackGoals ) || ( whiteGoals === null ) !== ( blackGoals === null ) ) {
		showMessage( elements.evaluationMessage, 'Anna molempien joukkueiden maalit (0–99) tai jätä molemmat tyhjiksi.', 'error' );
		return;
	}

	// eslint-disable-next-line no-alert
	const confirmed = window.confirm( `Tallennetaanko arvio "${ EVALUATION_LABELS[ evaluation ] }"?\n\nVuoron voi arvioida vain kerran.` );
	if ( ! confirmed ) {
		return;
	}

	const { error } = await supabase.rpc( 'evaluate_draw', {
		p_draw_id: draw.id,
		p_evaluation: evaluation,
		p_white_goals: whiteGoals,
		p_black_goals: blackGoals,
	} );
	if ( error ) {
		showMessage( elements.evaluationMessage, `Tallennus epäonnistui: ${ error.message }`, 'error' );
		return;
	}

	await Promise.all( [ loadPlayers(), loadEvaluations() ] );
	showDraw( draw );
	showMessage( elements.shareMessage, 'Arvio tallennettu. Pelaajien korjausarvot päivitettiin.', 'success' );
}

async function shareCurrentDraw() {
	if ( ! state.currentDraw ) {
		return;
	}
	try {
		const canvas = renderTeamsImage( state.currentDraw );
		const result = await shareCanvas( canvas, fileNameForDraw( state.currentDraw ) );
		if ( result === 'downloaded' ) {
			showMessage(
				elements.shareMessage,
				'Tämä selain ei voi jakaa kuvaa suoraan. Sovellus latasi kuvan. Lähetä kuva WhatsAppiin.'
			);
		}
	} catch ( error ) {
		showMessage( elements.shareMessage, `Jako epäonnistui: ${ error.message }`, 'error' );
	}
}

function downloadCurrentDraw() {
	if ( ! state.currentDraw ) {
		return;
	}
	downloadCanvas( renderTeamsImage( state.currentDraw ), fileNameForDraw( state.currentDraw ) );
}

// ---------- Authentication ----------

async function updateSession( session ) {
	const user = session?.user ?? null;
	elements.loginToggle.hidden = Boolean( user );
	elements.logoutButton.hidden = ! user;
	elements.userEmail.hidden = ! user;
	elements.userEmail.textContent = user?.email ?? '';

	state.isAdmin = false;
	if ( user ) {
		elements.loginView.hidden = true;
		const { data } = await supabase.from( 'admins' ).select( 'user_id' ).eq( 'user_id', user.id ).maybeSingle();
		state.isAdmin = Boolean( data );
	}

	renderRoute();
	await loadEvaluations();
	if ( state.isAdmin ) {
		await loadPlayers();
		await checkWeek();
	} else {
		state.players = [];
		if ( user ) {
			showMessage( elements.shareMessage, 'Tällä käyttäjällä ei ole admin-oikeuksia.', 'error' );
		}
	}
	renderEvaluation( state.currentDraw );
	renderDrawStats( state.currentDraw );
}

async function login( event ) {
	event.preventDefault();
	const form = new FormData( elements.loginForm );
	showMessage( elements.loginMessage, 'Kirjaudutaan…' );
	const { error } = await supabase.auth.signInWithPassword( {
		email: String( form.get( 'email' ) ),
		password: String( form.get( 'password' ) ),
	} );
	if ( error ) {
		showMessage( elements.loginMessage, 'Kirjautuminen epäonnistui. Tarkista sähköposti ja salasana.', 'error' );
		return;
	}
	elements.loginForm.reset();
	showMessage( elements.loginMessage, '' );
}

// ---------- Players ----------

async function loadPlayers() {
	const { data, error } = await supabase.from( 'players' ).select( 'id, name, position, rating, adjustment' ).order( 'name' );
	if ( error ) {
		showMessage( elements.playerMessage, `Pelaajien haku epäonnistui: ${ error.message }`, 'error' );
		return;
	}
	state.players = data.map( ( player ) => ( {
		...player,
		rating: Number( player.rating ),
		adjustment: Number( player.adjustment ),
	} ) );

	// Removes deleted players from the saved selection.
	const ids = new Set( state.players.map( ( player ) => player.id ) );
	state.selectedIds = new Set( [ ...state.selectedIds ].filter( ( id ) => ids.has( id ) ) );

	renderChecklist();
	renderPlayersTable();
}

function renderChecklist() {
	const groups = POSITION_ORDER.map( ( position ) => {
		const players = state.players.filter( ( player ) => player.position === position );
		if ( players.length === 0 ) {
			return null;
		}
		return createElement( 'fieldset', { className: 'checklist__group' }, [
			createElement( 'legend', { text: POSITION_LABELS[ position ] } ),
			...players.map( ( player ) => {
				const checkbox = createElement( 'input', {
					type: 'checkbox',
					value: String( player.id ),
					checked: state.selectedIds.has( player.id ),
				} );
				checkbox.addEventListener( 'change', () => {
					if ( checkbox.checked ) {
						state.selectedIds.add( player.id );
					} else {
						state.selectedIds.delete( player.id );
					}
					saveSelection();
					renderSelectionSummary();
				} );
				return createElement( 'label', { className: 'checklist__item' }, [
					checkbox,
					createElement( 'span', { text: player.name } ),
				] );
			} ),
		] );
	} ).filter( Boolean );

	if ( groups.length === 0 ) {
		elements.playerChecklist.replaceChildren(
			createElement( 'p', { className: 'muted', text: 'Lisää pelaajat ensin välilehdellä "Pelaajat".' } )
		);
	} else {
		elements.playerChecklist.replaceChildren( ...groups );
	}
	renderSelectionSummary();
}

function selectedPlayers() {
	return state.players.filter( ( player ) => state.selectedIds.has( player.id ) );
}

function renderSelectionSummary() {
	const players = selectedPlayers();
	const counts = POSITION_ORDER.map(
		( position ) => `${ position } ${ players.filter( ( player ) => player.position === position ).length }`
	).join( ' · ' );

	let text = `Valittu ${ players.length } pelaajaa (${ counts }).`;
	if ( players.length >= 2 ) {
		const targets = lineTargets( players );
		const [ bigTeam, smallTeam ] = targets.teamSizes;
		const split = targets.splits[ 0 ].defenders;
		text += ` Joukkueet: ${ bigTeam } + ${ smallTeam } pelaajaa, puolustajia ${ split[ 0 ] } + ${ split[ 1 ] }.`;
		if ( targets.defenders !== Math.round( players.length * 0.4 ) ) {
			text += ' Huom: puolustajia tai hyökkääjiä on liian vähän tasaiseen jakoon.';
		}
	}
	elements.selectionSummary.textContent = text;
	updateDrawButton();
}

function updateDrawButton() {
	elements.drawButton.disabled = state.weekTaken || selectedPlayers().length < 2 || ! elements.gameDate.value;
}

function setAllSelected( selected ) {
	state.selectedIds = new Set( selected ? state.players.map( ( player ) => player.id ) : [] );
	saveSelection();
	renderChecklist();
}

function renderPlayersTable() {
	const rows = state.players.map( ( player ) => {
		const nameInput = createElement( 'input', {
			type: 'text',
			value: player.name,
			maxLength: 80,
			required: true,
			'aria-label': 'Nimi',
		} );
		const positionSelect = createElement(
			'select',
			{ 'aria-label': `Pelipaikka: ${ player.name }` },
			POSITIONS.map( ( position ) =>
				createElement( 'option', { value: position, text: position, selected: position === player.position } )
			)
		);
		const ratingInput = createElement( 'input', {
			type: 'number',
			min: '1',
			max: '5',
			step: '0.5',
			value: String( player.rating ),
			required: true,
			'aria-label': `Rating: ${ player.name }`,
		} );
		const saveButton = createElement( 'button', {
			type: 'button',
			className: 'button button--small',
			text: 'Tallenna',
		} );
		const deleteButton = createElement( 'button', {
			type: 'button',
			className: 'button button--ghost button--small',
			text: 'Poista',
			'aria-label': `Poista ${ player.name }`,
		} );

		saveButton.addEventListener( 'click', () =>
			savePlayer( player.id, {
				name: nameInput.value,
				position: positionSelect.value,
				rating: ratingInput.value,
			} )
		);
		deleteButton.addEventListener( 'click', () => deletePlayer( player ) );

		const adjustmentCell = createElement( 'td', { className: 'players-table__adjustment' }, [
			createElement( 'span', {
				className: player.adjustment > 0 ? 'adjustment--positive' : player.adjustment < 0 ? 'adjustment--negative' : '',
				text: formatAdjustment( player.adjustment ),
			} ),
		] );
		if ( player.adjustment !== 0 ) {
			const resetButton = createElement( 'button', {
				type: 'button',
				className: 'button button--ghost button--small',
				text: 'Nollaa',
				'aria-label': `Nollaa korjaus: ${ player.name }`,
			} );
			resetButton.addEventListener( 'click', () => resetAdjustment( player ) );
			adjustmentCell.append( ' ', resetButton );
		}

		return createElement( 'tr', {}, [
			createElement( 'td', {}, [ nameInput ] ),
			createElement( 'td', {}, [ positionSelect ] ),
			createElement( 'td', {}, [ ratingInput ] ),
			adjustmentCell,
			createElement( 'td', { className: 'players-table__actions' }, [ saveButton, deleteButton ] ),
		] );
	} );
	elements.playersTableBody.replaceChildren( ...rows );
}

function validatePlayerInput( input ) {
	const name = normalizeName( input.name );
	const rating = parseRating( input.rating );
	if ( ! name || name.length > 80 ) {
		return { error: 'Anna nimi (enintään 80 merkkiä).' };
	}
	if ( ! POSITIONS.includes( input.position ) ) {
		return { error: 'Valitse pelipaikka.' };
	}
	if ( rating === null ) {
		return { error: 'Ratingin pitää olla 1–5.' };
	}
	return { player: { name, position: input.position, rating } };
}

function databaseErrorText( error ) {
	if ( error.code === '23505' ) {
		return 'Samanniminen pelaaja on jo listalla.';
	}
	return error.message;
}

async function addPlayer( event ) {
	event.preventDefault();
	const form = new FormData( elements.addPlayerForm );
	const { player, error: validationError } = validatePlayerInput( {
		name: form.get( 'name' ),
		position: form.get( 'position' ),
		rating: form.get( 'rating' ),
	} );
	if ( validationError ) {
		showMessage( elements.playerMessage, validationError, 'error' );
		return;
	}
	const { error } = await supabase.from( 'players' ).insert( player );
	if ( error ) {
		showMessage( elements.playerMessage, databaseErrorText( error ), 'error' );
		return;
	}
	elements.addPlayerForm.reset();
	showMessage( elements.playerMessage, `Pelaaja ${ player.name } lisätty.`, 'success' );
	await loadPlayers();
}

async function savePlayer( id, input ) {
	const { player, error: validationError } = validatePlayerInput( input );
	if ( validationError ) {
		showMessage( elements.playerMessage, validationError, 'error' );
		return;
	}
	const { error } = await supabase.from( 'players' ).update( player ).eq( 'id', id );
	if ( error ) {
		showMessage( elements.playerMessage, databaseErrorText( error ), 'error' );
		return;
	}
	showMessage( elements.playerMessage, `Pelaaja ${ player.name } tallennettu.`, 'success' );
	await loadPlayers();
}

async function resetAdjustment( player ) {
	// eslint-disable-next-line no-alert
	if ( ! window.confirm( `Nollataanko pelaajan ${ player.name } korjausarvo (${ formatAdjustment( player.adjustment ) })?` ) ) {
		return;
	}
	const { error } = await supabase.from( 'players' ).update( { adjustment: 0 } ).eq( 'id', player.id );
	if ( error ) {
		showMessage( elements.playerMessage, databaseErrorText( error ), 'error' );
		return;
	}
	showMessage( elements.playerMessage, `Pelaajan ${ player.name } korjausarvo nollattu.`, 'success' );
	await loadPlayers();
}

async function deletePlayer( player ) {
	// eslint-disable-next-line no-alert
	if ( ! window.confirm( `Poistetaanko ${ player.name }? Aiemmat arvonnat eivät muutu.` ) ) {
		return;
	}
	const { error } = await supabase.from( 'players' ).delete().eq( 'id', player.id );
	if ( error ) {
		showMessage( elements.playerMessage, databaseErrorText( error ), 'error' );
		return;
	}
	showMessage( elements.playerMessage, `Pelaaja ${ player.name } poistettu.`, 'success' );
	await loadPlayers();
}

async function importPlayers() {
	const file = elements.importFile.files[ 0 ];
	if ( ! file ) {
		return;
	}
	elements.importErrors.replaceChildren();
	showMessage( elements.importMessage, 'Luetaan tiedostoa…' );

	try {
		const { players, errors } = await readPlayersFile( file );
		elements.importErrors.replaceChildren( ...errors.map( ( text ) => createElement( 'li', { text } ) ) );

		if ( players.length === 0 ) {
			showMessage( elements.importMessage, 'Tiedostossa ei ole kelvollisia pelaajia.', 'error' );
			return;
		}

		const { error } = await supabase.from( 'players' ).upsert( players, { onConflict: 'name' } );
		if ( error ) {
			throw error;
		}
		const skipped = errors.length > 0 ? ` ${ errors.length } riviä ohitettiin.` : '';
		showMessage( elements.importMessage, `Tuotiin ${ players.length } pelaajaa.${ skipped }`, 'success' );
		await loadPlayers();
	} catch ( error ) {
		showMessage( elements.importMessage, `Tuonti epäonnistui: ${ error.message }`, 'error' );
	} finally {
		elements.importFile.value = '';
	}
}

// ---------- Draw (admin) ----------

async function checkWeek() {
	const gameDate = elements.gameDate.value;
	state.weekTaken = false;
	if ( ! gameDate ) {
		showMessage( elements.weekStatus, '' );
		updateDrawButton();
		return;
	}

	const week = isoWeek( gameDate );
	const weekNumber = Number( week.split( 'W' )[ 1 ] );
	const { data, error } = await supabase.from( 'draws' ).select( 'id' ).eq( 'week', week ).maybeSingle();

	if ( error ) {
		showMessage( elements.weekStatus, `Tarkistus epäonnistui: ${ error.message }`, 'error' );
	} else if ( data ) {
		state.weekTaken = true;
		showMessage( elements.weekStatus, `Viikon ${ weekNumber } joukkueet on jo arvottu. Arvonnan voi tehdä vain kerran.`, 'error' );
	} else {
		showMessage( elements.weekStatus, `Viikon ${ weekNumber } joukkueita ei ole vielä arvottu.` );
	}
	updateDrawButton();
}

async function runDraw() {
	const players = selectedPlayers();
	const gameDate = elements.gameDate.value;
	const weekNumber = Number( isoWeek( gameDate ).split( 'W' )[ 1 ] );

	// eslint-disable-next-line no-alert
	const confirmed = window.confirm(
		`Arvotaanko joukkueet viikolle ${ weekNumber } (${ players.length } pelaajaa)?\n\nArvonnan voi tehdä vain kerran.`
	);
	if ( ! confirmed ) {
		return;
	}

	elements.drawButton.disabled = true;
	showMessage( elements.drawMessage, 'Arvotaan…' );

	try {
		const result = drawTeams(
			players.map( ( player ) => ( { ...player, rating: effectiveRating( player ) } ) )
		);
		const { data, error } = await supabase
			.from( 'draws' )
			.insert( { game_date: gameDate, teams: { white: result.white, black: result.black } } )
			.select( 'id' )
			.single();

		if ( error ) {
			if ( error.code === '23505' ) {
				throw new Error( 'Tämän viikon joukkueet on jo arvottu.' );
			}
			throw error;
		}

		showMessage( elements.drawMessage, 'Joukkueet arvottu. Voit nyt jakaa kuvan.', 'success' );
		await loadDraws( data.id );
		document.getElementById( 'draw-view' ).scrollIntoView( { behavior: 'smooth' } );
	} catch ( error ) {
		showMessage( elements.drawMessage, `Arvonta epäonnistui: ${ error.message }`, 'error' );
	} finally {
		await checkWeek();
	}
}

// ---------- Admin pages ----------

const ADMIN_PAGES = { ohjeet: 'helpView', ukk: 'faqView' };
const HOME_ROUTE = 'etusivu';
let currentRoute = HOME_ROUTE;

// Other hash values (for example the skip link "#main") do not change the page.
function routeFromHash() {
	const hash = window.location.hash.slice( 1 );
	if ( hash === '' || hash === HOME_ROUTE || hash in ADMIN_PAGES ) {
		currentRoute = hash || HOME_ROUTE;
	}
	return currentRoute;
}

function renderRoute() {
	const route = routeFromHash();
	// The guide pages are only for admins. Other users always see the teams.
	const page = state.isAdmin && route in ADMIN_PAGES ? route : HOME_ROUTE;

	elements.adminNav.hidden = ! state.isAdmin;
	for ( const [ pageRoute, elementName ] of Object.entries( ADMIN_PAGES ) ) {
		elements[ elementName ].hidden = page !== pageRoute;
	}
	elements.drawView.hidden = page !== HOME_ROUTE;
	elements.adminView.hidden = ! state.isAdmin || page !== HOME_ROUTE;

	for ( const link of elements.adminNav.querySelectorAll( '[data-route]' ) ) {
		if ( link.dataset.route === page ) {
			link.setAttribute( 'aria-current', 'page' );
		} else {
			link.removeAttribute( 'aria-current' );
		}
	}
}

function onHashChange() {
	const previousRoute = currentRoute;
	renderRoute();
	if ( currentRoute !== previousRoute ) {
		window.scrollTo( 0, 0 );
	}
}

// ---------- Tabs ----------

function selectTab( tab ) {
	const tabs = [ elements.tabDraw, elements.tabPlayers ];
	for ( const item of tabs ) {
		const selected = item === tab;
		item.setAttribute( 'aria-selected', String( selected ) );
		item.tabIndex = selected ? 0 : -1;
		document.getElementById( item.getAttribute( 'aria-controls' ) ).hidden = ! selected;
	}
	tab.focus();
}

function onTabKeydown( event ) {
	if ( event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' ) {
		return;
	}
	selectTab( event.currentTarget === elements.tabDraw ? elements.tabPlayers : elements.tabDraw );
}

// ---------- Start ----------

function bindEvents() {
	elements.loginToggle.addEventListener( 'click', () => {
		elements.loginView.hidden = ! elements.loginView.hidden;
		if ( ! elements.loginView.hidden ) {
			elements.loginForm.elements.email.focus();
		}
	} );
	elements.logoutButton.addEventListener( 'click', () => supabase.auth.signOut() );
	elements.loginForm.addEventListener( 'submit', login );
	window.addEventListener( 'hashchange', onHashChange );

	elements.drawSelect.addEventListener( 'change', () => {
		const id = Number( elements.drawSelect.value );
		showDraw( state.draws.find( ( draw ) => draw.id === id ) ?? null );
	} );
	elements.shareButton.addEventListener( 'click', shareCurrentDraw );
	elements.downloadButton.addEventListener( 'click', downloadCurrentDraw );
	elements.evaluationForm.addEventListener( 'submit', saveEvaluation );
	elements.evaluationSlider.addEventListener( 'input', updateEvaluationSlider );
	for ( const tick of elements.evaluationForm.querySelectorAll( '.evaluation__tick' ) ) {
		tick.addEventListener( 'click', () => {
			elements.evaluationSlider.value = tick.dataset.value;
			updateEvaluationSlider();
			elements.evaluationSlider.focus();
		} );
	}

	elements.tabDraw.addEventListener( 'click', () => selectTab( elements.tabDraw ) );
	elements.tabPlayers.addEventListener( 'click', () => selectTab( elements.tabPlayers ) );
	elements.tabDraw.addEventListener( 'keydown', onTabKeydown );
	elements.tabPlayers.addEventListener( 'keydown', onTabKeydown );

	elements.gameDate.addEventListener( 'change', checkWeek );
	elements.selectAll.addEventListener( 'click', () => setAllSelected( true ) );
	elements.selectNone.addEventListener( 'click', () => setAllSelected( false ) );
	elements.drawButton.addEventListener( 'click', runDraw );

	elements.importFile.addEventListener( 'change', importPlayers );
	elements.addPlayerForm.addEventListener( 'submit', addPlayer );
}

async function start() {
	document.getElementById( 'footer-year' ).textContent = String( new Date().getFullYear() );
	prepareImageAssets();

	if ( ! SUPABASE_URL || ! SUPABASE_KEY ) {
		elements.setupNotice.hidden = false;
		elements.loginToggle.hidden = true;
		elements.drawEmpty.hidden = false;
		elements.drawSelect.hidden = true;
		return;
	}

	supabase = createClient( SUPABASE_URL, SUPABASE_KEY );
	elements.gameDate.value = todayIsoDate();
	bindEvents();

	await loadDraws();

	// The callback must not await Supabase calls directly, so the work runs after the callback.
	supabase.auth.onAuthStateChange( ( event, session ) => {
		setTimeout( () => updateSession( session ), 0 );
	} );
}

start();
