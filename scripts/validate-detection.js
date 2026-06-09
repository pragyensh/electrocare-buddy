const normalizeText = (text) =>
  text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");

const hasTerm = (query, term) => {
  const nq = normalizeText(query);
  const nt = normalizeText(term);
  const ascii = /^[a-z0-9 ]+$/i.test(nt);
  if (ascii) {
    return new RegExp("(^|[^a-z0-9])" + escapeRegex(nt) + "([^a-z0-9]|$)", "i").test(nq);
  }
  return nq.includes(nt);
};

const tests = [
  "वाशिंग मशीन खराब है",
  "एसी ठंडा नहीं कर रहा",
  "my car is broken",
  "fridge not cooling",
];

const applianceAliases = {
  ac: [
    "ac",
    "a/c",
    "air conditioner",
    "air conditioning",
    "एसी",
    "ए.सी.",
    "thanda",
    "ठंडा",
    "cooling",
    "कूलिंग",
    "cool",
    "cold",
    "कूल",
    "कोल्ड",
    "cooler",
    "कूलर",
    "conditioner",
    "कंडीशनर",
  ],
  fridge: [
    "fridge",
    "refrigerator",
    "फ्रिज",
    "रेफ़्रिज़रेटर",
    "ठंडा रखने की मशीन",
    "ठंडा रखने वाली मशीन",
    "ice",
    "आइस",
    "baraf",
    "बरफ",
    "freezer",
    "फ्रीजर",
  ],
  washingMachine: [
    "washing machine",
    "washer",
    "वॉशिंग मशीन",
    "वॉशिंगमशीन",
    "वाशिंग मशीन",
    "वाशिंगमशीन",
    "spin",
    "ड्रम",
    "स्पिन",
    "laundry",
    "लॉन्ड्री",
  ],
  microwave: ["microwave", "microwave oven", "माइक्रोवेव", "oven", "ओवन"],
  geyser: ["geyser", "water heater", "गीजर"],
};

const additional = ["split ac", "window ac", "freezer", "oven"];

for (const t of tests) {
  const supported = [...Object.values(applianceAliases).flat(), ...additional].filter((term) =>
    hasTerm(t, term),
  );
  const unsupported = ["car", "vehicle", "bike", "laptop"].filter((term) => hasTerm(t, term));
  console.log(`\nINPUT: ${t}`);
  console.log("supported:", supported);
  console.log("unsupported:", unsupported);
}
