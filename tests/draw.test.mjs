import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTeams, lineTargets, canPlay, normalizePosition } from '../js/draw.js';

// Deterministic random generator, so a failed test gives the same result again.
function seededRandom( seed ) {
	let value = seed;
	return () => {
		value = ( value * 1664525 + 1013904223 ) % 4294967296;
		return value / 4294967296;
	};
}

function makePlayers( positions, random ) {
	return positions.map( ( position, index ) => ( {
		id: index + 1,
		name: `Pelaaja ${ index + 1 }`,
		position,
		rating: 1 + Math.floor( random() * 5 ),
	} ) );
}

function roleCount( team, role ) {
	return team.filter( ( member ) => member.role === role ).length;
}

function teamTotal( team, players ) {
	return team.reduce( ( sum, member ) => sum + players.find( ( player ) => player.id === member.id ).rating, 0 );
}

const FULL_SHIFT = [
	...Array( 7 ).fill( 'P' ),
	'PH',
	'HP',
	'HP',
	...Array( 10 ).fill( 'H' ),
];

test( 'normalizePosition accepts the four positions', () => {
	assert.equal( normalizePosition( ' p ' ), 'P' );
	assert.equal( normalizePosition( 'H/P' ), 'HP' );
	assert.equal( normalizePosition( 'ph' ), 'PH' );
	assert.equal( normalizePosition( 'MV' ), null );
} );

test( 'a full shift gets 4 defenders and 6 forwards per team', () => {
	for ( let seed = 1; seed <= 20; seed++ ) {
		const random = seededRandom( seed );
		const players = makePlayers( FULL_SHIFT, random );
		const result = drawTeams( players, { random } );

		for ( const team of [ result.white, result.black ] ) {
			assert.equal( team.length, 10 );
			assert.equal( roleCount( team, 'D' ), 4 );
			assert.equal( roleCount( team, 'F' ), 6 );
		}
		for ( const member of [ ...result.white, ...result.black ] ) {
			assert.ok( canPlay( member.position, member.role ), `${ member.position } cannot play ${ member.role }` );
		}
		assert.ok(
			Math.abs( teamTotal( result.white, players ) - teamTotal( result.black, players ) ) <= 1,
			'rating totals differ too much'
		);
	}
} );

test( 'an odd player count gives one team 1 more player', () => {
	const random = seededRandom( 7 );
	const players = makePlayers( FULL_SHIFT.slice( 0, 19 ), random );
	const result = drawTeams( players, { random } );
	const sizes = [ result.white.length, result.black.length ].sort( ( a, b ) => a - b );

	assert.deepEqual( sizes, [ 9, 10 ] );
	assert.ok( Math.abs( roleCount( result.white, 'D' ) - roleCount( result.black, 'D' ) ) <= 1 );
	assert.ok( Math.abs( roleCount( result.white, 'F' ) - roleCount( result.black, 'F' ) ) <= 1 );
} );

test( 'flexible players fill the missing defender places', () => {
	// Only 5 pure defenders, so 3 flexible players must play defence.
	const positions = [ ...Array( 5 ).fill( 'P' ), 'HP', 'HP', 'HP', 'HP', ...Array( 11 ).fill( 'H' ) ];
	const targets = lineTargets( positions.map( ( position ) => ( { position } ) ) );
	assert.equal( targets.defenders, 8 );

	const random = seededRandom( 3 );
	const result = drawTeams( makePlayers( positions, random ), { random } );
	assert.equal( roleCount( result.white, 'D' ), 4 );
	assert.equal( roleCount( result.black, 'D' ), 4 );
} );

test( 'the draw gives different teams with different random values', () => {
	const players = makePlayers( FULL_SHIFT, seededRandom( 11 ) );
	const keys = new Set();
	for ( let seed = 1; seed <= 10; seed++ ) {
		const result = drawTeams( players, { random: seededRandom( seed * 97 ) } );
		const whiteIds = result.white.map( ( member ) => member.id ).sort( ( a, b ) => a - b );
		const blackIds = result.black.map( ( member ) => member.id ).sort( ( a, b ) => a - b );
		keys.add( [ whiteIds.join( ',' ), blackIds.join( ',' ) ].sort().join( '/' ) );
	}
	assert.ok( keys.size >= 5, `only ${ keys.size } different splits` );
} );
