// Rule-based auto-tagging. Scores each category by keyword hits in the title, breadcrumbs,
// brand/store and description, then keeps the strongest one or two.

const CATEGORIES = {
  Electronics: [
    'laptop', 'notebook computer', 'macbook', 'chromebook', 'computer', 'desktop pc', 'smartphone', 'phone', 'iphone',
    'android', 'ipad', 'tablet', 'headphone', 'headphones', 'earbuds', 'earphones', 'airpods', 'speaker', 'soundbar',
    'camera', 'lens', 'monitor', 'tv', 'television', 'oled', 'charger', 'usb', 'usb-c', 'bluetooth', 'smartwatch',
    'apple watch', 'keyboard', 'mouse', 'ssd', 'hard drive', 'router', 'wifi', 'drone', 'projector', 'e-reader', 'kindle',
    'gpu', 'graphics card', 'processor', 'power bank', 'webcam', 'electronics', 'hdmi', 'nas',
  ],
  Gaming: [
    'playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'switch 2', 'video game', 'gaming', 'controller', 'steam deck',
    'game', 'games', 'console', 'joy-con', 'gamepad',
  ],
  Clothing: [
    'shirt', 't-shirt', 'tee', 'hoodie', 'sweater', 'jacket', 'coat', 'jeans', 'pants', 'trousers', 'shorts', 'dress',
    'skirt', 'sweatshirt', 'cardigan', 'blazer', 'suit', 'socks', 'underwear', 'leggings', 'polo', 'vest', 'parka',
    'fleece', 'joggers', 'pullover', 'crewneck', 'apparel', 'clothing', 'outerwear', 'swimsuit', 'bikini', 'pajamas',
    'jumpsuit', 'overshirt', 'chinos', 'denim', 'knitwear', 'windbreaker', 'puffer', 'anorak', 'tank top',
  ],
  Shoes: [
    'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'sandal', 'sandals', 'loafer', 'loafers', 'heels',
    'trainers', 'slipper', 'slippers', 'cleats', 'footwear', 'clogs', 'mules', 'slides', 'air max', 'air force 1',
    'running shoe', 'derby', 'oxfords',
  ],
  Accessories: [
    'bag', 'backpack', 'wallet', 'belt', 'hat', 'cap', 'beanie', 'scarf', 'gloves', 'sunglasses', 'umbrella', 'tote',
    'purse', 'handbag', 'crossbody', 'keychain', 'tie', 'card holder', 'duffel', 'phone case', 'case',
  ],
  'Jewelry & Watches': [
    'ring', 'necklace', 'bracelet', 'earrings', 'pendant', 'jewelry', 'jewellery', 'watch', 'watches', 'chronograph',
    'diamond', 'gold', 'sterling silver', 'cufflinks', 'charm',
  ],
  Beauty: [
    'skincare', 'skin care', 'serum', 'moisturizer', 'moisturiser', 'cleanser', 'makeup', 'lipstick', 'lip gloss',
    'mascara', 'foundation', 'concealer', 'perfume', 'fragrance', 'cologne', 'eau de parfum', 'eau de toilette',
    'shampoo', 'conditioner', 'sunscreen', 'spf', 'nail polish', 'hair dryer', 'straightener', 'toner', 'retinol',
    'beauty', 'cosmetics', 'razor', 'trimmer', 'body wash', 'lotion',
  ],
  Home: [
    'sofa', 'couch', 'chair', 'table', 'desk', 'lamp', 'rug', 'pillow', 'blanket', 'throw', 'bedding', 'sheets',
    'duvet', 'comforter', 'curtain', 'curtains', 'mattress', 'shelf', 'bookshelf', 'bookcase', 'decor', 'vase',
    'candle', 'picture frame', 'mirror', 'furniture', 'dresser', 'nightstand', 'ottoman', 'bed frame', 'towel',
    'towels', 'storage', 'organizer', 'lighting', 'pendant light', 'sconce', 'home',
  ],
  Kitchen: [
    'cookware', 'pan', 'frying pan', 'skillet', 'saucepan', 'knife', 'knives', 'blender', 'stand mixer', 'mixer',
    'kettle', 'espresso', 'coffee maker', 'coffee machine', 'grinder', 'toaster', 'air fryer', 'cutting board',
    'dutch oven', 'mug', 'mugs', 'plate', 'plates', 'bowl', 'bowls', 'utensil', 'utensils', 'kitchen', 'bakeware',
    'glassware', 'wine glass', 'cast iron', 'nonstick', 'food processor', 'instant pot', 'pressure cooker', 'dinnerware',
  ],
  Appliances: [
    'vacuum', 'robot vacuum', 'washer', 'washing machine', 'dryer', 'refrigerator', 'fridge', 'dishwasher', 'microwave',
    'air purifier', 'humidifier', 'dehumidifier', 'heater', 'fan', 'air conditioner', 'appliance', 'appliances',
  ],
  Outdoors: [
    'tent', 'camping', 'hiking', 'sleeping bag', 'backpacking', 'climbing', 'kayak', 'fishing', 'grill', 'bbq',
    'cooler', 'lantern', 'headlamp', 'trekking', 'outdoor', 'outdoors', 'hammock', 'rain jacket', 'hydration',
  ],
  'Sports & Fitness': [
    'yoga', 'dumbbell', 'dumbbells', 'kettlebell', 'treadmill', 'bike', 'bicycle', 'cycling', 'running', 'fitness',
    'gym', 'golf', 'tennis', 'basketball', 'football', 'soccer', 'ski', 'skis', 'snowboard', 'surf', 'surfboard',
    'skateboard', 'workout', 'exercise', 'protein shaker', 'resistance band', 'pickleball', 'baseball', 'hockey',
  ],
  Books: [
    'book', 'books', 'hardcover', 'paperback', 'novel', 'kindle edition', 'audiobook', 'isbn', 'cookbook', 'box set',
    'graphic novel', 'manga', 'comic',
  ],
  'Toys & Kids': [
    'toy', 'toys', 'lego', 'puzzle', 'doll', 'plush', 'stuffed animal', 'baby', 'stroller', 'kids', "kids'", 'toddler',
    'board game', 'action figure', 'nursery', 'infant', 'crib', 'playset',
  ],
  'Tools & DIY': [
    'drill', 'saw', 'wrench', 'screwdriver', 'tool', 'tools', 'toolkit', 'tool set', 'hammer', 'ladder', 'socket set',
    'multimeter', 'sander', 'impact driver', 'workbench', 'hardware', 'soldering',
  ],
  Garden: [
    'garden', 'gardening', 'plant', 'plants', 'planter', 'seeds', 'lawn', 'mower', 'lawn mower', 'hose', 'patio',
    'trimmer', 'leaf blower', 'pruner', 'raised bed', 'outdoor furniture',
  ],
  Pets: [
    'dog', 'dogs', 'cat', 'cats', 'pet', 'pets', 'puppy', 'kitten', 'leash', 'collar', 'litter', 'aquarium', 'dog bed',
    'cat tree', 'kibble', 'harness',
  ],
  Music: [
    'guitar', 'bass guitar', 'piano', 'synth', 'synthesizer', 'microphone', 'amp', 'amplifier', 'vinyl', 'record player',
    'turntable', 'drum', 'drums', 'ukulele', 'violin', 'midi', 'audio interface', 'pedal', 'strings',
  ],
  Office: [
    'notebook', 'journal', 'pen', 'pens', 'pencil', 'planner', 'stationery', 'desk organizer', 'printer', 'office chair',
    'standing desk', 'monitor arm', 'paper', 'fountain pen', 'label maker',
  ],
  Health: [
    'vitamin', 'vitamins', 'supplement', 'supplements', 'protein powder', 'massage', 'massager', 'thermometer',
    'blood pressure', 'first aid', 'toothbrush', 'electric toothbrush', 'wellness', 'scale',
  ],
  Automotive: [
    'car', 'tire', 'tires', 'dash cam', 'dashcam', 'motorcycle', 'automotive', 'car seat', 'wiper', 'jump starter',
    'motor oil', 'vehicle',
  ],
  'Food & Drink': [
    'coffee beans', 'whole bean', 'tea', 'wine', 'whiskey', 'whisky', 'bourbon', 'chocolate', 'snack', 'snacks',
    'gourmet', 'sauce', 'spice', 'spices', 'olive oil', 'gift basket', 'candy',
  ],
  Travel: [
    'luggage', 'suitcase', 'carry-on', 'carry on', 'travel', 'packing cubes', 'passport', 'weekender', 'checked bag',
    'travel pillow',
  ],
  Art: ['print', 'poster', 'canvas', 'painting', 'art print', 'sketchbook', 'paint', 'easel', 'watercolor', 'sculpture'],
};

const HINTS = {
  // brands / stores that strongly imply a category
  Electronics: ['apple', 'samsung', 'sony', 'bose', 'anker', 'logitech', 'bestbuy', 'best buy', 'newegg', 'b&h', 'bhphotovideo', 'dell', 'lenovo', 'asus', 'lg', 'sonos', 'garmin', 'dji', 'razer', 'microcenter'],
  Gaming: ['nintendo', 'playstation', 'xbox', 'steam', 'valve', 'gamestop'],
  Shoes: ['new balance', 'converse', 'vans', 'allbirds', 'hoka', 'on running', 'asics', 'birkenstock', 'dr. martens', 'crocs', 'brooks'],
  Clothing: ['uniqlo', 'zara', 'h&m', 'gap', 'levi', "levi's", 'everlane', 'j.crew', 'lululemon', 'asos', 'ssense', 'nordstrom', 'aritzia', 'abercrombie'],
  Beauty: ['sephora', 'ulta', 'glossier', 'the ordinary', 'cerave', 'fenty', 'rare beauty', 'aesop', 'dyson airwrap'],
  Home: ['ikea', 'wayfair', 'west elm', 'westelm', 'pottery barn', 'potterybarn', 'crate & barrel', 'crateandbarrel', 'cb2', 'article', 'rh', 'burrow', 'target home'],
  Kitchen: ['le creuset', 'williams sonoma', 'williams-sonoma', 'staub', 'kitchenaid', 'breville', 'ooni', 'our place', 'made in', 'all-clad', 'lodge'],
  Outdoors: ['rei', 'patagonia', 'the north face', 'arc\'teryx', 'arcteryx', 'yeti', 'rab', 'black diamond', 'snow peak', 'osprey'],
  'Toys & Kids': ['lego', 'fisher-price', 'mattel', 'hasbro', 'melissa & doug'],
  'Tools & DIY': ['dewalt', 'milwaukee', 'makita', 'ryobi', 'home depot', 'homedepot', "lowe's", 'lowes', 'bosch', 'craftsman', 'festool'],
  'Sports & Fitness': ['peloton', 'rogue', 'garmin', 'wilson', 'callaway', 'titleist', 'decathlon', 'hydrow', 'theragun'],
  Books: ['bookshop', 'barnes & noble', 'barnesandnoble', 'penguin', 'harpercollins', 'audible'],
  Pets: ['chewy', 'petco', 'petsmart', 'barkbox', 'kong'],
  'Jewelry & Watches': ['mejuri', 'pandora', 'tiffany', 'rolex', 'omega', 'seiko', 'casio', 'mvmt', 'swarovski', 'catbird'],
  Music: ['fender', 'gibson', 'yamaha', 'roland', 'sweetwater', 'guitar center', 'korg', 'shure', 'teenage engineering'],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = (words) => new RegExp(`(?:^|[^a-z0-9])(?:${words.map(escape).join('|')})(?:e?s)?(?=$|[^a-z0-9])`, 'gi');
const RULES = Object.entries(CATEGORIES).map(([tag, words]) => [tag, compile(words)]);
const HINT_RULES = Object.entries(HINTS).map(([tag, words]) => [tag, compile(words)]);

const hits = (re, text) => (text ? (text.match(re) || []).length : 0);

/**
 * @param {object} item  { title, brand, siteName, domain, description, categories }
 * @param {Array<{tag: string, keywords: string}>} customRules user-defined rules
 * @returns {string[]} tags
 */
export function autoTags(item, customRules = []) {
  const title = (item.title || '').toLowerCase();
  const crumbs = (item.categories || []).join(' / ').toLowerCase();
  const store = `${item.brand || ''} ${item.siteName || ''} ${item.domain || ''}`.toLowerCase();
  const desc = (item.description || '').slice(0, 400).toLowerCase();

  const scores = [];
  for (const [tag, re] of RULES) {
    const score = hits(re, title) * 3 + Math.min(hits(re, crumbs), 2) * 3 + Math.min(hits(re, desc), 2);
    if (score) scores.push([tag, score]);
  }
  for (const [tag, re] of HINT_RULES) {
    if (hits(re, store)) {
      const existing = scores.find((s) => s[0] === tag);
      if (existing) existing[1] += 2;
      else scores.push([tag, 2]);
    }
  }
  scores.sort((a, b) => b[1] - a[1]);
  const top = scores.filter(([, s]) => s >= 3).slice(0, 2);
  // Only keep a runner-up if it's reasonably close to the winner.
  const tags = top.filter(([, s], i) => i === 0 || s >= top[0][1] * 0.6).map(([t]) => t);
  if (!tags.length && scores[0]) tags.push(scores[0][0]);

  const haystack = `${title} ${store} ${crumbs} ${desc}`;
  for (const rule of customRules || []) {
    const words = String(rule.keywords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (rule.tag && words.length && hits(compile(words), haystack) && !tags.includes(rule.tag)) tags.push(rule.tag.trim());
  }
  return tags;
}

export const BUILT_IN_TAGS = Object.keys(CATEGORIES);
