import { describe, expect, it } from 'vitest';
import {
  fallbackClassifyCategory,
  sanitizeCategoryLabel,
  STANDARD_CATEGORIES,
} from '../src/shared/categories';

describe('Category Standards & Offline Fallback Classifier', () => {
  it('provides 20 rich Korean standard categories', () => {
    expect(STANDARD_CATEGORIES.length).toBeGreaterThanOrEqual(20);
    const names = new Set(STANDARD_CATEGORIES.map((c) => c.name));
    expect(names.size).toBe(STANDARD_CATEGORIES.length);
    for (const expected of ['업무', '개발', '디자인', '학습', '독서', '건강', '운동', '금융', '쇼핑', '생활', '요리', '가족', '약속', '여행', '취미', '행정', '반려동물', '차량', '아이디어', '개인']) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('sanitizes noisy AI outputs and normalizes against existing categories', () => {
    expect(sanitizeCategoryLabel('  #건강 \n추가 설명')).toBe('건강');
    expect(sanitizeCategoryLabel('카테고리: "금융"')).toBe('금융');
    expect(sanitizeCategoryLabel('없음')).toBe('');
    expect(sanitizeCategoryLabel('미분류')).toBe('');
    expect(sanitizeCategoryLabel('sideproject', ['SideProject', '업무'])).toBe('SideProject');
  });

  it('classifies diverse Korean tasks accurately and learns from user history', () => {
    expect(fallbackClassifyCategory('치과 스케일링 예약')).toBe('건강');
    expect(fallbackClassifyCategory('헬스장 하체 루틴 1시간')).toBe('운동');
    expect(fallbackClassifyCategory('Cloudflare Workers 배포 오류 수정')).toBe('개발');
    expect(fallbackClassifyCategory('자동차 엔진오일 교체 및 세차')).toBe('차량');
    expect(fallbackClassifyCategory('강아지 심장사상충 약 먹이기')).toBe('반려동물');
    expect(fallbackClassifyCategory('강아지 예방접종 예약')).toBe('반려동물');
    expect(fallbackClassifyCategory('고양이 예방접종 예약')).toBe('반려동물');
    expect(fallbackClassifyCategory('독감 예방접종 예약')).toBe('건강');
    expect(fallbackClassifyCategory('주민센터에서 등본 발급받기')).toBe('행정');

    // Learns from previous categorized todos
    const history = [
      { title: '클라이밍 암장 회원권 연장', notes: '', category: '볼더링' },
    ];
    expect(fallbackClassifyCategory('클라이밍 초크백 챙기기', '', ['볼더링'], history)).toBe('볼더링');
  });
});
