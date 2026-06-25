import { describe, it, expect, vi } from 'vitest';
import {
  normalizeNaverUrl,
  extractPlaceIdFromUrl,
  parseApolloState,
  extractReviewsFromState,
  extractEnrichmentFromState,
  extractNaverReviews
} from '../../tools/naverReviewExtractor.js';
import { ReviewExtractionOutputSchema } from '../../../../shared/contracts/schemas.js';

// ─── normalizeNaverUrl ────────────────────────────────────────────────────────

describe('normalizeNaverUrl', () => {
  it('strips timestamp parameter from Naver Place URL', () => {
    const url =
      'https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?additionalHeight=76&fromPanelNum=1&locale=ko&svcName=map_pcv5&timestamp=202606251628';
    const result = normalizeNaverUrl(url);
    expect(result).not.toContain('timestamp=');
    expect(result).toContain('additionalHeight=76');
  });

  it('returns URL unchanged when timestamp is absent', () => {
    const url =
      'https://m.place.naver.com/restaurant/1265885017/review/visitor';
    expect(normalizeNaverUrl(url)).toBe(url);
  });

  it('returns null/undefined passthrough for falsy input', () => {
    expect(normalizeNaverUrl(null)).toBeNull();
    expect(normalizeNaverUrl('')).toBe('');
  });
});

// ─── extractPlaceIdFromUrl ────────────────────────────────────────────────────

describe('extractPlaceIdFromUrl', () => {
  it('extracts numeric place_id from m.place.naver.com URL', () => {
    expect(
      extractPlaceIdFromUrl('https://m.place.naver.com/restaurant/1265885017/home')
    ).toBe('1265885017');
  });

  it('extracts place_id from pcmap.place.naver.com visitor review URL', () => {
    expect(
      extractPlaceIdFromUrl(
        'https://pcmap.place.naver.com/restaurant/1301083778/review/visitor?locale=ko'
      )
    ).toBe('1301083778');
  });

  it('returns null for non-Naver or malformed URLs', () => {
    expect(extractPlaceIdFromUrl('https://example.com/place/111111')).toBeNull();
    expect(extractPlaceIdFromUrl(null)).toBeNull();
    expect(extractPlaceIdFromUrl('')).toBeNull();
  });

  it('handles all Naver biz path variants', () => {
    const bizPaths = ['restaurant', 'place', 'cafe', 'hairshop', 'beauty'];
    for (const biz of bizPaths) {
      expect(
        extractPlaceIdFromUrl(`https://m.place.naver.com/${biz}/9876543210/home`)
      ).toBe('9876543210');
    }
  });
});

// ─── parseApolloState ─────────────────────────────────────────────────────────

describe('parseApolloState', () => {
  it('parses __APOLLO_STATE__ JSON object from HTML string', () => {
    const html = `<html><script>window.__APOLLO_STATE__={"Review:1":{"__typename":"VisitorReview","body":"맛있어요","rating":5}}</script></html>`;
    const state = parseApolloState(html);
    expect(state).not.toBeNull();
    expect(state['Review:1'].body).toBe('맛있어요');
  });

  it('returns null when __APOLLO_STATE__ is absent', () => {
    expect(parseApolloState('<html><body>no state</body></html>')).toBeNull();
    expect(parseApolloState(null)).toBeNull();
    expect(parseApolloState('')).toBeNull();
  });

  it('returns null on malformed JSON after __APOLLO_STATE__', () => {
    const html = '<script>window.__APOLLO_STATE__=NOT_JSON;</script>';
    expect(parseApolloState(html)).toBeNull();
  });
});

// ─── extractReviewsFromState ─────────────────────────────────────────────────

describe('extractReviewsFromState', () => {
  function makeState(reviews) {
    const state = {};
    reviews.forEach((r, i) => {
      state[`Review:${i}`] = { __typename: 'VisitorReview', ...r };
    });
    return state;
  }

  it('extracts review body and rating from Apollo state', () => {
    const state = makeState([
      { body: '국물이 진하고 맛있어요', rating: 4 },
      { body: '가격이 좀 비싸요', rating: 3 }
    ]);
    const reviews = extractReviewsFromState(state);
    expect(reviews).toHaveLength(2);
    expect(reviews[0].body).toBe('국물이 진하고 맛있어요');
    expect(reviews[0].rating).toBe(4);
  });

  it('includes negative review bodies in the result corpus', () => {
    const state = makeState([
      { body: '정말 최고예요 재방문 의사 있어요', rating: 5 },
      { body: '좀 아쉬웠어요. 서비스가 불친절했습니다.', rating: 2 },
      { body: '별로였어요. 다시는 오지 않을 것 같아요.', rating: 1 }
    ]);
    const reviews = extractReviewsFromState(state);
    const bodies = reviews.map((r) => r.body);
    expect(bodies).toContain('좀 아쉬웠어요. 서비스가 불친절했습니다.');
    expect(bodies).toContain('별로였어요. 다시는 오지 않을 것 같아요.');
  });

  it('skips entries without body or non-Review __typename', () => {
    const state = {
      'PlaceDetail:1': { __typename: 'PlaceDetail', name: '테스트 식당' },
      'Review:1': { __typename: 'VisitorReview', body: '맛있어요' },
      'Review:2': { __typename: 'VisitorReview', body: '' }
    };
    const reviews = extractReviewsFromState(state);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].body).toBe('맛있어요');
  });

  it('resolves author nickname from __ref in author field', () => {
    const state = {
      'User:42': { nickname: '홍길동' },
      'Review:1': {
        __typename: 'VisitorReview',
        body: '리뷰 내용',
        author: { __ref: 'User:42' }
      }
    };
    const reviews = extractReviewsFromState(state);
    expect(reviews[0].author).toBe('홍길동');
  });

  it('returns empty array for null or empty state', () => {
    expect(extractReviewsFromState(null)).toEqual([]);
    expect(extractReviewsFromState({})).toEqual([]);
  });
});

// ─── extractEnrichmentFromState ───────────────────────────────────────────────

describe('extractEnrichmentFromState', () => {
  it('extracts mainPhoto, menuBoardPhoto, foodPhotos, and menuItems', () => {
    const state = {
      'Photo:1': {
        __typename: 'PlaceDetailTopPhotoItem',
        title: '메뉴판',
        origin: 'https://example.com/menu.jpg'
      },
      'Photo:2': {
        __typename: 'PlaceDetailTopPhotoItem',
        title: '외부',
        origin: 'https://example.com/main.jpg'
      },
      'Photo:3': {
        __typename: 'PlaceDetailTopPhotoItem',
        title: '음식·음료',
        origin: 'https://example.com/food.jpg'
      },
      'Menu:1': {
        __typename: 'Menu',
        name: '삼겹살',
        price: '15000',
        images: ['https://example.com/sammyeop.jpg']
      }
    };

    const result = extractEnrichmentFromState(state, '테스트 식당');
    expect(result.menuBoardPhoto).toBe('https://example.com/menu.jpg');
    expect(result.mainPhoto).toBe('https://example.com/main.jpg');
    expect(result.foodPhotos).toHaveLength(1);
    expect(result.foodPhotos[0].url).toBe('https://example.com/food.jpg');
    expect(result.menuItems).toHaveLength(1);
    expect(result.menuItems[0].name).toBe('삼겹살');
    expect(result.menuItems[0].price).toBe('15000');
  });

  it('returns null fields when no matching photos exist', () => {
    const result = extractEnrichmentFromState({}, '식당');
    expect(result.mainPhoto).toBeNull();
    expect(result.menuBoardPhoto).toBeNull();
    expect(result.foodPhotos).toEqual([]);
    expect(result.menuItems).toEqual([]);
  });

  it('returns safe defaults for null state input', () => {
    const result = extractEnrichmentFromState(null);
    expect(result.mainPhoto).toBeNull();
    expect(result.menuBoardPhoto).toBeNull();
  });
});

// ─── extractNaverReviews (integration-style unit with mocked fetch) ───────────

describe('extractNaverReviews', () => {
  function buildReviewPageHtml(reviews) {
    const state = {};
    reviews.forEach((r, i) => {
      state[`Review:${i}`] = { __typename: 'VisitorReview', ...r };
    });
    return `<html><script>window.__APOLLO_STATE__=${JSON.stringify(state)}</script></html>`;
  }

  it('returns ReviewExtractionOutputSchema-valid output on successful static extraction', async () => {
    const reviews = Array.from({ length: 12 }, (_, i) => ({
      body: `리뷰 내용 ${i}: ${i < 3 ? '아쉬운 점이 있어요' : '정말 맛있어요 재방문 확정'}`,
      rating: i < 3 ? 2 : 5
    }));
    const html = buildReviewPageHtml(reviews);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html)
    });

    const result = await extractNaverReviews(
      {
        placeUrl:
          'https://m.place.naver.com/restaurant/1265885017/review/visitor',
        placeName: '테스트 식당'
      },
      { fetchFn: mockFetch }
    );

    const parsed = ReviewExtractionOutputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.provider).toBe('naver');
    expect(result.placeId).toBe('1265885017');
    expect(result.extractionMethod).toBe('static-hydration');
    expect(result.error).toBeNull();
    expect(result.reviews.length).toBeGreaterThanOrEqual(10);
    expect(result.reviews.length).toBeLessThanOrEqual(20);
  });

  it('includes negative reviews in the reviews array', async () => {
    const reviews = [
      { body: '음식이 맛있어요', rating: 5 },
      { body: '서비스가 불친절하고 가격이 너무 비싸요', rating: 2 },
      { body: '대기 시간이 너무 길었어요', rating: 1 }
    ];
    const html = buildReviewPageHtml(reviews);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html)
    });

    const result = await extractNaverReviews(
      { placeUrl: 'https://m.place.naver.com/restaurant/9999/review/visitor' },
      { fetchFn: mockFetch }
    );

    const bodies = result.reviews.map((r) => r.body);
    expect(bodies).toContain('서비스가 불친절하고 가격이 너무 비싸요');
    expect(bodies).toContain('대기 시간이 너무 길었어요');
  });

  it('has reviewSummary with pros and cons fields', async () => {
    const reviews = [
      { body: '맛있어요 재방문 확정', rating: 5 },
      { body: '가격이 좀 비싸요 아쉬워요', rating: 3 }
    ];
    const html = buildReviewPageHtml(reviews);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html)
    });

    const result = await extractNaverReviews(
      { placeUrl: 'https://m.place.naver.com/restaurant/9999/review/visitor' },
      { fetchFn: mockFetch }
    );

    expect(result.reviewSummary).toHaveProperty('pros');
    expect(result.reviewSummary).toHaveProperty('cons');
  });

  it('caps reviews at 20 even when more are available in state', async () => {
    const reviews = Array.from({ length: 25 }, (_, i) => ({
      body: `리뷰 ${i}번`,
      rating: 4
    }));
    const html = buildReviewPageHtml(reviews);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html)
    });

    const result = await extractNaverReviews(
      { placeUrl: 'https://m.place.naver.com/restaurant/9999/review/visitor' },
      { fetchFn: mockFetch }
    );

    expect(result.reviews.length).toBeLessThanOrEqual(20);
  });

  it('returns extractionMethod unavailable when fetch fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    const result = await extractNaverReviews(
      { placeUrl: 'https://m.place.naver.com/restaurant/9999/review/visitor' },
      { fetchFn: mockFetch }
    );

    expect(result.extractionMethod).toBe('unavailable');
    expect(result.reviews).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('returns error result when no place_id can be resolved', async () => {
    const result = await extractNaverReviews(
      { placeUrl: null, placeName: null },
      { fetchFn: vi.fn() }
    );

    expect(result.extractionMethod).toBe('unavailable');
    expect(result.placeId).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it('uses timestamp-free URL as the extraction target', async () => {
    const urlWithTimestamp =
      'https://m.place.naver.com/restaurant/1265885017/review/visitor?timestamp=202606251628';
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await extractNaverReviews(
      { placeUrl: urlWithTimestamp },
      { fetchFn: mockFetch }
    );

    // All fetch calls must use URLs without the timestamp parameter
    for (const call of mockFetch.mock.calls) {
      const calledUrl = call[0];
      expect(calledUrl).not.toContain('timestamp=');
    }
  });
});

// ─── Vision extraction gating ─────────────────────────────────────────────────

describe('Vision extraction gating', () => {
  it('extractEnrichmentFromState does not trigger Vision extraction (returns menuBoardPhoto URL only, no LLM call)', () => {
    const state = {
      'Photo:1': {
        __typename: 'PlaceDetailTopPhotoItem',
        title: '메뉴판',
        origin: 'https://example.com/menu.jpg'
      }
    };
    // extractEnrichmentFromState is deterministic — it returns menuBoardPhoto as a URL
    // Callers must check OPENROUTER_API_KEY before calling Vision LLM
    const result = extractEnrichmentFromState(state);
    expect(result.menuBoardPhoto).toBe('https://example.com/menu.jpg');
    // No LLM was called — this is a pure data extraction function
  });

  it('returns menuBoardPhoto null when no menu board photo in state', () => {
    const state = {
      'Photo:1': {
        __typename: 'PlaceDetailTopPhotoItem',
        title: '외부',
        origin: 'https://example.com/store.jpg'
      }
    };
    const result = extractEnrichmentFromState(state);
    expect(result.menuBoardPhoto).toBeNull();
  });
});
