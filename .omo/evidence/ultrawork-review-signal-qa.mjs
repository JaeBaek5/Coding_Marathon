import { writeFileSync } from 'node:fs';
import { extractNaverReviews } from '../../server/src/tools/naverReviewExtractor.js';
import { GimelAgent } from '../../server/src/agents/gimel/index.js';

function buildHtml(reviews) {
  const state = {};
  reviews.forEach((review, index) => {
    state[`Review:${index + 1}`] = { __typename: 'VisitorReview', ...review };
  });
  return `<script>window.__APOLLO_STATE__=${JSON.stringify(state)}</script>`;
}

async function scrapeFromReviews(reviews) {
  const html = buildHtml(reviews);
  return extractNaverReviews(
    { placeUrl: 'https://m.place.naver.com/restaurant/1234567890/home' },
    { fetchFn: async () => ({ ok: true, text: async () => html }) }
  );
}

const negativeScraped = await scrapeFromReviews([
  {
    body: '삼겹살 한 근인데 두 근 양을 주셔서 고기 먹고 싶은 날 다시 가고 싶어요',
    rating: 5
  },
  {
    body:
      '짬뽕은 새우가 없어서 아쉬웠지만 짜장면은 잘 넘어가고 텁텁한 느낌도 없어요',
    rating: 3
  },
  {
    body: '직원이 불친절하고 위생이 아쉬워서 다시 방문하고 싶지 않아요',
    rating: 1
  }
]);

const positiveScraped = await scrapeFromReviews([
  {
    body: '쌀국수가 너무 맛있고 고수 향도 좋아서 베트남 음식 생각날 때 좋습니다',
    rating: 5
  },
  {
    body: '칼국수 면이 쫄깃하고 국물이 진해요',
    rating: 4
  },
  {
    body: '조용해서 친구와 편하게 오래 얘기하기 좋았어요',
    rating: 5
  }
]);

const agent = new GimelAgent({
  getAgentHarness: () => null,
  scrapeReviews: async () => positiveScraped
});
const results = await agent.generateReasons([
  {
    id: 'review-signal-qa',
    name: '리뷰신호식당',
    category: '음식점',
    address: '순천',
    location: { lat: 35.176, lng: 127.503 },
    placeUrl: 'https://map.naver.com/p/entry/place/1234567890',
    transportMode: 'walk',
    oneWayRouteMinutes: 6,
    totalExpectedMinutes: 45,
    distanceMeters: 480,
    confidenceBadge: 'high',
    providerAttribution: 'qa',
    openStatus: null,
    reason: '',
    priceLevel: null,
    openingHours: null,
    reviewSummary: null,
    path: []
  }
]);

const artifact = {
  negativeExtractor: {
    reviewSignals: negativeScraped.reviewSignals,
    shouldExcludeFromRecommendation: negativeScraped.shouldExcludeFromRecommendation
  },
  positiveExtractor: {
    reviewSignals: positiveScraped.reviewSignals,
    shouldExcludeFromRecommendation: positiveScraped.shouldExcludeFromRecommendation
  },
  gimel: {
    resultCount: results.length,
    firstResult: results[0] ?? null
  }
};

writeFileSync(
  '.omo/evidence/ultrawork-review-signal-qa.json',
  JSON.stringify(artifact, null, 2),
  'utf8'
);
console.log(JSON.stringify(artifact, null, 2));
