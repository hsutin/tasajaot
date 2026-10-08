// Team draw algorithm. This module has no DOM or network code, so Node tests can import it.

export const POSITIONS = [ 'P', 'H', 'HP', 'PH' ];

const ROLE_DEFENCE = 'D';
const ROLE_FORWARD = 'F';

// Weights of the cost function. The line differences are the most important values.
// Thus a strong defence cannot compensate for a weak attack. When the lines are equal,
// the totals are also equal, so the total has a smaller weight.
const WEIGHT_TOTAL = 4;
const WEIGHT_LINE = 10;
const WEIGHT_SECONDARY_ROLE = 1;

// The shift has a maximum of 20 players: 4 defenders and 6 forwards per team.
export const MAX_PLAYERS = 20;
const MAX_FORWARDS_PER_TEAM = 6;

/**
 * Number of defenders in the shift (both teams together).
 *
 * The rules of the shift:
 * - A team has a maximum of 4 defenders and 6 forwards.
 * - 20 players: 4 + 4 defenders.
 * - 19 players: 3 + 4 defenders, because a team cannot have more than 6 forwards.
 * - 14–18 players: 3 + 3 defenders. The forwards decrease.
 *   The defenders are in good condition and fast skaters, so 3 defenders per team are enough.
 * - Fewer than 14 players: about 40 % of the players are defenders.
 */
export function wantedDefenders( playerCount ) {
	if ( playerCount >= 14 ) {
		return Math.max( 6, playerCount - MAX_FORWARDS_PER_TEAM * 2 );
	}
	return Math.round( playerCount * 0.4 );
}

export function canPlay( position, role ) {
	if ( position === 'P' ) {
		return role === ROLE_DEFENCE;
	}
	if ( position === 'H' ) {
		return role === ROLE_FORWARD;
	}
	return position === 'HP' || position === 'PH';
}

export function primaryRole( position ) {
	return position === 'P' || position === 'PH' ? ROLE_DEFENCE : ROLE_FORWARD;
}

export function normalizePosition( value ) {
	const position = String( value ?? '' )
		.toUpperCase()
		.replace( /[^PH]/g, '' );
	return POSITIONS.includes( position ) ? position : null;
}

function shuffle( list, random ) {
	const copy = [ ...list ];
	for ( let i = copy.length - 1; i > 0; i-- ) {
		const j = Math.floor( random() * ( i + 1 ) );
		[ copy[ i ], copy[ j ] ] = [ copy[ j ], copy[ i ] ];
	}
	return copy;
}

function validatePlayers( players ) {
	if ( players.length < 2 ) {
		throw new Error( 'Valitse vähintään 2 pelaajaa.' );
	}
	if ( players.length > MAX_PLAYERS ) {
		throw new Error( `Vuorossa voi olla enintään ${ MAX_PLAYERS } pelaajaa.` );
	}
	for ( const player of players ) {
		if ( ! POSITIONS.includes( player.position ) ) {
			throw new Error( `Pelaajalla ${ player.name } on virheellinen pelipaikka.` );
		}
		if ( ! Number.isFinite( player.rating ) ) {
			throw new Error( `Pelaajalla ${ player.name } on virheellinen rating.` );
		}
	}
}

// Calculates how many defenders the shift has in total and per team.
export function lineTargets( players ) {
	const playerCount = players.length;
	const pureDefenders = players.filter( ( player ) => player.position === 'P' ).length;
	const pureForwards = players.filter( ( player ) => player.position === 'H' ).length;

	// Pure defenders (P) cannot play as forwards and pure forwards (H) cannot play as defenders.
	// Thus the number of these players can move the target.
	const defenders = Math.min(
		Math.max( wantedDefenders( playerCount ), pureDefenders ),
		playerCount - pureForwards
	);

	// Team 0 is the larger team when the player count is odd.
	const teamSizes = [ Math.ceil( playerCount / 2 ), Math.floor( playerCount / 2 ) ];
	const splits = [ Math.ceil( defenders / 2 ), Math.floor( defenders / 2 ) ].map( ( teamZeroDefenders ) => {
		const teamOneDefenders = defenders - teamZeroDefenders;
		const forwardDifference = Math.abs(
			teamSizes[ 0 ] - teamZeroDefenders - ( teamSizes[ 1 ] - teamOneDefenders )
		);
		return { defenders: [ teamZeroDefenders, teamOneDefenders ], forwardDifference };
	} );

	return { defenders, teamSizes, splits };
}

function pickSplit( splits, random ) {
	const best = Math.min( ...splits.map( ( split ) => split.forwardDifference ) );
	const options = splits.filter( ( split ) => split.forwardDifference === best );
	return options[ Math.floor( random() * options.length ) ].defenders;
}

// A state gives each player a slot: { team: 0 | 1, role: 'D' | 'F' }.
function initialState( players, targets, random ) {
	const roles = players.map( ( player ) => primaryRole( player.position ) );
	let defenderCount = roles.filter( ( role ) => role === ROLE_DEFENCE ).length;

	if ( defenderCount !== targets.defenders ) {
		const needMoreDefenders = defenderCount < targets.defenders;
		const fromRole = needMoreDefenders ? ROLE_FORWARD : ROLE_DEFENCE;
		const toRole = needMoreDefenders ? ROLE_DEFENCE : ROLE_FORWARD;
		const candidates = shuffle(
			players
				.map( ( player, index ) => index )
				.filter( ( index ) => roles[ index ] === fromRole && canPlay( players[ index ].position, toRole ) ),
			random
		);
		for ( const index of candidates ) {
			if ( defenderCount === targets.defenders ) {
				break;
			}
			roles[ index ] = toRole;
			defenderCount += needMoreDefenders ? 1 : -1;
		}
	}

	const teamDefenders = pickSplit( targets.splits, random );
	const teams = new Array( players.length );
	const defenderIndexes = shuffle(
		roles.map( ( role, index ) => index ).filter( ( index ) => roles[ index ] === ROLE_DEFENCE ),
		random
	);
	const forwardIndexes = shuffle(
		roles.map( ( role, index ) => index ).filter( ( index ) => roles[ index ] === ROLE_FORWARD ),
		random
	);
	const teamForwards = [ targets.teamSizes[ 0 ] - teamDefenders[ 0 ], targets.teamSizes[ 1 ] - teamDefenders[ 1 ] ];

	defenderIndexes.forEach( ( index, order ) => {
		teams[ index ] = order < teamDefenders[ 0 ] ? 0 : 1;
	} );
	forwardIndexes.forEach( ( index, order ) => {
		teams[ index ] = order < teamForwards[ 0 ] ? 0 : 1;
	} );

	return { teams, roles };
}

function average( sum, count ) {
	return count === 0 ? 0 : sum / count;
}

export function teamStats( players, state ) {
	const stats = [ 0, 1 ].map( () => ( {
		total: 0,
		defenceTotal: 0,
		forwardTotal: 0,
		defenders: 0,
		forwards: 0,
		secondaryRoles: 0,
	} ) );

	players.forEach( ( player, index ) => {
		const team = stats[ state.teams[ index ] ];
		team.total += player.rating;
		if ( state.roles[ index ] === ROLE_DEFENCE ) {
			team.defenceTotal += player.rating;
			team.defenders++;
		} else {
			team.forwardTotal += player.rating;
			team.forwards++;
		}
		if ( state.roles[ index ] !== primaryRole( player.position ) ) {
			team.secondaryRoles++;
		}
	} );

	return stats;
}

// Compares line averages, so a team with 3 defenders is not compared to a team with 4 defenders by sum.
function lineDifference( sums, counts ) {
	const averageCount = ( counts[ 0 ] + counts[ 1 ] ) / 2;
	return Math.abs( average( sums[ 0 ], counts[ 0 ] ) - average( sums[ 1 ], counts[ 1 ] ) ) * averageCount;
}

function cost( players, state ) {
	const [ teamZero, teamOne ] = teamStats( players, state );
	const value =
		WEIGHT_TOTAL * Math.abs( teamZero.total - teamOne.total ) +
		WEIGHT_LINE *
			lineDifference(
				[ teamZero.defenceTotal, teamOne.defenceTotal ],
				[ teamZero.defenders, teamOne.defenders ]
			) +
		WEIGHT_LINE *
			lineDifference(
				[ teamZero.forwardTotal, teamOne.forwardTotal ],
				[ teamZero.forwards, teamOne.forwards ]
			) +
		WEIGHT_SECONDARY_ROLE * ( teamZero.secondaryRoles + teamOne.secondaryRoles );

	// Removes floating point noise, so equal solutions get an equal cost.
	return Math.round( value * 1000 ) / 1000;
}

// Two players change slots (team and role). The player and line counts do not change.
function canSwap( players, state, first, second ) {
	if ( state.teams[ first ] === state.teams[ second ] && state.roles[ first ] === state.roles[ second ] ) {
		return false;
	}
	return (
		canPlay( players[ first ].position, state.roles[ second ] ) &&
		canPlay( players[ second ].position, state.roles[ first ] )
	);
}

function swap( state, first, second ) {
	[ state.teams[ first ], state.teams[ second ] ] = [ state.teams[ second ], state.teams[ first ] ];
	[ state.roles[ first ], state.roles[ second ] ] = [ state.roles[ second ], state.roles[ first ] ];
}

// Local search: does a swap if the swap makes the cost lower. Stops when no swap helps.
function improve( players, state, random ) {
	const pairs = [];
	for ( let first = 0; first < players.length; first++ ) {
		for ( let second = first + 1; second < players.length; second++ ) {
			pairs.push( [ first, second ] );
		}
	}

	let currentCost = cost( players, state );
	let improved = true;
	while ( improved ) {
		improved = false;
		for ( const [ first, second ] of shuffle( pairs, random ) ) {
			if ( ! canSwap( players, state, first, second ) ) {
				continue;
			}
			swap( state, first, second );
			const newCost = cost( players, state );
			if ( newCost < currentCost ) {
				currentCost = newCost;
				improved = true;
			} else {
				swap( state, first, second );
			}
		}
	}

	return currentCost;
}

function stateKey( players, state ) {
	return players
		.map( ( player, index ) => `${ player.id }:${ state.teams[ index ] }${ state.roles[ index ] }` )
		.sort()
		.join( '|' );
}

function compareMembers( first, second ) {
	if ( first.role !== second.role ) {
		return first.role === ROLE_DEFENCE ? -1 : 1;
	}
	return first.name.localeCompare( second.name, 'fi' );
}

/**
 * Draws two even teams.
 *
 * The function finds many good solutions and selects one of the best at random.
 * Thus the teams are even, but they are different each week.
 *
 * @param {Array<{id: *, name: string, position: string, rating: number}>} players
 * @param {{random?: Function, restarts?: number, tolerance?: number}} options
 */
export function drawTeams( players, options = {} ) {
	const { random = Math.random, restarts = 300, tolerance = 0.5 } = options;

	validatePlayers( players );
	const targets = lineTargets( players );
	const solutions = new Map();

	for ( let round = 0; round < restarts; round++ ) {
		const state = initialState( players, targets, random );
		const stateCost = improve( players, state, random );
		const key = stateKey( players, state );
		if ( ! solutions.has( key ) ) {
			solutions.set( key, {
				cost: stateCost,
				state: { teams: [ ...state.teams ], roles: [ ...state.roles ] },
			} );
		}
	}

	const allSolutions = [ ...solutions.values() ];
	const bestCost = Math.min( ...allSolutions.map( ( solution ) => solution.cost ) );
	const candidates = allSolutions.filter( ( solution ) => solution.cost <= bestCost + tolerance );
	const chosen = candidates[ Math.floor( random() * candidates.length ) ];

	// Team 0 is the larger team. The color of the larger team is random.
	const whiteTeam = random() < 0.5 ? 0 : 1;
	const members = [ [], [] ];
	players.forEach( ( player, index ) => {
		members[ chosen.state.teams[ index ] ].push( {
			id: player.id,
			name: player.name,
			position: player.position,
			role: chosen.state.roles[ index ],
		} );
	} );
	members.forEach( ( team ) => team.sort( compareMembers ) );

	const stats = teamStats( players, chosen.state );

	return {
		white: members[ whiteTeam ],
		black: members[ 1 - whiteTeam ],
		stats: { white: stats[ whiteTeam ], black: stats[ 1 - whiteTeam ] },
		cost: chosen.cost,
		candidateCount: candidates.length,
	};
}
