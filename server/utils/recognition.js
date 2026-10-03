/*
 * Non-monetary donor recognition (Recommendation 9): a donor number for the digital donor card
 * and badges for the number of verified donations.
 */
export const BADGES = [
    { id: 'first', min: 1, label: 'First donation' },
    { id: 'bronze', min: 5, label: 'Bronze donor' },
    { id: 'silver', min: 10, label: 'Silver donor' },
    { id: 'gold', min: 25, label: 'Gold donor' },
    { id: 'platinum', min: 50, label: 'Platinum donor' },
];

export function donorNumber(id) {
    return `OBBS-D-${String(id).padStart(6, '0')}`;
}

// Highest badge earned with this many donations (null before the first donation).
export function currentBadge(count) {
    return [...BADGES].reverse().find((b) => count >= b.min) ?? null;
}

// The next badge to earn and how many more donations it needs (null after the last badge).
export function nextBadge(count) {
    const badge = BADGES.find((b) => count < b.min);
    return badge ? { ...badge, remaining: badge.min - count } : null;
}

// The badge earned by exactly the donation that brought the total to count, if any.
export function badgeReachedAt(count) {
    return BADGES.find((b) => b.min === count) ?? null;
}
