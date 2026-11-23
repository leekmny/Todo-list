import { TODO_LIMITS, type TodoItem } from './types';

export interface StandardCategorySpec {
  name: string;
  description: string;
  keywords: readonly string[];
}

/**
 * 20 diverse, well-balanced Korean standard categories used both to guide
 * Cloudflare Workers AI classification and to power offline desktop fallback.
 */
export const STANDARD_CATEGORIES: readonly StandardCategorySpec[] = [
  {
    name: '업무',
    description: '회사 일, 회의, 보고서, 기획서, 발표, 메일, 협업, 출근, 프로젝트 관리',
    keywords: [
      '보고서', '회의', '미팅', '기획', '발표', '프레젠테이션', 'ppt', '슬라이드', '업무',
      '회사', '출근', '퇴근', '이메일', '메일', '협업', '결재', '품의', '제안서', '견적',
      '클라이언트', '고객', '거래처', '프로젝트', '일정 조율', '면접', '이력서', '포트폴리오',
      '성과', '리뷰', '인수인계', '온보딩', '워크숍', '출장', '야근', '근태', '연차', '휴가 신청',
    ],
  },
  {
    name: '개발',
    description: '코딩, 프로그래밍, 웹사이트·앱 제작, 버그 수정, 배포, 서버, DB, API, GitHub, AI 도구',
    keywords: [
      '개발', '코딩', '코드', '버그', '디버깅', '배포', 'deploy', 'git', 'github', '깃허브',
      '커밋', 'pr', '리팩토링', '테스트', 'api', '서버', '클라우드', 'cloudflare', '도커',
      'docker', 'db', '데이터베이스', 'sql', 'react', 'typescript', 'javascript', 'python',
      '웹사이트', '앱', '프론트엔드', '백엔드', '보안', 'oauth', '로그인', '빌드', 'ci', 'cd',
      'ai', 'llm', '프롬프트', '자동화', '스크립트', '크롤링', '알고리즘', '백준', '프로그래머스',
    ],
  },
  {
    name: '디자인',
    description: 'UI/UX, 로고, 포스터, 썸네일, 영상·사진 편집, 피그마, 브랜딩, 콘텐츠 제작',
    keywords: [
      '디자인', 'ui', 'ux', '피그마', 'figma', '포토샵', '일러스트', '로고', '아이콘',
      '배너', '썸네일', '포스터', '영상 편집', '편집', '프리미어', '유튜브', '릴스', '쇼츠',
      '블로그', '콘텐츠', '브랜딩', '레이아웃', '와이어프레임', '시안', '사진 보정', '촬영',
    ],
  },
  {
    name: '학습',
    description: '공부, 강의 수강, 자격증, 시험 준비, 외국어, 과제, 학교/대학원, 세미나',
    keywords: [
      '공부', '학습', '강의', '인강', '수업', '과제', '숙제', '시험', '자격증', '토익', '토플',
      '오픽', '영어', '일본어', '중국어', '외국어', '단어', '암기', '복습', '예습', '필기',
      '정리', '논문', '리포트', '세미나', '스터디', '학원', '대학', '전공', '교수님', '모의고사',
    ],
  },
  {
    name: '독서',
    description: '책 읽기, 서평, 독후감, 아티클·뉴스레터 읽기, 도서관 반납/대출',
    keywords: [
      '독서', '책', '도서', '읽기', '완독', '서평', '독후감', '도서관', '대출', '반납',
      '전자책', '밀리의서재', '리디', '아티클', '뉴스레터', '칼럼', '에세이', '소설',
    ],
  },
  {
    name: '아이디어',
    description: '브레인스토밍, 사이드 프로젝트 구상, 영감 메모, 창업·기획 아이디어',
    keywords: [
      '아이디어', '구상', '브레인스토밍', '영감', '사이드프로젝트', '사이드 프로젝트', '창업',
      '사업', '컨셉', '메모', '초안', '기획안', '상상', '리서치', '벤치마킹', '트렌드',
    ],
  },
  {
    name: '건강',
    description: '병원, 치과, 한의원, 약국, 처방약, 영양제, 건강검진, 수면, 컨디션 관리',
    keywords: [
      '병원', '치과', '안과', '피부과', '내과', '이비인후과', '정형외과', '한의원', '약국',
      '약', '영양제', '비타민', '건강검진', '검진', '예방접종', '백신', '스케일링', '진료',
      '처방', '수면', '컨디션', '물 마시기', '금연', '금주', '다이어트', '식단 관리', '건강',
    ],
  },
  {
    name: '운동',
    description: '헬스, 웨이트, 러닝, 조깅, 산책, 수영, 필라테스, 요가, 스트레칭, 스포츠',
    keywords: [
      '운동', '헬스', '헬스장', '피트니스', '웨이트', '러닝', '런닝', '조깅', '달리기', '마라톤',
      '산책', '걷기', '등산', '수영', '필라테스', '요가', '스트레칭', '홈트', 'pt', '크로스핏',
      '자전거', '라이딩', '테니스', '배드민턴', '축구', '농구', '골프', '클라이밍', '볼링',
    ],
  },
  {
    name: '금융',
    description: '은행, 송금, 이체, 세금, 연말정산, 카드값, 공과금, 보험, 주식, 투자, 가계부',
    keywords: [
      '은행', '송금', '이체', '입금', '출금', '계좌', '카드', '결제', '할부', '세금', '종소세',
      '부가세', '연말정산', '원천징수', '보험', '실비', '청구', '월세', '관리비', '공과금',
      '전기세', '가스비', '통신비', '적금', '예금', '주식', '투자', 'etf', '펀드', '가계부',
      '예산', '정산', '회비', '대출', '환전', '청약', '금융', '재테크', '지출',
    ],
  },
  {
    name: '쇼핑',
    description: '장보기, 온라인 주문, 택배, 반품·교환, 생필품 구매, 의류, 전자기기, 선물 구매',
    keywords: [
      '쇼핑', '구매', '사기', '주문', '쿠팡', '네이버페이', '마트', '장보기', '이마트', '코스트코',
      '다이소', '올리브영', '편의점', '택배', '배송', '반품', '교환', '환불', '생필품', '휴지',
      '세제', '샴푸', '옷', '신발', '선물', '장바구니', '할인', '당근', '중고', '구입',
    ],
  },
  {
    name: '생활',
    description: '청소, 빨래, 설거지, 분리수거, 방 정리, 가전 수리, 이사 준비, 집안일',
    keywords: [
      '청소', '빨래', '세탁', '건조', '다림질', '설거지', '분리수거', '쓰레기', '음식물', '정리',
      '정돈', '대청소', '환기', '이불', '침구', '수리', '교체', '전구', '필터', '배수구', '화분',
      '물주기', '집안일', '생활', '이사', '인테리어', '가구', '택배 뜯기', '세탁소',
    ],
  },
  {
    name: '요리',
    description: '식사 준비, 레시피, 반찬 만들기, 밀프렙, 식재료 손질, 베이킹, 도시락',
    keywords: [
      '요리', '레시피', '반찬', '밀프렙', '도시락', '아침', '점심', '저녁', '식사', '국', '찌개',
      '볶음', '베이킹', '빵', '커피', '장볼 재료', '냉장고', '해동', '식단', '음식', '먹기',
    ],
  },
  {
    name: '가족',
    description: '부모님, 엄마, 아빠, 형제자매, 배우자, 자녀, 가족 행사, 명절, 효도',
    keywords: [
      '엄마', '아빠', '어머니', '아버지', '부모님', '할머니', '할아버지', '형', '누나', '오빠',
      '언니', '동생', '가족', '아내', '남편', '와이프', '아이', '아들', '딸', '본가', '명절',
      '어버이날', '가족모임', '제사', '용돈', '안부', '집안',
    ],
  },
  {
    name: '약속',
    description: '친구 만나기, 회식, 동창회, 데이트, 모임, 경조사, 결혼식, 연락·답장',
    keywords: [
      '약속', '모임', '친구', '만나기', '만남', '저녁 약속', '점심 약속', '술자리', '회식',
      '동창회', '데이트', '소개팅', '결혼식', '축의금', '조의금', '돌잔치', '생일', '파티',
      '연락', '전화', '카톡', '답장', '인사', '축하', '청첩장', '초대', '카페',
    ],
  },
  {
    name: '여행',
    description: '국내·해외 여행 계획, 항공권, KTX, 호텔/숙소 예약, 짐 싸기, 나들이, 캠핑',
    keywords: [
      '여행', '휴가', '항공권', '비행기', '공항', '호텔', '숙소', '에어비앤비', '펜션', '리조트',
      'ktx', '기차', '버스 예매', '짐 싸기', '캐리어', '유심', '이심', 'esim', '로밍', '비자',
      '환전', '일정표', '맛집 리스트', '나들이', '캠핑', '드라이브', '제주', '일본 여행',
    ],
  },
  {
    name: '취미',
    description: '게임, 영화, 드라마, 음악, 공연, 콘서트, 전시회, 악기, 그림, 사진, 여가',
    keywords: [
      '취미', '게임', '영화', '드라마', '넷플릭스', '애니', '웹툰', '음악', '플레이리스트',
      '콘서트', '공연', '뮤지컬', '전시회', '미술관', '티켓', '예매', '기타', '피아노', '악기',
      '그림', '드로잉', '사진', '카메라', '낚시', '프라모델', '레고', '뜨개질', '여가',
    ],
  },
  {
    name: '행정',
    description: '주민센터, 정부24, 서류 발급, 여권, 면허 갱신, 전입신고, 계약서, 예약, 민원',
    keywords: [
      '행정', '주민센터', '구청', '시청', '동사무소', '정부24', '민원', '서류', '등본', '초본',
      '가족관계증명서', '인감', '여권', '신분증', '면허', '운전면허', '전입신고', '확정일자',
      '계약', '계약서', '갱신', '해지', '신청', '등록', '접수', '우체국', '등기', '공증', '예약',
    ],
  },
  {
    name: '반려동물',
    description: '강아지·고양이 산책, 사료, 간식, 동물병원, 예방접종, 미용, 모래 청소',
    keywords: [
      '반려동물', '강아지', '고양이', '댕댕이', '냥이', '멍멍이', '동물병원', '사료', '간식',
      '배변패드', '고양이 모래', '심장사상충', '애견미용', '펫', '산책 시키기', '목욕 시키기',
    ],
  },
  {
    name: '차량',
    description: '자동차 주유, 충전, 세차, 엔진오일, 정비, 타이어, 자동차 보험, 검사, 주차',
    keywords: [
      '차량', '자동차', '차', '주유', '충전', '전기차', '세차', '엔진오일', '타이어', '정비',
      '카센터', '정기검사', '자동차 검사', '자동차 보험', '하이패스', '블랙박스', '주차', '발렛',
    ],
  },
  {
    name: '개인',
    description: '자기계발, 회고, 일기, 목표 점검, 루틴, 미용실, 기타 개인 일정',
    keywords: [
      '개인', '일기', '회고', '목표', '계획', '다짐', '루틴', '습관', '명상', '휴식', '미용실',
      '머리 자르기', '네일', '피부관리', '정리하기', '생각 정리', '버킷리스트',
    ],
  },
] as const;

export const STANDARD_CATEGORY_NAMES: readonly string[] = STANDARD_CATEGORIES.map((c) => c.name);

const DISALLOWED_CATEGORY_WORDS = new Set([
  '',
  '없음',
  '미분류',
  '기타',
  'none',
  'null',
  'undefined',
  'n/a',
  'unknown',
  'uncategorized',
]);

/**
 * Sanitizes and normalizes an AI or user category string so it is safe to store and display.
 */
export function sanitizeCategoryLabel(
  raw: string | null | undefined,
  existingCategories: readonly string[] = []
): string {
  if (!raw || typeof raw !== 'string') return '';

  // Take first line only, strip quotes, markdown bullets, leading #, control chars
  let cleaned = raw
    .split(/[\r\n]/)[0]
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[\s"'`#\-*•·:：[\](]+/, '')
    .replace(/[\s"'`.,!?;:：\]()]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Remove accidental "카테고리:" prefix and re-strip surrounding quotes/punctuation
  cleaned = cleaned
    .replace(/^(카테고리|분류|category)\s*[:：\-]\s*/i, '')
    .replace(/^[\s"'`#\-*•·:：[\](]+/, '')
    .replace(/[\s"'`.,!?;:：\]()]+$/, '')
    .trim();
  if (!cleaned) return '';

  // Clip overly verbose responses
  if (cleaned.length > TODO_LIMITS.MAX_CATEGORY_LENGTH) {
    cleaned = cleaned.slice(0, TODO_LIMITS.MAX_CATEGORY_LENGTH).trim();
  }

  if (DISALLOWED_CATEGORY_WORDS.has(cleaned.toLowerCase())) {
    return '';
  }

  // Prefer exact case-insensitive match with user's existing categories
  const lower = cleaned.toLowerCase();
  const matchedExisting = existingCategories.find((cat) => cat.trim().toLowerCase() === lower);
  if (matchedExisting) {
    return matchedExisting.trim();
  }

  return cleaned;
}

function tokenizeKoreanAndEnglish(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

/**
 * Deterministic fallback classifier used in offline desktop mode or when Workers AI
 * is unavailable/times out. Combines user's existing history + 20 standard categories.
 */
export function fallbackClassifyCategory(
  title: string,
  notes = '',
  existingCategories: readonly string[] = [],
  existingTodos: readonly Pick<TodoItem, 'title' | 'notes' | 'category'>[] = []
): string {
  const combined = `${title} ${notes}`.trim();
  if (!combined) return '개인';

  const normalizedText = combined.toLowerCase();
  const inputTokens = tokenizeKoreanAndEnglish(combined);

  // 1. Direct mention of any existing user category name in title/notes
  for (const cat of existingCategories) {
    const trimmed = cat.trim();
    if (trimmed.length >= 2 && normalizedText.includes(trimmed.toLowerCase())) {
      return trimmed;
    }
  }

  // 2. Learn from user's existing categorized todos (token overlap)
  if (existingTodos.length > 0 && inputTokens.length > 0) {
    const historyScores = new Map<string, number>();
    for (const todo of existingTodos) {
      const cat = todo.category?.trim();
      if (!cat) continue;
      const todoTokens = new Set(tokenizeKoreanAndEnglish(`${todo.title} ${todo.notes}`));
      let overlap = 0;
      for (const token of inputTokens) {
        if (todoTokens.has(token)) {
          overlap += token.length >= 3 ? 2 : 1;
        }
      }
      if (overlap > 0) {
        historyScores.set(cat, (historyScores.get(cat) ?? 0) + overlap);
      }
    }

    let bestHistoryCat = '';
    let bestHistoryScore = 0;
    for (const [cat, score] of historyScores.entries()) {
      if (score > bestHistoryScore) {
        bestHistoryScore = score;
        bestHistoryCat = cat;
      }
    }
    if (bestHistoryScore >= 2 && bestHistoryCat) {
      return bestHistoryCat;
    }
  }

  // 3. Score against the 20 standard category keyword rules
  const titleLower = title.toLowerCase();
  let bestCategory = '';
  let bestScore = 0;

  for (const spec of STANDARD_CATEGORIES) {
    let score = 0;
    for (const kw of spec.keywords) {
      const kwLower = kw.toLowerCase();
      if (titleLower.includes(kwLower)) {
        score += kwLower.length >= 3 ? 3 : 2;
      } else if (normalizedText.includes(kwLower)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = spec.name;
    }
  }

  if (bestCategory) {
    return sanitizeCategoryLabel(bestCategory, existingCategories) || '개인';
  }

  return '개인';
}
