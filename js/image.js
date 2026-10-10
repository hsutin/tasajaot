// Makes a PNG image of the teams for WhatsApp.

const WIDTH = 1080;
const PADDING = 56;
const COLUMN_GAP = 32;
const HEADER_HEIGHT = 280;
const LOGO_SIZE = 168;
const CARD_HEADER_HEIGHT = 120;
const SECTION_TITLE_HEIGHT = 80;
const ROW_HEIGHT = 52;
const CARD_BOTTOM_PADDING = 36;
const FOOTER_HEIGHT = 40;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DISPLAY_FONT = 'Oswald, "Arial Narrow", system-ui, sans-serif';
const LOGO_URL = 'assets/logo.png';

// Brand colors from the Seminaarinmäen Senators logo.
const COLORS = {
	background: '#102135',
	accent: '#f4580c',
	title: '#ffffff',
	subtitle: '#a9b8c9',
	whiteCard: '#f4f6f9',
	whiteText: '#102135',
	whiteMuted: '#4f5f72',
	blackCard: '#05090f',
	blackBorder: '#24405e',
	blackText: '#ffffff',
	blackMuted: '#a9b8c9',
};

let logoImage = null;

function loadImage( url ) {
	return new Promise( ( resolve, reject ) => {
		const image = new Image();
		image.onload = () => resolve( image );
		image.onerror = () => reject( new Error( `Kuvan ${ url } lataus epäonnistui.` ) );
		image.src = url;
	} );
}

/**
 * Loads the logo and the fonts before the first image.
 * Call this when the page opens. The share must start immediately after a click,
 * so the click handler cannot wait for the downloads.
 */
export async function prepareImageAssets() {
	const results = await Promise.allSettled( [
		loadImage( LOGO_URL ),
		document.fonts.load( `700 76px ${ DISPLAY_FONT }` ),
		document.fonts.load( `500 36px ${ DISPLAY_FONT }` ),
	] );
	if ( results[ 0 ].status === 'fulfilled' ) {
		logoImage = results[ 0 ].value;
	}
}

export const ROLE_LABELS = { D: 'Puolustajat', F: 'Hyökkääjät' };

export function formatDate( isoDate ) {
	const [ year, month, day ] = isoDate.split( '-' ).map( Number );
	const date = new Date( year, month - 1, day );
	const weekday = date.toLocaleDateString( 'fi-FI', { weekday: 'short' } );
	return `${ weekday } ${ day }.${ month }.${ year }`;
}

function fitText( context, text, maxWidth ) {
	if ( context.measureText( text ).width <= maxWidth ) {
		return text;
	}
	let shortText = text;
	while ( shortText.length > 1 && context.measureText( `${ shortText }…` ).width > maxWidth ) {
		shortText = shortText.slice( 0, -1 );
	}
	return `${ shortText }…`;
}

function roundedRect( context, x, y, width, height, radius ) {
	context.beginPath();
	context.moveTo( x + radius, y );
	context.arcTo( x + width, y, x + width, y + height, radius );
	context.arcTo( x + width, y + height, x, y + height, radius );
	context.arcTo( x, y + height, x, y, radius );
	context.arcTo( x, y, x + width, y, radius );
	context.closePath();
}

function cardHeight( team ) {
	const sections = [ 'D', 'F' ].filter( ( role ) => team.some( ( member ) => member.role === role ) );
	return CARD_HEADER_HEIGHT + sections.length * SECTION_TITLE_HEIGHT + team.length * ROW_HEIGHT + CARD_BOTTOM_PADDING;
}

function drawCard( context, { x, y, width, height, title, team, colors } ) {
	roundedRect( context, x, y, width, height, 28 );
	context.fillStyle = colors.card;
	context.fill();
	if ( colors.border ) {
		context.lineWidth = 3;
		context.strokeStyle = colors.border;
		context.stroke();
	}

	// Orange stripe on the top edge of the card.
	context.save();
	roundedRect( context, x, y, width, height, 28 );
	context.clip();
	context.fillStyle = COLORS.accent;
	context.fillRect( x, y, width, 12 );
	context.restore();

	const textX = x + 36;
	const textWidth = width - 72;
	let cursorY = y + 80;

	context.fillStyle = colors.text;
	context.font = `700 56px ${ DISPLAY_FONT }`;
	context.fillText( title.toUpperCase(), textX, cursorY );

	context.font = `500 26px ${ FONT }`;
	context.fillStyle = colors.muted;
	context.textAlign = 'right';
	context.fillText( `${ team.length } pelaajaa`, x + width - 36, cursorY );
	context.textAlign = 'left';

	cursorY = y + CARD_HEADER_HEIGHT;

	for ( const role of [ 'D', 'F' ] ) {
		const members = team.filter( ( member ) => member.role === role );
		if ( members.length === 0 ) {
			continue;
		}
		cursorY += SECTION_TITLE_HEIGHT;
		context.font = `500 36px ${ DISPLAY_FONT }`;
		context.fillStyle = colors.section;
		context.fillText( `${ ROLE_LABELS[ role ].toUpperCase() } (${ members.length })`, textX, cursorY - 16 );

		context.font = `500 32px ${ FONT }`;
		context.fillStyle = colors.text;
		for ( const member of members ) {
			cursorY += ROW_HEIGHT;
			context.fillText( fitText( context, member.name, textWidth ), textX, cursorY - 16 );
		}
	}
}

/**
 * @param {{game_date: string, week: string, teams: {white: Array, black: Array}}} draw
 * @returns {HTMLCanvasElement}
 */
export function renderTeamsImage( draw ) {
	const { white, black } = draw.teams;
	const height = HEADER_HEIGHT + Math.max( cardHeight( white ), cardHeight( black ) ) + FOOTER_HEIGHT + PADDING;
	const columnWidth = ( WIDTH - PADDING * 2 - COLUMN_GAP ) / 2;

	const canvas = document.createElement( 'canvas' );
	canvas.width = WIDTH;
	canvas.height = height;
	const context = canvas.getContext( '2d' );
	context.textBaseline = 'alphabetic';

	context.fillStyle = COLORS.background;
	context.fillRect( 0, 0, WIDTH, height );

	let textX = PADDING;
	if ( logoImage ) {
		context.drawImage( logoImage, PADDING, 40, LOGO_SIZE, LOGO_SIZE );
		textX = PADDING + LOGO_SIZE + 36;
	}

	context.fillStyle = COLORS.accent;
	context.font = `500 30px ${ DISPLAY_FONT }`;
	// A test draw is not valid, so the image tells it clearly in place of the club name.
	context.fillText( draw.isTest ? 'TESTI – EI TALLENNETTU' : 'SEMINAARINMÄEN SENATORS', textX, 92 );

	context.fillStyle = COLORS.title;
	context.font = `700 76px ${ DISPLAY_FONT }`;
	context.fillText( 'JOUKKUEET', textX, 168 );

	context.fillStyle = COLORS.subtitle;
	context.font = `500 32px ${ FONT }`;
	context.fillText( `${ formatDate( draw.game_date ) } · viikko ${ Number( draw.week.split( 'W' )[ 1 ] ) }`, textX, 214 );

	context.fillStyle = COLORS.accent;
	context.fillRect( PADDING, HEADER_HEIGHT - 32, WIDTH - PADDING * 2, 4 );

	const cardsHeight = Math.max( cardHeight( white ), cardHeight( black ) );
	drawCard( context, {
		x: PADDING,
		y: HEADER_HEIGHT,
		width: columnWidth,
		height: cardsHeight,
		title: 'Valkoinen',
		team: white,
		colors: {
			card: COLORS.whiteCard,
			text: COLORS.whiteText,
			muted: COLORS.whiteMuted,
			section: COLORS.accent,
		},
	} );
	drawCard( context, {
		x: PADDING + columnWidth + COLUMN_GAP,
		y: HEADER_HEIGHT,
		width: columnWidth,
		height: cardsHeight,
		title: 'Musta',
		team: black,
		colors: {
			card: COLORS.blackCard,
			border: COLORS.blackBorder,
			text: COLORS.blackText,
			muted: COLORS.blackMuted,
			section: COLORS.accent,
		},
	} );

	return canvas;
}

function canvasToBlob( canvas ) {
	return new Promise( ( resolve, reject ) => {
		canvas.toBlob( ( blob ) => {
			if ( blob ) {
				resolve( blob );
			} else {
				reject( new Error( 'Kuvan teko epäonnistui.' ) );
			}
		}, 'image/png' );
	} );
}

export function downloadCanvas( canvas, fileName ) {
	const link = document.createElement( 'a' );
	link.download = fileName;
	link.href = canvas.toDataURL( 'image/png' );
	link.click();
}

/**
 * Opens the share menu of the phone (for example WhatsApp).
 * If the browser cannot share files, the function downloads the image.
 *
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function shareCanvas( canvas, fileName ) {
	const blob = await canvasToBlob( canvas );
	const file = new File( [ blob ], fileName, { type: 'image/png' } );

	if ( navigator.canShare && navigator.canShare( { files: [ file ] } ) ) {
		try {
			await navigator.share( { files: [ file ] } );
			return 'shared';
		} catch ( error ) {
			if ( error.name === 'AbortError' ) {
				return 'cancelled';
			}
			throw error;
		}
	}

	downloadCanvas( canvas, fileName );
	return 'downloaded';
}
