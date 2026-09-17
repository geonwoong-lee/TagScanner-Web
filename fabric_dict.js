// 소재·원단·라벨 용어 사전 (fabric_tag_dictionary.json 원본을 그대로 담음)
// 정적 호스팅에서 fetch 없이 쓰도록 스크립트로 제공한다.
window.FABRIC_DICT = {
  "description": "온라인 패션 플랫폼 상품명과 실제 의류 택(라벨)에 반복적으로 등장하는 소재·원단가공·라벨 표기 용어 사전입니다. OCR로 추출한 텍스트를 표준 용어(term)와 다양한 표기 변형(aliases)으로 대조해 매칭하는 용도로 사용합니다.",
  "note": "무신사 실시간 랭킹 데이터를 직접 수집해 빈도를 계산한 결과가 아니라, 국내 패션 브랜드가 택과 상품명에 일반적으로 사용하는 표준 용어를 정리한 시드 사전입니다. 보유하신 실제 택 이미지 샘플로 매칭 정확도를 검증하고, 빠진 용어는 계속 추가하시는 것을 권장합니다.",
  "categories": {
    "fiber_material": [
      {
        "term": "코튼",
        "aliases": [
          "Cotton",
          "COTTON",
          "면",
          "면 100%",
          "순면"
        ]
      },
      {
        "term": "울",
        "aliases": [
          "Wool",
          "WOOL",
          "모",
          "울 100%"
        ]
      },
      {
        "term": "폴리에스터",
        "aliases": [
          "Polyester",
          "POLYESTER",
          "폴리"
        ]
      },
      {
        "term": "나일론",
        "aliases": [
          "Nylon",
          "NYLON"
        ]
      },
      {
        "term": "스판덱스",
        "aliases": [
          "Spandex",
          "SPANDEX",
          "라이크라",
          "Lycra",
          "엘라스탄",
          "Elastane"
        ]
      },
      {
        "term": "레이온",
        "aliases": [
          "Rayon",
          "RAYON",
          "비스코스",
          "Viscose"
        ]
      },
      {
        "term": "린넨",
        "aliases": [
          "Linen",
          "LINEN",
          "마"
        ]
      },
      {
        "term": "캐시미어",
        "aliases": [
          "Cashmere",
          "CASHMERE"
        ]
      },
      {
        "term": "앙고라",
        "aliases": [
          "Angora",
          "ANGORA"
        ]
      },
      {
        "term": "아크릴",
        "aliases": [
          "Acrylic",
          "ACRYLIC"
        ]
      },
      {
        "term": "텐셀",
        "aliases": [
          "Tencel",
          "TENCEL",
          "라이오셀",
          "Lyocell"
        ]
      },
      {
        "term": "모달",
        "aliases": [
          "Modal",
          "MODAL"
        ]
      },
      {
        "term": "큐프라",
        "aliases": [
          "Cupro",
          "CUPRO"
        ]
      },
      {
        "term": "실크",
        "aliases": [
          "Silk",
          "SILK",
          "견"
        ]
      },
      {
        "term": "알파카",
        "aliases": [
          "Alpaca",
          "ALPACA"
        ]
      },
      {
        "term": "헴프",
        "aliases": [
          "Hemp",
          "HEMP",
          "대마"
        ]
      },
      {
        "term": "메리노울",
        "aliases": [
          "Merino Wool",
          "MERINO WOOL",
          "메리노"
        ]
      },
      {
        "term": "폴리우레탄",
        "aliases": [
          "Polyurethane",
          "PU",
          "PVC"
        ]
      }
    ],
    "fabric_texture": [
      {
        "term": "브러쉬드",
        "aliases": [
          "Brushed",
          "BRUSHED",
          "브러시드"
        ],
        "note": "표면을 긁어 보풀을 세운 가공, 기모와 유사"
      },
      {
        "term": "기모",
        "aliases": [
          "기모원단",
          "안감기모"
        ]
      },
      {
        "term": "융",
        "aliases": [
          "융원단",
          "융기모"
        ]
      },
      {
        "term": "워시드",
        "aliases": [
          "Washed",
          "WASHED"
        ]
      },
      {
        "term": "스톤워시드",
        "aliases": [
          "Stone Washed",
          "STONE WASH"
        ]
      },
      {
        "term": "빈티지워싱",
        "aliases": [
          "Vintage Wash",
          "Vintage Washing"
        ]
      },
      {
        "term": "멜란지",
        "aliases": [
          "Melange",
          "MELANGE",
          "멜란지컬러"
        ]
      },
      {
        "term": "헤비웨이트",
        "aliases": [
          "Heavyweight",
          "HEAVYWEIGHT"
        ]
      },
      {
        "term": "라이트웨이트",
        "aliases": [
          "Lightweight",
          "LIGHTWEIGHT"
        ]
      },
      {
        "term": "코팅",
        "aliases": [
          "Coated",
          "COATED",
          "코팅원단"
        ]
      },
      {
        "term": "퀄팅",
        "aliases": [
          "Quilted",
          "QUILTED",
          "누빔"
        ]
      },
      {
        "term": "시어서커",
        "aliases": [
          "Seersucker",
          "SEERSUCKER"
        ]
      },
      {
        "term": "와플",
        "aliases": [
          "Waffle",
          "WAFFLE"
        ]
      },
      {
        "term": "크링클",
        "aliases": [
          "Crinkle",
          "CRINKLE"
        ]
      },
      {
        "term": "옥스포드",
        "aliases": [
          "Oxford",
          "OXFORD"
        ]
      },
      {
        "term": "헤링본",
        "aliases": [
          "Herringbone",
          "HERRINGBONE"
        ]
      },
      {
        "term": "핀턱",
        "aliases": [
          "Pintuck",
          "PIN TUCK"
        ]
      },
      {
        "term": "발수",
        "aliases": [
          "Water Repellent",
          "워터프루프",
          "Waterproof"
        ]
      },
      {
        "term": "방풍",
        "aliases": [
          "Windproof",
          "윈드프루프"
        ]
      },
      {
        "term": "코듀로이",
        "aliases": [
          "Corduroy",
          "CORDUROY"
        ]
      },
      {
        "term": "트위드",
        "aliases": [
          "Tweed",
          "TWEED"
        ]
      },
      {
        "term": "개버딘",
        "aliases": [
          "Gabardine",
          "GABARDINE"
        ]
      },
      {
        "term": "데님",
        "aliases": [
          "Denim",
          "DENIM"
        ]
      },
      {
        "term": "저지",
        "aliases": [
          "Jersey",
          "JERSEY"
        ]
      },
      {
        "term": "플리스",
        "aliases": [
          "Fleece",
          "FLEECE"
        ]
      },
      {
        "term": "벨벳",
        "aliases": [
          "Velvet",
          "VELVET"
        ]
      },
      {
        "term": "스웨이드",
        "aliases": [
          "Suede",
          "SUEDE"
        ]
      },
      {
        "term": "메시",
        "aliases": [
          "Mesh",
          "MESH"
        ]
      }
    ],
    "knit_weave": [
      {
        "term": "리브",
        "aliases": [
          "Rib",
          "RIB",
          "골지"
        ]
      },
      {
        "term": "케이블",
        "aliases": [
          "Cable",
          "CABLE"
        ]
      },
      {
        "term": "자카드",
        "aliases": [
          "Jacquard",
          "JACQUARD"
        ]
      },
      {
        "term": "인터록",
        "aliases": [
          "Interlock",
          "INTERLOCK"
        ]
      },
      {
        "term": "도비",
        "aliases": [
          "Dobby",
          "DOBBY"
        ]
      },
      {
        "term": "트윌",
        "aliases": [
          "Twill",
          "TWILL"
        ]
      }
    ],
    "leather_fur": [
      {
        "term": "천연가죽",
        "aliases": [
          "Genuine Leather",
          "REAL LEATHER"
        ]
      },
      {
        "term": "인조가죽",
        "aliases": [
          "Synthetic Leather",
          "에코레더",
          "Eco Leather",
          "비건레더",
          "Vegan Leather"
        ]
      },
      {
        "term": "퍼",
        "aliases": [
          "Fur",
          "FUR",
          "모피"
        ]
      },
      {
        "term": "페이크퍼",
        "aliases": [
          "Faux Fur",
          "FAUX FUR",
          "인조모피"
        ]
      },
      {
        "term": "무스탕",
        "aliases": [
          "Shearling",
          "MOUTON",
          "무스탕"
        ]
      }
    ],
    "composition_label": [
      {
        "term": "겉감",
        "aliases": [
          "Shell",
          "Outer",
          "OUTER"
        ]
      },
      {
        "term": "안감",
        "aliases": [
          "Lining",
          "LINING"
        ]
      },
      {
        "term": "배색",
        "aliases": [
          "Contrast",
          "CONTRAST"
        ]
      },
      {
        "term": "부속",
        "aliases": [
          "Trim",
          "TRIM"
        ]
      },
      {
        "term": "충전재",
        "aliases": [
          "Filling",
          "Padding",
          "충전물"
        ]
      },
      {
        "term": "구스다운",
        "aliases": [
          "Goose Down",
          "GOOSE DOWN"
        ]
      },
      {
        "term": "덕다운",
        "aliases": [
          "Duck Down",
          "DUCK DOWN"
        ]
      },
      {
        "term": "충전량",
        "aliases": [
          "Fill Weight",
          "충전량(g)"
        ]
      },
      {
        "term": "혼용률",
        "aliases": [
          "Composition",
          "Fabric Composition",
          "혼용율"
        ]
      }
    ],
    "care_label": [
      {
        "term": "드라이클리닝",
        "aliases": [
          "Dry Clean",
          "DRY CLEAN ONLY"
        ]
      },
      {
        "term": "손세탁",
        "aliases": [
          "Hand Wash",
          "HAND WASH"
        ]
      },
      {
        "term": "세탁기사용가능",
        "aliases": [
          "Machine Washable",
          "MACHINE WASH"
        ]
      },
      {
        "term": "표백제사용금지",
        "aliases": [
          "Do Not Bleach",
          "NO BLEACH"
        ]
      },
      {
        "term": "다림질주의",
        "aliases": [
          "Iron with Caution",
          "저온다림질",
          "LOW IRON"
        ]
      },
      {
        "term": "그늘건조",
        "aliases": [
          "Dry in Shade",
          "라인건조"
        ]
      },
      {
        "term": "원산지",
        "aliases": [
          "Made in",
          "MADE IN KOREA",
          "MADE IN CHINA"
        ]
      },
      {
        "term": "제조연월",
        "aliases": [
          "Manufacture Date",
          "제조일자"
        ]
      }
    ]
  }
};
