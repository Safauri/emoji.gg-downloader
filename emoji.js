const fs = require('fs'),
  path = require('path'),
  axios = require('axios'),
  cheerio = require('cheerio');
const WAIT = ms => new Promise(r => setTimeout(r, ms)),
  RETRY = 3;
const SOURCES = {
  emojis: {
    base: 'https://emoji.gg/emojis',
    cdn: 'https://cdn3.emoji.gg/emojis',
    categories: ['pepe'] // whatever cata you're trying to add
  }
};

const download = async (file, category, type, cdn) => {
  const ext = path.extname(file).slice(1),
    dir = path.join(__dirname, type, category, ext),
    fp = path.join(dir, file),
    url = `${cdn}/${file}`;
  if (fs.existsSync(fp)) return console.log(`[SKIPPED]: ${type}/${category}/${file}`);
  try {
    fs.mkdirSync(dir, {
      recursive: true
    });
    const res = await axios.get(url, {
        responseType: 'stream'
      }),
      out = fs.createWriteStream(fp);
    res.data.pipe(out);
    await new Promise((r, e) => (out.on('finish', r), out.on('error', e)));
    console.log(`⬇ [SAVED]: ${type}/${category}/${file}`);
  } catch (e) {
    console.error(`❌ Fail: ${type}/${category}/${file} —`, e.message);
  }
};

const scrape = async (category, {
  base,
  cdn
}, type) => {
  const seen = new Set();
  for (let page = 1, fails = 0;; page++) {
    const url = `${base}/${category}&page=${page}`;
    console.log(`Scraping list: ${url}`);
    try {
      const {
        data
      } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const $ = cheerio.load(data),
        files = $('img[data-src*="cdn3.emoji.gg/emojis/"]')
        .map((_, el) => $(el).attr('data-src'))
        .get()
        .map(s => s.split('/').pop())
        .filter(f => f && !seen.has(f));
      if (!files.length) {
        if (++fails >= RETRY) break;
        console.warn(`[RETRY] ${fails}/${RETRY} on ${category} page ${page}`);
        await WAIT(1500);
        continue;
      }
      fails = 0;
      await Promise.allSettled(files.map(f => (seen.add(f), download(f, category, type, cdn))));
      if (files.length < 20) break;
    } catch (e) {
      if (++fails >= RETRY) break;
      console.warn(`[RETRY] ${fails}/${RETRY} — ${e.message}`);
      await WAIT(2000);
    }
  }
};

(async () => {
  for (const [type, config] of Object.entries(SOURCES))
    for (const category of config.categories)
      await scrape(category, config, type);
  console.log('All emojis saved!');
})();