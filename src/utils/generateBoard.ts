import type { Card, CardType, Team } from '../types';
import { WORD_LIST } from '../assets/wordlist';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateBoard(startingTeam: Team): Card[] {
  // Pick 25 random words
  const words = shuffleArray(WORD_LIST).slice(0, 25);

  // Create card type distribution
  // Starting team gets 9 cards, other team gets 8
  const types: CardType[] = [
    ...Array(startingTeam === 'red' ? 9 : 8).fill('red' as CardType),
    ...Array(startingTeam === 'blue' ? 9 : 8).fill('blue' as CardType),
    ...Array(7).fill('neutral' as CardType),
    'assassin' as CardType,
  ];

  // Shuffle the types
  const shuffledTypes = shuffleArray(types);

  // Create the cards
  return words.map((word, index) => ({
    id: index,
    word,
    type: shuffledTypes[index],
    revealed: false,
    revealedBy: null,
  }));
}

export function getRandomStartingTeam(): Team {
  return Math.random() < 0.5 ? 'red' : 'blue';
}
