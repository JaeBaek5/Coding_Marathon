/**
 * 음식 마스터 데이터 — 한국에서 접할 수 있는 한·중·일·양·분식·동남아 등.
 * @see foodCatalog.js (카테고리·조회 API)
 */

/** @param {Partial<import('./foodCatalog.js').FoodCatalogItem> & { id: string, label: string, category: string }} item */
function f(item) {
  const aliases = item.aliases || [item.id, item.label];
  return {
    id: item.id,
    label: item.label,
    category: item.category,
    ...(item.intentOnly ? { intentOnly: true } : {}),
    aliases,
    searchKeywords: item.searchKeywords || [item.id, ...aliases.slice(0, 3)],
    rankKeywords: item.rankKeywords || [item.id, item.label, ...aliases],
    mismatches: item.mismatches || []
  };
}

export const FOOD_CATALOG_DATA = [
  // —— 카테고리 대표(intent) ——
  f({ id: '해장', label: '해장', category: 'hangover', intentOnly: true, aliases: ['해장', '숙취', '술마셔', '술 마셔', '어제 술'], searchKeywords: ['해장국', '국밥', '순대국', '설렁탕'], rankKeywords: ['해장', '해장국', '국밥', '순대국', '설렁탕', '감자탕'], mismatches: ['치킨', '피자', '햄버거', '술집'] }),
  f({ id: '고기', label: '고기·구이', category: 'meat', intentOnly: true, aliases: ['고기', '육류', '구이', '고깃', '육식', 'bbq'], searchKeywords: ['고기', '삼겹살', '육류', '정육', '고깃집', '육식'], rankKeywords: ['고기', '육류', '삼겹살', '갈비', '구이', '숯불'], mismatches: ['샤브샤브', '칼국수', '파스타', '피자'] }),
  f({ id: '한식', label: '한식', category: 'korean', intentOnly: true, aliases: ['한식', '한정식', '집밥'] }),
  f({ id: '일식', label: '일식', category: 'japanese', intentOnly: true, aliases: ['일식', '이자카야', '일본식'] }),
  f({ id: '중식', label: '중식', category: 'chinese', intentOnly: true, aliases: ['중식', '중국집', '중국음식'] }),
  f({ id: '면', label: '면·국수', category: 'noodle', intentOnly: true, aliases: ['면류', '국수류', '면요리'] }),
  f({ id: '치킨', label: '치킨', category: 'chicken', intentOnly: true, aliases: ['치킨', '닭', '통닭', '후라이드', '양념치킨'] }),
  f({ id: '해산물', label: '해산물', category: 'seafood', intentOnly: true, aliases: ['해산물', '횟집', '수산'] }),
  f({ id: '찌개', label: '찌개·탕', category: 'soup', intentOnly: true, aliases: ['찌개', '탕', '전골', '찜'] }),
  f({ id: '양식', label: '양식', category: 'western', intentOnly: true, aliases: ['양식', '서양식', '이탈리안'] }),
  f({ id: '분식', label: '분식', category: 'snack', intentOnly: true, aliases: ['분식', '길거리음식', '포장마차'] }),
  f({ id: '동남아', label: '동남아·아시아', category: 'southeast_asian', intentOnly: true, aliases: ['동남아', '베트남', '태국', '쌀국수'] }),

  // —— 해장·국물 ——
  f({ id: '해장국', label: '해장국', category: 'hangover', aliases: ['해장국', '뼈해장국', '선지해장국'] }),
  f({ id: '국밥', label: '국밥', category: 'hangover', aliases: ['국밥', '돼지국밥', '순대국밥'] }),
  f({ id: '순대국', label: '순대국', category: 'hangover', aliases: ['순대국', '순댓국'] }),
  f({ id: '설렁탕', label: '설렁탕', category: 'hangover', aliases: ['설렁탕', '곰탕', '사골'] }),
  f({ id: '감자탕', label: '감자탕', category: 'hangover', aliases: ['감자탕', '뼈다귀'] }),
  f({ id: '콩나물국밥', label: '콩나물국밥', category: 'hangover', aliases: ['콩나물국밥'] }),
  f({ id: '육개장', label: '육개장', category: 'hangover', aliases: ['육개장'] }),
  f({ id: '추어탕', label: '추어탕', category: 'hangover', aliases: ['추어탕', '추어'] }),
  f({ id: '죽', label: '죽', category: 'hangover', aliases: ['죽', '전복죽', '야채죽', '삼계죽'] }),
  f({ id: '삼계탕', label: '삼계탕', category: 'hangover', aliases: ['삼계탕', '삼계'] }),
  f({ id: '내장탕', label: '내장탕', category: 'hangover', aliases: ['내장탕', '내장'] }),

  // —— 한식 ——
  f({ id: '불고기', label: '불고기', category: 'korean', aliases: ['불고기', '불고기덮밥'] }),
  f({ id: '갈비찜', label: '갈비찜', category: 'korean', aliases: ['갈비찜', '갈비찜'] }),
  f({ id: '제육볶음', label: '제육볶음', category: 'korean', aliases: ['제육볶음', '제육', '돼지볶음'] }),
  f({ id: '잡채', label: '잡채', category: 'korean', aliases: ['잡채', '당면'] }),
  f({ id: '파전', label: '파전', category: 'korean', aliases: ['파전', '해물파전', '김치전'] }),
  f({ id: '비지찌개', label: '비지찌개', category: 'korean', aliases: ['비지찌개', '비지'] }),
  f({ id: '고등어조림', label: '고등어조림', category: 'korean', aliases: ['고등어조림', '고등어', '조림'] }),
  f({ id: '나물', label: '나물', category: 'korean', aliases: ['나물', '시금치나물', '콩나물'] }),
  f({ id: '김치', label: '김치', category: 'korean', aliases: ['김치', '김치찜', '깍두기'] }),
  f({ id: '닭볶음탕', label: '닭볶음탕', category: 'korean', aliases: ['닭볶음탕', '닭도리탕'] }),
  f({ id: '두부김치', label: '두부김치', category: 'korean', aliases: ['두부김치', '두부'] }),
  f({ id: '육회', label: '육회', category: 'korean', aliases: ['육회', '한우육회'] }),
  f({ id: '보리비빔밥', label: '보리비빔밥', category: 'korean', aliases: ['보리비빔밥', '보리밥'] }),

  // —— 고기·구이 ——
  f({ id: '삼겹살', label: '삼겹살', category: 'meat', aliases: ['삼겹살', '삼겹', '대패삼겹'], mismatches: ['샤브샤브'] }),
  f({ id: '소고기', label: '소고기', category: 'meat', aliases: ['소고기', '한우', '불고기', '스테이크'] }),
  f({ id: '갈비', label: '갈비', category: 'meat', aliases: ['갈비', '양념갈비', 'LA갈비', '돼지갈비'] }),
  f({ id: '곱창', label: '곱창·막창', category: 'meat', aliases: ['곱창', '막창', '대창', '양'] }),
  f({ id: '닭갈비', label: '닭갈비', category: 'meat', aliases: ['닭갈비', '춘천닭갈비'] }),
  f({ id: '보쌈', label: '보쌈·족발', category: 'meat', aliases: ['보쌈', '족발', '수육', '편육'] }),
  f({ id: '족발', label: '족발', category: 'meat', aliases: ['족발', '미니족발'] }),
  f({ id: '양꼬치', label: '양꼬치', category: 'meat', aliases: ['양꼬치', '양고기', '꼬치'] }),
  f({ id: '닭발', label: '닭발', category: 'meat', aliases: ['닭발', '무뼈닭발'] }),

  // —— 해산물·회 ——
  f({ id: '회', label: '회', category: 'seafood', aliases: ['회', '사시미', '생선회', '횟집'] }),
  f({ id: '초밥', label: '초밥', category: 'seafood', aliases: ['초밥', '스시', '오마카세'] }),
  f({ id: '해물탕', label: '해물탕', category: 'seafood', aliases: ['해물탕', '해물찜'] }),
  f({ id: '조개구이', label: '조개구이', category: 'seafood', aliases: ['조개구이', '조개', '전복', '홍합'] }),
  f({ id: '장어', label: '장어', category: 'seafood', aliases: ['장어', '장어구이', '민물장어'] }),
  f({ id: '게', label: '게', category: 'seafood', aliases: ['게', '대게', '킹크랩', '꽃게'] }),
  f({ id: '새우', label: '새우', category: 'seafood', aliases: ['새우', '새우구이', '새우튀김'] }),
  f({ id: '오징어', label: '오징어', category: 'seafood', aliases: ['오징어', '오징어볶음', '오징어순대'] }),
  f({ id: '쭈꾸미', label: '쭈꾸미', category: 'seafood', aliases: ['쭈꾸미', '쭈꾸미볶음'] }),
  f({ id: '낙지', label: '낙지', category: 'seafood', aliases: ['낙지', '낙지볶음', '낙지탕'] }),
  f({ id: '황태', label: '황태', category: 'seafood', aliases: ['황태', '황태구이', '코다리'] }),

  // —— 찌개·탕 ——
  f({ id: '김치찌개', label: '김치찌개', category: 'soup', aliases: ['김치찌개'] }),
  f({ id: '된장찌개', label: '된장찌개', category: 'soup', aliases: ['된장찌개', '된장'] }),
  f({ id: '부대찌개', label: '부대찌개', category: 'soup', aliases: ['부대찌개', '부대'] }),
  f({ id: '순두부찌개', label: '순두부찌개', category: 'soup', aliases: ['순두부', '순두부찌개'] }),
  f({ id: '청국장', label: '청국장', category: 'soup', aliases: ['청국장', '청국장찌개'] }),
  f({ id: '전골', label: '전골', category: 'soup', aliases: ['전골', '버섯전골', '만두전골'] }),
  f({ id: '샤브샤브', label: '샤브샤브', category: 'soup', aliases: ['샤브샤브', '샤브'] }),
  f({ id: '곱도리탕', label: '곱도리탕', category: 'soup', aliases: ['곱도리탕', '곱도리'] }),
  f({ id: '아구찜', label: '아구찜', category: 'soup', aliases: ['아구찜', '아귀찜', '아구'] }),
  f({ id: '알탕', label: '알탕', category: 'soup', aliases: ['알탕', '명란'] }),

  // —— 면류 ——
  f({ id: '라면', label: '라면', category: 'noodle', aliases: ['라면', '라멘'] }),
  f({ id: '국수', label: '국수', category: 'noodle', aliases: ['국수', '잔치국수'] }),
  f({ id: '칼국수', label: '칼국수', category: 'noodle', aliases: ['칼국수', '바지락칼국수'] }),
  f({ id: '막국수', label: '막국수', category: 'noodle', aliases: ['막국수', '메밀국수'] }),
  f({ id: '파스타', label: '파스타', category: 'noodle', aliases: ['파스타', '스파게티', '까보나라'] }),
  f({ id: '우동', label: '우동', category: 'noodle', aliases: ['우동', '냉우동'] }),
  f({ id: '냉면', label: '냉면', category: 'noodle', aliases: ['냉면', '물냉면', '비빔냉면', '평양냉면'] }),
  f({ id: '쫄면', label: '쫄면', category: 'noodle', aliases: ['쫄면', '쫄우동'] }),
  f({ id: '짜장면', label: '짜장면', category: 'noodle', aliases: ['짜장면', '짜장'] }),
  f({ id: '짬뽕', label: '짬뽕', category: 'noodle', aliases: ['짬뽕', '해물짬뽕'] }),
  f({ id: '쌀국수', label: '쌀국수', category: 'noodle', aliases: ['쌀국수', '포', '베트남쌀국수'] }),
  f({ id: '수제비', label: '수제비', category: 'noodle', aliases: ['수제비', '손칼국수'] }),
  f({ id: '닭칼국수', label: '닭칼국수', category: 'noodle', aliases: ['닭칼국수', '닭국수'] }),
  f({ id: '짬짜면', label: '짬짜면', category: 'noodle', aliases: ['짬짜면', '짬짜'] }),

  // —— 밥·덮밥 ——
  f({ id: '비빔밥', label: '비빔밥', category: 'rice', aliases: ['비빔밥', '돌솥비빔밥'] }),
  f({ id: '덮밥', label: '덮밥', category: 'rice', aliases: ['덮밥', '돈부리'] }),
  f({ id: '백반', label: '백반', category: 'rice', aliases: ['백반', '한정식'] }),
  f({ id: '볶음밥', label: '볶음밥', category: 'rice', aliases: ['볶음밥', '김치볶음밥', '새우볶음밥'] }),
  f({ id: '김밥', label: '김밥', category: 'rice', aliases: ['김밥', '삼각김밥', '주먹밥'] }),

  // —— 치킨 ——
  f({ id: '후라이드치킨', label: '후라이드치킨', category: 'chicken', aliases: ['후라이드', '후라이드치킨'] }),
  f({ id: '양념치킨', label: '양념치킨', category: 'chicken', aliases: ['양념치킨', '양념'] }),
  f({ id: '닭강정', label: '닭강정', category: 'chicken', aliases: ['닭강정', '강정'] }),
  f({ id: '찜닭', label: '찜닭', category: 'chicken', aliases: ['찜닭', '안동찜닭'] }),
  f({ id: '굽네치킨', label: '굽기치킨', category: 'chicken', aliases: ['굽네', '오븐치킨', '구운치킨'] }),

  // —— 중식 ——
  f({ id: '탕수육', label: '탕수육', category: 'chinese', aliases: ['탕수육', '탕수'] }),
  f({ id: '마파두부', label: '마파두부', category: 'chinese', aliases: ['마파두부', '마파'] }),
  f({ id: '깐풍기', label: '깐풍기', category: 'chinese', aliases: ['깐풍기', '깐풍'] }),
  f({ id: '유린기', label: '유린기', category: 'chinese', aliases: ['유린기'] }),
  f({ id: '양장피', label: '양장피', category: 'chinese', aliases: ['양장피'] }),
  f({ id: '팔보채', label: '팔보채', category: 'chinese', aliases: ['팔보채'] }),
  f({ id: '고추잡채', label: '고추잡채', category: 'chinese', aliases: ['고추잡채'] }),
  f({ id: '유산슬', label: '유산슬', category: 'chinese', aliases: ['유산슬'] }),
  f({ id: '딤섬', label: '딤섬', category: 'chinese', aliases: ['딤섬', '하가우', '샤오롱바오'] }),
  f({ id: '동파육', label: '동파육', category: 'chinese', aliases: ['동파육'] }),
  f({ id: '꿔바로우', label: '꿔바로우', category: 'chinese', aliases: ['꿔바로우', '깐쇠새우'] }),
  f({ id: '마라탕', label: '마라탕', category: 'chinese', aliases: ['마라탕', '마라', '훠궈'] }),
  f({ id: '마라샹궈', label: '마라샹궈', category: 'chinese', aliases: ['마라샹궈', '마라볶음'] }),
  f({ id: '칠리새우', label: '칠리새우', category: 'chinese', aliases: ['칠리새우'] }),
  f({ id: '짜장밥', label: '짜장밥', category: 'chinese', aliases: ['짜장밥', '짜장덮밥'] }),
  f({ id: '중화볶음밥', label: '중화볶음밥', category: 'chinese', aliases: ['중화볶음밥', '볶음밥', '양송이볶음밥'] }),

  // —— 일식 ——
  f({ id: '돈까스', label: '돈까스', category: 'japanese', aliases: ['돈까스', '돈카츠', '카츠'] }),
  f({ id: '라멘', label: '라멘', category: 'japanese', aliases: ['라멘', '일본라멘', '돈코츠라멘'] }),
  f({ id: '규동', label: '규동', category: 'japanese', aliases: ['규동', '소고기덮밥'] }),
  f({ id: '소바', label: '소바', category: 'japanese', aliases: ['소바', '메밀소바', '냉소바'] }),
  f({ id: '가라아게', label: '가라아게', category: 'japanese', aliases: ['가라아게', '가라아게튀김'] }),
  f({ id: '텐동', label: '텐동', category: 'japanese', aliases: ['텐동', '튀김덮밥'] }),
  f({ id: '오코노미야키', label: '오코노미야키', category: 'japanese', aliases: ['오코노미야키', '오코노미'] }),
  f({ id: '타코야키', label: '타코야키', category: 'japanese', aliases: ['타코야키'] }),
  f({ id: '야키토리', label: '야키토리', category: 'japanese', aliases: ['야키토리', '꼬치구이'] }),
  f({ id: '연어덮밥', label: '연어덮밥', category: 'japanese', aliases: ['연어덮밥', '연어'] }),
  f({ id: '규카츠', label: '규카츠', category: 'japanese', aliases: ['규카츠', '고기카츠'] }),

  // —— 양식 ——
  f({ id: '피자', label: '피자', category: 'western', aliases: ['피자', 'pizza'] }),
  f({ id: '햄버거', label: '햄버거', category: 'western', aliases: ['햄버거', '버거', '치즈버거'] }),
  f({ id: '스테이크', label: '스테이크', category: 'western', aliases: ['스테이크', '스테이크하우스'] }),
  f({ id: '샐러드', label: '샐러드', category: 'western', aliases: ['샐러드', '샐러드보울'] }),
  f({ id: '리조또', label: '리조또', category: 'western', aliases: ['리조또', '리소토'] }),
  f({ id: '샌드위치', label: '샌드위치', category: 'western', aliases: ['샌드위치', '샌드', '토스트'] }),
  f({ id: '오믈렛', label: '오믈렛', category: 'western', aliases: ['오믈렛', '오믈라이스'] }),
  f({ id: '라자냐', label: '라자냐', category: 'western', aliases: ['라자냐'] }),
  f({ id: '핫도그', label: '핫도그', category: 'western', aliases: ['핫도그', '핫도그'] }),
  f({ id: '그라탕', label: '그라탕', category: 'western', aliases: ['그라탕', '그라탱'] }),
  f({ id: '바베큐', label: '바베큐', category: 'western', aliases: ['바베큐', '바비큐', 'bbq'] }),
  f({ id: '브런치', label: '브런치', category: 'western', aliases: ['브런치', '브런치카페'] }),

  // —— 분식·길거리 ——
  f({ id: '떡볶이', label: '떡볶이', category: 'snack', aliases: ['떡볶이', '로제떡볶이'] }),
  f({ id: '순대', label: '순대', category: 'snack', aliases: ['순대', '순대볶음'] }),
  f({ id: '튀김', label: '튀김', category: 'snack', aliases: ['튀김', '모듬튀김'] }),
  f({ id: '어묵', label: '어묵', category: 'snack', aliases: ['어묵', '오뎅', '꼬치어묵'] }),
  f({ id: '만두', label: '만두', category: 'snack', aliases: ['만두', '군만두', '물만두', '왕만두'] }),
  f({ id: '라볶이', label: '라볶이', category: 'snack', aliases: ['라볶이', '라면떡볶이'] }),
  f({ id: '호떡', label: '호떡', category: 'snack', aliases: ['호떡'] }),
  f({ id: '붕어빵', label: '붕어빵', category: 'snack', aliases: ['붕어빵', '잉어빵'] }),
  f({ id: '토스트', label: '토스트', category: 'snack', aliases: ['토스트', '길거리토스트'] }),
  f({ id: '계란빵', label: '계란빵', category: 'snack', aliases: ['계란빵', '계란빵'] }),

  // —— 동남아·아시아 ——
  f({ id: '분짜', label: '분짜', category: 'southeast_asian', aliases: ['분짜', '분짜쌀국수'] }),
  f({ id: '반미', label: '반미', category: 'southeast_asian', aliases: ['반미', '베트남샌드'] }),
  f({ id: '똠얌꿍', label: '똠얌꿍', category: 'southeast_asian', aliases: ['똠얌꿍', '똠얌', '톰얌'] }),
  f({ id: '팟타이', label: '팟타이', category: 'southeast_asian', aliases: ['팟타이', '태국볶음면'] }),
  f({ id: '뿌팟퐁커리', label: '뿌팟퐁커리', category: 'southeast_asian', aliases: ['뿌팟퐁커리', '뿌팟', '태국커리'] }),
  f({ id: '반쎄오', label: '반쎄오', category: 'southeast_asian', aliases: ['반쎄오', '베트남전'] }),
  f({ id: '카오팟', label: '카오팟', category: 'southeast_asian', aliases: ['카오팟', '태국볶음밥'] }),
  f({ id: '팟카파우', label: '팟카파우', category: 'southeast_asian', aliases: ['팟카파우', '태국덮밥'] }),
  f({ id: '인도커리', label: '인도커리', category: 'southeast_asian', aliases: ['인도커리', '버터치킨', '치킨마살라', '탄두리'] }),
  f({ id: '난', label: '난', category: 'southeast_asian', aliases: ['난', '인도빵', '난브레드'] }),
  f({ id: '타코', label: '타코', category: 'southeast_asian', aliases: ['타코', '멕시칸', '케사디야', '부리또'] }),
  f({ id: '케밥', label: '케밥', category: 'southeast_asian', aliases: ['케밥', '터키케밥', '샤와르마'] }),
  f({ id: '똠카', label: '똠카', category: 'southeast_asian', aliases: ['똠카', '똠카가이', '태국카레'] }),

  // —— 디저트·카페 ——
  f({ id: '디저트', label: '디저트', category: 'dessert', aliases: ['디저트', '케이크', '빵'] }),
  f({ id: '빙수', label: '빙수', category: 'dessert', aliases: ['빙수', '팥빙수', '인절미빙수'] }),
  f({ id: '카페', label: '카페', category: 'dessert', aliases: ['카페', '커피', '커피숍'] }),
  f({ id: '아이스크림', label: '아이스크림', category: 'dessert', aliases: ['아이스크림', '젤라또', '빙과'] }),
  f({ id: '와플', label: '와플', category: 'dessert', aliases: ['와플', '크로플'] }),
  f({ id: '마카롱', label: '마카롱', category: 'dessert', aliases: ['마카롱', '마카롱'] }),
  f({ id: '도넛', label: '도넛', category: 'dessert', aliases: ['도넛', '던킨'] }),
  f({ id: '탕후루', label: '탕후루', category: 'dessert', aliases: ['탕후루', '과일탕후루'] })
];
