import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLikedRestaurants,
  saveLikedRestaurant,
  removeLikedRestaurant,
  isRestaurantLiked
} from './likedRestaurants.js';

describe('likedRestaurants', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads liked restaurants', () => {
    const saved = saveLikedRestaurant({
      id: 'place-1',
      name: '든든한국밥',
      category: '한식',
      address: '순천시'
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('든든한국밥');
    expect(loadLikedRestaurants()).toHaveLength(1);
    expect(isRestaurantLiked('place-1')).toBe(true);
  });

  it('moves duplicate likes to the top', () => {
    saveLikedRestaurant({ id: 'a', name: 'A' });
    saveLikedRestaurant({ id: 'b', name: 'B' });
    const saved = saveLikedRestaurant({ id: 'a', name: 'A' });

    expect(saved.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('removes a liked restaurant', () => {
    saveLikedRestaurant({ id: 'a', name: 'A' });
    const saved = removeLikedRestaurant('a');

    expect(saved).toEqual([]);
    expect(isRestaurantLiked('a')).toBe(false);
  });
});
