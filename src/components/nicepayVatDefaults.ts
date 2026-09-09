import type { ClassificationRule, Facility, PackageComponent } from "./nicepayVatEngine";

const facilityColumns = [
  ["객실료", "AE"], ["한식당", "AF"], ["양식당", "AG"], ["카페테리아", "AH"], ["커피샵", "AI"], ["콘도임대", "AJ"], ["스키임대", "AK"], ["오토캠핑장", "AL"], ["관광곤돌라", "AM"], ["눈썰매", "AN"], ["플라잉라인", "AO"], ["시즌권", "AP"], ["스키보관", "AQ"], ["리프트", "AR"], ["스키렌탈", "AS"], ["스키복렌탈", "AT"], ["워터파크", "AU"], ["워터식사", "AV"], ["카바나", "AW"], ["선베드", "AX"], ["물품대여", "AY"], ["보관소(P)", "AZ"], ["사우나", "BA"], ["스키강습", "BB"], ["공통배부", "BC"], ["루지", "BD"], ["사계절썰매", "BE"], ["레이싱카트", "BF"], ["고카트", "BG"], ["MTB", "BH"], ["깡통열차", "BI"], ["아레나", "BJ"],
] as const;

export const DEFAULT_FACILITIES: Facility[] = facilityColumns.map(([name, excelColumn], index) => ({ id: `facility-${excelColumn}`, name, excelColumn, displayOrder: index + 1, enabled: true }));

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRule[] = [
  { id: "rule-water-breakfast", priority: 1, includeKeywords: ["워터", "조식"], excludeKeywords: [], standardProductName: "워터조식", packageName: "워터조식", enabled: true, description: "워터파크와 조식 구성 상품" },
  { id: "rule-water-package", priority: 2, includeKeywords: ["워터", "PKG"], excludeKeywords: ["조식"], standardProductName: "워터PKG", packageName: "워터PKG", enabled: true, description: "워터파크 객실 패키지" },
  { id: "rule-welli-bbq", priority: 3, includeKeywords: ["웰리", "바베큐"], excludeKeywords: [], standardProductName: "웰리바베큐", packageName: "웰리바베큐", enabled: true, description: "웰리 바베큐 패키지" },
  { id: "rule-room-only", priority: 4, includeKeywords: ["룸온리"], excludeKeywords: [], standardProductName: "룸온리", packageName: "객실료", enabled: true, description: "객실 단독 상품" },
  { id: "rule-cabana", priority: 10, includeKeywords: ["카바나"], excludeKeywords: [], standardProductName: "카바나", packageName: "카바나", enabled: true, description: "카바나 직접 배부" },
  { id: "rule-sunbed", priority: 11, includeKeywords: ["썬베드"], excludeKeywords: [], standardProductName: "선베드", packageName: "선베드", enabled: true, description: "선베드 직접 배부" },
  { id: "rule-gondola", priority: 12, includeKeywords: ["곤돌라"], excludeKeywords: [], standardProductName: "관광곤돌라", packageName: "관광곤돌라", enabled: true, description: "관광곤돌라 직접 배부" },
  { id: "rule-luge", priority: 13, includeKeywords: ["루지"], excludeKeywords: [], standardProductName: "루지", packageName: "루지", enabled: true, description: "루지 직접 배부" },
  { id: "rule-kart", priority: 14, includeKeywords: ["고카트"], excludeKeywords: [], standardProductName: "고카트", packageName: "고카트", enabled: true, description: "고카트 직접 배부" },
];

export const DEFAULT_PACKAGE_COMPONENTS: PackageComponent[] = [
  { id: "component-water-room", packageName: "워터PKG", facilityName: "객실료", baseAmount: 93000, enabled: true },
  { id: "component-water-waterpark", packageName: "워터PKG", facilityName: "워터파크", baseAmount: 40000, enabled: true },
  { id: "component-waterbreakfast-room", packageName: "워터조식", facilityName: "객실료", baseAmount: 127000, enabled: true },
  { id: "component-waterbreakfast-korean", packageName: "워터조식", facilityName: "한식당", baseAmount: 30000, enabled: true },
  { id: "component-waterbreakfast-waterpark", packageName: "워터조식", facilityName: "워터파크", baseAmount: 96000, enabled: true },
  { id: "component-bbq-room", packageName: "웰리바베큐", facilityName: "객실료", baseAmount: 156000, enabled: true },
  { id: "component-bbq-western", packageName: "웰리바베큐", facilityName: "양식당", baseAmount: 244000, enabled: true },
];
