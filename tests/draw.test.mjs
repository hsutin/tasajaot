import test from 'node:test';
import assert from 'node:assert/strict';
import { drawTeams, lineTargets, wantedDefenders, canPlay, normalizePosition, impactValue } from '../js/draw.js';

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

test( 'the shift rules give the defender count per team', () => {
	assert.equal( wantedDefenders( 20 ), 8 );
	assert.equal( wantedDefenders( 19 ), 7 );
	for ( let playerCount = 14; playerCount <= 18; playerCount++ ) {
		assert.equal( wantedDefenders( playerCount ), 6, `${ playerCount } players` );
	}
	assert.equal( wantedDefenders( 12 ), 5 );
} );

test( 'a team never has more than 4 defenders or 6 forwards', () => {
	for ( let playerCount = 14; playerCount <= 20; playerCount++ ) {
		const random = seededRandom( playerCount * 7 );
		const result = drawTeams( makePlayers( FULL_SHIFT.slice( 20 - playerCount ), random ), { random } );
		for ( const team of [ result.white, result.black ] ) {
			assert.ok( roleCount( team, 'D' ) <= 4, `${ playerCount } players: too many defenders` );
			assert.ok( roleCount( team, 'F' ) <= 6, `${ playerCount } players: too many forwards` );
		}
	}
} );

test( 'more than 20 players is an error', () => {
	const random = seededRandom( 1 );
	assert.throws( () => drawTeams( makePlayers( [ ...FULL_SHIFT, 'H' ], random ), { random } ) );
} );

test( 'teams of 14–18 players get 3 defenders per team', () => {
	for ( let playerCount = 14; playerCount <= 18; playerCount++ ) {
		// 5 pure defenders and 3 flexible players. One flexible player must play defence.
		const positions = [ ...Array( 5 ).fill( 'P' ), 'PH', 'HP', 'HP', ...Array( playerCount - 8 ).fill( 'H' ) ];
		const random = seededRandom( playerCount );
		const result = drawTeams( makePlayers( positions, random ), { random } );
		assert.equal( roleCount( result.white, 'D' ), 3, `${ playerCount } players, white` );
		assert.equal( roleCount( result.black, 'D' ), 3, `${ playerCount } players, black` );
		assert.ok( Math.abs( result.white.length - result.black.length ) <= 1 );
	}
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

test( 'the impact value increases the ends of the rating scale', () => {
	assert.equal( impactValue( 3 ), 3 );
	assert.equal( impactValue( 5 ), 7 );
	assert.equal( impactValue( 4 ), 4.5 );
	assert.ok( Math.abs( impactValue( 2 ) - 1.7 ) < 1e-9 );
	assert.ok( Math.abs( impactValue( 1 ) + 0.2 ) < 1e-9 );
	// A strong player has a larger effect than a weak player.
	assert.ok( impactValue( 5 ) + impactValue( 1 ) > 6 );
	assert.ok( impactValue( 4 ) * 2 + impactValue( 1 ) < 9 );
} );

test( 'strong and weak players are divided evenly', () => {
	const ratings = [ 5, 5, 4.5, 4.5, 1, 1, 1.5, 1.5, 3, 3, 3, 3, 3, 3, 3.5, 3.5, 2.5, 2.5, 4, 2 ];
	for ( let seed = 1; seed <= 20; seed++ ) {
		const random = seededRandom( seed );
		const players = shuffleRatings( ratings, random ).map( ( rating, index ) => ( {
			id: index + 1,
			name: `Pelaaja ${ index + 1 }`,
			position: FULL_SHIFT[ index ],
			rating,
		} ) );
		const result = drawTeams( players, { random } );
		const count = ( team, test ) =>
			team.filter( ( member ) => test( players.find( ( player ) => player.id === member.id ).rating ) ).length;
		assert.equal( count( result.white, ( rating ) => rating >= 4.5 ), 2, `seed ${ seed }: strong players` );
		assert.equal( count( result.white, ( rating ) => rating < 2 ), 2, `seed ${ seed }: weak players` );
	}
} );

function shuffleRatings( ratings, random ) {
	return [ ...ratings ].sort( () => random() - 0.5 );
}
