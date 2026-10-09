# Kolmannen osapuolen kirjastot

Sivu käyttää näiden kirjastojen paikallisia kopioita. Siksi sivu ei lataa koodia muilta sivustoilta, ja sivun Content Security Policy (`index.html`) voi sallia vain oman sivuston skriptit.

| Tiedosto | Kirjasto | Lähde | Lisenssi |
|---|---|---|---|
| `supabase-2.45.4.js` | @supabase/supabase-js 2.45.4 (UMD) | npm: `@supabase/supabase-js@2.45.4`, tiedosto `dist/umd/supabase.js` | MIT (`supabase-LICENSE.txt`) |
| `xlsx-0.20.3.mjs` | SheetJS Community Edition 0.20.3 | <https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>, tiedosto `package/xlsx.mjs` | Apache-2.0 (`xlsx-LICENSE.txt`) |

## Tarkistus

- `supabase-2.45.4.js`: npm-paketin tarkistesumma vastasi npm-rekisterin arvoa `sha512-E5p8/zOLaQ3a462MZnmnz03CrduA5ySH9hZyL03Y+QZLIOO4/Gs8Rdy4ZCKDHsN7x0xdanVEWWFN3pJFQr9/hg==`.
- `xlsx-0.20.3.mjs`: SHA-256 `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`.

## Päivitys

1. Lataa uusi versio samasta lähteestä ja tarkista tarkistesumma.
2. Vaihda tiedosto ja tiedoston nimen versionumero.
3. Päivitä nimi tiedostoihin `index.html` (Supabase) tai `js/excel.js` (SheetJS) ja tähän taulukkoon.
