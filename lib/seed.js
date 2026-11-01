// Стартовый каталог: заливается в пустую базу при первом запуске (см. lib/schema.js).
// Дальше товары и настройки меняются только в админке.

export const SEED_SETTINGS = {
  "deliveryFee": 25000,
  "freeFrom": 500000,
  "banner": "1756982477754-2c05a288f4db",
  "categoryPhotos": {
    "women": "1616313253719-c46514cddee1",
    "men": "1624835567150-0c530a20d8cc",
    "kids": "1615863712239-becde744591a"
  },
  "pickupPoint": {
    "ru": "ул. Шота Руставели, 12",
    "uz": "Shota Rustaveli ko'chasi, 12"
  },
  "pickupHours": {
    "ru": "Ежедневно 10:00–21:00",
    "uz": "Har kuni 10:00–21:00"
  }
};

export const SEED_PRODUCTS = [
  {
    "id": "w-dress",
    "data": {
      "cat": "women",
      "tags": [
        "new"
      ],
      "name": {
        "ru": "Платье макси с длинным рукавом",
        "uz": "Uzun yengli maksi ko'ylak"
      },
      "desc": {
        "ru": "Струящееся платье в пол из вискозы. Закрытый крой, мягкий пояс по талии.",
        "uz": "Viskozadan oqib turuvchi uzun ko'ylak. Yopiq bichim, belida yumshoq kamar."
      },
      "price": 459000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#3b3b38",
          "ru": "Цветочный принт",
          "uz": "Gulli print",
          "photo": "1616313253719-c46514cddee1"
        },
        {
          "hex": "#bcd3cf",
          "ru": "Мятный",
          "uz": "Yalpiz rang",
          "photo": "1759992878772-e83a691a6d8f"
        }
      ],
      "photos": [],
      "sizes": [
        "S",
        "M",
        "L",
        "XL"
      ]
    }
  },
  {
    "id": "w-blouse",
    "data": {
      "cat": "women",
      "tags": [],
      "name": {
        "ru": "Блуза из сатина",
        "uz": "Satin bluza"
      },
      "desc": {
        "ru": "Лёгкая сатиновая блуза свободного кроя. Подходит и для офиса, и для праздника.",
        "uz": "Erkin bichimli yengil satin bluza. Ofis uchun ham, bayram uchun ham mos."
      },
      "price": 289000,
      "oldPrice": 349000,
      "colors": [
        {
          "hex": "#b3202a",
          "ru": "Красный",
          "uz": "Qizil",
          "photo": "1761117228880-df2425bd70da"
        },
        {
          "hex": "#f4f1ea",
          "ru": "Молочный",
          "uz": "Sut rang",
          "photo": "1611235116156-0cbda6649efb"
        }
      ],
      "photos": [],
      "sizes": [
        "S",
        "M",
        "L",
        "XL"
      ]
    }
  },
  {
    "id": "w-cardigan",
    "data": {
      "cat": "women",
      "tags": [
        "new"
      ],
      "name": {
        "ru": "Кардиган крупной вязки",
        "uz": "Yirik to'qilgan kardigan"
      },
      "desc": {
        "ru": "Тёплый кардиган из шерсти с пуговицами. Объёмный, уютный, на всю осень.",
        "uz": "Tugmali issiq jun kardigan. Hajmli va qulay — butun kuz uchun."
      },
      "price": 329000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#c79a3b",
          "ru": "Горчичный",
          "uz": "Xantal rang",
          "photo": "1610288311735-39b7facbd095"
        },
        {
          "hex": "#a7a39c",
          "ru": "Серый",
          "uz": "Kulrang",
          "photo": "1579206464424-7e43a81cadc1"
        }
      ],
      "photos": [],
      "sizes": [
        "S",
        "M",
        "L"
      ]
    }
  },
  {
    "id": "w-coat",
    "data": {
      "cat": "women",
      "tags": [],
      "name": {
        "ru": "Пальто с поясом",
        "uz": "Kamarli palto"
      },
      "desc": {
        "ru": "Классическое пальто прямого кроя из шерстяной смеси. Пояс в комплекте.",
        "uz": "Jun aralashmasidan to'g'ri bichimli klassik palto. Kamar to'plamda."
      },
      "price": 1290000,
      "oldPrice": 1490000,
      "colors": [
        {
          "hex": "#a8774a",
          "ru": "Кэмел",
          "uz": "Kemel",
          "photo": "1539533018447-63fcce2678e3"
        },
        {
          "hex": "#cdb894",
          "ru": "Бежевый",
          "uz": "Bej",
          "photo": "1633821879282-0c4e91f96232"
        }
      ],
      "photos": [
        "1539533113208-f6df8cc8b543"
      ],
      "sizes": [
        "S",
        "M",
        "L",
        "XL"
      ]
    }
  },
  {
    "id": "m-shirt",
    "data": {
      "cat": "men",
      "tags": [],
      "name": {
        "ru": "Рубашка классическая",
        "uz": "Klassik ko'ylak"
      },
      "desc": {
        "ru": "Хлопковая рубашка приталенного кроя. Не мнётся, легко гладится.",
        "uz": "Belga mos bichimli paxta ko'ylak. G'ijimlanmaydi, oson dazmollanadi."
      },
      "price": 279000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#3f5875",
          "ru": "Синий",
          "uz": "Ko'k",
          "photo": "1740711152088-88a009e877bb"
        }
      ],
      "photos": [
        "1624835567150-0c530a20d8cc"
      ],
      "sizes": [
        "S",
        "M",
        "L",
        "XL",
        "XXL"
      ]
    }
  },
  {
    "id": "m-shirt-check",
    "data": {
      "cat": "men",
      "tags": [],
      "name": {
        "ru": "Рубашка в клетку",
        "uz": "Katakli ko'ylak"
      },
      "desc": {
        "ru": "Плотная фланелевая рубашка в клетку. Можно носить как лёгкую куртку.",
        "uz": "Zich flanel katakli ko'ylak. Yengil kurtka sifatida ham kiysa bo'ladi."
      },
      "price": 299000,
      "oldPrice": 359000,
      "colors": [
        {
          "hex": "#3a3a3a",
          "ru": "Серая клетка",
          "uz": "Kulrang katak",
          "photo": "1611312449412-6cefac5dc3e4"
        }
      ],
      "photos": [],
      "sizes": [
        "M",
        "L",
        "XL",
        "XXL"
      ]
    }
  },
  {
    "id": "m-tee",
    "data": {
      "cat": "men",
      "tags": [],
      "name": {
        "ru": "Базовая футболка",
        "uz": "Bazaviy futbolka"
      },
      "desc": {
        "ru": "Плотный хлопок 220 г/м², свободный крой. Базовая вещь на каждый день.",
        "uz": "Zich paxta 220 g/m², erkin bichim. Har kunlik bazaviy kiyim."
      },
      "price": 149000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#f4f4f2",
          "ru": "Белый",
          "uz": "Oq",
          "photo": "1581655353564-df123a1eb820"
        },
        {
          "hex": "#232325",
          "ru": "Чёрный",
          "uz": "Qora",
          "photo": "1583743814966-8936f5b7be1a"
        }
      ],
      "photos": [
        "1521572163474-6864f9cf17ab"
      ],
      "sizes": [
        "S",
        "M",
        "L",
        "XL"
      ]
    }
  },
  {
    "id": "m-hoodie",
    "data": {
      "cat": "men",
      "tags": [
        "new"
      ],
      "name": {
        "ru": "Худи на флисе",
        "uz": "Flisli xudi"
      },
      "desc": {
        "ru": "Тёплое худи на флисе с капюшоном и карманом-кенгуру.",
        "uz": "Kapyushonli va kenguru cho'ntakli issiq flisli xudi."
      },
      "price": 389000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#a9a9ab",
          "ru": "Серый меланж",
          "uz": "Kulrang melanj",
          "photo": "1556821840-3a63f95609a7"
        },
        {
          "hex": "#232325",
          "ru": "Чёрный",
          "uz": "Qora",
          "photo": "1579572331145-5e53b299c64e"
        }
      ],
      "photos": [
        "1564557287817-3785e38ec1f5"
      ],
      "sizes": [
        "S",
        "M",
        "L",
        "XL",
        "XXL"
      ]
    }
  },
  {
    "id": "m-jeans",
    "data": {
      "cat": "men",
      "tags": [],
      "name": {
        "ru": "Джинсы straight",
        "uz": "Straight jinsi"
      },
      "desc": {
        "ru": "Прямой крой, средняя посадка, 100% хлопок.",
        "uz": "To'g'ri bichim, o'rta bel, 100% paxta."
      },
      "price": 349000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#9db5d0",
          "ru": "Голубой",
          "uz": "Havorang",
          "photo": "1602293589930-45aad59ba3ab"
        }
      ],
      "photos": [
        "1714729382668-7bc3bb261662"
      ],
      "sizes": [
        "30",
        "32",
        "34",
        "36"
      ]
    }
  },
  {
    "id": "m-bomber",
    "data": {
      "cat": "men",
      "tags": [],
      "name": {
        "ru": "Куртка-бомбер",
        "uz": "Bomber kurtka"
      },
      "desc": {
        "ru": "Лёгкий бомбер с трикотажными манжетами. Водоотталкивающая ткань.",
        "uz": "Trikotaj manjetli yengil bomber. Suv o'tkazmaydigan mato."
      },
      "price": 690000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#b8643f",
          "ru": "Терракотовый",
          "uz": "Terrakota",
          "photo": "1591047139829-d91aecb6caea"
        }
      ],
      "photos": [
        "1774413768759-d3cc719c1a0e"
      ],
      "sizes": [
        "S",
        "M",
        "L",
        "XL"
      ]
    }
  },
  {
    "id": "k-shirt",
    "data": {
      "cat": "kids",
      "tags": [
        "new"
      ],
      "name": {
        "ru": "Детская рубашка в клетку",
        "uz": "Bolalar katakli ko'ylagi"
      },
      "desc": {
        "ru": "Мягкая фланель, не колется. Удобные пуговицы, которые ребёнок застегнёт сам.",
        "uz": "Yumshoq flanel, sanchmaydi. Bola o'zi taqa oladigan qulay tugmalar."
      },
      "price": 189000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#b3262f",
          "ru": "Красная клетка",
          "uz": "Qizil katak",
          "photo": "1615863712239-becde744591a"
        }
      ],
      "photos": [],
      "sizes": [
        "98",
        "110",
        "122",
        "134"
      ]
    }
  },
  {
    "id": "k-knit",
    "data": {
      "cat": "kids",
      "tags": [],
      "name": {
        "ru": "Свитер с узором",
        "uz": "Naqshli sviter"
      },
      "desc": {
        "ru": "Тёплый вязаный свитер с зимним узором. Гипоаллергенная пряжа.",
        "uz": "Qishki naqshli issiq to'qilgan sviter. Gipoallergen ip."
      },
      "price": 219000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#c0383c",
          "ru": "Красный",
          "uz": "Qizil",
          "photo": "1624272949900-9ae4c56397e8"
        }
      ],
      "photos": [],
      "sizes": [
        "98",
        "110",
        "122",
        "134"
      ]
    }
  },
  {
    "id": "k-dress",
    "data": {
      "cat": "kids",
      "tags": [],
      "name": {
        "ru": "Нарядное платье для девочки",
        "uz": "Qizlar uchun bayramona ko'ylak"
      },
      "desc": {
        "ru": "Нарядное платье с пышной юбкой — для праздников и семейных торжеств.",
        "uz": "Keng yubkali ko'ylak — bayramlar va oilaviy tantanalar uchun."
      },
      "price": 249000,
      "oldPrice": 299000,
      "colors": [
        {
          "hex": "#c8182b",
          "ru": "Красный",
          "uz": "Qizil",
          "photo": "1578897367107-2828e351c8a8"
        }
      ],
      "photos": [],
      "sizes": [
        "98",
        "110",
        "122",
        "134"
      ]
    }
  },
  {
    "id": "k-jacket",
    "data": {
      "cat": "kids",
      "tags": [],
      "name": {
        "ru": "Детская куртка-пуховик",
        "uz": "Bolalar puxovik kurtkasi"
      },
      "desc": {
        "ru": "Лёгкий тёплый пуховик с капюшоном. Держит тепло до −15°.",
        "uz": "Kapyushonli yengil issiq puxovik. −15° gacha issiqni saqlaydi."
      },
      "price": 459000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#2d3a2e",
          "ru": "Тёмно-зелёный",
          "uz": "To'q yashil",
          "photo": "1759473434572-64c4bfd8cb31"
        },
        {
          "hex": "#9a9da1",
          "ru": "Серый",
          "uz": "Kulrang",
          "photo": "1529598993581-b025f3f79f9c"
        }
      ],
      "photos": [],
      "sizes": [
        "98",
        "110",
        "122",
        "134"
      ]
    }
  },
  {
    "id": "k-denim",
    "data": {
      "cat": "kids",
      "tags": [],
      "name": {
        "ru": "Джинсовый комплект",
        "uz": "Jinsi to'plam"
      },
      "desc": {
        "ru": "Джинсовая куртка и джинсы из мягкого денима со стрейчем.",
        "uz": "Stretchli yumshoq jinsidan kurtka va shim."
      },
      "price": 279000,
      "oldPrice": null,
      "colors": [
        {
          "hex": "#7fa3c9",
          "ru": "Голубой деним",
          "uz": "Och ko'k jinsi",
          "photo": "1606841466616-795c2c8dec72"
        }
      ],
      "photos": [],
      "sizes": [
        "98",
        "110",
        "122",
        "134"
      ]
    }
  }
];
