// Reads the player list from an Excel or CSV file.

import { normalizePosition } from './draw.js';

// Local copy of SheetJS. The browser loads it only when an admin imports a file.
const SHEETJS_URL = './vendor/xlsx-0.20.3.mjs';

const COLUMN_NAMES = {
	name: [ 'nimi', 'name', 'pelaaja' ],
	position: [ 'pelipaikka', 'paikka', 'positio', 'position', 'pp' ],
	rating: [ 'rating', 'taso', 'arvo' ],
};

function normalizeHeader( value ) {
	return String( value ).trim().toLowerCase();
}

function findColumn( headers, names ) {
	return headers.find( ( header ) => names.includes( normalizeHeader( header ) ) );
}

export function normalizeName( value ) {
	return String( value ?? '' ).trim().replace( /\s+/g, ' ' );
}

export function parseRating( value ) {
	const rating = Number( String( value ?? '' ).replace( ',', '.' ).trim() );
	if ( ! Number.isFinite( rating ) || rating < 1 || rating > 5 ) {
		return null;
	}
	return Math.round( rating * 10 ) / 10;
}

/**
 * @param {File} file
 * @returns {Promise<{players: Array<{name: string, position: string, rating: number}>, errors: string[]}>}
 */
export async function readPlayersFile( file ) {
	const XLSX = await import( SHEETJS_URL );
	const workbook = XLSX.read( await file.arrayBuffer() );
	const sheet = workbook.Sheets[ workbook.SheetNames[ 0 ] ];
	const rows = XLSX.utils.sheet_to_json( sheet, { defval: '' } );

	if ( rows.length === 0 ) {
		throw new Error( 'Tiedostossa ei ole rivejä.' );
	}

	const headers = Object.keys( rows[ 0 ] );
	const columns = {
		name: findColumn( headers, COLUMN_NAMES.name ),
		position: findColumn( headers, COLUMN_NAMES.position ),
		rating: findColumn( headers, COLUMN_NAMES.rating ),
	};
	const missing = Object.entries( columns )
		.filter( ( [ , column ] ) => ! column )
		.map( ( [ key ] ) => COLUMN_NAMES[ key ][ 0 ] );
	if ( missing.length > 0 ) {
		throw new Error( `Tiedostosta puuttuu sarake: ${ missing.join( ', ' ) }.` );
	}

	const players = new Map();
	const errors = [];

	rows.forEach( ( row, index ) => {
		// Row 1 is the header row in Excel.
		const rowNumber = index + 2;
		const name = normalizeName( row[ columns.name ] );
		if ( ! name ) {
			return;
		}
		const position = normalizePosition( row[ columns.position ] );
		const rating = parseRating( row[ columns.rating ] );
		if ( ! position ) {
			errors.push( `Rivi ${ rowNumber } (${ name }): pelipaikan pitää olla P, H, HP tai PH.` );
			return;
		}
		if ( rating === null ) {
			errors.push( `Rivi ${ rowNumber } (${ name }): ratingin pitää olla 1–5.` );
			return;
		}
		if ( name.length > 80 ) {
			errors.push( `Rivi ${ rowNumber }: nimi on liian pitkä.` );
			return;
		}
		players.set( name.toLowerCase(), { name, position, rating } );
	} );

	return { players: [ ...players.values() ], errors };
}
